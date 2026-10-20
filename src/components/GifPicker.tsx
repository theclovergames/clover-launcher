import { CloudOff, LoaderCircle } from "lucide-react";
import { type UIEvent, useCallback, useEffect, useRef, useState } from "react";

import poweredByGiphy from "@/assets/brand/powered-by-giphy.png";
import { SearchField } from "@/components/SearchField";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { masonry } from "@/lib/messages";
import type { GifPage, GifResult } from "@/types";

/** Frappe terminée : la recherche part (le site en accepte 30 par minute). */
const SEARCH_DELAY_MS = 400;

type Results = { query: string; gifs: GifResult[]; next: number | null };

/**
 * GIF de Giphy, cherchés par le site (la clé reste chez lui) : tendances à l'ouverture, recherche,
 * suite au défilement. Grille légère en deux colonnes au rendu `fixed_width`, avec la mention
 * « Powered by GIPHY » demandée par Giphy. Un clic envoie le GIF.
 */
export function GifPicker({ search, onPick, disabled }: { search: (query: string, offset: number) => Promise<GifPage>; onPick: (gif: GifResult) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(
    (wanted: string, offset: number) => {
      const id = ++request.current;
      setLoading(true);
      setError(null);
      search(wanted, offset)
        .then((page) => {
          if (id !== request.current) return;
          setResults((current) => ({
            query: wanted,
            gifs: offset > 0 && current?.query === wanted ? [...current.gifs, ...page.gifs.filter((gif) => !current.gifs.some((other) => other.id === gif.id))] : page.gifs,
            next: page.next,
          }));
        })
        .catch((reason) => id === request.current && setError(String(reason)))
        .finally(() => id === request.current && setLoading(false));
    },
    [search],
  );

  // Ouverture ou nouvelle recherche : première page, après la frappe.
  const wanted = query.trim();
  useEffect(() => {
    if (!open || results?.query === wanted) return;
    const timer = window.setTimeout(() => load(wanted, 0), wanted ? SEARCH_DELAY_MS : 0);
    return () => window.clearTimeout(timer);
  }, [open, wanted, results?.query, load]);

  const more = (event: UIEvent<HTMLDivElement>) => {
    const box = event.currentTarget;
    if (!loading && results?.next != null && box.scrollHeight - box.scrollTop - box.clientHeight < 160) load(results.query, results.next);
  };

  const columns = masonry(results?.gifs ?? [], 2);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Envoyer un GIF"
          title="GIF"
          className="grid h-9 shrink-0 place-items-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-50 data-[state=open]:bg-white/[0.06] data-[state=open]:text-primary"
        >
          <span aria-hidden className="rounded-[4px] border-2 border-current px-1 text-[10px] leading-[14px] font-extrabold">
            GIF
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="mc-frame flex h-[min(440px,70vh)] w-[372px] flex-col gap-2 border-[var(--mc-outline)] bg-card p-2 ring-0">
        <SearchField label="Chercher un GIF" placeholder="Chercher un GIF" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={50} autoFocus />
        <p className="px-1 text-[11px] font-semibold text-muted-foreground">{wanted ? `Résultats pour « ${wanted} »` : "Tendances"}</p>
        <div onScroll={more} className="min-h-0 flex-1 overflow-y-auto pr-0.5" aria-busy={loading}>
          {error && !results?.gifs.length ? (
            <p role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-muted-foreground">
              <CloudOff className="size-5" aria-hidden />
              {error}
            </p>
          ) : results && results.query === wanted && results.gifs.length === 0 && !loading ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">Aucun GIF trouvé.</p>
          ) : (
            <div className="flex gap-1.5">
              {columns.map((column, index) => (
                <ul key={index} className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {column.map((gif) => (
                    <li key={gif.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onPick(gif);
                          setOpen(false);
                        }}
                        aria-label={gif.title ? `GIF : ${gif.title}` : "GIF sans titre"}
                        title={gif.title || undefined}
                        className="block w-full overflow-hidden rounded-md bg-sunken outline-offset-2 transition-[filter] hover:brightness-110"
                        style={{ aspectRatio: gif.width > 0 && gif.height > 0 ? `${gif.width} / ${gif.height}` : "1" }}
                      >
                        <img src={gif.url} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          )}
          {loading && (
            <p className="flex justify-center py-3 text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              <span className="sr-only">Chargement des GIF…</span>
            </p>
          )}
        </div>
        <p className="flex justify-end px-1">
          <img src={poweredByGiphy} alt="Powered by GIPHY" draggable={false} className="h-3.5 w-auto" />
        </p>
      </PopoverContent>
    </Popover>
  );
}
