import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(__dirname, "../..");
const bundleRoot = join(desktopRoot, "src-tauri/target/release/bundle");
const outRoot = join(desktopRoot, "dist-packaging/app");

function collectArtifacts(root) {
  if (!existsSync(root)) {
    return [];
  }

  const found = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.endsWith(".app")) {
          found.push(path);
        } else {
          stack.push(path);
        }
        continue;
      }
      if (/\.(dmg|app\.tar\.gz|rpm|deb|AppImage)$/i.test(entry.name)) {
        found.push(path);
      }
    }
  }
  return found;
}

function isLightweightProductArtifact(path) {
  const name = basename(path);
  return name === "Anarlog.app" || /^Anarlog_\d.*\.dmg$/i.test(name);
}

const artifacts = collectArtifacts(bundleRoot).filter(
  isLightweightProductArtifact,
);

mkdirSync(outRoot, { recursive: true });

if (artifacts.length === 0) {
  console.warn(
    "No lightweight Anarlog packaging artifacts found under",
    bundleRoot,
  );
} else {
  for (const artifact of artifacts) {
    const name = basename(artifact);
    const to = join(outRoot, name);
    if (existsSync(to)) {
      rmSync(to, { recursive: true, force: true });
    }
    cpSync(artifact, to, { recursive: true });
    console.log(`Copied ${artifact} -> ${to}`);
  }
}
