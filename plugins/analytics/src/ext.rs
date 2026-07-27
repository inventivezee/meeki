use tauri_plugin_misc::MiscPluginExt;
use tauri_plugin_store2::Store2PluginExt;

pub struct Analytics<'a, R: tauri::Runtime, M: tauri::Manager<R>> {
    manager: &'a M,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<'a, R: tauri::Runtime, M: tauri::Manager<R>> Analytics<'a, R, M> {
    pub async fn event(
        &self,
        mut payload: meeki_analytics::AnalyticsPayload,
    ) -> Result<(), crate::Error> {
        Self::enrich_payload(self.manager, &mut payload);

        if self.is_disabled().unwrap_or(true) {
            return Ok(());
        }

        let machine_id = meeki_host::fingerprint();
        let client = self.manager.state::<crate::ManagedState>();
        client
            .event(machine_id, payload)
            .await
            .map_err(crate::Error::HyprAnalytics)?;

        Ok(())
    }

    pub fn event_fire_and_forget(&self, mut payload: meeki_analytics::AnalyticsPayload) {
        Self::enrich_payload(self.manager, &mut payload);

        if self.is_disabled().unwrap_or(true) {
            return;
        }

        let machine_id = meeki_host::fingerprint();
        let client = self.manager.state::<crate::ManagedState>().inner().clone();

        tauri::async_runtime::spawn(async move {
            let _ = client.event(machine_id, payload).await;
        });
    }

    fn enrich_payload(manager: &M, payload: &mut meeki_analytics::AnalyticsPayload) {
        let app_version = option_env!("APP_VERSION").unwrap_or("0.0.0-local");
        let app_identifier = manager.config().identifier.clone();
        let git_hash = manager.misc().get_git_hash();
        let bundle_id = manager.config().identifier.clone();

        payload
            .props
            .entry("app_version".into())
            .or_insert(app_version.into());

        payload
            .props
            .entry("app_identifier".into())
            .or_insert(app_identifier.into());

        payload
            .props
            .entry("git_hash".into())
            .or_insert(git_hash.into());

        payload
            .props
            .entry("bundle_id".into())
            .or_insert(bundle_id.into());

        payload.props.entry("$set".into()).or_insert_with(|| {
            serde_json::json!({
                "app_version": app_version
            })
        });
    }

    pub fn set_disabled(&self, disabled: bool) -> Result<(), crate::Error> {
        {
            let store = self.manager.store2().scoped_store(crate::PLUGIN_NAME)?;
            store.set(crate::StoreKey::Disabled, disabled)?;
        }
        Ok(())
    }

    pub fn is_disabled(&self) -> Result<bool, crate::Error> {
        let store = self.manager.store2().scoped_store(crate::PLUGIN_NAME)?;
        // Opt-in: missing key means analytics stays disabled.
        let v = store.get(crate::StoreKey::Disabled)?.unwrap_or(true);
        Ok(v)
    }

    pub async fn set_properties(
        &self,
        payload: meeki_analytics::PropertiesPayload,
    ) -> Result<(), crate::Error> {
        if !self.is_disabled()? {
            let machine_id = meeki_host::fingerprint();

            let client = self.manager.state::<crate::ManagedState>();
            client
                .set_properties(machine_id, payload)
                .await
                .map_err(crate::Error::HyprAnalytics)?;
        }

        Ok(())
    }

    pub async fn identify(
        &self,
        user_id: impl Into<String>,
        payload: meeki_analytics::PropertiesPayload,
    ) -> Result<(), crate::Error> {
        if !self.is_disabled()? {
            let machine_id = meeki_host::fingerprint();
            let user_id = user_id.into();

            let client = self.manager.state::<crate::ManagedState>();
            client
                .identify(user_id, machine_id, payload)
                .await
                .map_err(crate::Error::HyprAnalytics)?;
        }

        Ok(())
    }
}

pub trait AnalyticsPluginExt<R: tauri::Runtime> {
    fn analytics(&self) -> Analytics<'_, R, Self>
    where
        Self: tauri::Manager<R> + Sized;
}

impl<R: tauri::Runtime, T: tauri::Manager<R>> AnalyticsPluginExt<R> for T {
    fn analytics(&self) -> Analytics<'_, R, Self>
    where
        Self: Sized,
    {
        Analytics {
            manager: self,
            _runtime: std::marker::PhantomData,
        }
    }
}
