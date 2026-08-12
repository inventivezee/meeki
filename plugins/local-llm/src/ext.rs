use std::{collections::HashMap, path::PathBuf, sync::Arc};
use tauri::{Manager, Runtime, ipc::Channel};

use meeki_model_downloader::{DownloadableModel, ModelDownloadManager, ModelDownloaderRuntime};

/// Only one server start at a time. See `start_server`.
static START_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

struct TauriModelRuntime<R: Runtime> {
    app_handle: tauri::AppHandle<R>,
    channels: Arc<std::sync::Mutex<HashMap<String, Channel<i8>>>>,
}

impl<R: Runtime> ModelDownloaderRuntime<crate::SupportedModel> for TauriModelRuntime<R> {
    fn models_base(&self) -> Result<PathBuf, meeki_model_downloader::Error> {
        Ok(models_base(&self.app_handle))
    }

    fn emit_progress(
        &self,
        model: &crate::SupportedModel,
        status: meeki_model_downloader::DownloadStatus,
    ) {
        use meeki_model_downloader::DownloadStatus;
        use tauri_specta::Event as _;

        let _ = crate::types::DownloadProgressPayload {
            model: model.clone(),
            status: status.clone(),
        }
        .emit(&self.app_handle);

        // -2 rather than -1: consumers of this legacy channel read -1 as a
        // failure, and a pause is not one. They ignore anything below zero.
        let progress: i8 = match &status {
            DownloadStatus::Downloading { percent, .. } => *percent as i8,
            DownloadStatus::Completed => 100,
            DownloadStatus::Paused { .. } => -2,
            DownloadStatus::Failed(_) => -1,
        };

        let key = model.download_key();
        let mut guard = self.channels.lock().unwrap();

        let Some(channel) = guard.get(&key) else {
            return;
        };

        let send_result = channel.send(progress);
        let is_terminal = matches!(
            status,
            DownloadStatus::Completed | DownloadStatus::Failed(_) | DownloadStatus::Paused { .. }
        );
        if send_result.is_err() || is_terminal {
            guard.remove(&key);
        }
    }
}

pub fn create_model_downloader<R: Runtime>(
    app_handle: &tauri::AppHandle<R>,
    channels: Arc<std::sync::Mutex<HashMap<String, Channel<i8>>>>,
) -> ModelDownloadManager<crate::SupportedModel> {
    let runtime = Arc::new(TauriModelRuntime {
        app_handle: app_handle.clone(),
        channels,
    });
    ModelDownloadManager::new(runtime)
}

fn models_base<R: Runtime, T: Manager<R>>(manager: &T) -> PathBuf {
    use tauri_plugin_settings::SettingsPluginExt;

    manager
        .settings()
        .global_base()
        .map(|base| base.join("models").into_std_path_buf())
        .unwrap_or_else(|_| dirs::data_dir().unwrap_or_default().join("models"))
}

fn resolve_llama_server_bin<R: Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    use tauri::Manager;
    use tauri::path::BaseDirectory;

    if let Ok(path) = app
        .path()
        .resolve("llama-cpp/llama-server", BaseDirectory::Resource)
    {
        if path.exists() {
            return path;
        }
    }

    // Dev / unbundled fallback.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../apps/desktop/src-tauri/resources/llama-cpp/llama-server")
}

async fn downloader<R: Runtime>(
    manager: &impl Manager<R>,
) -> ModelDownloadManager<crate::SupportedModel> {
    let state = manager.state::<crate::SharedState>();
    state.lock().await.model_downloader.clone()
}

