import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
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

test("server-renders the Meeki landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>Meeki — Your meetings should stay yours<\/title>/i,
  );
  assert.match(html, /Your meetings/i);
  assert.match(html, /should stay/i);
  assert.match(html, /Download Meeki/i);
  assert.match(html, /View on GitHub/i);
  assert.match(html, /https:\/\/github\.com\/inventivezee\/meeki/);
  assert.match(html, /\/og\.png/i);
  assert.doesNotMatch(html, /Meeki design study|Glassbox|Quiet Companion/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});
