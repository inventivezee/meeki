//! A truncated transfer must never be reported as a finished one.
//!
//! Downstream there is nothing to catch it: the GGUF models carry no checksum,
//! their finalize_download is a no-op, and promote renames the .part over the
//! real weights. Whatever this function calls success gets written over a
//! working model.

use file::{Error, download_file_parallel_cancellable};
use meeki_download_interface::DownloadProgress;
use tokio_util::sync::CancellationToken;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

/// Bigger than DEFAULT_CHUNK_SIZE so the parallel ranged path is taken at all;
/// below that the function falls back to a plain sequential download.
const TOTAL: usize = 9 * 1024 * 1024;

async fn ranged_server(body_for_range: Vec<u8>) -> MockServer {
    let server = MockServer::start().await;

    Mock::given(method("HEAD"))
        .and(path("/model.gguf"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-length", TOTAL.to_string().as_str())
                .insert_header("accept-ranges", "bytes"),
        )
        .mount(&server)
        .await;

    // 206 as asked, but the body stops early — the case a real CDN produces on
    // a dropped upstream, and the one no size check downstream would catch.
    Mock::given(method("GET"))
        .and(path("/model.gguf"))
        .respond_with(ResponseTemplate::new(206).set_body_bytes(body_for_range))
        .mount(&server)
        .await;

    server
}

#[tokio::test]
async fn short_206_body_is_an_error_not_a_finished_download() {
    let server = ranged_server(vec![7u8; 64]).await;
    let dir = tempfile::tempdir().unwrap();
    let out = dir.path().join("model.gguf");

    let result = download_file_parallel_cancellable(
        format!("{}/model.gguf", server.uri()),
        &out,
        |_| {},
        None,
    )
    .await;

    match result {
        Err(Error::IncompleteChunk { received, .. }) => assert_eq!(received, 64),
        Err(other) => panic!("expected IncompleteChunk, got {other:?}"),
        Ok(()) => panic!(
            "reported success for a file that received 64 bytes of {TOTAL} — \
             this is the state that gets renamed over a complete model"
        ),
    }
}

#[tokio::test]
async fn a_short_body_never_reports_finished() {
    let server = ranged_server(vec![7u8; 64]).await;
    let dir = tempfile::tempdir().unwrap();
    let out = dir.path().join("model.gguf");

    let finished = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let seen = finished.clone();

    let _ = download_file_parallel_cancellable(
        format!("{}/model.gguf", server.uri()),
        &out,
        move |progress| {
            if matches!(progress, DownloadProgress::Finished) {
                seen.store(true, std::sync::atomic::Ordering::Relaxed);
            }
        },
        None,
    )
    .await;

    assert!(
        !finished.load(std::sync::atomic::Ordering::Relaxed),
        "emitted Finished for a truncated transfer; the download task treats \
         that as a completed model"
    );
}

#[tokio::test]
async fn cancellation_after_the_last_dispatch_is_still_reported() {
    // A standing guard on the property that matters — a cancelled transfer must
    // never return Ok, because the caller reads Ok as "model complete" and
    // renames the .part over the real weights.
    //
    // Honest scope: this one passes against the pre-fix code too. Reaching the
    // final drain with an Err in hand needs a cancellation that lands after the
    // last chunk is dispatched but while one is still streaming, and this
    // arrangement does not reliably produce that. The two tests above are what
    // discriminate; this holds the line on the outcome.
    let server = MockServer::start().await;

    Mock::given(method("HEAD"))
        .and(path("/model.gguf"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-length", TOTAL.to_string().as_str())
                .insert_header("accept-ranges", "bytes"),
        )
        .mount(&server)
        .await;

    Mock::given(method("GET"))
        .and(path("/model.gguf"))
        .respond_with(
            ResponseTemplate::new(206)
                .set_body_bytes(vec![7u8; TOTAL / 8])
                .set_delay(std::time::Duration::from_millis(1500)),
        )
        .mount(&server)
        .await;

    let dir = tempfile::tempdir().unwrap();
    let out = dir.path().join("model.gguf");
    let token = CancellationToken::new();

    let finished = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let seen = finished.clone();
    let url = format!("{}/model.gguf", server.uri());
    let path_for_task = out.clone();
    let token_for_task = token.clone();

    let handle = tokio::spawn(async move {
        download_file_parallel_cancellable(
            url,
            &path_for_task,
            move |progress| {
                if matches!(progress, DownloadProgress::Finished) {
                    seen.store(true, std::sync::atomic::Ordering::Relaxed);
                }
            },
            Some(token_for_task),
        )
        .await
    });

    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
    token.cancel();

    let result = handle.await.unwrap();

    assert!(
        result.is_err(),
        "a cancelled transfer returned Ok — the caller reads that as a complete \
         model and renames the short .part over the real weights"
    );
    assert!(
        !finished.load(std::sync::atomic::Ordering::Relaxed),
        "emitted Finished for a cancelled transfer"
    );
}
