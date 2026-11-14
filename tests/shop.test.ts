import assert from "node:assert/strict";
import test from "node:test";

import { bySection, comparison, featuredProduct, formatCoins, formatCredits, gamePrices, goalPercent, isGiftName, kindLabel, priceLabel, priceLabels } from "../src/lib/shop.ts";
import type { ShopCatalog, ShopProduct } from "../src/types.ts";

function product(id: string, extra: Partial<ShopProduct> = {}): ShopProduct {
  return { id, slug: id, category: "grades", name: id.toUpperCase(), description: null, imageUrl: null, priceCents: 999, credits: 999, pieces: 99900, euro: true, type: "one_time", interval: null, badge: null, section: null, features: [], grade: false, ...extra };
}

test("prix en euros, en crédits et en pièces, abonnements par mois ou par an", () => {
  assert.equal(priceLabel(product("vip")).replace(/\s/g, " "), "9,99 €");
  assert.equal(priceLabel(product("plus", { type: "subscription", interval: "month", priceCents: 499 })).replace(/\s/g, " "), "4,99 € / mois");
  assert.equal(formatCoins(1250).replace(/\s/g, " "), "1 250 pièces");
  assert.equal(formatCoins(1), "1 pièce");
  assert.equal(formatCredits(1250).replace(/\s/g, " "), "1 250 crédits");
  assert.equal(formatCredits(1), "1 crédit");
  assert.equal(kindLabel(product("vip", { grade: true })), "Grade permanent");
  assert.equal(kindLabel(product("plus", { type: "subscription", interval: "year" })), "Abonnement annuel");
});

test("crédits et pièces : seulement si le site ouvre la monnaie et si le produit s'y paie", () => {
  const both = { credits: { enabled: true, perEuro: 100 }, pieces: { enabled: true, perCredit: 100 } };
  assert.deepEqual(gamePrices(product("vip"), both), { credits: 999, pieces: 99900 });
  assert.deepEqual(gamePrices(product("vip"), { credits: { enabled: true, perEuro: 100 }, pieces: null }), { credits: 999, pieces: null });
  assert.deepEqual(gamePrices(product("vip"), { credits: { enabled: false, perEuro: 100 }, pieces: { enabled: false, perCredit: 100 } }), { credits: null, pieces: null });
  assert.deepEqual(gamePrices(product("exclu", { pieces: null }), both), { credits: 999, pieces: null });
  const labels = (entry: ShopProduct, catalog: Pick<ShopCatalog, "credits" | "pieces"> = both) => priceLabels(entry, catalog).map((label) => label.replace(/\s/g, " "));
  assert.deepEqual(labels(product("vip")), ["9,99 €", "999 crédits", "99 900 pièces"]);
  assert.deepEqual(labels(product("cles", { euro: false })), ["999 crédits", "99 900 pièces"]);
  assert.deepEqual(labels(product("cles", { euro: false, credits: null })), ["99 900 pièces"]);
  assert.deepEqual(labels(product("cles", { euro: false }), { credits: null, pieces: null }), ["9,99 €"], "rien de payable : le prix en euros reste affiché");
});

test("mise en avant : « Populaire », puis « Best-seller », puis le premier", () => {
  assert.equal(featuredProduct([product("a"), product("b", { badge: "best-offer" }), product("c", { badge: "popular" })])?.id, "c");
  assert.equal(featuredProduct([product("a"), product("b", { badge: "best-offer" })])?.id, "b");
  assert.equal(featuredProduct([product("a")])?.id, "a");
  assert.equal(featuredProduct([]), null);
});

test("sections dans l'ordre du site", () => {
  const groups = bySection([product("a", { section: "Grades" }), product("b", { section: null }), product("c", { section: "Grades" })]);
  assert.deepEqual(
    groups.map((group) => [group.section, group.products.map((entry) => entry.id)]),
    [
      ["Grades", ["a", "c"]],
      [null, ["b"]],
    ],
  );
});

test("tableau comparatif : toutes les lignes, une case vide si le produit ne la cite pas", () => {
  assert.equal(comparison([product("a", { features: [{ label: "Kit", value: true }] })]), null);
  const table = comparison([product("vip", { features: [{ label: "Kit", value: true }, { label: "Homes", value: "3" }] }), product("none"), product("mvp", { features: [{ label: "Homes", value: "10" }, { label: "Vol", value: true }] })]);
  assert.deepEqual(table?.products.map((entry) => entry.id), ["vip", "mvp"]);
  assert.deepEqual(table?.rows, [
    { label: "Kit", values: [true, null] },
    { label: "Homes", values: ["3", "10"] },
    { label: "Vol", values: [null, true] },
  ]);
});

test("objectif et pseudo d'un cadeau", () => {
  assert.equal(goalPercent({ target: 150, current: 42.5 }), 28);
  assert.equal(goalPercent({ target: 100, current: 250 }), 100);
  assert.ok(isGiftName("Kanname_2"));
  assert.ok(!isGiftName("Kan name") && !isGiftName("ab"));
});
