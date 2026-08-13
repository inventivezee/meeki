use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::process::{Child, Command};
use tokio::sync::watch;

use crate::{Error, SupportedModel};

const MIN_CTX_SIZE: u32 = 8_192;
const MAX_CTX_SIZE: u32 = 262_144;
const CTX_SIZE_ENV: &str = "MEEKI_LLM_CTX_SIZE";

const GIB: u64 = 1024 * 1024 * 1024;
const MIB: u64 = 1024 * 1024;

/// llama.cpp allocates one sliding-window KV cache per slot, so slots multiply
/// the fixed part of the cache. `-np auto` picks 4 on this hardware, which on
/// Gemma 4 12B spends 1440 MiB on window caches where one slot spends 480. The
/// desktop app only ever has a single request in flight.
const SERVER_SLOTS: u32 = 1;

/// Smallest run of tokens worth KV-shifting rather than reprocessing. Chunks
/// below this cost more in shifting bookkeeping than the prefill they save.
const CACHE_REUSE_MIN_CHUNK: u32 = 256;

/// Graph, logits and Metal scratch buffers. These scale with batch size rather
/// than context, so they are a constant rather than a per-token cost.
const COMPUTE_OVERHEAD_BYTES: u64 = 384 * MIB;

/// Beyond this the KV cache buys context the app never fills — even a long
/// meeting transcript is well under 20k tokens — while prefill time keeps
/// growing linearly, which is what a user on a memory-bandwidth-bound machine
/// actually feels. `MEEKI_LLM_CTX_SIZE` can still raise it to `MAX_CTX_SIZE`.
const DEFAULT_CTX_CEILING: u32 = 20_480;

/// Metal will not wire more than ~75% of unified memory (measured: 11.84 GiB of
/// a 16 GiB M1), and macOS plus the app's own WebKit processes need a real
/// share of the rest. The budget is whichever of those two limits binds first.
fn server_memory_budget(total_memory_bytes: u64) -> u64 {
    let metal_limit = total_memory_bytes / 4 * 3;
    let host_reserve = (total_memory_bytes / 2).clamp(3 * GIB, 8 * GIB);
    metal_limit.min(total_memory_bytes.saturating_sub(host_reserve))
}

/// llama.cpp reserves the whole KV cache at startup rather than growing it on
/// demand, so `--ctx-size` costs memory whether or not a conversation ever
/// fills it. A fixed 65,536 was sized against Qwen 3.6's unusually cheap
/// ~20 KiB/token layout and is catastrophic for the dense models in the same
/// catalog: Qwen 3 4B costs 144 KiB/token, so 64k reserves 9 GiB of KV on the
/// 8 GiB Macs it is recommended to.
fn adaptive_ctx_size(model: &SupportedModel, total_memory_bytes: u64) -> u32 {
    round_to_cache_padding(
        max_affordable_ctx_size(model, total_memory_bytes).min(DEFAULT_CTX_CEILING),
    )
}

/// The largest window this Mac could hold if something actually needed it. The
/// default deliberately sits below this — see `DEFAULT_CTX_CEILING` — but a
/// long meeting is the one case where paying the memory beats failing.
fn max_affordable_ctx_size(model: &SupportedModel, total_memory_bytes: u64) -> u32 {
    let per_token = model.kv_bytes_per_token().max(1);

    let affordable = server_memory_budget(total_memory_bytes)
        .saturating_sub(model.model_size())
        .saturating_sub(model.kv_window_bytes(SERVER_SLOTS))
        .saturating_sub(COMPUTE_OVERHEAD_BYTES)
        / per_token;

    round_to_cache_padding(affordable.min(MAX_CTX_SIZE as u64) as u32)
}

/// llama.cpp pads the cache to 256 tokens; round down so the padding cannot
/// push the allocation back over the budget we just computed.
fn round_to_cache_padding(ctx: u32) -> u32 {
    (ctx / 256 * 256).max(MIN_CTX_SIZE)
}

