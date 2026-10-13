import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NewsItem } from "@/types";

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

/**
 * Derniers articles du blog du site, en une ligne de cartes : deux quand la place manque, trois
 * sinon. Fenêtre haute : grande image au-dessus de la date et du titre ; sinon, vignette à côté.
 * Le premier est à la une. « Tout lire » mène à la page Actualités.
 */
export function NewsList({ news, onOpen, onAll, className }: { news: NewsItem[]; onOpen: (item: NewsItem) => void; onAll: () => void; className?: string }) {
  return (
    <section aria-labelledby="news-title" className={cn("@container flex min-w-0 flex-col gap-2.5", className)}>
      <div className="flex items-baseline justify-between">
        <h2 id="news-title" className="font-display text-xl">
          Actualités
        </h2>
        <button type="button" onClick={onAll} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
          Tout lire
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>

      {news.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune actualité à afficher pour le moment.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 @5xl:grid-cols-3">
          {news.slice(0, 3).map((item, index) => (
            <li key={item.url} className={cn("min-w-0", index === 2 && "hidden @5xl:block")}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="group flex h-full w-full items-center gap-3 overflow-hidden rounded-lg border border-border bg-card p-1.5 pr-3 text-left transition-colors hover:border-accent/60 tall:flex-col tall:items-stretch tall:gap-0 tall:p-0"
              >
                <span className="aspect-video w-36 shrink-0 overflow-hidden rounded-md bg-sunken tall:aspect-auto tall:h-36 tall:w-full tall:rounded-none">
                  {item.image && <img src={item.image} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />}
                </span>
                <span className="flex min-w-0 flex-col gap-1 tall:px-3.5 tall:pt-3 tall:pb-3.5">
                  <span className="text-[11px] font-semibold tracking-wide text-accent uppercase">
                    {index === 0 && "À la une · "}
                    <time dateTime={item.publishedAt}>{date.format(new Date(item.publishedAt))}</time>
                  </span>
                  <span className="line-clamp-2 text-sm leading-snug font-bold tall:text-[15px]">{item.title}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
