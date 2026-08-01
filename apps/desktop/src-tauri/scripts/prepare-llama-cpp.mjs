import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const release = process.env.MEEKI_LLAMA_CPP_RELEASE ?? "b10067";

// The arch has to follow the build target, not the machine doing the building.
// A universal/Intel release built on an Apple Silicon runner would otherwise
// ship arm64 llama-server binaries inside an x86_64 app, which only fails at
// runtime on the user's Mac.
const target = process.env.TAURI_ENV_TARGET_TRIPLE ?? "";
const arch = target.startsWith("x86_64")
  ? "x64"
  : target.startsWith("aarch64")
    ? "arm64"
    : process.arch === "x64"
      ? "x64"
      : "arm64";

const dest = join(__dirname, "../resources/llama-cpp");
const serverPath = join(dest, "llama-server");

if (existsSync(serverPath)) {
  console.log(`llama-server already present at ${serverPath}`);
  process.exit(0);
}

console.log(`Preparing llama.cpp ${release} for macos-${arch}`);

const url = `https://github.com/ggml-org/llama.cpp/releases/download/${release}/llama-${release}-bin-macos-${arch}.tar.gz`;
const tmpTar = join("/tmp", `llama-${release}-bin-macos-${arch}.tar.gz`);
const tmpDir = join("/tmp", `llama-${release}-extract-${arch}`);

console.log(`Downloading ${url}`);
const response = await fetch(url);
if (!response.ok || !response.body) {
  throw new Error(`Failed to download llama.cpp: ${response.status}`);
}
await pipeline(Readable.fromWeb(response.body), createWriteStream(tmpTar));

mkdirSync(tmpDir, { recursive: true });
execFileSync("tar", ["-xzf", tmpTar, "-C", tmpDir], { stdio: "inherit" });

const extracted = join(tmpDir, `llama-${release}`);
mkdirSync(dest, { recursive: true });
execFileSync(
  "bash",
  [
    "-lc",
    `cp "${extracted}/llama-server" "${dest}/" && cp "${extracted}/"*.dylib "${dest}/" && chmod +x "${dest}/llama-server" && xattr -dr com.apple.quarantine "${dest}" || true`,
  ],
  { stdio: "inherit" },
);

chmodSync(serverPath, 0o755);
console.log(`Prepared llama-server runtime in ${dest}`);