fn total_memory_bytes() -> u64 {
    sysinfo::System::new_with_specifics(
        sysinfo::RefreshKind::nothing().with_memory(sysinfo::MemoryRefreshKind::everything()),
    )
    .total_memory()
}

/// -1 lets a reasoning model think for as long as it needs, bounded only by the
/// per-request output budget.
const DEFAULT_THINK_BUDGET: i32 = -1;
const THINK_BUDGET_ENV: &str = "MEEKI_LLM_THINK_BUDGET";

/// llama-server unloads the weights after this long without a request and
/// reloads them on the next one, so an idle app stops holding 7-14 GB. Five
/// minutes keeps a burst of related work (summary, then title, then a couple of
/// chat turns) on one load while still releasing memory before a recording gets
/// long enough to need it. Reloading costs ~3 s warm and ~6 s cold for a 7 GB
/// model, which is why the timeout is not shorter.
const DEFAULT_SLEEP_IDLE_SECONDS: i64 = 300;
/// Below this the server thrashes: a reload costs more than the memory it frees.
const MIN_SLEEP_IDLE_SECONDS: i64 = 30;
const SLEEP_IDLE_ENV: &str = "MEEKI_LLM_SLEEP_IDLE_SECONDS";

fn parse_ctx_size(raw: Option<&str>, fallback: u32) -> u32 {
    raw.and_then(|value| value.trim().parse::<u32>().ok())
        .map(|value| value.clamp(MIN_CTX_SIZE, MAX_CTX_SIZE))
        .unwrap_or(fallback)
}

/// The largest window asked for so far in this process.
///
/// Two callers ask for a server independently and disagree about size: the
/// liveness poll passes nothing and gets the default, while sizing a summary
/// passes what that transcript needs. Without a shared floor the poll starts a
/// default-sized server and the summary immediately replaces it — two
/// llama-servers a fraction of a second apart, each loading the weights again,
/// on every single recording of a batch. Flooring every start at the high-water
/// mark makes the poll start the server the summary was going to ask for, so
/// the summary reuses it instead of replacing it.
///
/// Only ever rises, which matches the documented contract: a window already
/// paid for is never given back mid-session, because shrinking costs a full
/// reload and buys nothing.
static CTX_HIGH_WATER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// The window to start llama-server with.
///
/// `needed` is what the work in hand actually requires — a long transcript
/// plus the summary it has to produce. It only ever raises the window above
/// the default, and never past what this Mac can hold, so a caller can ask for
/// what it wants without knowing anything about the hardware. The env var
/// still wins over both, so a support session can pin a window outright.
pub fn resolved_ctx_size(model: Option<&SupportedModel>, needed: Option<u32>) -> u32 {
    let fallback = match model {
        Some(model) => {
            let total = total_memory_bytes();
            let default = adaptive_ctx_size(model, total);
            match needed {
                // Written as max-then-min rather than `clamp` so it stays
                // panic-free if a future default ever exceeds what fits.
                Some(needed) => needed
                    .max(default)
                    .min(max_affordable_ctx_size(model, total).max(default)),
                None => default,
            }
        }
        None => MIN_CTX_SIZE,
    };
    let previous = CTX_HIGH_WATER.fetch_max(fallback, std::sync::atomic::Ordering::Relaxed);
    let fallback = fallback.max(previous);

    parse_ctx_size(std::env::var(CTX_SIZE_ENV).ok().as_deref(), fallback)
}

fn parse_think_budget(raw: Option<&str>) -> i32 {
    raw.and_then(|value| value.trim().parse::<i32>().ok())
        .map(|value| value.max(-1))
        .unwrap_or(DEFAULT_THINK_BUDGET)
}

fn resolve_think_budget() -> i32 {
    parse_think_budget(std::env::var(THINK_BUDGET_ENV).ok().as_deref())
}

