use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};

use super::MenuItemHandler;

pub struct TrayVersion;

impl TrayVersion {
    fn get_channel(identifier: &str, app_name: &str) -> &'static str {
        match identifier {
            "com.meeki.stable" | "com.meeki.Meeki" => "stable",
            "com.meeki.staging" => "staging",
            "com.meeki.dev" => "dev",
            _ => match app_name {
                "Meeki" | "Char" | "Hyprnote" => "stable",
                "Meeki Staging" | "Char Staging" | "Hyprnote Staging" => "staging",
                _ => "dev",
            },
        }
    }
}

impl MenuItemHandler for TrayVersion {
    const ID: &'static str = "meeki_tray_version";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let identifier = &app.config().identifier;
        let app_name = &app.package_info().name;
        let app_version = app.package_info().version.to_string();
        let channel = Self::get_channel(identifier, app_name);

        let text = format!("v{} ({})", app_version, channel);
        let item = MenuItem::with_id(app, Self::ID, text, false, None::<&str>)?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(_app: &AppHandle<tauri::Wry>) {}
}

#[cfg(test)]
mod tests {
    use super::TrayVersion;

    #[test]
    fn gets_channel_from_identifier() {
        assert_eq!(
            TrayVersion::get_channel("com.meeki.stable", "Meeki"),
            "stable"
        );
        assert_eq!(
            TrayVersion::get_channel("com.meeki.staging", "Meeki Staging"),
            "staging"
        );
        assert_eq!(
            TrayVersion::get_channel("com.meeki.dev", "Meeki Dev"),
            "dev"
        );
    }

    #[test]
    fn falls_back_to_product_name_for_unknown_identifier() {
        assert_eq!(TrayVersion::get_channel("unknown", "Meeki"), "stable");
        assert_eq!(
            TrayVersion::get_channel("unknown", "Meeki Staging"),
            "staging"
        );
        assert_eq!(TrayVersion::get_channel("unknown", "Meeki Dev"), "dev");
    }
}
