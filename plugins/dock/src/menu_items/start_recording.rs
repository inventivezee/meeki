use super::DockMenuItem;

/// Right-click the Dock icon and start recording, without going through the
/// window first. Delegates to the tray's handler so the two entry points cannot
/// drift: that one opens a new session tab with auto_start set, which the front
/// end turns into a live recording.
pub struct DockStartRecording;

impl DockMenuItem for DockStartRecording {
    fn title(_app: &tauri::AppHandle<tauri::Wry>) -> String {
        "Start Recording".to_string()
    }

    fn handle(app: &tauri::AppHandle<tauri::Wry>) {
        tauri_plugin_tray::HyprMenuItem::TrayStart.handle(app);
    }
}