/// `0` and any negative value disable sleeping, matching llama-server's own
/// `-1 = disabled` contract.
fn parse_sleep_idle_seconds(raw: Option<&str>) -> i64 {
    raw.and_then(|value| value.trim().parse::<i64>().ok())
        .map(|value| {
            if value <= 0 {
                -1
            } else {
                value.max(MIN_SLEEP_IDLE_SECONDS)
            }
        })
        .unwrap_or(DEFAULT_SLEEP_IDLE_SECONDS)
}

/// Exposed so the UI can tell, without probing, whether the next request will
/// have to wake the server. llama-server answers /health identically asleep and
/// awake, and any request that would reveal the difference wakes it — so the
/// only honest signal is knowing the timeout and our own last-request time.
pub fn sleep_idle_seconds() -> i64 {
    resolve_sleep_idle_seconds()
}

fn resolve_sleep_idle_seconds() -> i64 {
    parse_sleep_idle_seconds(std::env::var(SLEEP_IDLE_ENV).ok().as_deref())
}

pub struct LlmServer {
    url: String,
    model_id: String,
    ctx_size: u32,
    port: u16,
    child: Child,
    exit_tx: watch::Sender<bool>,
    exit_rx: watch::Receiver<bool>,
}

impl LlmServer {
    /// `ctx_size` is already resolved by the caller — see `resolved_ctx_size` —
    /// because the caller also has to compare it against a running server to
    /// decide whether that server can be reused.
    ///
    /// `preferred_port` is the port of the server being replaced. Growing the
    /// context window means replacing the process, and the app has already
    /// handed the old base URL to the AI SDK; keeping the port means an
    /// in-flight model keeps working instead of talking to a dead socket. Falls
    /// back to a fresh port if that one is no longer bindable.
    pub async fn start_with_model_path(
        name: String,
        file_path: impl AsRef<Path>,
        server_bin: impl AsRef<Path>,
        ctx_size: u32,
        preferred_port: Option<u16>,
    ) -> Result<Self, Error> {
        let model_path = file_path.as_ref();
        if !model_path.exists() {
            return Err(Error::Other(format!(
                "model file not found: {}",
                model_path.display()
            )));
        }

        let server_bin = server_bin.as_ref();
        if !server_bin.exists() {
            return Err(Error::Other(format!(
                "llama-server runtime not found at {}. Rebuild with prepare-llama-cpp.",
                server_bin.display()
            )));
        }

        let port = match preferred_port {
            Some(port) if port_is_bindable(port) => port,
            _ => free_port()?,
        };
        let host = "127.0.0.1";
        let url = format!("http://{host}:{port}/v1");
        let work_dir = server_bin
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));

        let mut child = Command::new(server_bin)
            .current_dir(&work_dir)
            .arg("--model")
            .arg(model_path)
            .arg("--host")
            .arg(host)
            .arg("--port")
            .arg(port.to_string())
            .arg("--ctx-size")
            .arg(ctx_size.to_string())
            .arg("--parallel")
            .arg(SERVER_SLOTS.to_string())
            // Prefill dominates the wait — measured 153 tok/s, so a note plus
            // system prompt plus tool definitions costs ~13 s before the first
            // token can exist. An exact prefix match already reuses the cache
            // (1996 tokens in 0.1 s); this rescues the near-miss case by
            // KV-shifting the common prefix instead of reprocessing it.
            .arg("--cache-reuse")
            .arg(CACHE_REUSE_MIN_CHUNK.to_string())
            // Thoughts go to `reasoning_content` so they never land in a note,
            // and short tasks (titles, key facts) opt out by default; the
            // summary opts back in per request.
            .arg("--reasoning-format")
            .arg("deepseek")
            .arg("--reasoning-budget")
            .arg(resolve_think_budget().to_string())
            .arg("--chat-template-kwargs")
            .arg(r#"{"enable_thinking":false}"#)
            .arg("--sleep-idle-seconds")
            .arg(resolve_sleep_idle_seconds().to_string())
            .arg("--alias")
            .arg(&name)
            .arg("-ngl")
            .arg("99")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| Error::Other(format!("failed to start llama-server: {e}")))?;

        let health_url = format!("http://{host}:{port}/health");
        if let Err(error) = wait_for_health(&health_url, Duration::from_secs(180)).await {
            let _ = child.kill().await;
            return Err(error);
        }

        let (exit_tx, exit_rx) = watch::channel(false);
        Ok(Self {
            url,
            model_id: name,
            ctx_size,
            port,
            child,
            exit_tx,
            exit_rx,
        })
    }

    pub fn url(&self) -> &str {
        &self.url
    }

    pub fn model_id(&self) -> &str {
        &self.model_id
    }

    /// The window this process was started with. `--ctx-size` is fixed for the
    /// life of the process, so changing it means replacing the server.
    pub fn ctx_size(&self) -> u32 {
        self.ctx_size
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn is_running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    pub fn exit_receiver(&self) -> watch::Receiver<bool> {
        self.exit_rx.clone()
    }

    pub async fn stop(mut self) {
        let _ = self.exit_tx.send(true);
        let _ = self.child.kill().await;
        let _ = self.child.wait().await;
    }
}

