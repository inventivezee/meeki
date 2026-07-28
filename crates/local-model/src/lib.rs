use std::path::{Path, PathBuf};

pub use meeki_am::AmModel;
use meeki_model_downloader::{DownloadableModel, Error};
pub use meeki_transcribe_soniqo::SoniqoModel;
pub use meeki_whisper_local_model::WhisperModel;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, Eq, Hash, PartialEq)]
pub enum GgufLlmModel {
    #[serde(rename = "qwen3.6-35b-a3b")]
    Qwen36_35bA3bIq4Xs,
    #[serde(rename = "qwen3.6-35b-a3b-q4km")]
    Qwen36_35bA3bQ4Km,
    #[serde(rename = "gemma-4-26b-a4b")]
    Gemma4_26bA4bIq4Xs,
    #[serde(rename = "gemma-4-12b")]
    Gemma4_12bQ4Km,
    #[serde(rename = "qwen3-4b")]
    Qwen3_4bQ4Km,
    #[serde(rename = "llama-3.3-70b")]
    Llama33_70bQ4Km,
    Llama3p2_3bQ4,
    Gemma3_4bQ4,
    HyprLLM,
}

impl GgufLlmModel {
    pub fn file_name(&self) -> &str {
        match self {
            GgufLlmModel::Qwen36_35bA3bIq4Xs => "Qwen3.6-35B-A3B-UD-IQ4_XS.gguf",
            GgufLlmModel::Qwen36_35bA3bQ4Km => "Qwen3.6-35B-A3B-UD-Q4_K_M.gguf",
            GgufLlmModel::Gemma4_26bA4bIq4Xs => "gemma-4-26B-A4B-it-UD-IQ4_XS.gguf",
            GgufLlmModel::Gemma4_12bQ4Km => "gemma-4-12b-it-Q4_K_M.gguf",
            GgufLlmModel::Qwen3_4bQ4Km => "Qwen3-4B-Q4_K_M.gguf",
            GgufLlmModel::Llama33_70bQ4Km => "Llama-3.3-70B-Instruct-Q4_K_M.gguf",
            GgufLlmModel::Llama3p2_3bQ4 => "llm.gguf",
            GgufLlmModel::HyprLLM => "hypr-llm.gguf",
            GgufLlmModel::Gemma3_4bQ4 => "gemma-3-4b-it-Q4_K_M.gguf",
        }
    }

    pub fn model_url(&self) -> &str {
        match self {
            GgufLlmModel::Qwen36_35bA3bIq4Xs => {
                "https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF/resolve/main/Qwen3.6-35B-A3B-UD-IQ4_XS.gguf"
            }
            GgufLlmModel::Qwen36_35bA3bQ4Km => {
                "https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF/resolve/main/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf"
            }
            GgufLlmModel::Gemma4_26bA4bIq4Xs => {
                "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/gemma-4-26B-A4B-it-UD-IQ4_XS.gguf"
            }
            GgufLlmModel::Gemma4_12bQ4Km => {
                "https://huggingface.co/unsloth/gemma-4-12b-it-GGUF/resolve/main/gemma-4-12b-it-Q4_K_M.gguf"
            }
            GgufLlmModel::Qwen3_4bQ4Km => {
                "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf"
            }
            // Deliberately the largest well-known model that still fits in one
            // file: anything past Hugging Face's 50 GB per-file limit ships as
            // shards, which the single-URL downloader cannot fetch.
            GgufLlmModel::Llama33_70bQ4Km => {
                "https://huggingface.co/unsloth/Llama-3.3-70B-Instruct-GGUF/resolve/main/Llama-3.3-70B-Instruct-Q4_K_M.gguf"
            }
            GgufLlmModel::Llama3p2_3bQ4 => {
                "https://huggingface.co/lmstudio-community/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
            }
            // Proprietary package historically hosted on hyprnote CDN — disabled by default.
            // Set MEEKI_HYPR_LLM_URL at build time to re-enable downloads from your own host.
            GgufLlmModel::HyprLLM => option_env!("MEEKI_HYPR_LLM_URL").unwrap_or(""),
            GgufLlmModel::Gemma3_4bQ4 => {
                "https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf"
            }
        }
    }

