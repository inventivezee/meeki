use std::ffi::OsString;
use std::path::Path;
use std::path::PathBuf;

/// Stable across attempts, unlike the `.part-{generation}` name this replaced.
/// A partial that a later attempt cannot find is a partial that cannot be
/// resumed, which made every pause a restart from zero.
pub(crate) fn download_part_path(destination: &Path) -> PathBuf {
    suffixed(destination, ".part")
}

/// Records what the partial belongs to, so a resume can tell whether the bytes
/// on disk still match the file being asked for. The GGUF models ship without
/// checksums on purpose, so without this a stale partial from a changed model
/// would resume into a silently corrupt file.
pub(crate) fn download_sidecar_path(destination: &Path) -> PathBuf {
    suffixed(destination, ".part.json")
}

fn suffixed(destination: &Path, suffix: &str) -> PathBuf {
    let mut path = destination.to_path_buf();

    if let Some(file_name) = destination.file_name() {
        let mut generated_name = OsString::from(file_name);
        generated_name.push(suffix);
        path.set_file_name(generated_name);
    } else {
        path.push(format!("download{suffix}"));
    }

    path
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct PartialMeta {
    pub(crate) url: String,
    pub(crate) expected_bytes: u64,
}

impl PartialMeta {
    pub(crate) async fn write(&self, destination: &Path) {
        let Ok(encoded) = serde_json::to_vec(self) else {
            return;
        };
        let _ = tokio::fs::write(download_sidecar_path(destination), encoded).await;
    }

    pub(crate) async fn read(destination: &Path) -> Option<Self> {
        let raw = tokio::fs::read(download_sidecar_path(destination))
            .await
            .ok()?;
        serde_json::from_slice(&raw).ok()
    }
}

/// Drops a partial that does not belong to the download about to run. A missing
/// or unreadable sidecar counts as unusable: without it we cannot show the
/// partial is safe to build on, and a corrupt model is worse than a re-download.
pub(crate) async fn discard_unusable_partial(destination: &Path, expected: &PartialMeta) {
    let part_path = download_part_path(destination);
    if !tokio::fs::try_exists(&part_path).await.unwrap_or(false) {
        return;
    }

    if PartialMeta::read(destination).await.as_ref() == Some(expected) {
        return;
    }

    tracing::info!(
        path = %part_path.display(),
        "discarding a partial download that no longer matches its source"
    );
    let _ = tokio::fs::remove_file(&part_path).await;
    let _ = tokio::fs::remove_file(download_sidecar_path(destination)).await;
}

/// Bytes already fetched for a paused or interrupted download, if any.
pub(crate) async fn partial_bytes(destination: &Path) -> Option<u64> {
    tokio::fs::metadata(download_part_path(destination))
        .await
        .ok()
        .map(|meta| meta.len())
}
