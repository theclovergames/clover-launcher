import assert from "node:assert/strict";
import test from "node:test";
import { groupVersions, minecraftRange, opensWorldsDirectly, preferredModpackVersion, versionFamily } from "../src/lib/game-versions.ts";

test("les correctifs restent dans leur famille et gardent leur numéro de lancement", () => {
  const ids = ["26.1", "26.1.1", "26.1.2", "1.21", "1.21.1", "1.21.3", "1.21.4", "1.21.5", "1.21.8", "1.21.10", "1.21.11", "1.20.1", "1.8.9", "1.12.2", "1.16.5", "1.17.1", "1.18.2", "1.19.4"];
  const groups = groupVersions(ids.map((id) => ({ id, snapshot: false, released: "" })), [], false);
  assert.deepEqual(groups.find((entry) => entry.id === "26.1")?.versions, ["26.1.2", "26.1.1", "26.1"]);
  assert.equal(groups.find((entry) => entry.id === "1.21")?.versions[0], "1.21.11");
  assert.deepEqual(groups.find((entry) => entry.id === "1.8")?.versions, ["1.8.9"]);
  assert.equal(versionFamily("1.12.2"), "1.12");
  assert.equal(new Set(groups.flatMap((entry) => entry.versions)).size, ids.length);
});

test("les instances existantes restent accessibles quand les snapshots sont masqués", () => {
  const versions = [{ id: "26.1", snapshot: false, released: "" }, { id: "26.4-snapshot-2", snapshot: true, released: "" }];
  assert.equal(groupVersions(versions, [], false).length, 1);
  assert.equal(groupVersions(versions, [], true).length, 2);
  assert.equal(groupVersions(versions, ["26.4-snapshot-2"], false).length, 2);
});

test("un monde s'ouvre directement à partir de la 1.20", () => {
  for (const id of ["1.20", "1.20.1", "1.21.11", "26.1", "26.4-snapshot-2", "23w14a", "24w10a"]) assert.equal(opensWorldsDirectly(id), true, id);
  for (const id of ["1.19.4", "1.8.9", "1.12.2", "23w13a", "22w45a"]) assert.equal(opensWorldsDirectly(id), false, id);
});

test("les versions d'un projet se résument de la plus ancienne à la plus récente, sans snapshots", () => {
  assert.equal(minecraftRange(["1.21.4", "1.20.1", "24w14a", "1.21.10", "1.21.1"]), "1.20.1 à 1.21.10");
  assert.equal(minecraftRange(["26.2", "1.21.11"]), "1.21.11 à 26.2");
  assert.equal(minecraftRange(["1.20.1"]), "1.20.1");
  assert.equal(minecraftRange(["24w14a"]), null);
  assert.equal(minecraftRange([]), null);
});

test("la version d'un modpack proposée suit la version de Minecraft voulue", () => {
  const version = (id: string, gameVersions: string[], release = true) => ({ id, name: id, number: id, loaders: ["fabric"], gameVersions, release, published: "" });
  const versions = [version("c", ["1.21.1"], false), version("b", ["1.21.1"]), version("a", ["1.20.1"], false)];
  assert.equal(preferredModpackVersion(versions, "1.21.1")?.id, "b");
  assert.equal(preferredModpackVersion(versions, "1.20.1")?.id, "a");
  assert.equal(preferredModpackVersion(versions, "1.12.2")?.id, "b");
  assert.equal(preferredModpackVersion(versions)?.id, "b");
  assert.equal(preferredModpackVersion([]), undefined);
});

test("préversions, snapshots et anciennes versions rejoignent leur famille, dans l'ordre", () => {
  const entry = (id: string, released: string, snapshot = false) => ({ id, snapshot, released });
  const versions = [
    entry("26.1", "2026-03-24"),
    entry("26.1-snapshot-2", "2026-01-13", true),
    entry("1.21.5", "2025-03-25"),
    entry("1.21.5-rc1", "2025-03-20", true),
    entry("25w10a", "2025-03-05", true),
    entry("1.21.4", "2024-12-03"),
    entry("1.0", "2011-11-18"),
    entry("b1.8.1", "2011-09-19"),
    entry("b1.7.3", "2011-07-08"),
    entry("a1.2.6", "2010-12-03"),
    entry("c0.30_01c", "2009-12-22"),
  ];
  const groups = groupVersions(versions, [], true);
  assert.deepEqual(groups.map((group) => group.id), ["26.1", "1.21", "1.0", "Bêta", "Alpha"]);
  assert.deepEqual(groups.find((group) => group.id === "1.21")?.versions, ["1.21.5", "1.21.5-rc1", "25w10a", "1.21.4"]);
  assert.deepEqual(groups.find((group) => group.id === "Alpha")?.versions, ["a1.2.6", "c0.30_01c"]);
  // Sans snapshots : seulement les versions sorties.
  assert.deepEqual(groupVersions(versions, [], false).find((group) => group.id === "1.21")?.versions, ["1.21.5", "1.21.4"]);
  assert.equal(versionFamily("26.1-snapshot-2"), "26.1");
  assert.equal(versionFamily("1.14_combat-212796"), "1.14");
});
