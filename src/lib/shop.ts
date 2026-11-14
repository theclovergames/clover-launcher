/**
 * Boutique : prix, mise en avant et tableau comparatif, comme sur clovergames.fr/shop. Testé par
 * `tests/shop.test.ts`.
 */
import type { ShopCatalog, ShopFeature, ShopProduct } from "../types";

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const whole = new Intl.NumberFormat("fr-FR");

/** « 9,99 € » */
export const formatEuros = (cents: number) => euros.format(cents / 100);

/** « 1 250 pièces » */
export const formatCoins = (coins: number) => `${whole.format(coins)} pièce${coins > 1 ? "s" : ""}`;

/** « 1 250 crédits » */
export const formatCredits = (credits: number) => `${whole.format(credits)} crédit${credits > 1 ? "s" : ""}`;

/** Prix payables depuis le launcher dans chaque monnaie du jeu ; `null` si le site la ferme ou si le produit ne s'y paie pas. */
export function gamePrices(product: Pick<ShopProduct, "credits" | "pieces">, catalog: Pick<ShopCatalog, "credits" | "pieces">): { credits: number | null; pieces: number | null } {
  return { credits: catalog.credits?.enabled ? product.credits : null, pieces: catalog.pieces?.enabled ? product.pieces : null };
}

/** Prix à afficher, dans l'ordre des paiements (euros, crédits, pièces) : le premier est le prix principal. */
export function priceLabels(product: ShopProduct, catalog: Pick<ShopCatalog, "credits" | "pieces">): string[] {
  const { credits, pieces } = gamePrices(product, catalog);
  const labels = [product.euro ? priceLabel(product) : null, credits === null ? null : formatCredits(credits), pieces === null ? null : formatCoins(pieces)].filter((label): label is string => label !== null);
  return labels.length > 0 ? labels : [priceLabel(product)];
}

/** Prix en euros, « / mois » ou « / an » pour un abonnement. */
export function priceLabel(product: Pick<ShopProduct, "priceCents" | "type" | "interval">): string {
  const price = formatEuros(product.priceCents);
  if (product.type !== "subscription") return price;
  return `${price} / ${product.interval === "year" ? "an" : "mois"}`;
}

/** Nature du produit, comme sur sa page du site. */
export function kindLabel(product: Pick<ShopProduct, "type" | "interval" | "grade">): string {
  if (product.type === "subscription") return product.interval === "year" ? "Abonnement annuel" : "Abonnement mensuel";
  return product.grade ? "Grade permanent" : "Achat unique";
}

/** Produit mis en avant : le premier « Populaire », sinon « Best-seller », sinon le premier. */
export function featuredProduct(products: ShopProduct[]): ShopProduct | null {
  return products.find((product) => product.badge === "popular") ?? products.find((product) => product.badge === "best-offer") ?? products[0] ?? null;
}

/** Produits d'une catégorie rangés par section (« Groupe / Sous-groupe »), dans l'ordre du site. */
export function bySection(products: ShopProduct[]): { section: string | null; products: ShopProduct[] }[] {
  const groups: { section: string | null; products: ShopProduct[] }[] = [];
  for (const product of products) {
    const group = groups.find((entry) => entry.section === product.section);
    if (group) group.products.push(product);
    else groups.push({ section: product.section, products: [product] });
  }
  return groups;
}

/**
 * Tableau comparatif d'une catégorie : une ligne par caractéristique, dans l'ordre où elles
 * apparaissent ; `null` s'il y a moins de deux produits à comparer.
 */
export function comparison(products: ShopProduct[]): { products: ShopProduct[]; rows: { label: string; values: (ShopFeature["value"] | null)[] }[] } | null {
  const compared = products.filter((product) => product.features.length > 0);
  if (compared.length < 2) return null;
  const labels: string[] = [];
  for (const product of compared) for (const feature of product.features) if (!labels.includes(feature.label)) labels.push(feature.label);
  return {
    products: compared,
    rows: labels.map((label) => ({ label, values: compared.map((product) => product.features.find((feature) => feature.label === label)?.value ?? null) })),
  };
}

/** Part de l'objectif atteinte, de 0 à 100. */
export const goalPercent = (goal: { target: number; current: number }) => (goal.target > 0 ? Math.min(100, Math.max(0, Math.round((goal.current / goal.target) * 100))) : 0);

/** Pseudo d'un cadeau : celui du jeu, 3 à 16 lettres, chiffres ou « _ ». */
export const isGiftName = (name: string) => /^[A-Za-z0-9_]{3,16}$/.test(name);