    pub fn model_size(&self) -> u64 {
        match self {
            GgufLlmModel::Qwen36_35bA3bIq4Xs => 17_730_509_792,
            GgufLlmModel::Qwen36_35bA3bQ4Km => 22_134_528_992,
            GgufLlmModel::Gemma4_26bA4bIq4Xs => 13_597_177_568,
            GgufLlmModel::Gemma4_12bQ4Km => 7_121_861_440,
            GgufLlmModel::Qwen3_4bQ4Km => 2_497_281_312,
            GgufLlmModel::Llama33_70bQ4Km => 42_520_398_432,
            GgufLlmModel::Llama3p2_3bQ4 => 2019377440,
            GgufLlmModel::HyprLLM => 1107409056,
            GgufLlmModel::Gemma3_4bQ4 => 2489894016,
        }
    }

    pub fn model_checksum(&self) -> Option<u32> {
        match self {
            // Large HF quants: skip CRC so one-click download is not blocked on a baked hash.
            GgufLlmModel::Qwen36_35bA3bIq4Xs
            | GgufLlmModel::Qwen36_35bA3bQ4Km
            | GgufLlmModel::Gemma4_26bA4bIq4Xs
            | GgufLlmModel::Gemma4_12bQ4Km
            | GgufLlmModel::Qwen3_4bQ4Km
            | GgufLlmModel::Llama33_70bQ4Km => None,
            GgufLlmModel::Llama3p2_3bQ4 => Some(2831308098),
            GgufLlmModel::HyprLLM => Some(4037351144),
            GgufLlmModel::Gemma3_4bQ4 => Some(2760830291),
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            GgufLlmModel::Qwen36_35bA3bIq4Xs => "Qwen 3.6 35B A3B",
            GgufLlmModel::Qwen36_35bA3bQ4Km => "Qwen 3.6 35B A3B (Q4_K_M)",
            GgufLlmModel::Gemma4_26bA4bIq4Xs => "Gemma 4 26B A4B",
            GgufLlmModel::Gemma4_12bQ4Km => "Gemma 4 12B",
            GgufLlmModel::Qwen3_4bQ4Km => "Qwen 3 4B",
            GgufLlmModel::Llama33_70bQ4Km => "Llama 3.3 70B",
            GgufLlmModel::Llama3p2_3bQ4 => "Llama 3.2 3B Q4",
            GgufLlmModel::HyprLLM => "HyprLLM",
            GgufLlmModel::Gemma3_4bQ4 => "Gemma 3 4B Q4",
        }
    }

