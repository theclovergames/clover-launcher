import { ArrowRight, Newspaper } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NewsItem } from "@/types";

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
 * Le dernier article en grand, bannière entière, puis les deux précédents en lignes avec leur
 * miniature ; fenêtre basse, le premier passe lui aussi en ligne. Catégorie et ancienneté sur chacun, « Nouveau » la première semaine. Pas de résumé :
 * la bannière et le titre disent déjà l'essentiel, le lecteur fait le reste.
 */
export function NewsList({ news, onOpen, onAll, className }: { news: NewsItem[]; onOpen: (item: NewsItem) => void; onAll: () => void; className?: string }) {
  const now = new Date();
  const [lead, ...others] = news;

  return (
    <section aria-labelledby="news-title" className={cn("flex min-w-0 flex-col gap-3", className)}>
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
        <ul className="flex flex-col gap-1">
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(lead)}
              className="group flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring tall:flex-col tall:items-stretch tall:gap-2"
            >
              <Banner item={lead} className="w-20 tall:w-full" />
              <span className="flex min-w-0 flex-1 flex-col-reverse gap-1 tall:flex-col tall:px-0.5">
                <Meta item={lead} now={now} />
                <span className="line-clamp-2 text-xs leading-snug font-semibold transition-colors group-hover:text-accent tall:text-[15px] tall:font-bold">{lead.title}</span>
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5 tall:hidden" aria-hidden />
            </button>
          </li>
          {others.slice(0, 2).map((item) => (
            <li key={item.url} className="min-w-0 border-t border-border pt-1">
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="group flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Banner item={item} className="w-20" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="line-clamp-2 text-xs leading-snug font-semibold transition-colors group-hover:text-accent">{item.title}</span>
                  <Meta item={item} now={now} />
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
