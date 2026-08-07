use super::DockMenuItem;

pub struct DockQuit;

impl DockMenuItem for DockQuit {
    fn title(app: &tauri::AppHandle<tauri::Wry>) -> String {
        // Not "Completely": this is the same app.exit(0) that the tray's
        // "Quit" runs — handle() below literally delegates to it. The word
        // promised a distinction that has never existed, and closing the
        // window (which does leave the app running) is a separate action.
        format!("Quit {}", app.package_info().name)
    }

    fn handle(app: &tauri::AppHandle<tauri::Wry>) {
        tauri_plugin_tray::HyprMenuItem::TrayQuit.handle(app);
    }
}
