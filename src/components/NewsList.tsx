import { ArrowRight, Newspaper } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import type { MinecraftNewsItem, NewsItem } from "@/types";

const dayMonth = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const dayMonthYear = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
/** Moins d'une semaine : l'article est signalé « Nouveau ». */
const FRESH_DAYS = 7;

const daysAgo = (published: Date, now: Date) =>
  Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(published.getFullYear(), published.getMonth(), published.getDate()).getTime()) / 86_400_000);

/** « Aujourd'hui », « Hier », « Il y a 3 jours », puis la date (avec l'année si ce n'est pas celle en cours). */
function when(publishedAt: string, now: Date) {
  const published = new Date(publishedAt);
  const days = daysAgo(published, now);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < FRESH_DAYS) return `Il y a ${days} jours`;
  return (published.getFullYear() === now.getFullYear() ? dayMonth : dayMonthYear).format(published);
}

/** Bannière 16:9 de l'article (le site y lettre souvent le titre) : jamais recadrée autrement. */
function Banner({ item, className }: { item: NewsItem; className?: string }) {
  return (
    <span className={cn("block aspect-video shrink-0 overflow-hidden rounded-md bg-sunken", className)}>
      {item.image ? (
        <img src={item.image} alt="" loading="lazy" draggable={false} className="size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]" />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground">
          <Newspaper className="size-1/4" aria-hidden />
        </span>
      )}
    </span>
  );
}

/** Ligne ou carte d'un article, surlignée au survol. */
const row = "group flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Annonce de Minecraft présentée comme un article, sous la catégorie « Minecraft ». */
const fromMinecraft = (item: MinecraftNewsItem): NewsItem => ({ title: item.title, excerpt: item.summary, category: "Minecraft", image: item.image, url: item.url ?? item.id, publishedAt: item.publishedAt });

function Meta({ item, now }: { item: NewsItem; now: Date }) {
  const fresh = daysAgo(new Date(item.publishedAt), now) < FRESH_DAYS;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
      {fresh && <span className="rounded-sm bg-accent px-1.5 py-px text-[10px] font-bold text-accent-foreground uppercase">Nouveau</span>}
      {item.category && <span className="truncate font-semibold tracking-wide text-accent uppercase">{item.category}</span>}
      {item.category && <span aria-hidden>·</span>}
      <time dateTime={item.publishedAt} title={dayMonthYear.format(new Date(item.publishedAt))}>{when(item.publishedAt, now)}</time>
    </span>
  );
}

/**
 * Le dernier article en grand, bannière entière, puis les précédents en lignes avec leur
 * miniature, ou en cartes deux par deux si le bloc est très haut (plein écran), autant qu'il en
 * tient d'entiers dans la hauteur donnée ; trop basse, le premier passe lui aussi en ligne. Les
 * annonces de Minecraft suivent les articles de Clover Games : elles n'apparaissent que s'il reste
 * de la place. Catégorie et ancienneté sur chacun, « Nouveau » la première semaine. Pas de résumé :
 * la bannière et le titre disent déjà l'essentiel, le lecteur fait le reste.
 */
export function NewsList({ news, minecraft = [], onOpen, onOpenMinecraft, onAll, className }: { news: NewsItem[]; minecraft?: MinecraftNewsItem[]; onOpen: (item: NewsItem) => void; onOpenMinecraft?: (item: MinecraftNewsItem) => void; onAll: () => void; className?: string }) {
  const now = new Date();
  const [lead, ...others] = news;
  const rest = [
    ...others.map((item) => ({ item, open: () => onOpen(item) })),
    ...(onOpenMinecraft ? minecraft.map((item) => ({ item: fromMinecraft(item), open: () => onOpenMinecraft(item) })) : []),
  ];
  const list = useRef<HTMLUListElement>(null);

  // Les articles qui ne tiennent pas passent dans une colonne à droite (lignes) ou sont coupés en
  // bas (cartes) : on les retire, et les rangées de cartes restantes s'étirent sur la hauteur libérée.
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    const hide = () => {
      const items = [...node.children].slice(1) as HTMLElement[];
      for (const item of items) item.hidden = false;
      const out = items.map((item) => item.offsetLeft + item.offsetWidth > node.clientWidth + 1 || item.offsetTop + item.offsetHeight > node.clientHeight + 1);
      items.forEach((item, index) => (item.hidden = out[index]));
    };
    const observer = new ResizeObserver(hide);
    observer.observe(node);
    return () => observer.disconnect();
  }, [news, minecraft]);

  return (
    <section aria-labelledby="news-title" className={cn("flex min-w-0 flex-col gap-3 [container:news/size]", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="news-title" className="font-display text-xl leading-none">
          Actualités
        </h2>
        <button type="button" onClick={onAll} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
          Tout lire
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>

      {!lead ? (
        <p className="text-sm text-muted-foreground">Aucune actualité à afficher pour le moment.</p>
      ) : (
        // Cartes : grille de deux colonnes ; la rangée du premier article garde sa hauteur, les autres s'étirent.
        <ul ref={list} className="relative flex min-h-0 flex-1 flex-col flex-wrap content-start gap-x-4 gap-y-1 overflow-clip news-tall:grid news-tall:grid-cols-2 news-tall:grid-rows-[min-content] news-tall:content-stretch">
          <li className="w-full min-w-0 news-tall:col-span-2">
            <button
              type="button"
              onClick={() => onOpen(lead)}
              className={cn(row, "news-roomy:flex-col news-roomy:items-stretch news-roomy:gap-2")}
            >
              <Banner item={lead} className="w-20 news-roomy:w-full" />
              <span className="flex min-w-0 flex-1 flex-col-reverse gap-1 news-roomy:flex-col news-roomy:px-0.5">
                <Meta item={lead} now={now} />
                <span className="line-clamp-2 text-xs leading-snug font-semibold transition-colors group-hover:text-accent news-roomy:text-[15px] news-roomy:font-bold">{lead.title}</span>
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5 news-roomy:hidden" aria-hidden />
            </button>
          </li>
          {rest.slice(0, 14).map(({ item, open }) => (
            <li key={item.url} className="w-full min-w-0 border-t border-border pt-1 news-tall:max-h-52">
              <button
                type="button"
                onClick={open}
                className={cn(row, "news-tall:h-full news-tall:flex-col news-tall:items-stretch news-tall:gap-2")}
              >
                <Banner item={item} className="w-20 news-tall:w-full" />
                <span className="flex min-w-0 flex-1 flex-col gap-1 news-tall:px-0.5">
                  <span className="line-clamp-2 text-xs leading-snug font-semibold transition-colors group-hover:text-accent">{item.title}</span>
                  <Meta item={item} now={now} />
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5 news-tall:hidden" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
