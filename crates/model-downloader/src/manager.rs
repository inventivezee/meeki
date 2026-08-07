use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use tokio::fs;

use crate::Error;
use crate::download_paths::{
    PartialMeta, discard_unusable_partial, download_part_path, download_sidecar_path, partial_bytes,
};
use crate::download_task::{DownloadTaskParams, spawn_download_task};
use crate::downloads_registry::{DownloadEntry, DownloadsRegistry};
use crate::model::DownloadableModel;
use crate::runtime::ModelDownloaderRuntime;
use crate::task_join::wait_for_task_exit;

pub struct ModelDownloadManager<M: DownloadableModel> {
    runtime: Arc<dyn ModelDownloaderRuntime<M>>,
    downloads: DownloadsRegistry,
    next_generation: Arc<AtomicU64>,
}

impl<M: DownloadableModel> Clone for ModelDownloadManager<M> {
    fn clone(&self) -> Self {
        Self {
            runtime: self.runtime.clone(),
            downloads: self.downloads.clone(),
            next_generation: self.next_generation.clone(),
        }
    }
}

impl<M: DownloadableModel> ModelDownloadManager<M> {
    const TASK_JOIN_WARN_AFTER: Duration = Duration::from_secs(5);

    pub fn new(runtime: Arc<dyn ModelDownloaderRuntime<M>>) -> Self {
        Self {
            runtime,
            downloads: DownloadsRegistry::new(),
            next_generation: Arc::new(AtomicU64::new(1)),
        }
    }

    pub fn model_path(&self, model: &M) -> Result<PathBuf, Error> {
        let models_base = self.runtime.models_base()?;
        Ok(model.download_destination(&models_base))
    }

    pub async fn is_downloaded(&self, model: &M) -> Result<bool, Error> {
        let models_base = self.runtime.models_base()?;
        let model_clone = model.clone();
        tokio::task::spawn_blocking(move || model_clone.is_downloaded(&models_base))
            .await
            .map_err(|e| Error::OperationFailed(e.to_string()))?
    }

    pub async fn is_downloading(&self, model: &M) -> bool {
        self.downloads.contains(&model.download_key()).await
    }

    /// Fetches a model, unless it is already here.
    ///
    /// The guard is in the manager rather than in each caller because the
    /// callers kept forgetting it: the on-device setup card, the summary empty
    /// state and both settings rows all reached this function with a complete
    /// model on disk, and every one of them refetched it from byte zero. The
    /// cost is invisible — bytes land in a `.part` while the finished file goes
    /// on serving inference — so nothing surfaced it until a user watched a
    /// progress bar climb for a model they had already downloaded.
    ///
    /// A caller that wants the file replaced deletes it first. `is_downloaded`
    /// is deliberately a weak predicate (`gguf_size_matches` allows drift, and
    /// AmModel accepts any non-empty directory), so it cannot be trusted to
    /// distinguish a good file from a damaged one — only to say something is
    /// there.
    pub async fn download(&self, model: &M) -> Result<(), Error> {
        if self.is_downloaded(model).await? {
            tracing::info!(
                key = %model.download_key(),
                "skipping a download for a model already on disk"
            );
            // The channel consumers wait for a terminal value; without this a
            // no-op download would leave a spinner up until the next poll.
            self.runtime
                .emit_progress(model, crate::runtime::DownloadStatus::Completed);
            return Ok(());
        }

        let key = model.download_key();
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);

        let url = model
            .download_url()
            .ok_or_else(|| Error::NoDownloadUrl(model.download_key()))?;

