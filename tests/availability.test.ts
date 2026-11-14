import assert from "node:assert/strict";
import test from "node:test";
import { ONLINE, parseStatus, shownStatus } from "../src/lib/availability.ts";

const now = 1_800_000_000_000;

test("un statut choisi reste jusqu'à son échéance, puis repasse en ligne", () => {
  assert.deepEqual(parseStatus(JSON.stringify({ availability: "busy", until: null }), now), { availability: "busy", until: null });
  assert.deepEqual(parseStatus(JSON.stringify({ availability: "away", until: now + 1 }), now), { availability: "away", until: now + 1 });
  assert.deepEqual(parseStatus(JSON.stringify({ availability: "away", until: now }), now), ONLINE);
});

test("rien, un statut inconnu ou illisible : en ligne", () => {
  assert.deepEqual(parseStatus(null, now), ONLINE);
  assert.deepEqual(parseStatus(JSON.stringify({ availability: "dnd", until: null }), now), ONLINE);
  assert.deepEqual(parseStatus(JSON.stringify({ availability: "toString", until: null }), now), ONLINE);
  assert.deepEqual(parseStatus("{", now), ONLINE);
});

test("un ami : statut du launcher, sinon en ligne s'il joue, sinon hors ligne", () => {
  assert.equal(shownStatus({ online: true, availability: "busy" }), "busy");
  assert.equal(shownStatus({ online: true, availability: null }), "online");
  assert.equal(shownStatus({ online: false }), null);
});
