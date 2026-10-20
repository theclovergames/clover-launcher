import assert from "node:assert/strict";
import test from "node:test";

import { bySection, comparison, featuredProduct, formatCoins, goalPercent, isGiftName, kindLabel, priceLabel } from "../src/lib/shop.ts";
import type { ShopProduct } from "../src/types.ts";

function product(id: string, extra: Partial<ShopProduct> = {}): ShopProduct {
  return { id, slug: id, category: "grades", name: id.toUpperCase(), description: null, imageUrl: null, priceCents: 999, credits: 999, euro: true, type: "one_time", interval: null, badge: null, section: null, features: [], grade: false, ...extra };
}

test("prix en euros et en pièces, abonnements par mois ou par an", () => {
  assert.equal(priceLabel(product("vip")).replace(/\s/g, " "), "9,99 €");
  assert.equal(priceLabel(product("plus", { type: "subscription", interval: "month", priceCents: 499 })).replace(/\s/g, " "), "4,99 € / mois");
  assert.equal(formatCoins(1250).replace(/\s/g, " "), "1 250 pièces");
  assert.equal(formatCoins(1), "1 pièce");
  assert.equal(kindLabel(product("vip", { grade: true })), "Grade permanent");
  assert.equal(kindLabel(product("plus", { type: "subscription", interval: "year" })), "Abonnement annuel");
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
