import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-ignore — worker JavaScript sans déclarations.
import worker, { checkBody, isAllowedRoute, Quota, sky, zone } from "../relay/worker.js";

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
  const calls = { global: 0 };
  return {
    CURSEFORGE_API_KEY: "k",
    calls,
    LIMITER: { limit: async () => ({ success: ipOk }) },
    QUOTA: {
      idFromName: () => "global",
      get: () => ({ fetch: async () => (calls.global++, new Response(null, { status: globalOk ? 204 : 429 })) }),
    },
  };
}
const call = (method: string, path: string, init: { agent?: string; body?: string } = {}, e = env()) =>
  worker.fetch(new Request("https://curseforge.clovergames.fr" + path, { method, body: init.body, headers: { "user-agent": init.agent ?? AGENT } }), e);

test("refus hors usage du launcher", async () => {
  assert.equal((await call("GET", "/v1/games")).status, 404);
  assert.equal((await call("GET", "/v1/mods/search", { agent: "curl/8" })).status, 403);
  assert.equal((await call("POST", "/v1/mods", { body: "x" })).status, 400);
  assert.equal((await call("GET", "/v1/mods/search", {}, env(true, false))).status, 429);
});

test("une adresse bloquée n'entame pas le plafond global", async () => {
  const e = env(false);
  assert.equal((await call("GET", "/v1/mods/search", {}, e)).status, 429);
  assert.equal(e.calls.global, 0);
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

test("plafond global sur une minute", () => {
  const quota = new Quota();
  for (let i = 0; i < 1200; i++) assert.equal(quota.fetch().status, 204);
  assert.equal(quota.fetch().status, 429);
  quota.window--;
  assert.equal(quota.fetch().status, 204);
});

test("météo : symboles de MET Norway ramenés au ciel de l'accueil", () => {
  assert.deepEqual(sky("clearsky_night"), { sky: "clear", heavy: false });
  assert.deepEqual(sky("fair_day"), { sky: "fair", heavy: false });
  assert.deepEqual(sky("partlycloudy_day"), { sky: "cloudy", heavy: false });
  assert.deepEqual(sky("cloudy"), { sky: "overcast", heavy: false });
  assert.deepEqual(sky("lightrainshowers_day"), { sky: "rain", heavy: false });
  assert.deepEqual(sky("heavysleet"), { sky: "rain", heavy: true });
  assert.deepEqual(sky("heavysnowshowersandthunder_day"), { sky: "storm", heavy: true });
  assert.deepEqual(sky("snow"), { sky: "snow", heavy: false });
  assert.equal(sky("inconnu"), null);
  assert.equal(sky(undefined), null);
});

test("météo : zone arrondie à 0,1°, rien sans position", () => {
  assert.deepEqual(zone({ latitude: "48.85660", longitude: "2.35220" }), { lat: "48.9", lon: "2.4" });
  assert.equal(zone({ latitude: "48.8" }), null);
  assert.equal(zone(undefined), null);
});

test("météo : seule la zone part chez MET Norway, seul le temps revient", async () => {
  const real = globalThis.fetch;
  let seen = "";
  globalThis.fetch = (async (url: string) => {
    seen = url;
    return Response.json({ properties: { timeseries: [{ data: { instant: { details: { air_temperature: -2.6 } }, next_1_hours: { summary: { symbol_code: "rainandthunder" } } } }] } });
  }) as typeof fetch;
  const request = (agent = AGENT, cf: object | null = { latitude: "45.76404", longitude: "4.83566" }) =>
    Object.assign(new Request("https://curseforge.clovergames.fr/weather", { headers: { "user-agent": agent } }), { cf });
  try {
    const res = await worker.fetch(request(), env());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { schema: 1, sky: "storm", heavy: false, temperature: -3 });
    assert.equal(seen, "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=45.8&lon=4.8");
    assert.equal((await worker.fetch(request("curl/8"), env())).status, 403);
    assert.equal((await worker.fetch(request(AGENT, null), env())).status, 404);
    assert.equal((await worker.fetch(request(), env(false))).status, 429);
  } finally {
    globalThis.fetch = real;
  }
});
