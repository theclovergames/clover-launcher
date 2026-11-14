import assert from "node:assert/strict";
import test from "node:test";
import { moonPhase, sceneOf, skyAt, sunTimes } from "../src/lib/appearance.ts";

/** 22 octobre 2026, à `hours` heures locales. */
const at = (hours: number) => new Date(2026, 9, 22, 0, Math.round(hours * 60));

test("lever et coucher suivent la saison", () => {
  const autumn = sunTimes(new Date(2026, 9, 22));
  const summer = sunTimes(new Date(2026, 5, 21));
  assert.ok(Math.abs(autumn.sunset - autumn.sunrise - 10.3) < 0.3, `jour d'octobre : ${(autumn.sunset - autumn.sunrise).toFixed(2)} h`);
  assert.ok(Math.abs(summer.sunset - summer.sunrise - 16.2) < 0.3, `jour de juin : ${(summer.sunset - summer.sunrise).toFixed(2)} h`);
});

test("le ciel de l'accueil suit l'heure : soleil haut à midi, lune la nuit, lueur au couchant", () => {
  const { sunrise, sunset } = sunTimes(at(12));
  const noon = skyAt(at((sunrise + sunset) / 2));
  assert.equal(noon.body, "sun");
  assert.ok(noon.y < 10 && Math.abs(noon.x - 50) < 2);
  assert.equal(noon.night, 0);
  assert.equal(noon.dusk, 0);

  const evening = skyAt(at(sunset - 0.2));
  assert.equal(evening.body, "sun");
  assert.ok(evening.x > 85 && evening.y > 60, "bas, à droite");
  assert.ok(evening.dusk > 0.7 && evening.night > 0 && evening.night < 1);

  const late = skyAt(at(sunset + 3));
  assert.equal(late.body, "moon");
  assert.equal(late.night, 1);
});

test("phase de la lune : nouvelle, quartiers et pleine lune de 2024", () => {
  assert.equal(moonPhase(new Date(Date.UTC(2024, 3, 8, 18, 21))).lit, 0);
  assert.deepEqual(moonPhase(new Date(Date.UTC(2024, 3, 15, 19, 13))), { lit: 4, side: "right" });
  assert.equal(moonPhase(new Date(Date.UTC(2024, 8, 18, 2, 34))).lit, 8);
  assert.deepEqual(moonPhase(new Date(Date.UTC(2024, 3, 1, 3, 15))), { lit: 4, side: "left" });
});

test("décor : les teintes des versions précédentes vont au décor le plus proche", () => {
  assert.equal(sceneOf("desert"), "desert");
  assert.equal(sceneOf("obsidian"), "end");
  assert.equal(sceneOf("ocean"), "village");
  assert.equal(sceneOf("gold"), "desert");
  assert.equal(sceneOf("inconnu"), "forest");
  assert.equal(sceneOf("toString"), "forest");
  assert.equal(sceneOf(undefined), "forest");
});