    /// What the model is good at, in the user's terms. Size and memory are
    /// rendered separately, so they must not be repeated here.
    pub fn description(&self) -> &'static str {
        match self {
            GgufLlmModel::Qwen36_35bA3bIq4Xs => {
                "Strongest at chat, tool use and step-by-step reasoning. Less faithful than Gemma when summarizing — it tends to add detail the meeting didn't contain."
            }
            GgufLlmModel::Qwen36_35bA3bQ4Km => {
                "The same Qwen 3.6 weights at a higher-fidelity quantization: a small quality gain for 4.4 GB more memory."
            }
            GgufLlmModel::Gemma4_26bA4bIq4Xs => {
                "Sharpest meeting summaries. Mixture-of-experts, so only 3.8B parameters run per token and it answers about as fast as a small model."
            }
            GgufLlmModel::Gemma4_12bQ4Km => {
                "Nearly as faithful as the 26B on summaries, at half the memory. The safe pick for 16 GB Macs."
            }
            GgufLlmModel::Qwen3_4bQ4Km => {
                "Fast and small. Fine for titles and short meetings; drops detail on long, multi-topic ones."
            }
            GgufLlmModel::Llama33_70bQ4Km => {
                "Overkill for meeting summaries — Gemma writes them better and far faster. Worth it only if you want a strong general model to talk to about your notes. Dense 70B, so every parameter runs on every token, and it needs workstation-class memory."
            }
            GgufLlmModel::Llama3p2_3bQ4 => "Legacy lightweight model kept for older installs.",
            GgufLlmModel::Gemma3_4bQ4 => {
                "Previous-generation small Gemma, superseded by Qwen 3 4B."
            }
            GgufLlmModel::HyprLLM => "Legacy Hyprnote summarization model.",
        }
    }

    /// Total machine RAM a model realistically needs, rounded to the Mac
    /// configurations Apple actually sells. Metal only gets ~75% of unified
    /// memory and the KV cache plus compute buffers add ~2 GB on top of the
    /// weights, so this is well above `model_size()`.
    pub fn min_memory_bytes(&self) -> u64 {
        const GIB: u64 = 1024 * 1024 * 1024;

        match self {
            GgufLlmModel::Llama33_70bQ4Km => 64 * GIB,
            GgufLlmModel::Qwen36_35bA3bQ4Km => 36 * GIB,
            GgufLlmModel::Qwen36_35bA3bIq4Xs => 32 * GIB,
            GgufLlmModel::Gemma4_26bA4bIq4Xs => 24 * GIB,
            GgufLlmModel::Gemma4_12bQ4Km => 16 * GIB,
            GgufLlmModel::Qwen3_4bQ4Km
            | GgufLlmModel::Llama3p2_3bQ4
            | GgufLlmModel::Gemma3_4bQ4
            | GgufLlmModel::HyprLLM => 8 * GIB,
        }
    }

    /// Total parameters in billions, not active parameters — a 35B MoE with 3B
    /// active still reasons like a large model, which is what decides whether
    /// it can hold the full tool guidance.
    pub fn parameters_billions(&self) -> u32 {
        match self {
            GgufLlmModel::HyprLLM => 2,
            GgufLlmModel::Llama3p2_3bQ4 => 3,
            GgufLlmModel::Gemma3_4bQ4 | GgufLlmModel::Qwen3_4bQ4Km => 4,
            GgufLlmModel::Gemma4_12bQ4Km => 12,
            GgufLlmModel::Gemma4_26bA4bIq4Xs => 26,
            GgufLlmModel::Qwen36_35bA3bIq4Xs | GgufLlmModel::Qwen36_35bA3bQ4Km => 35,
            GgufLlmModel::Llama33_70bQ4Km => 70,
        }
    }

    /// f16 KV-cache bytes per token, counting only the layers whose cache grows
    /// with the context window. Sliding-window layers are capped at the window
    /// by llama.cpp and are accounted for by `kv_window_bytes` instead.
    ///
    /// Gemma 4 12B is read off the shipped GGUF: 48 layers in a 5:1
    /// sliding-window:full pattern, so the 8 full-attention layers cost
    /// 1 KV head x 512 head dim x 2 (K and V) x 2 bytes = 2 KiB each, 16 KiB per
    /// token in total. Note how much this varies: Qwen 3 4B has no sliding
    /// window and 8 KV heads on all 36 layers, so it costs nine times more per
    /// token than a model three times its size.
    pub fn kv_bytes_per_token(&self) -> u64 {
        const KIB: u64 = 1024;

        match self {
            GgufLlmModel::Gemma4_12bQ4Km => 16 * KIB,
            GgufLlmModel::Gemma4_26bA4bIq4Xs => 24 * KIB,
            GgufLlmModel::Qwen36_35bA3bIq4Xs | GgufLlmModel::Qwen36_35bA3bQ4Km => 20 * KIB,
            GgufLlmModel::Gemma3_4bQ4 => 24 * KIB,
            GgufLlmModel::Qwen3_4bQ4Km => 144 * KIB,
            GgufLlmModel::Llama3p2_3bQ4 | GgufLlmModel::HyprLLM => 112 * KIB,
            GgufLlmModel::Llama33_70bQ4Km => 320 * KIB,
        }
    }

    /// f16 KV-cache bytes for sliding-window layers, which llama.cpp sizes to
    /// the window instead of the context and therefore charges once rather than
    /// per context token. Every server slot gets its own copy.
    ///
    /// Gemma 4 12B: 40 window layers x 8 KV heads x 256 head dim x 2 (K and V)
    /// x 2 bytes = 320 KiB per token, held over a 1024-token window plus one
    /// 512-token ubatch = 480 MiB per slot.
    pub fn kv_window_bytes(&self, slots: u32) -> u64 {
        const MIB: u64 = 1024 * 1024;

        let per_slot = match self {
            GgufLlmModel::Gemma4_12bQ4Km => 480 * MIB,
            GgufLlmModel::Gemma4_26bA4bIq4Xs => 600 * MIB,
            GgufLlmModel::Qwen36_35bA3bIq4Xs | GgufLlmModel::Qwen36_35bA3bQ4Km => 360 * MIB,
            GgufLlmModel::Gemma3_4bQ4 => 120 * MIB,
            GgufLlmModel::Qwen3_4bQ4Km
            | GgufLlmModel::Llama3p2_3bQ4
            | GgufLlmModel::HyprLLM
            | GgufLlmModel::Llama33_70bQ4Km => 0,
        };

        per_slot * slots as u64
    }

    /// Rough seconds to get from "no weights resident" to "answering", used to
    /// pace the warm-up indicator. Measured on an M-series SSD against
    /// llama-server b10067: a 7.1 GB model takes ~3 s with the file still in the
    /// page cache and ~5-6 s once it has been evicted. This tracks the evicted
    /// case so the estimate usually finishes early rather than overrunning.
    pub fn warmup_seconds(&self) -> u32 {
        const BYTES_PER_SECOND: u64 = 1_500_000_000;
        const FIXED_OVERHEAD_SECONDS: u64 = 1;

        (FIXED_OVERHEAD_SECONDS + self.model_size().div_ceil(BYTES_PER_SECOND)) as u32
    }

    pub fn openai_model_id(&self) -> &'static str {
        match self {
            GgufLlmModel::Qwen36_35bA3bIq4Xs => "qwen3.6-35b-a3b",
            GgufLlmModel::Qwen36_35bA3bQ4Km => "qwen3.6-35b-a3b-q4km",
            GgufLlmModel::Gemma4_26bA4bIq4Xs => "gemma-4-26b-a4b",
            GgufLlmModel::Gemma4_12bQ4Km => "gemma-4-12b",
            GgufLlmModel::Qwen3_4bQ4Km => "qwen3-4b",
            GgufLlmModel::Llama33_70bQ4Km => "llama-3.3-70b",
            GgufLlmModel::Llama3p2_3bQ4 => "llm-llama3-2-3b-q4",
            GgufLlmModel::HyprLLM => "llm-meeki-llm",
            GgufLlmModel::Gemma3_4bQ4 => "llm-gemma3-4b-q4",
        }
    }
}

