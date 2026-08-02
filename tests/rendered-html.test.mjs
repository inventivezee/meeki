import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
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
  assert.doesNotMatch(html, /Meeki design study|Glassbox|Quiet Companion/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
}

test("server-renders the private notekeeper variation", async () => {
  const html = await htmlFor("/");
  assert.match(html, /<title>Meeki — Your private meeting notekeeper<\/title>/i);
  assert.match(html, /Meeki is your[\s\S]*<strong>private<\/strong>[\s\S]*meeting/i);
  assert.match(html, /<em>notekeeper\.<\/em>/i);
  assert.match(html, /A keeper, not a collector/i);
  assertSharedProof(html);
});

test("server-renders the personal notekeeper variation", async () => {
  const html = await htmlFor("/personal");
  assert.match(html, /<title>Meeki — Your personal meeting notekeeper<\/title>/i);
  assert.match(html, /Meeki is your[\s\S]*<strong>personal<\/strong>[\s\S]*meeting/i);
  assert.match(html, /<em>notekeeper\.<\/em>/i);
  assert.match(html, /Listens\. Tidies\. Remembers\./i);
  assertSharedProof(html);
});
