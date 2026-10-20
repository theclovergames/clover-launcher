import assert from "node:assert/strict";
import test from "node:test";
import { columnsOf, formatValue, isMe, rankRows } from "../src/lib/leaderboard.ts";
import type { LeaderboardBoard } from "../src/types.ts";

const board: LeaderboardBoard = {
  id: "bw",
  name: "BedWars",
  icon: "Swords",
  color: "emerald",
  stats: [
    { key: "wins", label: "Victoires", format: "number" },
    { key: "kills", label: "Éliminations", format: "number" },
  ],
  sortKey: "wins",
  ascending: false,
  rows: [
    { uuid: "0f3c2b9e-6a1d-4f7e-9b2a-1c3d5e7f9a0b", name: "Kanname", values: { wins: 30, kills: 5 } },
    { uuid: null, name: "Kaysuto", values: { wins: 20, kills: 50 } },
    { uuid: null, name: "Steve", values: { wins: 10, kills: null } },
  ],
};

test("les valeurs suivent le format du site", () => {
  assert.equal(formatValue(1204, "number"), "1 204");
  assert.equal(formatValue(null, "number"), "0");
  assert.equal(formatValue(165_600, "duration"), "46 h 00");
  assert.equal(formatValue(720, "duration"), "12 min");
});

test("le tri du site garde son ordre, un autre tri reclasse", () => {
  assert.deepEqual(
    rankRows(board, { key: "wins", ascending: false }).map(({ row, rank }) => `${rank}:${row.name}`),
    ["1:Kanname", "2:Kaysuto", "3:Steve"],
  );
  assert.deepEqual(
    rankRows(board, { key: "kills", ascending: false }).map(({ row, rank }) => `${rank}:${row.name}`),
    ["1:Kaysuto", "2:Kanname", "3:Steve"],
  );
  assert.deepEqual(
    rankRows(board, null).map(({ row }) => row.name),
    ["Kanname", "Kaysuto", "Steve"],
  );
});

test("la colonne de tri est affichée même si l'administration ne l'a pas listée", () => {
  assert.equal(columnsOf(board).length, 2);
  assert.deepEqual(
    columnsOf({ ...board, sortKey: "points" }).map((stat) => stat.key),
    ["points", "wins", "kills"],
  );
});

test("le compte actif est reconnu par UUID, sinon par pseudo", () => {
  assert.ok(isMe(board.rows[0], { uuid: "0F3C2B9E6A1D4F7E9B2A1C3D5E7F9A0B", name: "Autre" }));
  assert.ok(!isMe(board.rows[0], { uuid: "00000000-0000-0000-0000-000000000000", name: "Kanname" }));
  assert.ok(isMe(board.rows[1], { uuid: "x", name: "kaysuto" }));
});
