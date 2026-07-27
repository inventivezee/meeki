use crate::{
    HealthCheckOptions, InstallCliResponse, ProviderAuthStatus, ProviderHealth,
    ProviderHealthStatus, ProviderKind, UninstallCliResponse,
};

const STOP_EVENT: &str = "Stop";
const COMMAND: &str = "char claude notify";

pub fn health(options: &HealthCheckOptions) -> ProviderHealth {
    let health = meeki_claude::health_check_with_options(&meeki_claude::ClaudeOptions {
        claude_path_override: options.claude_path_override.clone(),
        ..Default::default()
    });

    ProviderHealth {
        provider: ProviderKind::Claude,
        binary_path: health.binary_path,
        installed: health.installed,
        integration_installed: integration_installed().unwrap_or(false),
        version: health.version,
        status: health.status.into(),
        auth_status: health.auth_status.into(),
        message: health.message,
    }
}

pub fn install_cli() -> Result<InstallCliResponse, String> {
    let settings_path = meeki_claude::settings_path();
    let mut settings = meeki_claude::read_settings(&settings_path)?;

    meeki_claude::upsert_command_hook(&mut settings, STOP_EVENT, COMMAND)?;
    meeki_claude::write_settings(&settings_path, &settings)?;

    Ok(InstallCliResponse {
        provider: ProviderKind::Claude,
        target_path: settings_path.clone(),
        message: format!(
            "Installed char as Claude Code hook handler in {}",
            settings_path.display()
        ),
    })
}

pub fn upgrade() {
    upgrade_at(&meeki_claude::settings_path());
}

fn upgrade_at(settings_path: &std::path::Path) {
    let Ok(mut settings) = meeki_claude::read_settings(settings_path) else {
        return;
    };
    if !meeki_claude::has_command_hook(&settings, STOP_EVENT, COMMAND) {
        return;
    }
    let _ = meeki_claude::remove_command_hook(&mut settings, STOP_EVENT, COMMAND);
    let _ = meeki_claude::upsert_command_hook(&mut settings, STOP_EVENT, COMMAND);
    let _ = meeki_claude::write_settings(settings_path, &settings);
}

pub fn uninstall_cli() -> Result<UninstallCliResponse, String> {
    let settings_path = meeki_claude::settings_path();
    let mut settings = meeki_claude::read_settings(&settings_path)?;

    meeki_claude::remove_command_hook(&mut settings, STOP_EVENT, COMMAND)?;
    meeki_claude::write_settings(&settings_path, &settings)?;

    Ok(UninstallCliResponse {
        provider: ProviderKind::Claude,
        target_path: settings_path.clone(),
        message: format!(
            "Removed char as Claude Code hook handler from {}",
            settings_path.display()
        ),
    })
}

fn integration_installed() -> Result<bool, String> {
    let settings_path = meeki_claude::settings_path();
    let settings = meeki_claude::read_settings(&settings_path)?;
    Ok(meeki_claude::has_command_hook(
        &settings, STOP_EVENT, COMMAND,
    ))
}

impl From<meeki_claude::HealthStatus> for ProviderHealthStatus {
    fn from(value: meeki_claude::HealthStatus) -> Self {
        match value {
            meeki_claude::HealthStatus::Ready => Self::Ready,
            meeki_claude::HealthStatus::Warning => Self::Warning,
            meeki_claude::HealthStatus::Error => Self::Error,
        }
    }
}

impl From<meeki_claude::HealthAuthStatus> for ProviderAuthStatus {
    fn from(value: meeki_claude::HealthAuthStatus) -> Self {
        match value {
            meeki_claude::HealthAuthStatus::Authenticated => Self::Authenticated,
            meeki_claude::HealthAuthStatus::Unauthenticated => Self::Unauthenticated,
            meeki_claude::HealthAuthStatus::Unknown => Self::Unknown,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upgrade_does_not_create_file_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");

        upgrade_at(&path);

        assert!(!path.exists());
    }

    #[test]
    fn upgrade_does_not_add_hook_when_not_installed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, "{}").unwrap();

        upgrade_at(&path);

        let settings = meeki_claude::read_settings(&path).unwrap();
        assert!(!meeki_claude::has_command_hook(
            &settings, STOP_EVENT, COMMAND
        ));
    }

    #[test]
    fn upgrade_refreshes_existing_hook() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");

        let mut settings = serde_json::json!({});
        meeki_claude::upsert_command_hook(&mut settings, STOP_EVENT, COMMAND).unwrap();
        meeki_claude::write_settings(&path, &settings).unwrap();

        upgrade_at(&path);

        let settings = meeki_claude::read_settings(&path).unwrap();
        assert!(meeki_claude::has_command_hook(
            &settings, STOP_EVENT, COMMAND
        ));
    }
}
