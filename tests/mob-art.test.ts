import assert from "node:assert/strict";
import test from "node:test";
import { HUSK_PALETTE, MOB_ART, SPIDER_LEGS } from "../src/lib/mob-art.ts";

test("les surfaces des mobs sont rectangulaires et leurs pixels ont une couleur", () => {
  for (const [mob, { palette, parts }] of Object.entries(MOB_ART)) {
    for (const [part, rows] of Object.entries(parts)) {
      assert.ok(rows.length > 0, `${mob}.${part} : surface vide`);
      for (const row of rows) {
        assert.equal(row.length, rows[0].length, `${mob}.${part} : largeur incohérente`);
        for (const mark of row) assert.ok(mark === "." || mark in palette, `${mob}.${part} : couleur ${mark} absente`);
      }
    }
  }
  for (const rows of Object.values(MOB_ART.zombie.parts)) {
    for (const row of rows) for (const mark of row) assert.ok(mark in HUSK_PALETTE, `husk : couleur ${mark} absente`);
  }
});

test("l'araignée garde huit pattes distinctes dans son cadre", () => {
  assert.equal(SPIDER_LEGS.length, 8);
  assert.equal(new Set(SPIDER_LEGS.map((leg) => leg.join(","))).size, 8);
  for (const leg of SPIDER_LEGS) for (let index = 0; index < leg.length; index += 2) {
    assert.ok(leg[index] >= 0 && leg[index] < 36);
    assert.ok(leg[index + 1] >= 0 && leg[index + 1] < 19);
  }
});
