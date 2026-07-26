use std::path::{Path, PathBuf};

use crate::{Result, SoniqoModel};

/// Copy prebundled Soniqo weights from an app Resources tree into the runtime
/// HuggingFace cache (`~/Library/Caches/qwen3-speech/models/...`) when missing.
///
/// Expected layout under `bundled_root`:
///   `<org>/<repo>/...`  (e.g. `aufklarer/Qwen3-ASR-0.6B-MLX-4bit/`)
pub fn seed_bundled_models(bundled_root: &Path) -> Result<Vec<SoniqoModel>> {
    if !bundled_root.is_dir() {
        return Ok(Vec::new());
    }

    let mut seeded = Vec::new();

    for model in SoniqoModel::selectable() {
        let relative = PathBuf::from(model.repo());
        let source = bundled_root.join(&relative);
        if !source.is_dir() {
            continue;
        }

        let Ok(dest) = crate::model_cache_dir(*model) else {
            continue;
        };

        if dest.exists() && dir_nonempty(&dest) {
            continue;
        }

        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(crate::Error::Seed)?;
        }

        copy_dir_recursive(&source, &dest).map_err(crate::Error::Seed)?;
        tracing::info!(
            model = model.as_str(),
            source = %source.display(),
            dest = %dest.display(),
            "seeded_bundled_soniqo_model"
        );
        seeded.push(*model);
    }

    Ok(seeded)
}

fn dir_nonempty(path: &Path) -> bool {
    std::fs::read_dir(path)
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false)
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let from = entry.path();
        let to = dest.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else if file_type.is_symlink() {
            // Follow symlinks from HF snapshots (`.cache`/refs) by copying target contents when possible.
            if let Ok(target) = std::fs::canonicalize(&from) {
                if target.is_dir() {
                    copy_dir_recursive(&target, &to)?;
                } else {
                    std::fs::copy(&target, &to)?;
                }
            }
        } else {
            if let Some(parent) = to.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&from, &to)?;
        }
    }

    Ok(())
}
