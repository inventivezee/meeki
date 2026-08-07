use std::time::{Duration, SystemTime};

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
                // Deliberately a short tick against a wall-clock deadline,
                // rather than one long sleep per check.
                //
                // tokio's timer runs on a monotonic clock that does not advance
                // while the Mac is asleep, so a 30-minute sleep begun five
                // minutes before the lid closes still has 25 minutes left when
                // the lid opens the next morning — a night counts for nothing,
                // and closing the lid again before it elapses restarts the wait.
                // Comparing SystemTime instead means the night does count, and
                // the first tick after wake finds the check overdue.
                let mut schedule = CheckSchedule::due_now();

                loop {
                    if schedule.is_due(SystemTime::now()) {
                        let reached = check_and_download(&handle).await;
                        schedule.record(SystemTime::now(), reached);
                    }
                    tokio::time::sleep(TICK).await;
                }
            });

            Ok(())
        })
        .build()
}

const CHECK_INTERVAL: Duration = Duration::from_secs(30 * 60);
/// How often the deadline is examined. Bounds how long after waking the Mac an
/// overdue check waits, so it wants to be short; it costs one clock read.
const TICK: Duration = Duration::from_secs(60);
/// Backoff for a check that could not reach the server — the launch case, where
/// the app opens as a login item before Wi-Fi associates, and the offline case.
/// Capped so a Mac that is away for a day does not retry every minute all day.
const RETRY_WAITS: [Duration; 4] = [
    Duration::from_secs(15),
    Duration::from_secs(30),
    Duration::from_secs(60),
    Duration::from_secs(300),
];

/// When the next update check is owed, on the wall clock.
#[derive(Debug, Clone, PartialEq, Eq)]
struct CheckSchedule {
    next: SystemTime,
    failures: usize,
}

impl CheckSchedule {
    fn due_now() -> Self {
        Self {
            next: SystemTime::now(),
            failures: 0,
        }
    }

    fn is_due(&self, now: SystemTime) -> bool {
        // A deadline further out than a whole interval can only come from the
        // wall clock moving backwards (an NTP correction, or the user changing
        // it). Left alone that would strand the checks until the clock caught
        // up, so treat it as due and re-anchor.
        now >= self.next || self.next.duration_since(now).unwrap_or_default() > CHECK_INTERVAL
    }

    fn record(&mut self, now: SystemTime, reached_server: bool) {
        if reached_server {
            self.failures = 0;
            self.next = now + CHECK_INTERVAL;
            return;
        }

        let wait = RETRY_WAITS[self.failures.min(RETRY_WAITS.len() - 1)];
        self.failures += 1;
        self.next = now + wait;
    }
}

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
    fn a_night_asleep_counts_toward_the_next_check() {
        // The bug this replaces: tokio's monotonic sleep does not advance while
        // the Mac is asleep, so an overnight lid-close left most of the wait
        // still to run on wake. A wall-clock deadline makes the night count.
        let checked_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);
        let mut schedule = CheckSchedule::due_now();
        schedule.record(checked_at, true);

        let five_minutes_later = checked_at + Duration::from_secs(5 * 60);
        assert!(!schedule.is_due(five_minutes_later), "not owed yet");

        let next_morning = checked_at + Duration::from_secs(14 * 60 * 60);
        assert!(
            schedule.is_due(next_morning),
            "a check owed since last night must be due on the first tick after wake"
        );
    }

    #[test]
    fn a_reached_server_schedules_the_next_check_an_interval_out() {
        let now = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);
        let mut schedule = CheckSchedule::due_now();
        schedule.record(now, true);

        assert_eq!(schedule.next, now + CHECK_INTERVAL);
        assert_eq!(schedule.failures, 0);
    }

    #[test]
    fn an_unreachable_server_retries_sooner_and_backs_off() {
        // Launching as a login item beats Wi-Fi to the punch; waiting a full
        // interval on that would leave the app a release behind all day.
        let now = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);
        let mut schedule = CheckSchedule::due_now();

        for expected in RETRY_WAITS {
            schedule.record(now, false);
            assert_eq!(schedule.next, now + expected);
            assert!(expected < CHECK_INTERVAL, "a retry must beat the cadence");
        }

        // Capped, so a Mac offline all day does not retry every minute.
        schedule.record(now, false);
        assert_eq!(schedule.next, now + RETRY_WAITS[RETRY_WAITS.len() - 1]);
    }

    #[test]
    fn reaching_the_server_clears_earlier_failures() {
        let now = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);
        let mut schedule = CheckSchedule::due_now();
        schedule.record(now, false);
        schedule.record(now, false);
        schedule.record(now, true);

        assert_eq!(schedule.failures, 0);
        schedule.record(now, false);
        assert_eq!(
            schedule.next,
            now + RETRY_WAITS[0],
            "the ladder restarts rather than resuming where it left off"
        );
    }

    #[test]
    fn a_clock_moved_backwards_does_not_strand_the_checks() {
        // An NTP correction or a user editing the date could otherwise push the
        // deadline years out and stop update checks entirely.
        let now = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);
        let mut schedule = CheckSchedule::due_now();
        schedule.record(now, true);

        let clock_jumped_back = now - Duration::from_secs(365 * 24 * 60 * 60);
        assert!(schedule.is_due(clock_jumped_back));
    }

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
