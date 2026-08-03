use std::ffi::c_void;
use std::sync::Mutex;

use cidre::{arc, cf, io::pm, ns};

use crate::{Error, PowerSource, Snapshot, ThermalState};

const AC_POWER_VALUE: &str = "AC Power";
const BATTERY_POWER_VALUE: &str = "Battery Power";
const IS_CHARGING_KEY: &str = "Is Charging";
const CURRENT_CAPACITY_KEY: &str = "Current Capacity";

#[link(name = "IOKit", kind = "framework")]
unsafe extern "C" {
    fn IOPSCopyPowerSourcesInfo() -> *const c_void;
    fn IOPSCopyPowerSourcesList(blob: *const c_void) -> *const c_void;
    fn IOPSGetPowerSourceDescription(blob: *const c_void, source: *const c_void) -> *const c_void;
    fn IOPSGetProvidingPowerSourceType(blob: *const c_void) -> *const c_void;
}

unsafe fn cf_retained(ptr: *const c_void) -> arc::R<cf::Type> {
    unsafe { std::mem::transmute::<*const c_void, arc::R<cf::Type>>(ptr) }
}

pub fn snapshot() -> Result<Snapshot, Error> {
    let blob_ptr = unsafe { IOPSCopyPowerSourcesInfo() };
    if blob_ptr.is_null() {
        return Err(Error::Unavailable("IOPSCopyPowerSourcesInfo"));
    }
    let blob = unsafe { cf_retained(blob_ptr) };

    let info = power_source_info(&blob)?;
    let process_info = ns::ProcessInfo::current();

    Ok(Snapshot {
        has_battery: info.has_battery,
        power_source: providing_power_source(&blob)?,
        is_charging: info.is_charging,
        battery_percent: info.battery_percent,
        low_power_mode: process_info.is_low_power_mode_enabled(),
        thermal_state: thermal_state(process_info.thermal_state()),
    })
}

struct BatteryInfo {
    has_battery: bool,
    is_charging: Option<bool>,
    battery_percent: Option<u8>,
}

fn power_source_info(blob: &cf::Type) -> Result<BatteryInfo, Error> {
    let list_ptr = unsafe { IOPSCopyPowerSourcesList(blob.as_type_ptr() as _) };
    if list_ptr.is_null() {
        return Err(Error::Unavailable("IOPSCopyPowerSourcesList"));
    }
    let list = unsafe { cf_retained(list_ptr) };
    let list: &cf::ArrayOf<cf::Type> =
        unsafe { &*((&*list) as *const cf::Type as *const cf::ArrayOf<cf::Type>) };

    let mut info = BatteryInfo {
        has_battery: false,
        is_charging: None,
        battery_percent: None,
    };

    for source in list.iter() {
        let desc_ptr = unsafe {
            IOPSGetPowerSourceDescription(blob.as_type_ptr() as _, source.as_type_ptr() as _)
        };
        if desc_ptr.is_null() {
            continue;
        }
        info.has_battery = true;
        let desc = unsafe { &*(desc_ptr as *const cf::DictionaryOf<cf::String, cf::Type>) };
        if info.is_charging.is_none() {
            info.is_charging = find_bool(desc, IS_CHARGING_KEY);
        }
        if info.battery_percent.is_none() {
            info.battery_percent =
                find_i32(desc, CURRENT_CAPACITY_KEY).map(|v| v.clamp(0, 100) as u8);
        }
    }

    Ok(info)
}

fn providing_power_source(blob: &cf::Type) -> Result<PowerSource, Error> {
    let value_ptr = unsafe { IOPSGetProvidingPowerSourceType(blob.as_type_ptr() as _) };
    if value_ptr.is_null() {
        return Err(Error::Unavailable("IOPSGetProvidingPowerSourceType"));
    }

    let value: &cf::String = unsafe { &*(value_ptr as *const cf::String) };
    Ok(match value.to_string().as_str() {
        AC_POWER_VALUE => PowerSource::Ac,
        BATTERY_POWER_VALUE => PowerSource::Battery,
        _ => PowerSource::Unknown,
    })
}

