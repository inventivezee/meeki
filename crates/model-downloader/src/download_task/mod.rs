use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use std::sync::atomic::Ordering;

use crate::download_task::failure::{cleanup_for_failure, forget_without_cleanup};
use crate::download_task::steps::{ChecksumError, FinalizeError};
use crate::download_task_progress::make_progress_callback;
use crate::model::DownloadableModel;

mod failure;
mod params;
mod steps;

pub(crate) use params::DownloadTaskParams;

/// Long enough that a closed lid or a dropped link has plausibly recovered,
/// short enough that a user watching the bar sees it move again.
const RETRY_WAITS_SECONDS: [u64; 3] = [30, 60, 120];

pub(crate) fn spawn_download_task<M: DownloadableModel>(
    params: DownloadTaskParams<M>,
    start_rx: oneshot::Receiver<()>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        if start_rx.await.is_err() {
            cleanup_for_failure(&params).await;
            return;
        }

        // Bound to the whole task body so every early return, failure and
        // cancellation below releases it. Models run to several gigabytes, and
        // an idle sleep part-way through strands the transfer.
        let _keep_awake = match meeki_power::keep_awake("Meeki is downloading a model") {
            Ok(guard) => Some(guard),
            Err(error) => {
                tracing::warn!(error = %error, "model_download_keep_awake_failed");
                None
            }
        };

        // Retried here rather than driven by a sleep observer. The process is
        // frozen while the Mac sleeps, so these waits elapse *after* wake, with
        // the network back — which is exactly the moment to try again. The
        // partial and its Range resume mean each attempt continues rather than
        // restarts, and the registry entry stays put so the settings card's own
        // sequencer does not read this as a stop.
        let mut attempt = 0usize;
        loop {
            let progress_callback =
                make_progress_callback(params.runtime.clone(), params.model.clone());

            let Err(error) = steps::download(&params, progress_callback).await else {
                break;
            };

            // A pause cancels the same token a cancel does, so the flag is the
            // only thing that says whether the partial should survive.
            if params.paused.load(Ordering::Relaxed) {
                forget_without_cleanup(&params).await;
                return;
            }

            // A checksum mismatch or a bad status will not fix itself.
            if !error.is_transient() {
                let reason = log_download_error(&error);
                fail_task(&params, reason).await;
                return;
            }

            let Some(wait) = RETRY_WAITS_SECONDS.get(attempt).copied() else {
                // Out of attempts. The bytes are still good, so this is a
                // resumable pause rather than a failure.
                tracing::info!(error = %error, "model_download_gave_up_retrying");
                pause_task(&params).await;
                return;
            };
            attempt += 1;

            tracing::info!(
                error = %error,
                attempt,
                wait_seconds = wait,
                "model_download_interrupted_retrying"
            );
            // Reported as paused for the wait: it is not transferring, and the
            // UI already knows how to render a resumable pause.
            emit_paused(&params).await;

            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_secs(wait)) => {}
                _ = params.cancellation_token.cancelled() => {
                    if params.paused.load(Ordering::Relaxed) {
                        forget_without_cleanup(&params).await;
                    } else {
                        cleanup_for_failure(&params).await;
                    }
                    return;
                }
            }
        }

        if let Some(expected_checksum) = params.model.download_checksum()
            && let Err(error) = steps::verify_checksum(&params, expected_checksum).await
        {
            let reason = log_checksum_error(&error);
            fail_task(&params, Some(reason)).await;
            return;
        }

        if let Err(error) = steps::finalize(&params).await {
            let reason = log_finalize_error(&error);
            fail_task(&params, Some(reason)).await;
            return;
        }

        if params.model.remove_destination_after_finalize() {
            let _ = tokio::fs::remove_file(&params.destination).await;
        } else if let Err(error) = steps::promote(&params).await {
            tracing::error!(error = %error, "model_download_promote_error");
            let reason = format!("Failed to move model file: {}", error);
            fail_task(&params, Some(reason)).await;
            return;
        }

        // The sidecar only vouches for a partial. Once the real file is in
        // place it is stale metadata that a later download would test against.
        let _ = tokio::fs::remove_file(crate::download_paths::download_sidecar_path(
            &params.final_destination,
        ))
        .await;

        params
            .runtime
            .emit_progress(&params.model, crate::runtime::DownloadStatus::Completed);
        params
            .registry
            .remove_if_generation_matches(&params.key, params.generation)
            .await;
    })
}

async fn emit_paused<M: DownloadableModel>(params: &DownloadTaskParams<M>) {
    let downloaded_bytes = crate::download_paths::partial_bytes(&params.final_destination)
        .await
        .unwrap_or(0);

    params.runtime.emit_progress(
        &params.model,
        crate::runtime::DownloadStatus::Paused {
            downloaded_bytes,
            total_bytes: params.model.download_size().unwrap_or(0),
        },
    );
}

/// Stops without discarding the partial, and reports it as resumable.
async fn pause_task<M: DownloadableModel>(params: &DownloadTaskParams<M>) {
    emit_paused(params).await;
    forget_without_cleanup(params).await;
}

async fn fail_task<M: DownloadableModel>(params: &DownloadTaskParams<M>, reason: Option<String>) {
    if let Some(reason) = reason {
        params.runtime.emit_progress(
            &params.model,
            crate::runtime::DownloadStatus::Failed(reason),
        );
    }
    cleanup_for_failure(params).await;
}

fn log_download_error(error: &meeki_file::Error) -> Option<String> {
    if matches!(error, meeki_file::Error::Cancelled) {
        return None;
    }

    tracing::error!(error = %error, "model_download_error");

    let reason = match error {
        meeki_file::Error::ReqwestError(e) => {
            if e.is_timeout() {
                "Download timed out. Please check your internet connection and try again."
                    .to_string()
            } else if e.is_connect() {
                "Could not connect to the download server. Please check your internet connection."
                    .to_string()
            } else {
                format!("Network error: {}", e)
            }
        }
        meeki_file::Error::FileIOError(e) => {
            format!("File system error: {}", e)
        }
        meeki_file::Error::HttpStatus { status, .. } => match status {
            404 | 410 => "That model is no longer available for download.".to_string(),
            _ => format!("The download server returned {status}. Please try again."),
        },
        meeki_file::Error::Cancelled => unreachable!(),
        meeki_file::Error::OtherError(msg) => msg.clone(),
    };
    Some(reason)
}

fn log_checksum_error(error: &ChecksumError) -> String {
    match error {
        ChecksumError::Mismatch { actual, expected } => {
            tracing::error!(
                actual_checksum = actual,
                expected_checksum = expected,
                "model_download_checksum_mismatch"
            );
            "Downloaded file is corrupted (checksum mismatch). Please try again.".to_string()
        }
        ChecksumError::Calculate(error) => {
            tracing::error!(error = %error, "model_download_checksum_error");
            format!("Failed to verify download: {}", error)
        }
        ChecksumError::Join(error) => {
            tracing::error!(error = %error, "model_download_checksum_join_error");
            format!("Verification interrupted: {}", error)
        }
    }
}

fn log_finalize_error(error: &FinalizeError) -> String {
    match error {
        FinalizeError::Finalize(error) => {
            tracing::error!(error = %error, "model_finalize_error");
            format!("Failed to finalize model: {}", error)
        }
        FinalizeError::Join(error) => {
            tracing::error!(error = %error, "model_finalize_join_error");
            format!("Finalization interrupted: {}", error)
        }
    }
}
