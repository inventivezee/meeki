use std::path::PathBuf;

use crate::model::DownloadableModel;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum DownloadStatus {
    /// `total_bytes` is 0 when the source never reported a size. Consumers
    /// should fall back to the model's declared size rather than treat the
    /// transfer as complete.
    #[serde(rename_all = "camelCase")]
    Downloading {
        percent: u8,
        downloaded_bytes: u64,
        total_bytes: u64,
    },
    /// Stopped on purpose, with the partial file left on disk. Distinct from
    /// `Failed` because the bytes already fetched are still good and resuming
    /// picks up from them.
    #[serde(rename_all = "camelCase")]
    Paused {
        downloaded_bytes: u64,
        total_bytes: u64,
    },
    Completed,
    Failed(String),
}

impl DownloadStatus {
    pub fn downloading(percent: u8) -> Self {
        Self::Downloading {
            percent,
            downloaded_bytes: 0,
            total_bytes: 0,
        }
    }
}

pub trait ModelDownloaderRuntime<M: DownloadableModel>: Send + Sync + 'static {
    fn models_base(&self) -> Result<PathBuf, crate::Error>;
    fn emit_progress(&self, model: &M, status: DownloadStatus);
}