/// Whether the replaced server has actually let go of its port. Binding and
/// dropping is the only honest test; the gap before llama-server binds it again
/// is microseconds on loopback, and `wait_for_health` catches a loss anyway.
fn port_is_bindable(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn free_port() -> Result<u16, Error> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| Error::Other(format!("failed to allocate local port: {e}")))?;
    Ok(listener
        .local_addr()
        .map_err(|e| Error::Other(format!("failed to read local port: {e}")))?
        .port())
}

async fn wait_for_health(url: &str, timeout: Duration) -> Result<(), Error> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| Error::Other(format!("failed to create health client: {e}")))?;
    let started = std::time::Instant::now();

    loop {
        if started.elapsed() > timeout {
            return Err(Error::Other(
                "timed out waiting for local LLM server to become ready".to_string(),
            ));
        }

        match client.get(url).send().await {
            Ok(response) if response.status().is_success() => return Ok(()),
            _ => tokio::time::sleep(Duration::from_millis(400)).await,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_when_unset_or_invalid() {
        assert_eq!(parse_ctx_size(None, 16_384), 16_384);
        assert_eq!(parse_ctx_size(Some(""), 16_384), 16_384);
        assert_eq!(parse_ctx_size(Some("not-a-number"), 16_384), 16_384);
    }

    #[test]
    fn clamps_to_supported_window() {
        assert_eq!(parse_ctx_size(Some("1024"), 16_384), MIN_CTX_SIZE);
        assert_eq!(parse_ctx_size(Some("999999999"), 16_384), MAX_CTX_SIZE);
        assert_eq!(parse_ctx_size(Some(" 131072 "), 16_384), 131_072);
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn context_never_outgrows_the_machine_it_runs_on() {
        for model in crate::SUPPORTED_MODELS {
            let total = model.min_memory_bytes();
            let ctx = adaptive_ctx_size(model, total);

            let resident = model.model_size()
                + model.kv_window_bytes(SERVER_SLOTS)
                + COMPUTE_OVERHEAD_BYTES
                + ctx as u64 * model.kv_bytes_per_token();

            assert!(
                resident <= server_memory_budget(total) || ctx == MIN_CTX_SIZE,
                "{model:?} on its own {} GiB minimum wants {} MiB but only affords {} MiB",
                total / GIB,
                resident / MIB,
                server_memory_budget(total) / MIB
            );
        }
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn the_fixed_default_would_have_overcommitted_small_macs() {
        // Qwen 3 4B is what an 8 GiB Mac is told to run, and 64k of its
        // 144 KiB/token cache is 9 GiB of KV on a machine with 8 GiB total.
        let model = SupportedModel::Qwen3_4bQ4Km;
        assert!(65_536 * model.kv_bytes_per_token() > 8 * GIB);
        assert!(adaptive_ctx_size(&model, 8 * GIB) < 16_384);
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn context_grows_with_available_memory() {
        let model = SupportedModel::Gemma4_12bQ4Km;
        assert!(adaptive_ctx_size(&model, 16 * GIB) <= DEFAULT_CTX_CEILING);
        assert!(adaptive_ctx_size(&model, 8 * GIB) <= adaptive_ctx_size(&model, 16 * GIB));
        assert_eq!(adaptive_ctx_size(&model, 64 * GIB), DEFAULT_CTX_CEILING);
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn a_long_transcript_can_raise_the_window_but_never_lower_it() {
        let model = SupportedModel::Gemma4_12bQ4Km;
        let default = resolved_ctx_size(Some(&model), None);

        // Asking for less keeps the default: shrinking buys nothing and costs a
        // full weight reload.
        assert_eq!(resolved_ctx_size(Some(&model), Some(1_024)), default);
        assert_eq!(resolved_ctx_size(Some(&model), Some(default)), default);
        assert!(resolved_ctx_size(Some(&model), Some(default + 8_192)) > default);
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn growth_stops_at_what_the_machine_can_hold() {
        // A demand no Mac can satisfy must still resolve to something that
        // starts, rather than to the number that was asked for.
        for total in [8, 16, 24, 32, 64] {
            let model = crate::recommended_model_for_memory(total * GIB).unwrap();
            let ceiling = max_affordable_ctx_size(&model, total * GIB);
            let resident = model.model_size()
                + model.kv_window_bytes(SERVER_SLOTS)
                + COMPUTE_OVERHEAD_BYTES
                + ceiling as u64 * model.kv_bytes_per_token();

            assert!(
                resident <= server_memory_budget(total * GIB) || ceiling == MIN_CTX_SIZE,
                "{model:?} on {total} GiB would grow to {ceiling} tokens, needing {} MiB of {} MiB",
                resident / MIB,
                server_memory_budget(total * GIB) / MIB
            );
            assert!(ceiling >= adaptive_ctx_size(&model, total * GIB));
        }
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn the_default_leaves_headroom_to_grow_into() {
        // Otherwise the whole mechanism is a no-op on the roomy Macs that can
        // actually afford a long meeting.
        let model = SupportedModel::Gemma4_26bA4bIq4Xs;
        assert!(max_affordable_ctx_size(&model, 64 * GIB) > adaptive_ctx_size(&model, 64 * GIB));
    }

    #[test]
    fn sleep_idle_defaults_and_disables() {
        assert_eq!(parse_sleep_idle_seconds(None), DEFAULT_SLEEP_IDLE_SECONDS);
        assert_eq!(
            parse_sleep_idle_seconds(Some("nonsense")),
            DEFAULT_SLEEP_IDLE_SECONDS
        );
        assert_eq!(parse_sleep_idle_seconds(Some("0")), -1);
        assert_eq!(parse_sleep_idle_seconds(Some("-1")), -1);
        assert_eq!(parse_sleep_idle_seconds(Some("-99")), -1);
    }

    #[test]
    fn sleep_idle_floors_at_the_thrash_threshold() {
        assert_eq!(parse_sleep_idle_seconds(Some("5")), MIN_SLEEP_IDLE_SECONDS);
        assert_eq!(parse_sleep_idle_seconds(Some(" 900 ")), 900);
        assert_eq!(parse_sleep_idle_seconds(Some("30")), 30);
    }

    #[test]
    fn think_budget_defaults_to_unrestricted() {
        assert_eq!(parse_think_budget(None), -1);
        assert_eq!(parse_think_budget(Some("nonsense")), -1);
        assert_eq!(parse_think_budget(Some("4096")), 4096);
        assert_eq!(parse_think_budget(Some("0")), 0);
        assert_eq!(parse_think_budget(Some("-99")), -1);
    }
}