fn gguf_size_matches(actual: u64, expected: u64, checksum: Option<u32>) -> bool {
    if actual == expected {
        return true;
    }
    // CRC-less HF quants: tolerate small size drift so one-click downloads
    // aren't bricked when the remote file is republished.
    if checksum.is_none() {
        let tolerance = (expected / 200).max(32 * 1024 * 1024);
        return actual.abs_diff(expected) <= tolerance;
    }
    false
}

#[derive(Debug, Clone, Copy, Eq, Hash, PartialEq)]
pub enum LocalModelKind {
    Stt,
    Llm,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, Eq, Hash, PartialEq)]
#[serde(untagged)]
pub enum LocalModel {
    Soniqo(SoniqoModel),
    Whisper(WhisperModel),
    Am(AmModel),
    GgufLlm(GgufLlmModel),
}

impl std::fmt::Display for LocalModel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LocalModel::Soniqo(model) => write!(f, "{model}"),
            LocalModel::Whisper(model) => write!(f, "whisper-{model}"),
            LocalModel::Am(model) => write!(f, "am-{model}"),
            LocalModel::GgufLlm(model) => write!(f, "llm-{model:?}"),
        }
    }
}

impl LocalModel {
    pub fn all() -> Vec<LocalModel> {
        let mut models = SoniqoModel::all()
            .iter()
            .copied()
            .map(LocalModel::Soniqo)
            .collect::<Vec<_>>();

        models.extend([
            LocalModel::Whisper(WhisperModel::QuantizedTiny),
            LocalModel::Whisper(WhisperModel::QuantizedTinyEn),
            LocalModel::Whisper(WhisperModel::QuantizedBase),
            LocalModel::Whisper(WhisperModel::QuantizedBaseEn),
            LocalModel::Whisper(WhisperModel::QuantizedSmall),
            LocalModel::Whisper(WhisperModel::QuantizedSmallEn),
            LocalModel::Whisper(WhisperModel::QuantizedLargeTurbo),
            LocalModel::Am(AmModel::ParakeetV2),
            LocalModel::Am(AmModel::ParakeetV3),
            LocalModel::Am(AmModel::WhisperLargeV3),
        ]);

        models.extend([
            LocalModel::GgufLlm(GgufLlmModel::Qwen36_35bA3bIq4Xs),
            LocalModel::GgufLlm(GgufLlmModel::Qwen36_35bA3bQ4Km),
            LocalModel::GgufLlm(GgufLlmModel::Gemma4_26bA4bIq4Xs),
            LocalModel::GgufLlm(GgufLlmModel::Gemma4_12bQ4Km),
            LocalModel::GgufLlm(GgufLlmModel::Qwen3_4bQ4Km),
            LocalModel::GgufLlm(GgufLlmModel::Llama33_70bQ4Km),
            LocalModel::GgufLlm(GgufLlmModel::Llama3p2_3bQ4),
            LocalModel::GgufLlm(GgufLlmModel::HyprLLM),
            LocalModel::GgufLlm(GgufLlmModel::Gemma3_4bQ4),
        ]);

        models
    }

