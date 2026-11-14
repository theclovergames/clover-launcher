import assert from "node:assert/strict";
import test from "node:test";

import { changelogLabel, newsEntries } from "../src/lib/news.ts";
import type { ChangelogItem, NewsPage } from "../src/types.ts";

const changelog = (category: ChangelogItem["category"], date: string): ChangelogItem => ({
  slug: category,
  title: `Mise à jour ${category}`,
  excerpt: "Les nouveautés publiées.",
  version: "0.6.1",
  category,
  image: null,
  url: `https://clovergames.fr/changelog#${category}`,
  publishedAt: date,
});
const page: NewsPage = {
  blog: [{ title: "Annonce", excerpt: "Blog", image: null, url: "https://clovergames.fr/blog/annonce", publishedAt: "2026-10-20T10:00:00Z" }],
  changelog: [changelog("launcher", "2026-10-22T12:00:00+02:00"), changelog("site", "2026-10-22T10:30:00Z"), changelog("minecraft", "2026-10-21T10:00:00Z")],
  minecraft: { translated: true, items: [{ id: "site", kind: "release", title: "Minecraft", summary: "Version", image: null, url: null, publishedAt: "2026-10-19T10:00:00Z", readable: true }] },
};

test("mélange les trois sources par date et conserve toutes les catégories de changelog", () => {
  const entries = newsEntries(page, "all");
  assert.deepEqual(entries.map((entry) => entry.item.title), ["Mise à jour site", "Mise à jour launcher", "Mise à jour minecraft", "Annonce", "Minecraft"]);
  assert.equal(new Set(entries.map((entry) => entry.key)).size, entries.length);
  assert.equal(newsEntries(page, "changelog").length, 3);
  assert.equal(newsEntries(page, "clover").length, 1);
  assert.equal(newsEntries(page, "minecraft").length, 1);
});

test("une panne de source et une date invalide ne masquent pas les autres actualités", () => {
  assert.equal(newsEntries({ ...page, changelog: null }, "all").length, 2);
  assert.deepEqual(newsEntries({ ...page, changelog: null }, "changelog"), []);
  assert.equal(newsEntries({ ...page, changelog: [changelog("site", "date illisible")] }, "all").length, 2);
  assert.deepEqual(newsEntries(null, "all"), []);
});

test("les changelogs indiquent leur produit et leur version sans inventer de version absente", () => {
  assert.equal(changelogLabel(changelog("site", "")), "Site Web · 0.6.1");
  assert.equal(changelogLabel(changelog("launcher", "")), "Launcher · 0.6.1");
  assert.equal(changelogLabel({ ...changelog("minecraft", ""), version: null }), "Serveur Minecraft");
});
