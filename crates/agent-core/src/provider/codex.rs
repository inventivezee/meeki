use crate::{
    HealthCheckOptions, InstallCliResponse, ProviderAuthStatus, ProviderHealth,
    ProviderHealthStatus, ProviderKind, UninstallCliResponse,
};

pub fn health(options: &HealthCheckOptions) -> ProviderHealth {
    let health = meeki_codex::health_check_with_options(&meeki_codex::CodexOptions {
        codex_path_override: options.codex_path_override.clone(),
        ..Default::default()
    });

    ProviderHealth {
        provider: ProviderKind::Codex,
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
    let config_path = meeki_codex::config_path();
    let command = meeki_codex::notify_command();

    let mut table = meeki_codex::read_config(&config_path)?;

    if table.contains_key("notify") && !meeki_codex::has_notify(&table, &command) {
        return Err(format!(
            "refusing to replace existing notify handler in {}",
            config_path.display()
        ));
    }

    meeki_codex::set_notify(&mut table, command);
    meeki_codex::write_config(&config_path, &table)?;

    Ok(InstallCliResponse {
        provider: ProviderKind::Codex,
        target_path: config_path.clone(),
        message: format!(
            "Installed char as Codex notify handler in {}",
            config_path.display()
        ),
    })
}

pub fn upgrade() {
    upgrade_at(&meeki_codex::config_path());
}

fn upgrade_at(config_path: &std::path::Path) {
    let command = meeki_codex::notify_command();
    let Ok(mut table) = meeki_codex::read_config(config_path) else {
        return;
    };
    if !meeki_codex::has_notify(&table, &command) {
        return;
    }
    meeki_codex::set_notify(&mut table, command);
    let _ = meeki_codex::write_config(config_path, &table);
}

pub fn uninstall_cli() -> Result<UninstallCliResponse, String> {
    let config_path = meeki_codex::config_path();
    let command = meeki_codex::notify_command();
    let mut table = meeki_codex::read_config(&config_path)?;

    if table.contains_key("notify") && !meeki_codex::has_notify(&table, &command) {
        return Err(format!(
            "refusing to remove existing notify handler in {}",
            config_path.display()
        ));
    }

    meeki_codex::remove_notify(&mut table);
    meeki_codex::write_config(&config_path, &table)?;

    Ok(UninstallCliResponse {
        provider: ProviderKind::Codex,
        target_path: config_path.clone(),
        message: format!(
            "Removed char as Codex notify handler from {}",
            config_path.display()
        ),
    })
}

fn integration_installed() -> Result<bool, String> {
    let config_path = meeki_codex::config_path();
    let table = meeki_codex::read_config(&config_path)?;
    Ok(meeki_codex::has_notify(
        &table,
        &meeki_codex::notify_command(),
    ))
}

impl From<meeki_codex::HealthStatus> for ProviderHealthStatus {
    fn from(value: meeki_codex::HealthStatus) -> Self {
        match value {
            meeki_codex::HealthStatus::Ready => Self::Ready,
            meeki_codex::HealthStatus::Warning => Self::Warning,
            meeki_codex::HealthStatus::Error => Self::Error,
        }
    }
}

impl From<meeki_codex::HealthAuthStatus> for ProviderAuthStatus {
    fn from(value: meeki_codex::HealthAuthStatus) -> Self {
        match value {
            meeki_codex::HealthAuthStatus::Authenticated => Self::Authenticated,
            meeki_codex::HealthAuthStatus::Unauthenticated => Self::Unauthenticated,
            meeki_codex::HealthAuthStatus::Unknown => Self::Unknown,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upgrade_does_not_create_file_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");

        upgrade_at(&path);

        assert!(!path.exists());
    }

    #[test]
    fn upgrade_does_not_add_hook_when_not_installed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(&path, "").unwrap();

        upgrade_at(&path);

        let table = meeki_codex::read_config(&path).unwrap();
        assert!(!meeki_codex::has_notify(
            &table,
            &meeki_codex::notify_command()
        ));
    }

    #[test]
    fn upgrade_refreshes_existing_hook() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");

        let mut table = toml::Table::new();
        let command = meeki_codex::notify_command();
        meeki_codex::set_notify(&mut table, command.clone());
        meeki_codex::write_config(&path, &table).unwrap();

        upgrade_at(&path);

        let table = meeki_codex::read_config(&path).unwrap();
        assert!(meeki_codex::has_notify(&table, &command));
    }
}
