mod commands;

mod ext;
pub use ext::*;

const PLUGIN_NAME: &str = "misc";

/// Live sleep assertions, keyed by the reason that asked for them. Dropping a
/// guard releases it, so the map *is* the set of things keeping the Mac awake.
pub type KeepAwakeState =
    std::sync::Mutex<std::collections::HashMap<String, meeki_power::KeepAwake>>;

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::get_git_hash::<tauri::Wry>,
            commands::get_fingerprint::<tauri::Wry>,
            commands::get_device_info::<tauri::Wry>,
            commands::opinionated_md_to_html::<tauri::Wry>,
            commands::keep_awake_acquire::<tauri::Wry>,
            commands::keep_awake_release::<tauri::Wry>,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(|app, _api| {
            use tauri::Manager as _;
            app.manage(KeepAwakeState::default());
            Ok(())
        })
        .build()
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
