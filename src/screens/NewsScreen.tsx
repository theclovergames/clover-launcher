import { ArrowUpRight, BookOpen, ClipboardList, Clover, CloudOff, LoaderCircle, Newspaper, Pickaxe, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SegmentBar } from "@/components/SegmentBar";
import { api } from "@/lib/api";
import { secondaryButton, slidingSegment } from "@/lib/buttons";
import { changelogLabel, newsEntries, type NewsEntry as Card, type NewsFilter as Filter, type ReaderTarget } from "@/lib/news";
import { cn } from "@/lib/utils";
import type { NewsPage } from "@/types";

type Services = Pick<typeof api, "newsPage">;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "clover", label: "Clover Games" },
  { id: "changelog", label: "Changelogs" },
  { id: "minecraft", label: "Minecraft" },
];
const KIND_LABELS: Record<string, string> = { release: "Nouvelle version", snapshot: "Snapshot", news: "Annonce" };
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * Actualités : blog, changelogs et annonces officielles de Minecraft (en anglais,
 * comme Mojang les publie, sauf si le site les traduit). Articles et notes se lisent dans le launcher
 * (`onRead`) ; les autres annonces Minecraft s'ouvrent sur minecraft.net.
 */
export function NewsScreen({
  onOpenLink,
  onRead,
  initial = null,
  services = api,
}: {
  onOpenLink: (url: string) => void;
  /** Ouvre la page de l'article (ArticleScreen). */
  onRead: (target: ReaderTarget) => void;
  /** Contenu déjà connu (planche des maquettes) : pas de chargement. */
  initial?: NewsPage | null;
  services?: Services;
}) {
  const [page, setPage] = useState<NewsPage | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(() => {
    setLoading(true);
    services
      .newsPage()
      .then(setPage)
      .catch(() => setPage({ blog: null, changelog: null, minecraft: null }))
      .finally(() => setLoading(false));
  }, [services]);
  useEffect(() => {
    if (initial === null) load();
  }, [initial, load]);

  const cards = useMemo(() => newsEntries(page, filter), [page, filter]);

  const minecraftMissing = page !== null && page.minecraft === null && (filter === "all" || filter === "minecraft");
  const blogMissing = page !== null && page.blog === null && (filter === "all" || filter === "clover");
  const changelogMissing = page !== null && page.changelog === null && (filter === "all" || filter === "changelog");

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-10 pt-8 pb-8">
        <header className="flex items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[30px] leading-none">Actualités</h1>
            <p className="text-sm text-muted-foreground">Le blog, les changelogs de Clover Games et les annonces officielles de Minecraft.</p>
          </div>
          <button type="button" onClick={load} disabled={loading} className={secondaryButton}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
            Actualiser
          </button>
        </header>

        <SegmentBar role="radiogroup" aria-label="Source" value={filter} className="mt-5 self-start">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={filter === id}
              onClick={() => setFilter(id)}
              className={slidingSegment(filter === id)}
            >
              {label}
            </button>
          ))}
        </SegmentBar>

        {(minecraftMissing || blogMissing || changelogMissing) && (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs leading-snug text-muted-foreground">
            <CloudOff className="mt-px size-4 shrink-0" aria-hidden />
            {minecraftMissing && "Les annonces de Minecraft ne sont pas disponibles pour le moment. "}
            {blogMissing && "Le blog de Clover Games ne répond pas pour le moment. "}
            {changelogMissing && "Les changelogs de Clover Games ne sont pas disponibles pour le moment."}
          </p>
        )}

        {loading && page === null ? (
          <p className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Chargement des actualités…
          </p>
        ) : cards.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">Aucune actualité à afficher pour le moment.</p>
        ) : (
          <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {cards.map((card) => (
              <li key={card.key}>
                <NewsCard card={card} onOpen={() => openCard(card, onRead, onOpenLink)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

/** Blog, changelog et note de version : lus dans le launcher. Autre annonce : minecraft.net. */
function openCard(card: Card, onRead: (target: ReaderTarget) => void, onOpenLink: (url: string) => void) {
  if (card.source === "clover") {
    const { slug, title, category, publishedAt, url } = card.item;
    if (slug) onRead({ source: "clover", slug, title, category: category ?? null, publishedAt, url });
    else onOpenLink(url);
  } else if (card.source === "changelog") {
    onRead({ source: "changelog", item: card.item });
  } else if (card.item.readable) {
    onRead({ source: "minecraft", item: card.item });
  } else if (card.item.url) {
    onOpenLink(card.item.url);
  }
}

function NewsCard({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const clover = card.source === "clover";
  const title = card.item.title;
  const text = card.source === "minecraft" ? card.item.summary : card.item.excerpt;
  const label = clover ? (card.item.category ?? "Blog") : card.source === "changelog" ? changelogLabel(card.item) : KIND_LABELS[card.item.kind] ?? "Annonce";
  const inside = clover ? Boolean(card.item.slug) : card.source === "changelog" || card.item.readable;
  const action = card.source === "changelog" ? "Lire le changelog" : clover ? (inside ? "Lire l'article" : "Lire sur le site") : inside ? "Lire la note de version" : "Article complet sur minecraft.net";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group mc-frame flex h-full w-full flex-col overflow-hidden bg-card text-left transition-colors hover:bg-[#221e18]"
    >
      <span className="relative aspect-[16/8] w-full overflow-hidden border-b border-border bg-sunken">
        {card.item.image ? (
          <img src={card.item.image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground/50">
            <Newspaper className="size-8" aria-hidden />
          </span>
        )}
        <span
          className={cn(
            "absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold shadow",
            card.source !== "minecraft" ? "bg-primary text-primary-foreground" : "bg-[#14120f]/90 text-foreground",
          )}
        >
          {clover ? <Clover className="size-3.5" aria-hidden /> : card.source === "changelog" ? <ClipboardList className="size-3.5" aria-hidden /> : <Pickaxe className="size-3.5" aria-hidden />}
          {label}
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-3.5">
        <span className="flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase">
          <time dateTime={card.date} className="text-muted-foreground">
            {dateFormat.format(new Date(card.date))}
          </time>
        </span>
        <span className="line-clamp-2 text-[15px] leading-snug font-bold">{title}</span>
        <span className="line-clamp-3 text-[13px] leading-snug text-muted-foreground">{text}</span>
        <span className="mt-auto flex items-center gap-1 pt-2 text-xs font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
          {inside ? <BookOpen className="size-3.5" aria-hidden /> : <ArrowUpRight className="size-3.5" aria-hidden />}
          {action}
        </span>
      </span>
    </button>
  );
}