    pub fn kind(&self) -> &'static str {
        match self {
            LocalModel::Soniqo(_) => "stt-soniqo",
            LocalModel::Whisper(_) => "stt-whisper",
            LocalModel::Am(_) => "stt-am",
            LocalModel::GgufLlm(_) => "llm",
        }
    }

    pub fn model_kind(&self) -> LocalModelKind {
        match self {
            LocalModel::Soniqo(_) | LocalModel::Whisper(_) | LocalModel::Am(_) => {
                LocalModelKind::Stt
            }
            LocalModel::GgufLlm(_) => LocalModelKind::Llm,
        }
    }

    pub fn cli_name(&self) -> &'static str {
        match self {
            LocalModel::Soniqo(model) => model.as_str(),
            LocalModel::Whisper(WhisperModel::QuantizedTiny) => "whisper-tiny",
            LocalModel::Whisper(WhisperModel::QuantizedTinyEn) => "whisper-tiny-en",
            LocalModel::Whisper(WhisperModel::QuantizedBase) => "whisper-base",
            LocalModel::Whisper(WhisperModel::QuantizedBaseEn) => "whisper-base-en",
            LocalModel::Whisper(WhisperModel::QuantizedSmall) => "whisper-small",
            LocalModel::Whisper(WhisperModel::QuantizedSmallEn) => "whisper-small-en",
            LocalModel::Whisper(WhisperModel::QuantizedLargeTurbo) => "whisper-large-turbo",
            LocalModel::Am(AmModel::ParakeetV2) => "am-parakeet-v2",
            LocalModel::Am(AmModel::ParakeetV3) => "am-parakeet-v3",
            LocalModel::Am(AmModel::WhisperLargeV3) => "am-whisper-large-v3",
            LocalModel::GgufLlm(model) => model.openai_model_id(),
        }
    }

    pub fn install_path(&self, models_base: &Path) -> PathBuf {
        match self {
            LocalModel::Soniqo(model) => models_base.join("soniqo").join(model.as_str()),
            LocalModel::Whisper(model) => models_base.join("stt").join(model.file_name()),
            LocalModel::Am(model) => models_base.join("stt").join(model.model_dir()),
            LocalModel::GgufLlm(model) => models_base.join("llm").join(model.file_name()),
        }
    }

    pub fn display_name(&self) -> String {
        match self {
            LocalModel::Soniqo(model) => model.display_name().to_string(),
            LocalModel::Whisper(model) => model.display_name().to_string(),
            LocalModel::Am(model) => model.display_name().to_string(),
            LocalModel::GgufLlm(model) => model.display_name().to_string(),
        }
    }

    pub fn description(&self) -> String {
        match self {
            LocalModel::Soniqo(model) => model.description().to_string(),
            LocalModel::Whisper(model) => model.description(),
            LocalModel::Am(model) => model.description().to_string(),
            LocalModel::GgufLlm(model) => model.description().to_string(),
        }
    }

    pub fn is_available_on_current_platform(&self) -> bool {
        let is_apple_silicon = cfg!(target_arch = "aarch64") && cfg!(target_os = "macos");

        match self {
            LocalModel::Soniqo(model) => model.is_available_on_current_platform(),
            LocalModel::Whisper(_) => is_apple_silicon,
            LocalModel::Am(_) => is_apple_silicon,
            LocalModel::GgufLlm(_) => cfg!(target_arch = "aarch64"),
        }
    }
}

