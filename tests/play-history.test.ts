import assert from "node:assert/strict";
import test from "node:test";
import { activity, activityLevel, formatDuration, playStats, recentActivity, topServers } from "../src/lib/play-history.ts";

const session = (started: Date, minutes: number, servers: string[] = []) => ({ instance: "clover", started: started.getTime() / 1000, seconds: minutes * 60, code: 0, servers });

test("les durées s'écrivent en heures et minutes", () => {
  assert.equal(formatDuration(20), "moins d'une minute");
  assert.equal(formatDuration(45 * 60), "45 min");
  assert.equal(formatDuration(13 * 3600 + 5 * 60), "13 h 05");
  assert.equal(formatDuration(2 * 3600), "2 h");
});

test("statistiques et serveurs les plus joués", () => {
  const sessions = [session(new Date(2026, 9, 1), 60, ["play.clovergames.fr"]), session(new Date(2026, 9, 2), 180, ["play.clovergames.fr", "autre.example"]), session(new Date(2026, 9, 3), 30)];
  assert.deepEqual(playStats(sessions), { total: 270 * 60, count: 3, average: 90 * 60, longest: 180 * 60 });
  assert.deepEqual(playStats([]), { total: 0, count: 0, average: 0, longest: 0 });
  assert.deepEqual(topServers(sessions).map((server) => [server.address, server.sessions, server.seconds / 60]), [["play.clovergames.fr", 2, 240], ["autre.example", 1, 180]]);
});

test("une case par jour, semaines du lundi, la dernière étant la semaine en cours", () => {
  const now = new Date(2026, 9, 7, 15); // mercredi 7 octobre
  const sessions = [
    session(new Date(2026, 9, 7, 10), 40),
    session(new Date(2026, 9, 7, 12), 20),
    session(new Date(2026, 9, 6, 22), 90),
    session(new Date(2026, 9, 5, 9), 10),
    session(new Date(2026, 9, 1, 20), 200),
    session(new Date(2026, 9, 9), 60), // à venir : ignorée
    session(new Date(2026, 1, 1), 30), // avant la période
  ];
  const half = activity(sessions, now, "half");
  assert.equal(half.days.length, 26 * 7);
  assert.equal(half.days[0].date.getDay(), 1);
  const today = half.days.findIndex((day) => day.date.getTime() === new Date(2026, 9, 7).getTime());
  assert.equal(today, 25 * 7 + 2);
  assert.deepEqual([half.days[today].seconds / 60, half.days[today].sessions, half.days[today - 1].seconds / 60], [60, 2, 90]);
  assert.deepEqual([half.days[today].future, half.days[today + 1].future], [false, true]);
  assert.deepEqual([half.total / 60, half.sessions, half.daysPlayed, half.previous / 60], [360, 5, 4, 30]);
  assert.deepEqual([half.streak, half.best], [3, 3]);
  assert.equal(activity(sessions, now, "year").days.length, 53 * 7);
});

test("la série tient tant que la journée n'est pas finie", () => {
  const now = new Date(2026, 9, 7, 9);
  const yesterday = [session(new Date(2026, 9, 6, 20), 30), session(new Date(2026, 9, 5, 20), 30)];
  assert.equal(activity(yesterday, now, "half").streak, 2);
  assert.equal(activity([session(new Date(2026, 9, 5, 20), 30)], now, "half").streak, 0);
  assert.equal(activity([], now, "half").streak, 0);
});

test("quatre teintes selon le temps joué dans la journée", () => {
  assert.deepEqual([0, 60, 30 * 60, 3599, 3600, 3 * 3600].map(activityLevel), [0, 1, 2, 2, 3, 4]);
});

test("les derniers jours, aujourd'hui en dernier, comparés aux jours d'avant", () => {
  const now = new Date(2026, 9, 7, 15); // mercredi 7 octobre
  const sessions = [
    session(new Date(2026, 9, 7, 10), 40),
    session(new Date(2026, 9, 7, 12), 20),
    session(new Date(2026, 9, 6, 22), 90),
    session(new Date(2026, 9, 1, 20), 200),
    session(new Date(2026, 8, 29, 20), 30), // semaine d'avant
    session(new Date(2026, 9, 9), 60), // à venir : ignorée
  ];
  const week = recentActivity(sessions, now, 7);
  assert.equal(week.days.length, 7);
  assert.deepEqual([week.days[0].date, week.days[6].date], [new Date(2026, 9, 1), new Date(2026, 9, 7)]);
  assert.deepEqual([week.days[6].seconds / 60, week.days[6].sessions, week.days[5].seconds / 60, week.days[0].seconds / 60], [60, 2, 90, 200]);
  assert.deepEqual([week.total / 60, week.sessions, week.daysPlayed, week.previous / 60, week.longest / 60], [350, 4, 3, 30, 200]);
  assert.equal(week.streak, 2);
  assert.equal(recentActivity(sessions, now, 30).days.length, 30);
});

test("la série des derniers jours dépasse la période et tient jusqu'à la fin de la journée", () => {
  const now = new Date(2026, 9, 7, 9);
  const days = Array.from({ length: 9 }, (_, index) => session(new Date(2026, 9, 6 - index, 20), 30));
  assert.equal(recentActivity(days, now, 7).streak, 9);
  assert.equal(recentActivity([session(new Date(2026, 9, 5, 20), 30)], now, 7).streak, 0);
  assert.deepEqual(recentActivity([], now, 7).days.map((day) => day.seconds), [0, 0, 0, 0, 0, 0, 0]);
});
