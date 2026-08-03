/// Broadcast alongside the per-call `Channel<i8>` that `download_model` takes.
///
/// The channel is owned by whichever component started the download, so it dies
/// when that component unmounts — navigating away from a settings tab used to
/// lose all progress for a 13.6 GB transfer that was still running. An app-wide
/// event lets any surface re-attach to a download already in flight.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, tauri_specta::Event)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressPayload {
    pub model: crate::SupportedModel,
    pub status: meeki_model_downloader::DownloadStatus,
}
