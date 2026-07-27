import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const release = process.env.MEEKI_LLAMA_CPP_RELEASE ?? "b10067";
const dest = join(__dirname, "../resources/llama-cpp");
const serverPath = join(dest, "llama-server");

if (existsSync(serverPath)) {
  console.log(`llama-server already present at ${serverPath}`);
  process.exit(0);
}

const url = `https://github.com/ggml-org/llama.cpp/releases/download/${release}/llama-${release}-bin-macos-arm64.tar.gz`;
const tmpTar = join("/tmp", `llama-${release}-bin-macos-arm64.tar.gz`);
const tmpDir = join("/tmp", `llama-${release}-extract`);

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