fn find_i32(description: &cf::DictionaryOf<cf::String, cf::Type>, key: &str) -> Option<i32> {
    let cf_key = cf::String::from_str(key);
    let value = description.get(&cf_key)?;
    value.try_as_number()?.to_i32()
}

fn find_bool(description: &cf::DictionaryOf<cf::String, cf::Type>, key: &str) -> Option<bool> {
    let cf_key = cf::String::from_str(key);
    let value = description.get(&cf_key)?;
    if value.get_type_id() == cf::Boolean::type_id() {
        Some(unsafe { &*(value as *const cf::Type as *const cf::Boolean) }.value())
    } else {
        None
    }
}

fn thermal_state(value: ns::ProcessInfoThermalState) -> ThermalState {
    #[allow(unreachable_patterns)]
    match value {
        ns::ProcessInfoThermalState::Nominal => ThermalState::Nominal,
        ns::ProcessInfoThermalState::Fair => ThermalState::Fair,
        ns::ProcessInfoThermalState::Serious => ThermalState::Serious,
        ns::ProcessInfoThermalState::Critical => ThermalState::Critical,
        _ => ThermalState::Unknown,
    }
}

/// One process-wide assertion shared by every caller, with a refcount, so that
/// concurrent downloads do not each register their own entry in
/// `pmset -g assertions`. The assertion is released when the last guard drops.
static KEEP_AWAKE: Mutex<Option<(usize, pm::Assertion)>> = Mutex::new(None);

/// Releases its share of the sleep assertion when dropped.
pub struct KeepAwake(());

/// Holds off *idle* system sleep until the returned guard is dropped. Closing
/// the lid still sleeps, so callers doing long work must also be resumable.
///
/// `reason` is user-visible in `pmset -g assertions`. Only the first caller
/// names the shared assertion; later callers join the existing one.
pub fn keep_awake(reason: &str) -> Result<KeepAwake, Error> {
    let mut state = KEEP_AWAKE.lock().unwrap_or_else(|e| e.into_inner());

    match state.as_mut() {
        Some((count, _)) => *count += 1,
        None => {
            let name = cf::String::from_str(reason);
            let assertion = pm::Assertion::with_name(
                &*name,
                pm::assertions::prevent_user_idle_system_sleep(),
                pm::AssertionLevel::ON,
            )
            .map_err(|_| Error::Unavailable("IOPMAssertionCreateWithName"))?;
            *state = Some((1, assertion));
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
            // Dropping the assertion calls IOPMAssertionRelease.
            *state = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REASON: &str = "power-crate-keep-awake-test";

    fn registered_with_os() -> bool {
        let out = std::process::Command::new("pmset")
            .args(["-g", "assertions"])
            .output()
            .expect("pmset should be present on macOS");
        String::from_utf8_lossy(&out.stdout).contains(REASON)
    }

    /// One test, not three: the assertion is process-wide shared state, so
    /// parallel tests would see each other's guards.
    #[test]
    fn holds_one_shared_assertion_until_the_last_guard_drops() {
        assert!(!registered_with_os(), "leaked from an earlier run");

        let first = keep_awake(REASON).expect("assertion should be created");
        assert!(
            registered_with_os(),
            "the OS should report our assertion by name"
        );

        let second = keep_awake(REASON).expect("second caller should join");
        {
            let state = KEEP_AWAKE.lock().unwrap();
            assert_eq!(state.as_ref().map(|(count, _)| *count), Some(2));
        }

        drop(second);
        assert!(
            registered_with_os(),
            "one guard remains, so sleep must still be held off"
        );

        drop(first);
        assert!(
            !registered_with_os(),
            "the last drop must release the assertion"
        );
    }
}
