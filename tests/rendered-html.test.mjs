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

test("server-renders the Meeki design study", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Meeki — Your private meeting note-taker<\/title>/i);
  assert.match(html, /Meeki design study/i);
  assert.match(html, /Private Notebook/i);
  assert.match(html, /Glassbox/i);
  assert.match(html, /Quiet Companion/i);
  assert.match(html, /https:\/\/github\.com\/inventivezee\/meeki/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});
