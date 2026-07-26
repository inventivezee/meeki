#!/usr/bin/env node
/**
 * Download Soniqo models into src-tauri/resources/soniqo-models for the
 * bundled-models build (tauri.conf.bundled-models.json).
 *
 * Usage:
 *   node apps/desktop/src-tauri/scripts/prepare-bundled-models.mjs
 *   MEETY_BUNDLE_MODELS=qwen3-small,parakeet-streaming node ...
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const resourcesRoot = path.join(scriptDir, "..", "resources", "soniqo-models");

const MODELS = {
  "qwen3-small": {
    repo: "aufklarer/Qwen3-ASR-0.6B-MLX-4bit",
    relativeDir: path.join("aufklarer", "Qwen3-ASR-0.6B-MLX-4bit"),
  },
  "qwen3-large": {
    repo: "aufklarer/Qwen3-ASR-1.7B-MLX-8bit",
    relativeDir: path.join("aufklarer", "Qwen3-ASR-1.7B-MLX-8bit"),
  },
  "parakeet-streaming": {
    repo: "aufklarer/Parakeet-EOU-120M-CoreML-INT8",
    relativeDir: path.join("aufklarer", "Parakeet-EOU-120M-CoreML-INT8"),
  },
  "parakeet-batch": {
    repo: "aufklarer/Parakeet-TDT-v3-CoreML-INT8",
    relativeDir: path.join("aufklarer", "Parakeet-TDT-v3-CoreML-INT8"),
  },
};

// Default STT pack: largest Qwen3 ASR + Parakeet streaming for live capture.
const selected = (
  process.env.MEETY_BUNDLE_MODELS ?? "qwen3-large,parakeet-streaming"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

for (const key of selected) {
  if (!(key in MODELS)) {
    console.error(`[prepare-bundled-models] Unknown model key: ${key}`);
    console.error(`Known keys: ${Object.keys(MODELS).join(", ")}`);
    process.exit(1);
  }
}

fs.mkdirSync(resourcesRoot, { recursive: true });

function runHfDownload(repo, dest) {
  const python = process.env.PYTHON ?? "python3";
  const code = `
from huggingface_hub import snapshot_download
import sys
snapshot_download(repo_id=sys.argv[1], local_dir=sys.argv[2])
`;
  const result = spawnSync(python, ["-c", code, repo, dest], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `Failed to download ${repo} (exit ${result.status ?? "unknown"})`,
    );
  }
}

function modelLooksReady(dest, key) {
  if (key.startsWith("qwen3")) {
    return (
      fs.existsSync(path.join(dest, "vocab.json")) &&
      fs.existsSync(path.join(dest, "merges.txt")) &&
      fs.existsSync(path.join(dest, "tokenizer_config.json")) &&
      fs.readdirSync(dest).some((name) => name.endsWith(".safetensors"))
    );
  }

  return (
    fs.existsSync(path.join(dest, "config.json")) &&
    fs.existsSync(path.join(dest, "vocab.json"))
  );
}

for (const key of selected) {
  const { repo, relativeDir } = MODELS[key];
  const dest = path.join(resourcesRoot, relativeDir);

  if (modelLooksReady(dest, key)) {
    console.log(`[prepare-bundled-models] ${key} already present at ${dest}`);
    continue;
  }

  console.log(`[prepare-bundled-models] Downloading ${repo} → ${dest}`);
  fs.mkdirSync(dest, { recursive: true });
  runHfDownload(repo, dest);

  if (!modelLooksReady(dest, key)) {
    console.error(
      `[prepare-bundled-models] Download finished but ${key} looks incomplete`,
    );
    process.exit(1);
  }
}

console.log(`[prepare-bundled-models] Ready under ${resourcesRoot}`);