        let models_base = self.runtime.models_base()?;
        let final_destination = model.download_destination(&models_base);
        let destination = download_part_path(&final_destination);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).await?;
        }

        // Anything already on disk is only usable if it came from this exact
        // source; otherwise resuming would append new bytes onto old ones.
        let meta = PartialMeta {
            url: url.clone(),
            expected_bytes: model.download_size().unwrap_or(0),
        };
        discard_unusable_partial(&final_destination, &meta).await;
        meta.write(&final_destination).await;

        let (start_tx, start_rx) = tokio::sync::oneshot::channel::<()>();

        let cancellation_token = tokio_util::sync::CancellationToken::new();
        let paused = Arc::new(AtomicBool::new(false));
        let task = spawn_download_task(
            DownloadTaskParams {
                runtime: self.runtime.clone(),
                registry: self.downloads.clone(),
                model: model.clone(),
                url,
                destination: destination.clone(),
                final_destination: final_destination.clone(),
                models_base: models_base.clone(),
                key: key.clone(),
                generation,
                cancellation_token: cancellation_token.clone(),
                paused: paused.clone(),
            },
            start_rx,
        );

        let existing = self
            .downloads
            .insert(
                key,
                DownloadEntry {
                    task,
                    token: cancellation_token,
                    generation,
                    download_path: destination,
                    final_destination: final_destination.clone(),
                    expected_bytes: meta.expected_bytes,
                    paused: paused.clone(),
                },
            )
            .await;

        if let Some(entry) = existing {
            // Both tasks share one stable .part path now, so the outgoing task
            // must not treat its exit as a failure and delete the file the
            // incoming one is about to resume from.
            entry.paused.store(true, Ordering::Relaxed);
            entry.token.cancel();
            wait_for_task_exit(
                entry.task,
                Self::TASK_JOIN_WARN_AFTER,
                "replace_existing_download",
            )
            .await;
        }

        let _ = start_tx.send(());

        Ok(())
    }

    pub async fn cancel_download(&self, model: &M) -> Result<bool, Error> {
        let key = model.download_key();

        let existing = self.downloads.remove(&key).await;

        if let Some(entry) = existing {
            entry.token.cancel();
            wait_for_task_exit(entry.task, Self::TASK_JOIN_WARN_AFTER, "cancel_download").await;
            self.runtime.emit_progress(
                model,
                crate::runtime::DownloadStatus::Failed("Download cancelled".to_string()),
            );
            let _ = fs::remove_file(entry.download_path).await;
            let _ = fs::remove_file(download_sidecar_path(&entry.final_destination)).await;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Stops the transfer but keeps the partial file, so `download` resumes
    /// from it rather than starting over. Returns false if nothing was running.
    pub async fn pause_download(&self, model: &M) -> Result<bool, Error> {
        let key = model.download_key();

        let Some(entry) = self.downloads.remove(&key).await else {
            return Ok(false);
        };

        // Set before cancelling: the task reads this to decide whether the
        // partial it leaves behind should survive.
        entry.paused.store(true, Ordering::Relaxed);
        entry.token.cancel();
        wait_for_task_exit(entry.task, Self::TASK_JOIN_WARN_AFTER, "pause_download").await;

        self.runtime.emit_progress(
            model,
            crate::runtime::DownloadStatus::Paused {
                downloaded_bytes: partial_bytes(&entry.final_destination).await.unwrap_or(0),
                total_bytes: entry.expected_bytes,
            },
        );

        Ok(true)
    }

    /// Bytes waiting to be resumed, for a download that is not currently
    /// running. Lets the UI offer Resume after an app restart with no extra
    /// bookkeeping to persist.
    pub async fn paused_bytes(&self, model: &M) -> Result<u64, Error> {
        let models_base = self.runtime.models_base()?;
        let destination = model.download_destination(&models_base);
        Ok(partial_bytes(&destination).await.unwrap_or(0))
    }

    pub async fn delete(&self, model: &M) -> Result<(), Error> {
        if !self.is_downloaded(model).await? {
            return Err(Error::ModelNotDownloaded(model.download_key()));
        }

        let models_base = self.runtime.models_base()?;
        let model_clone = model.clone();
        tokio::task::spawn_blocking(move || model_clone.delete_downloaded(&models_base))
            .await
            .map_err(|e| Error::OperationFailed(e.to_string()))?
    }
}
