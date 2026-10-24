import type { ChangelogItem, MinecraftNewsItem, NewsItem, NewsPage } from "../types.ts";

export type NewsSource = "clover" | "changelog" | "minecraft";
export type NewsFilter = "all" | NewsSource;
export type NewsEntry =
  | { source: "clover"; key: string; date: string; item: NewsItem }
  | { source: "changelog"; key: string; date: string; item: ChangelogItem }
  | { source: "minecraft"; key: string; date: string; item: MinecraftNewsItem };

/** Article à lire dans le launcher : blog, changelog de Clover Games ou note de version Minecraft. */
export type ReaderTarget =
  | { source: "clover"; slug: string; title: string; category: string | null; publishedAt: string; url: string }
  | { source: "changelog"; item: ChangelogItem }
  | { source: "minecraft"; item: MinecraftNewsItem };

/** Titre connu avant que l'article arrive. */
export const readerTitle = (target: ReaderTarget) => (target.source === "clover" ? target.title : target.item.title);

const CHANGELOG_LABELS ={ launcher: "Launcher", site: "Site Web", minecraft: "Serveur Minecraft" };

export function changelogLabel(item: ChangelogItem): string {
  return `${CHANGELOG_LABELS[item.category]}${item.version ? ` · ${item.version}` : ""}`;
}

/** Une seule chronologie ; une source indisponible ou une date illisible n'efface pas les autres. */
export function newsEntries(page: NewsPage | null, filter: NewsFilter): NewsEntry[] {
  const entries: NewsEntry[] = [
    ...(page?.blog ?? []).map((item): NewsEntry => ({ source: "clover", key: `clover:${item.url}`, date: item.publishedAt, item })),
    ...(page?.changelog ?? []).map((item): NewsEntry => ({ source: "changelog", key: `changelog:${item.slug}`, date: item.publishedAt, item })),
    ...(page?.minecraft?.items ?? []).map((item): NewsEntry => ({ source: "minecraft", key: `minecraft:${item.id}`, date: item.publishedAt, item })),
  ];
  return entries
    .filter((entry) => (filter === "all" || entry.source === filter) && Number.isFinite(Date.parse(entry.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}
