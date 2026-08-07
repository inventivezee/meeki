mod commands;
mod error;
mod events;
mod ext;
#[cfg(target_os = "macos")]
mod install_macos;
mod startup_migration;
mod store;

pub use error::{Error, Result};
pub use events::*;
pub use ext::*;
pub(crate) use store::*;

const PLUGIN_NAME: &str = "updater2";

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::check::<tauri::Wry>,
            commands::download::<tauri::Wry>,
            commands::install::<tauri::Wry>,
            commands::is_downloaded::<tauri::Wry>,
            commands::postinstall::<tauri::Wry>,
            commands::maybe_emit_updated::<tauri::Wry>,
        ])
        .events(tauri_specta::collect_events![
            events::UpdateAvailableEvent,
            events::UpdateDownloadingEvent,
            events::UpdateDownloadProgressEvent,
            events::UpdateDownloadFailedEvent,
            events::UpdateReadyEvent,
            events::UpdatedEvent,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app, _api| {
            specta_builder.mount_events(app);

            #[cfg(target_os = "macos")]
            match startup_migration::maybe_schedule_legacy_bundle_rename_on_launch(app) {
                Ok(true) => std::process::exit(0),
                Ok(false) => {}
                Err(err) => tracing::error!("failed to schedule legacy bundle rename: {}", err),
            }

            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                // The launch check runs against a network that is often not up
                // yet — a Mac waking to an app that opens on login reaches this
                // before Wi-Fi associates. One attempt then meant the first real
                // check was half an hour away, so a machine that had been off
                // for a week still opened on a stale build.
                for wait in STARTUP_RETRY_WAITS_SECONDS {
                    if check_and_download(&handle).await {
                        break;
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(wait)).await;
                }

                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(30 * 60)).await;
                    check_and_download(&handle).await;
                }
            });

            Ok(())
        })
        .build()
}

/// Retries for the launch check only. Roughly six minutes of patience spread
/// over five attempts, which covers a login-item start racing the network
/// without hammering the endpoint.
const STARTUP_RETRY_WAITS_SECONDS: [u64; 5] = [15, 30, 60, 120, 180];

/// True when the check reached the server — whether or not an update existed.
/// Only a failed check is worth retrying; "you are up to date" is an answer.
async fn check_and_download<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    if cfg!(debug_assertions) {
        return true;
    }

    let updater2 = app.updater2();

    let version = match updater2.check().await {
        Ok(Some(v)) => v,
        Ok(None) => return true,
        Err(e) => {
            tracing::error!("update_check_failed: {}", e);
            return false;
        }
    };

    if let Err(e) = updater2.download(&version).await {
        tracing::error!("update_download_failed: {}", e);
    }

    true
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn export_types() {
        const OUTPUT_FILE: &str = "./js/bindings.gen.ts";

        make_specta_builder::<tauri::Wry>()
            .export(
                specta_typescript::Typescript::default()
                    .formatter(specta_typescript::formatter::prettier)
                    .bigint(specta_typescript::BigIntExportBehavior::Number),
                OUTPUT_FILE,
            )
            .unwrap();

        let content = std::fs::read_to_string(OUTPUT_FILE).unwrap();
        std::fs::write(OUTPUT_FILE, format!("// @ts-nocheck\n{content}")).unwrap();
    }
}
