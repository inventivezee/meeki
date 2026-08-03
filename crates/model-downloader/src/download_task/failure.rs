use tokio::fs;

use crate::download_task::params::DownloadTaskParams;
use crate::model::DownloadableModel;

/// Forgets the download without touching the partial file. Used when the stop
/// was deliberate, so the next `download` can resume from what is on disk.
pub(super) async fn forget_without_cleanup<M: DownloadableModel>(params: &DownloadTaskParams<M>) {
    params
        .registry
        .remove_if_generation_matches(&params.key, params.generation)
        .await;
}

pub(super) async fn cleanup_for_failure<M: DownloadableModel>(params: &DownloadTaskParams<M>) {
    let _ = fs::remove_file(&params.destination).await;
    let _ = fs::remove_file(crate::download_paths::download_sidecar_path(
        &params.final_destination,
    ))
    .await;
    params
        .registry
        .remove_if_generation_matches(&params.key, params.generation)
        .await;
}
