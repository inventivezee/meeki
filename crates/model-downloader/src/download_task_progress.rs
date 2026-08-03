use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use meeki_download_interface::DownloadProgress;

use crate::model::DownloadableModel;
use crate::runtime::{DownloadStatus, ModelDownloaderRuntime};

/// One percent of a 13.6 GB model is 136 MB, so emitting only on percent change
/// leaves the byte counter visibly frozen for a minute at a time on a slow link.
const MIN_EMIT_INTERVAL: Duration = Duration::from_millis(250);

struct EmitState {
    percent: u8,
    last_emit: Option<Instant>,
}

pub(crate) fn make_progress_callback<M: DownloadableModel>(
    runtime: Arc<dyn ModelDownloaderRuntime<M>>,
    model: M,
) -> impl Fn(DownloadProgress) + Send + Sync {
    let state = Arc::new(Mutex::new(EmitState {
        percent: 0,
        last_emit: None,
    }));

    move |progress: DownloadProgress| {
        let mut state = state.lock().unwrap_or_else(|e| e.into_inner());

        match progress {
            DownloadProgress::Started => {
                state.percent = 0;
                state.last_emit = Some(Instant::now());
                runtime.emit_progress(&model, DownloadStatus::downloading(0));
            }
            DownloadProgress::Progress(downloaded, total_size) => {
                if total_size == 0 {
                    return;
                }

                let percent = ((downloaded as f64 / total_size as f64) * 100.0)
                    .floor()
                    .clamp(0.0, 99.0) as u8;

                // Ratcheted: chunks complete out of order, so a later callback
                // can report fewer bytes. The bar must never travel backwards.
                let advanced = percent > state.percent;
                let due = state
                    .last_emit
                    .is_none_or(|at| at.elapsed() >= MIN_EMIT_INTERVAL);
                if !advanced && !due {
                    return;
                }

                if advanced {
                    state.percent = percent;
                }
                state.last_emit = Some(Instant::now());

                runtime.emit_progress(
                    &model,
                    DownloadStatus::Downloading {
                        percent: state.percent,
                        downloaded_bytes: downloaded,
                        total_bytes: total_size,
                    },
                );
            }
            DownloadProgress::Finished => {
                if state.percent < 99 {
                    state.percent = 99;
                    state.last_emit = Some(Instant::now());
                    runtime.emit_progress(&model, DownloadStatus::downloading(99));
                }
            }
        }
    }
}
