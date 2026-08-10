use crate::MiscPluginExt;

#[tauri::command]
#[specta::specta]
pub async fn get_git_hash<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    Ok(app.misc().get_git_hash())
}

#[tauri::command]
#[specta::specta]
pub async fn get_fingerprint<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    Ok(app.misc().get_fingerprint())
}

#[tauri::command]
#[specta::specta]
pub async fn get_device_info<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    locale: Option<String>,
) -> Result<meeki_template_support::DeviceInfo, String> {
    Ok(app.misc().get_device_info(locale))
}

#[tauri::command]
#[specta::specta]
pub async fn opinionated_md_to_html<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    text: String,
) -> Result<String, String> {
    app.misc().opinionated_md_to_html(&text)
}

/// Holds off system sleep for as long as `reason` is held.
///
/// A backlog of recordings takes hours to transcribe and summarize, and a Mac
/// that sleeps partway through does not simply resume: tokio's timers do not
/// advance while the machine is asleep, so work in flight stalls rather than
/// continuing. Keyed by reason and idempotent, so a re-entrant caller does not
/// stack assertions it will forget to drop.
#[tauri::command]
#[specta::specta]
pub async fn keep_awake_acquire<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    reason: String,
) -> Result<(), String> {
    use tauri::Manager as _;
    let state = app.state::<crate::KeepAwakeState>();
    let mut guards = state.lock().unwrap();
    if guards.contains_key(&reason) {
        return Ok(());
    }
    match meeki_power::keep_awake(&reason) {
        Ok(guard) => {
            guards.insert(reason, guard);
            Ok(())
        }
        // Not fatal: the work still runs, it just is not protected from sleep.
        Err(error) => {
            eprintln!("[misc] keep_awake failed: {error}");
            Ok(())
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn keep_awake_release<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    reason: String,
) -> Result<(), String> {
    use tauri::Manager as _;
    let state = app.state::<crate::KeepAwakeState>();
    // Dropping the guard is what releases the assertion.
    state.lock().unwrap().remove(&reason);
    Ok(())
}
