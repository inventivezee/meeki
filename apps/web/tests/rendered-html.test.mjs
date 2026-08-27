import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

/**
 * The Worker build exported a fetch handler this file could import directly and
 * call with a mock ASSETS binding. A Next server has no such entry point, so the
 * harness starts the real thing and speaks HTTP to it.
 *
 * Every assertion below is unchanged from the Workers version — only the way the
 * HTML is obtained differs. `pnpm test` runs `next build` first.
 */
const PORT = Number(process.env.TEST_PORT ?? 3101);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
let server;

before(async () => {
  // The local binary, not `npx`: npx adds a process layer that survives kill()
  // and leaves the port held for the next run.
  server = spawn(
    join(APP_DIR, "node_modules/.bin/next"),
    ["start", "-p", String(PORT), "-H", "127.0.0.1"],
    {
      cwd: APP_DIR,
      stdio: "ignore",
      detached: true,
      env: { ...process.env, SITE_ORIGIN: "https://meeki.ai" },
    },
  );

  const deadline = Date.now() + 60_000;
  for (;;) {
    if (server.exitCode !== null) {
      throw new Error(`next start exited early with code ${server.exitCode}`);
    }
    try {
      const probe = await fetch(`${ORIGIN}/`, {
        headers: { accept: "text/html" },
      });
      if (probe.ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline)
      throw new Error(`next start did not answer on ${ORIGIN}`);
    await sleep(250);
  }
});

after(() => {
  // Negative pid = the whole process group, so no orphan keeps the port.
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
});

async function render(path = "/") {
  return fetch(`${ORIGIN}${path}`, {
    headers: { accept: "text/html" },
    redirect: "manual",
  });
}

async function htmlFor(path) {
  const response = await render(path);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  return response.text();
}

function assertSharedProof(html) {
  assert.match(html, /Fully private/i);
  assert.match(html, /Fully open source/i);
  assert.match(html, /Download Meeki/i);
  assert.match(html, /View Meeki on GitHub/i);
  assert.match(html, /https:\/\/github\.com\/inventivezee\/meeki/);
  assert.match(html, /\/og\.png/i);
  assert.match(html, /meeki-rabbit-notekeeper-cutout\.png/i);
  assert.match(html, /Meeki’s rabbit notekeeper holding a notepad/i);
  assert.match(html, /object-fit:contain/i);
  assert.doesNotMatch(html, /Website variations/i);
  assert.doesNotMatch(html, /href="\/personal"/i);
  assert.doesNotMatch(html, /Meeki design study|Glassbox|Quiet Companion/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
}

test("server-renders the private notekeeper variation", async () => {
  const html = await htmlFor("/");
  assert.match(
    html,
    /<title>Meeki — Your private meeting notekeeper<\/title>/i,
  );
  assert.match(
    html,
    /Meeki is your[\s\S]*<strong>private<\/strong>[\s\S]*meeting/i,
  );
  assert.match(html, /<em>notekeeper\.<\/em>/i);
  assert.match(html, /A keeper, not a collector/i);
  assertSharedProof(html);
});

test("server-renders the personal notekeeper variation", async () => {
  const html = await htmlFor("/personal");
  assert.match(
    html,
    /<title>Meeki — Your personal meeting notekeeper<\/title>/i,
  );
  assert.match(
    html,
    /Meeki is your[\s\S]*<strong>personal<\/strong>[\s\S]*meeting/i,
  );
  assert.match(html, /<em>notekeeper\.<\/em>/i);
  assert.match(html, /Listens\. Tidies\. Remembers\./i);
  assertSharedProof(html);
});
