use std::path::{Path, PathBuf};

#[cfg(target_arch = "aarch64")]
pub static SUPPORTED_MODELS: &[SupportedModel] = &[
    SupportedModel::Gemma4_26bA4bIq4Xs,
    SupportedModel::Gemma4_12bQ4Km,
    SupportedModel::Qwen3_4bQ4Km,
    // Kept selectable for tool-heavy chat, but not recommended by default:
    // the Qwen 3.5/3.6 line trades summarisation faithfulness for agentic skill.
    SupportedModel::Qwen36_35bA3bIq4Xs,
    SupportedModel::Qwen36_35bA3bQ4Km,
];

#[cfg(not(target_arch = "aarch64"))]
pub static SUPPORTED_MODELS: &[SupportedModel] = &[];

pub use meeki_local_model::GgufLlmModel as SupportedModel;

#[derive(serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct ModelInfo {
    pub key: SupportedModel,
    pub name: String,
    pub description: String,
    pub size_bytes: u64,
    pub min_memory_bytes: u64,
    pub warmup_seconds: u32,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct CustomModelInfo {
    pub path: String,
    pub name: String,
}

pub fn llm_models_dir(models_base: &Path) -> PathBuf {
    models_base.join("llm")
}

pub fn list_supported_models() -> Vec<ModelInfo> {
    SUPPORTED_MODELS.iter().map(supported_model_info).collect()
}

pub fn supported_model_info(model: &SupportedModel) -> ModelInfo {
    ModelInfo {
        key: model.clone(),
        name: model.display_name().to_string(),
        description: model.description().to_string(),
        size_bytes: model.model_size(),
        min_memory_bytes: model.min_memory_bytes(),
        warmup_seconds: model.warmup_seconds(),
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub enum ModelIdentifier {
    #[serde(rename = "local")]
    Local,
    #[serde(rename = "mock-onboarding")]
    MockOnboarding,
}

const GIB: u64 = 1024 * 1024 * 1024;

/// Weights are resident for the whole session alongside the STT models, the
/// app, and macOS, and Metal only gets ~75% of unified memory, so each tier
/// leaves well over half of RAM free rather than filling it.
pub fn recommended_model_for_memory(total_memory_bytes: u64) -> Option<SupportedModel> {
    if !cfg!(target_arch = "aarch64") {
        return None;
    }

    // Gemma leads open models on summarisation faithfulness, which is the job
    // here; slack below each nominal size because reported memory is never
    // exactly 24 GiB.
    let model = if total_memory_bytes >= 22 * GIB {
        SupportedModel::Gemma4_26bA4bIq4Xs
    } else if total_memory_bytes >= 12 * GIB {
        SupportedModel::Gemma4_12bQ4Km
    } else {
        SupportedModel::Qwen3_4bQ4Km
    };

    Some(model)
}

#[derive(serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct ModelRecommendation {
    pub model: Option<ModelInfo>,
    pub total_memory_bytes: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn picks_a_tier_that_fits_common_macs() {
        assert_eq!(
            recommended_model_for_memory(8 * GIB),
            Some(SupportedModel::Qwen3_4bQ4Km)
        );
        assert_eq!(
            recommended_model_for_memory(16 * GIB),
            Some(SupportedModel::Gemma4_12bQ4Km)
        );
        assert_eq!(
            recommended_model_for_memory(18 * GIB),
            Some(SupportedModel::Gemma4_12bQ4Km)
        );
        assert_eq!(
            recommended_model_for_memory(24 * GIB),
            Some(SupportedModel::Gemma4_26bA4bIq4Xs)
        );
        assert_eq!(
            recommended_model_for_memory(32 * GIB),
            Some(SupportedModel::Gemma4_26bA4bIq4Xs)
        );
        assert_eq!(
            recommended_model_for_memory(64 * GIB),
            Some(SupportedModel::Gemma4_26bA4bIq4Xs)
        );
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn never_recommends_a_model_the_mac_cannot_hold() {
        for total in [8, 16, 18, 24, 32, 36, 48, 64, 96, 128] {
            let bytes = total * GIB;
            let model = recommended_model_for_memory(bytes).unwrap();
            assert!(
                model.min_memory_bytes() <= bytes,
                "{model:?} advertises {} GiB minimum but was recommended to a {total} GiB Mac",
                model.min_memory_bytes() / GIB
            );
        }
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn warmup_estimate_grows_with_weights_and_stays_sane() {
        for model in SUPPORTED_MODELS {
            let seconds = model.warmup_seconds();
            assert!(
                (2..=30).contains(&seconds),
                "{model:?} estimates {seconds}s, which the countdown UI cannot present usefully"
            );
        }

        assert!(
            SupportedModel::Qwen3_4bQ4Km.warmup_seconds()
                < SupportedModel::Gemma4_12bQ4Km.warmup_seconds()
        );
        assert!(
            SupportedModel::Gemma4_12bQ4Km.warmup_seconds()
                < SupportedModel::Gemma4_26bA4bIq4Xs.warmup_seconds()
        );
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn every_recommendation_fits_the_metal_working_set() {
        // Metal only gets ~75% of unified memory, and the KV cache plus compute
        // buffers need roughly 2 GB on top of the weights.
        const KV_AND_COMPUTE_ALLOWANCE: u64 = 2 * GIB;

        for total in [8, 16, 18, 24, 32, 36, 64] {
            let bytes = total * GIB;
            let model = recommended_model_for_memory(bytes).unwrap();
            let needed = model.model_size() + KV_AND_COMPUTE_ALLOWANCE;
            let budget = bytes / 4 * 3;
            assert!(
                needed <= budget,
                "{model:?} needs {needed} bytes but {total} GiB only affords {budget}"
            );
        }
    }
}