pub struct LocalLlmExt<'a, R: Runtime, M: Manager<R>> {
    manager: &'a M,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<'a, R: Runtime, M: Manager<R>> LocalLlmExt<'a, R, M> {
    pub fn models_dir(&self) -> PathBuf {
        meeki_local_llm_core::llm_models_dir(&models_base(self.manager))
    }

    #[tracing::instrument(skip_all)]
    pub async fn is_model_downloading(&self, model: &crate::SupportedModel) -> bool {
        downloader(self.manager).await.is_downloading(model).await
    }

    #[tracing::instrument(skip_all)]
    pub async fn is_model_downloaded(
        &self,
        model: &crate::SupportedModel,
    ) -> Result<bool, crate::Error> {
        Ok(downloader(self.manager).await.is_downloaded(model).await?)
    }

    #[tracing::instrument(skip_all)]
    pub async fn server_url(&self) -> Result<Option<String>, crate::Error> {
        let state = self.manager.state::<crate::SharedState>();
        let mut guard = state.lock().await;

        // Drop a crashed llama-server so callers restart instead of reusing a dead URL.
        if guard
            .server
            .as_mut()
            .is_some_and(|server| !server.is_running())
            && let Some(dead) = guard.server.take()
        {
            dead.stop().await;
            return Ok(None);
        }

        Ok(guard.server.as_ref().map(|server| server.url().to_string()))
    }

    #[tracing::instrument(skip_all)]
    pub async fn download_model(
        &self,
        model: crate::SupportedModel,
        channel: Channel<i8>,
    ) -> Result<(), crate::Error> {
        let key = model.download_key();

        let (dl, channels) = {
            let state = self.manager.state::<crate::SharedState>();
            let guard = state.lock().await;
            (
                guard.model_downloader.clone(),
                guard.download_channels.clone(),
            )
        };

        // Not cancel_download: that deletes the partial, which is exactly what
        // a resume needs. `download` already replaces any in-flight transfer.

        {
            let mut guard = channels.lock().unwrap();
            if let Some(existing) = guard.insert(key.clone(), channel) {
                let _ = existing.send(-1);
            }
        }

        if let Err(e) = dl.download(&model).await {
            let mut guard = channels.lock().unwrap();
            if let Some(channel) = guard.remove(&key) {
                let _ = channel.send(-1);
            }
            return Err(e.into());
        }

        Ok(())
    }

    #[tracing::instrument(skip_all)]
    pub async fn cancel_download(
        &self,
        model: crate::SupportedModel,
    ) -> Result<bool, crate::Error> {
        Ok(downloader(self.manager)
            .await
            .cancel_download(&model)
            .await?)
    }

    /// Stops the transfer but keeps what has already landed, so a later
    /// `download_model` picks up from there instead of refetching 13.6 GB.
    pub async fn pause_download(&self, model: crate::SupportedModel) -> Result<bool, crate::Error> {
        Ok(downloader(self.manager)
            .await
            .pause_download(&model)
            .await?)
    }

    /// Bytes waiting to be resumed. Non-zero means the UI should offer Resume
    /// rather than a fresh Download, even after a restart.
    pub async fn paused_bytes(&self, model: crate::SupportedModel) -> Result<u64, crate::Error> {
        Ok(downloader(self.manager).await.paused_bytes(&model).await?)
    }

    #[tracing::instrument(skip_all)]
    pub async fn delete_model(&self, model: &crate::SupportedModel) -> Result<(), crate::Error> {
        downloader(self.manager).await.delete(model).await?;
        Ok(())
    }

    #[tracing::instrument(skip_all)]
    pub async fn list_downloaded_model(&self) -> Result<Vec<crate::SupportedModel>, crate::Error> {
        Ok(meeki_local_llm_core::list_downloaded_models(
            &self.models_dir(),
        )?)
    }

    #[tracing::instrument(skip_all)]
    pub async fn list_custom_models(&self) -> Result<Vec<crate::CustomModelInfo>, crate::Error> {
        Ok(meeki_local_llm_core::list_custom_models()?)
    }

    #[tracing::instrument(skip_all)]
    pub async fn recommended_model(
        &self,
    ) -> Result<meeki_local_llm_core::ModelRecommendation, crate::Error> {
        let total_memory_bytes = sysinfo::System::new_with_specifics(
            sysinfo::RefreshKind::nothing().with_memory(sysinfo::MemoryRefreshKind::everything()),
        )
        .total_memory();

        Ok(meeki_local_llm_core::ModelRecommendation {
            model: meeki_local_llm_core::recommended_model_for_memory(total_memory_bytes)
                .map(|model| meeki_local_llm_core::supported_model_info(&model)),
            total_memory_bytes,
        })
    }

    /// Idempotent: reuses a live server already serving `model`, otherwise
    /// replaces whatever is running. Starting happens outside the state lock so
    /// slow model loads don't block downloads or status polls.
    ///
    /// `ctx_size` is what the work in hand needs, or `None` for the default
    /// this Mac can comfortably hold. It only ever grows the window — a running
    /// server that is already large enough is reused — because `--ctx-size` is
    /// fixed for the life of the process, so shrinking would cost a full weight
    /// reload and buy nothing.
    #[tracing::instrument(skip_all)]
    pub async fn start_server(
        &self,
        model: crate::SupportedModel,
        ctx_size: Option<u32>,
    ) -> Result<String, crate::Error> {
        // Serialised across callers, and held for the whole start rather than
        // just the state read. Several things ask for the server independently
        // — the five-second liveness poll, and sizing the window before a
        // summary — and replacing a server empties the state while the new one
        // loads. Without this, a caller arriving in that window saw nothing
        // running and spawned a second llama-server: observed as pairs of
        // processes a fraction of a second apart, each loading the weights
        // again, on a machine that then had two copies of the model resident.
        let _starting = START_MUTEX.lock().await;

        let state = self.manager.state::<crate::SharedState>();
        let model_id = model.openai_model_id();
        let ctx_size = meeki_local_llm_core::resolved_ctx_size(Some(&model), ctx_size);

        let replaced = {
            let mut guard = state.lock().await;
            // `is_running` needs the mutable borrow, so this cannot be a match
            // guard: pattern bindings stay immutable until the guard finishes.
            let reusable = match guard.server.as_mut() {
                Some(existing) => {
                    existing.model_id() == model_id
                        && existing.ctx_size() >= ctx_size
                        && existing.is_running()
                }
                None => false,
            };
            if let Some(existing) = guard.server.as_ref()
                && reusable
            {
                return Ok(existing.url().to_string());
            }
            guard.server.take()
        };

        // The old process has to go before the new one can claim its port, so
        // this is not the usual "keep the old one alive while the new one
        // loads". Reusing the port is what lets a growing window leave the base
        // URL the app already handed to the AI SDK still pointing somewhere.
        let reuse_port = replaced.as_ref().map(|server| server.port());
        if let Some(replaced) = replaced {
            replaced.stop().await;
        }

        let model_path = self.models_dir().join(model.file_name());
        let server_bin = resolve_llama_server_bin(self.manager.app_handle());

        let server = meeki_local_llm_core::LlmServer::start_with_model_path(
            model_id.to_string(),
            model_path,
            server_bin,
            ctx_size,
            reuse_port,
        )
        .await?;
        let url = server.url().to_string();

        let mut guard = state.lock().await;
        if let Some(existing) = guard.server.take() {
            existing.stop().await;
        }
        guard.server = Some(server);
        Ok(url)
    }

    #[tracing::instrument(skip_all)]
    pub async fn stop_server(&self) -> Result<(), crate::Error> {
        let state = self.manager.state::<crate::SharedState>();
        let mut guard = state.lock().await;
        if let Some(existing) = guard.server.take() {
            existing.stop().await;
        }
        Ok(())
    }
}

pub trait LocalLlmPluginExt<R: Runtime> {
    fn local_llm(&self) -> LocalLlmExt<'_, R, Self>
    where
        Self: Manager<R> + Sized;
}

impl<R: Runtime, T: Manager<R>> LocalLlmPluginExt<R> for T {
    fn local_llm(&self) -> LocalLlmExt<'_, R, Self>
    where
        Self: Sized,
    {
        LocalLlmExt {
            manager: self,
            _runtime: std::marker::PhantomData,
        }
    }
}
