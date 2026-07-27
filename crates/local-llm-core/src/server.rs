use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::process::{Child, Command};
use tokio::sync::watch;

use crate::Error;

/// Qwen 3.6 is trained for 262,144 tokens. The hybrid layout (only 10 of 40
/// layers use full attention, with 2 KV heads at head dim 256) costs ~20 KB of
/// KV cache per token, and llama.cpp reserves the whole window at startup
/// rather than growing it on demand, so 64k costs ~1.3 GB whether or not a
/// conversation ever fills it.
const DEFAULT_CTX_SIZE: u32 = 65_536;
const MIN_CTX_SIZE: u32 = 8_192;
const MAX_CTX_SIZE: u32 = 262_144;
const CTX_SIZE_ENV: &str = "MEEKI_LLM_CTX_SIZE";

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

fn parse_ctx_size(raw: Option<&str>) -> u32 {
    raw.and_then(|value| value.trim().parse::<u32>().ok())
        .map(|value| value.clamp(MIN_CTX_SIZE, MAX_CTX_SIZE))
        .unwrap_or(DEFAULT_CTX_SIZE)
}

fn resolve_ctx_size() -> u32 {
    parse_ctx_size(std::env::var(CTX_SIZE_ENV).ok().as_deref())
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

fn resolve_sleep_idle_seconds() -> i64 {
    parse_sleep_idle_seconds(std::env::var(SLEEP_IDLE_ENV).ok().as_deref())
}

pub struct LlmServer {
    url: String,
    model_id: String,
    child: Child,
    exit_tx: watch::Sender<bool>,
    exit_rx: watch::Receiver<bool>,
}

impl LlmServer {
    pub async fn start_with_model_path(
        name: String,
        file_path: impl AsRef<Path>,
        server_bin: impl AsRef<Path>,
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

        let port = free_port()?;
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
            .arg(resolve_ctx_size().to_string())
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
        assert_eq!(parse_ctx_size(None), DEFAULT_CTX_SIZE);
        assert_eq!(parse_ctx_size(Some("")), DEFAULT_CTX_SIZE);
        assert_eq!(parse_ctx_size(Some("not-a-number")), DEFAULT_CTX_SIZE);
    }

    #[test]
    fn clamps_to_supported_window() {
        assert_eq!(parse_ctx_size(Some("1024")), MIN_CTX_SIZE);
        assert_eq!(parse_ctx_size(Some("999999999")), MAX_CTX_SIZE);
        assert_eq!(parse_ctx_size(Some(" 131072 ")), 131_072);
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
