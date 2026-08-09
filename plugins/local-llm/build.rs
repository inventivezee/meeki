const COMMANDS: &[&str] = &[
    "models_dir",
    "is_model_downloaded",
    "is_model_downloading",
    "download_model",
    "cancel_download",
    // These three ship permissions but were never listed here, so a clean
    // regeneration would have dropped them and broken the app at
    // `generate_context!` rather than at `cargo check`.
    "pause_download",
    "paused_bytes",
    "sleep_idle_seconds",
    "delete_model",
    "list_downloaded_model",
    "list_supported_model",
    "list_custom_models",
    "recommended_model",
    "server_url",
    "start_server",
    "stop_server",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
