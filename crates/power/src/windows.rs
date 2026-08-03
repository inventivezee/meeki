use std::sync::{Mutex, mpsc};

use windows::Win32::System::Power::{
    ES_CONTINUOUS, ES_SYSTEM_REQUIRED, GetSystemPowerStatus, SYSTEM_POWER_STATUS,
    SetThreadExecutionState,
};

use crate::{Error, PowerSource, Snapshot, ThermalState};

const AC_LINE_OFFLINE: u8 = 0;
const AC_LINE_ONLINE: u8 = 1;
const BATTERY_FLAG_CHARGING: u8 = 0x08;
const BATTERY_FLAG_NO_SYSTEM_BATTERY: u8 = 0x80;
const STATUS_FLAG_BATTERY_SAVER_OFF: u8 = 0;
const STATUS_FLAG_BATTERY_SAVER_ON: u8 = 1;

pub fn snapshot() -> Result<Snapshot, Error> {
    let mut status = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut status) }
        .map_err(|_| Error::Unavailable("GetSystemPowerStatus"))?;

    let has_battery = has_battery(status.BatteryFlag);

    Ok(Snapshot {
        has_battery,
        power_source: power_source(status.ACLineStatus),
        is_charging: has_battery.then(|| is_charging(status.BatteryFlag)),
        battery_percent: has_battery
            .then(|| status.BatteryLifePercent)
            .filter(|&v| v <= 100),
        low_power_mode: low_power_mode(status.SystemStatusFlag),
        thermal_state: ThermalState::Unknown,
    })
}

fn has_battery(battery_flag: u8) -> bool {
    battery_flag != BATTERY_FLAG_NO_SYSTEM_BATTERY
}

fn is_charging(battery_flag: u8) -> bool {
    battery_flag & BATTERY_FLAG_CHARGING != 0
}

fn power_source(ac_line_status: u8) -> PowerSource {
    match ac_line_status {
        AC_LINE_OFFLINE => PowerSource::Battery,
        AC_LINE_ONLINE => PowerSource::Ac,
        _ => PowerSource::Unknown,
    }
}

fn low_power_mode(system_status_flag: u8) -> bool {
    match system_status_flag {
        STATUS_FLAG_BATTERY_SAVER_OFF => false,
        STATUS_FLAG_BATTERY_SAVER_ON => true,
        _ => false,
    }
}

static KEEP_AWAKE: Mutex<Option<(usize, mpsc::Sender<()>)>> = Mutex::new(None);

/// Releases its share of the sleep request when dropped.
pub struct KeepAwake(());

/// Holds off idle system sleep until the returned guard is dropped.
///
/// `reason` is unused here; Windows has no equivalent of the user-visible name
/// macOS shows in `pmset -g assertions`.
pub fn keep_awake(_reason: &str) -> Result<KeepAwake, Error> {
    let mut state = KEEP_AWAKE.lock().unwrap_or_else(|e| e.into_inner());

    match state.as_mut() {
        Some((count, _)) => *count += 1,
        None => {
            let (stop_tx, stop_rx) = mpsc::channel::<()>();
            let (ready_tx, ready_rx) = mpsc::channel::<bool>();

            // SetThreadExecutionState applies to the calling thread only, so the
            // flag has to be set and cleared on one thread that outlives every
            // guard — a tokio task would migrate workers and leak the request.
            std::thread::spawn(move || {
                let set = unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) };
                let ok = set.0 != 0;
                let _ = ready_tx.send(ok);
                if !ok {
                    return;
                }
                let _ = stop_rx.recv();
                unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
            });

            let ok = ready_rx
                .recv()
                .map_err(|_| Error::Unavailable("SetThreadExecutionState"))?;
            if !ok {
                return Err(Error::Unavailable("SetThreadExecutionState"));
            }
            *state = Some((1, stop_tx));
        }
    }

    Ok(KeepAwake(()))
}

impl Drop for KeepAwake {
    fn drop(&mut self) {
        let mut state = KEEP_AWAKE.lock().unwrap_or_else(|e| e.into_inner());
        let Some((count, _)) = state.as_mut() else {
            return;
        };
        *count -= 1;
        if *count == 0 {
            // Dropping the sender wakes the holder thread, which clears the flag.
            *state = None;
        }
    }
}
