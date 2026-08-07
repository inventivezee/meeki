import { readdirSync, readFileSync, watch } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const changelogDir = resolve(__dirname, "../../../packages/changelog/content");

const VIRTUAL_ID = "virtual:changelog";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

function readAll(): Record<string, string> {
  try {
    const files = readdirSync(changelogDir).filter(
      (f) => f.endsWith(".md") && /^\d/.test(f),
    );
    const entries: Record<string, string> = {};
    for (const file of files) {
      try {
        entries[file.replace(".md", "")] = readFileSync(
          resolve(changelogDir, file),
          "utf-8",
        );
      } catch {}
    }
    return entries;
  } catch {
    return {};
  }
}

function sortVersionsDescending(versions: string[]): string[] {
  return [...versions].sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true }),
  );
}

/**
 * Every entry, keyed by version — not just the newest one.
 *
 * Only the highest-numbered file used to be bundled, and the panel showed it
 * only when it matched the running version. This fork restarted the desktop at
 * 0.0.x while the content directory kept the 1.x lineage, so "latest" resolved
 * to 1.3.11 and no Meeki release could ever match it. Every version shipped
 * with "No changelog available for this version", and adding a 0.0.x file would
 * not have helped, because 1.3.11 still sorts higher.
 */
function buildModule(): string {
  const entries = readAll();
  const versions = sortVersionsDescending(Object.keys(entries));
  const latest = versions[0] ?? null;

  return [
    `export const changelogs = ${JSON.stringify(entries)};`,
    `export const versions = ${JSON.stringify(versions)};`,
    `export const latestVersion = ${JSON.stringify(latest)};`,
    `export const latestContent = ${JSON.stringify(latest ? entries[latest] : null)};`,
  ].join("\n");
}

export function changelog(): Plugin {
  return {
    name: "changelog",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id === RESOLVED_ID) return buildModule();
    },
    configureServer(server: ViteDevServer) {
      if (process.env.NODE_ENV === "test" || process.env.VITEST) {
        return;
      }

      try {
        watch(changelogDir, { recursive: true }, () => {
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
            server.ws.send({ type: "full-reload" });
          }
        });
      } catch {}
    },
  };
}