impl DownloadableModel for GgufLlmModel {
    fn download_key(&self) -> String {
        format!("llm:{}", self.file_name())
    }

    fn download_url(&self) -> Option<String> {
        let url = self.model_url();
        if url.is_empty() {
            None
        } else {
            Some(url.to_string())
        }
    }

    fn download_checksum(&self) -> Option<u32> {
        self.model_checksum()
    }

    fn download_destination(&self, models_base: &Path) -> PathBuf {
        models_base.join("llm").join(self.file_name())
    }

    fn is_downloaded(&self, models_base: &Path) -> Result<bool, Error> {
        let path = models_base.join("llm").join(self.file_name());
        if !path.exists() {
            return Ok(false);
        }

        let actual =
            meeki_file::file_size(&path).map_err(|e| Error::OperationFailed(e.to_string()))?;
        Ok(gguf_size_matches(
            actual,
            self.model_size(),
            self.model_checksum(),
        ))
    }

    fn finalize_download(&self, _downloaded_path: &Path, _models_base: &Path) -> Result<(), Error> {
        Ok(())
    }

    fn delete_downloaded(&self, models_base: &Path) -> Result<(), Error> {
        let path = models_base.join("llm").join(self.file_name());
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| Error::DeleteFailed(e.to_string()))?;
        }
        Ok(())
    }
}

impl DownloadableModel for LocalModel {
    fn download_key(&self) -> String {
        match self {
            LocalModel::Soniqo(model) => format!("soniqo:{}", model.as_str()),
            LocalModel::Whisper(model) => format!("whisper:{}", model.file_name()),
            LocalModel::Am(model) => format!("am:{}", model.model_dir()),
            LocalModel::GgufLlm(model) => model.download_key(),
        }
    }

