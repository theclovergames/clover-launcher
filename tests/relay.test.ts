import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-ignore — worker JavaScript sans déclarations.
import worker, { checkBody, isAllowedRoute } from "../relay/worker.js";

const AGENT = "CloverLauncher/0.4.7 (+https://clovergames.fr)";

test("liste blanche des routes", () => {
  assert.ok(isAllowedRoute("GET", "/v1/mods/search"));
  assert.ok(isAllowedRoute("GET", "/v1/mods/123/files"));
  assert.ok(isAllowedRoute("GET", "/v1/mods/123/description"));
  assert.ok(isAllowedRoute("POST", "/v1/mods"));
  assert.ok(isAllowedRoute("POST", "/v1/mods/files"));
  assert.ok(!isAllowedRoute("POST", "/v1/mods/search"));
  assert.ok(!isAllowedRoute("GET", "/v1/games"));
  assert.ok(!isAllowedRoute("GET", "/v1/mods/abc"));
  assert.ok(!isAllowedRoute("DELETE", "/v1/mods"));
});

test("corps des POST", () => {
  assert.equal(checkBody("/v1/mods", '{"modIds":[1,2]}'), '{"modIds":[1,2]}');
  assert.equal(checkBody("/v1/mods/files", '{"fileIds":[5],"extra":1}'), '{"fileIds":[5]}');
  assert.equal(checkBody("/v1/mods", '{"fileIds":[1]}'), null);
  assert.equal(checkBody("/v1/mods", "pas du json"), null);
  assert.equal(checkBody("/v1/mods", '{"modIds":[]}'), null);
  assert.equal(checkBody("/v1/mods", '{"modIds":["1"]}'), null);
  assert.equal(checkBody("/v1/mods", JSON.stringify({ modIds: Array.from({ length: 1001 }, (_, i) => i + 1) })), null);
  assert.ok(checkBody("/v1/mods", JSON.stringify({ modIds: Array.from({ length: 1000 }, (_, i) => i + 1) })));
  assert.equal(checkBody("/v1/mods", " ".repeat(70000)), null);
});

function env(ipOk = true, globalOk = true) {
  return { CURSEFORGE_API_KEY: "k", LIMITER: { limit: async () => ({ success: ipOk }) }, GLOBAL_LIMITER: { limit: async () => ({ success: globalOk }) } };
}
const call = (method: string, path: string, init: { agent?: string; body?: string } = {}, e = env()) =>
  worker.fetch(new Request("https://curseforge.clovergames.fr" + path, { method, body: init.body, headers: { "user-agent": init.agent ?? AGENT } }), e);

test("refus hors usage du launcher", async () => {
  assert.equal((await call("GET", "/v1/games")).status, 404);
  assert.equal((await call("GET", "/v1/mods/search", { agent: "curl/8" })).status, 403);
  assert.equal((await call("POST", "/v1/mods", { body: "x" })).status, 400);
  assert.equal((await call("GET", "/v1/mods/search", {}, env(false))).status, 429);
  assert.equal((await call("GET", "/v1/mods/search", {}, env(true, false))).status, 429);
});

test("relais d'une requête valide", async () => {
  const real = globalThis.fetch;
  let seen: { url: string; body: unknown } | undefined;
  globalThis.fetch = (async (url: string, init: { body?: string }) => {
    seen = { url, body: init.body };
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const res = await call("POST", "/v1/mods", { body: '{"modIds":[7]}' });
    assert.equal(res.status, 200);
    assert.deepEqual(seen, { url: "https://api.curseforge.com/v1/mods", body: '{"modIds":[7]}' });
  } finally {
    globalThis.fetch = real;
  }
});