    fn download_url(&self) -> Option<String> {
        match self {
            LocalModel::Soniqo(_) => None,
            LocalModel::Whisper(model) => {
                let url = model.model_url();
                (!url.is_empty()).then(|| url.to_string())
            }
            LocalModel::Am(model) => {
                let url = model.tar_url();
                (!url.is_empty()).then(|| url.to_string())
            }
            LocalModel::GgufLlm(model) => model.download_url(),
        }
    }

    fn download_checksum(&self) -> Option<u32> {
        match self {
            LocalModel::Soniqo(_) => None,
            LocalModel::Whisper(model) => Some(model.checksum()),
            LocalModel::Am(model) => Some(model.tar_checksum()),
            LocalModel::GgufLlm(model) => model.download_checksum(),
        }
    }

    fn download_destination(&self, models_base: &Path) -> PathBuf {
        match self {
            LocalModel::Soniqo(model) => models_base.join("soniqo").join(model.as_str()),
            LocalModel::Whisper(model) => models_base.join("stt").join(model.file_name()),
            LocalModel::Am(model) => models_base
                .join("stt")
                .join(format!("{}.tar", model.model_dir())),
            LocalModel::GgufLlm(model) => model.download_destination(models_base),
        }
    }

    fn is_downloaded(&self, models_base: &Path) -> Result<bool, Error> {
        match self {
            LocalModel::Soniqo(model) => meeki_transcribe_soniqo::is_model_downloaded(*model)
                .map_err(|e| Error::OperationFailed(e.to_string())),
            LocalModel::Whisper(model) => {
                Ok(models_base.join("stt").join(model.file_name()).exists())
            }
            LocalModel::Am(model) => model
                .is_downloaded(models_base.join("stt"))
                .map_err(|e| Error::OperationFailed(e.to_string())),
            LocalModel::GgufLlm(model) => model.is_downloaded(models_base),
        }
    }

    fn finalize_download(&self, downloaded_path: &Path, models_base: &Path) -> Result<(), Error> {
        match self {
            LocalModel::Soniqo(_) => Err(Error::FinalizeFailed(
                "Soniqo models are downloaded through the Soniqo bridge".to_string(),
            )),
            LocalModel::Whisper(_) => Ok(()),
            LocalModel::Am(model) => {
                let final_path = models_base.join("stt");
                model
                    .tar_unpack_and_cleanup(downloaded_path, &final_path)
                    .map_err(|e| Error::FinalizeFailed(e.to_string()))
            }
            LocalModel::GgufLlm(model) => model.finalize_download(downloaded_path, models_base),
        }
    }

    fn delete_downloaded(&self, models_base: &Path) -> Result<(), Error> {
        match self {
            LocalModel::Soniqo(model) => meeki_transcribe_soniqo::delete_model(*model)
                .map_err(|e| Error::DeleteFailed(e.to_string())),
            LocalModel::Whisper(model) => {
                let model_path = models_base.join("stt").join(model.file_name());
                if model_path.exists() {
                    std::fs::remove_file(&model_path)
                        .map_err(|e| Error::DeleteFailed(e.to_string()))?;
                }
                Ok(())
            }
            LocalModel::Am(model) => {
                let model_dir = models_base.join("stt").join(model.model_dir());
                if model_dir.exists() {
                    std::fs::remove_dir_all(&model_dir)
                        .map_err(|e| Error::DeleteFailed(e.to_string()))?;
                }
                Ok(())
            }
            LocalModel::GgufLlm(model) => model.delete_downloaded(models_base),
        }
    }

    fn remove_destination_after_finalize(&self) -> bool {
        matches!(self, LocalModel::Am(_))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn soniqo_models_reject_generic_download_finalize() {
        let model = LocalModel::Soniqo(SoniqoModel::ParakeetStreaming);

        let error = model
            .finalize_download(Path::new("download"), Path::new("models"))
            .unwrap_err();

        assert!(error.to_string().contains("Soniqo bridge"));
    }
}
