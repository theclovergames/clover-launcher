import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Crosshair,
  Crown,
  Flame,
  Gem,
  Heart,
  LocateFixed,
  type LucideIcon,
  Medal,
  RotateCcw,
  Rocket,
  Shield,
  Skull,
  Star,
  Swords,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/PlayerStats";
import { SearchField } from "@/components/SearchField";
import { SkinFront } from "@/components/SkinFront";
import { Tabs } from "@/components/Tabs";
import { api } from "@/lib/api";
import { secondaryButton } from "@/lib/buttons";
import { headUrl } from "@/lib/friends";
import { columnsOf, formatValue, isMe, rankRows, type Sort } from "@/lib/leaderboard";
import { SITE_URL } from "@/lib/site";
import { cn, fold } from "@/lib/utils";
import type { LeaderboardBoard, LeaderboardRow, LeaderboardStat, PlayerLook, SkinModel } from "@/types";

/** Joueurs par page du tableau, comme sur le site. */
const PAGE_SIZE = 25;

/** Icônes proposées par l'administration du site (`leaderboard-ui.ts`), par leur clé. */
const ICONS: Record<string, LucideIcon> = { Target, Swords, Trophy, Crown, Zap, Shield, Flame, Skull, Gem, Clock, Coins, Heart, Star, Rocket, Crosshair };

/** Couleurs du site par clé, pour le chiffre clé et l'onglet. */
const COLORS: Record<string, string> = {
  primary: "var(--primary)",
  blue: "#60a5fa",
  purple: "#a78bfa",
  red: "#f87171",
  amber: "#fbbf24",
  cyan: "#22d3ee",
  pink: "#f472b6",
  slate: "#94a3b8",
};

/** Or, argent, bronze. */
const PODIUM = ["#e8bc5c", "#c9ccd1", "#c98a5a"];

/** Les trois premiers, debout : skin de Mojang s'il est lu, sinon celui de minotar. */
function Podium({ board, entries, onOpen }: { board: LeaderboardBoard; entries: { row: LeaderboardRow; rank: number }[]; onOpen: (name: string) => void }) {
  const [looks, setLooks] = useState<Record<string, PlayerLook | null>>({});
  const names = entries.map((entry) => entry.row.name).join(",");
  useEffect(() => {
    let alive = true;
    for (const name of names.split(",").filter(Boolean)) {
      api
        .playerLook(name)
        .then((look) => alive && setLooks((current) => ({ ...current, [name]: look })))
        .catch(() => alive && setLooks((current) => ({ ...current, [name]: null })));
    }
    return () => {
      alive = false;
    };
  }, [names]);
  const key = columnsOf(board).find((stat) => stat.key === board.sortKey)!;
  return (
    // Lu dans l'ordre ; affiché avec le premier au centre, le deuxième à gauche, le troisième à droite.
    <ol aria-label="Podium" className="grid grid-cols-3 items-end gap-3">
      {entries.map(({ row, rank }) => {
        const look = looks[row.name];
        const texture = look?.texture ?? `https://minotar.net/skin/${encodeURIComponent(row.name)}`;
        const model: SkinModel = look?.model ?? "classic";
        const color = PODIUM[rank - 1];
        return (
          <li key={row.name} className={cn("flex min-w-0 flex-col items-center", rank === 1 ? "order-2" : rank === 2 ? "order-1" : "order-3")}>
            <button
              type="button"
              onClick={() => onOpen(row.name)}
              title={`Voir le profil de ${row.name}`}
              className="group flex w-full min-w-0 flex-col items-center gap-2 rounded-lg px-2 pt-3 pb-3 transition-colors hover:bg-white/[0.03]"
            >
              <span className="relative">
                {look === undefined ? <Skeleton className={rank === 1 ? "h-[128px] w-[64px]" : "h-[104px] w-[52px]"} /> : <SkinFront texture={texture} model={model} scale={rank === 1 ? 4 : 3.25} className="transition-transform duration-200 motion-safe:group-hover:-translate-y-1" />}
              </span>
              <span className="flex max-w-full items-center gap-1.5">
                {rank === 1 ? <Crown className="size-4 shrink-0" style={{ color }} aria-hidden /> : <Medal className="size-4 shrink-0" style={{ color }} aria-hidden />}
                <span className="truncate font-display text-lg leading-none">{row.name}</span>
              </span>
              <span className="font-pixel text-[15px] leading-none" style={{ color }}>
                {formatValue(row.values[board.sortKey], key.format)}
              </span>
              <span className="text-[11px] text-muted-foreground">{key.label}</span>
            </button>
            {/* Marche du podium, plus haute pour le premier. */}
            <span
              aria-hidden
              className={cn("mc-slot grid w-full place-items-center font-pixel text-xl", rank === 1 ? "h-16" : rank === 2 ? "h-11" : "h-8")}
              style={{ color }}
            >
              {rank}
            </span>
            <span className="sr-only">{`${rank}${rank === 1 ? "er" : "e"}`}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SortHeader({ stat, sort, onSort }: { stat: LeaderboardStat; sort: Sort; onSort: (key: string) => void }) {
  const active = sort.key === stat.key;
  return (
    <th scope="col" aria-sort={active ? (sort.ascending ? "ascending" : "descending") : undefined} className="px-3 py-2 text-right font-semibold">
      <button
        type="button"
        onClick={() => onSort(stat.key)}
        className={cn("ml-auto flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}
      >
        {stat.label}
        {active && (sort.ascending ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />)}
      </button>
    </th>
  );
}

/**
 * Classement du réseau, les mêmes tableaux que sur clovergames.fr : un onglet par tableau, les
 * trois premiers sur un podium, puis les 100 premiers par pages de 25, triables par colonne. Un
 * pseudo ouvre le profil du joueur ; « Ma place » mène à la ligne du compte actif.
 */
export function LeaderboardScreen({ me, onOpenPlayer, onOpenLink, services = api }: { me: { uuid: string; name: string }; onOpenPlayer: (name: string) => void; onOpenLink: (url: string) => void; services?: Pick<typeof api, "leaderboard"> }) {
  const [boards, setBoards] = useState<LeaderboardBoard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    services
      .leaderboard()
      .then(setBoards)
      .catch((reason) => setError(String(reason)));
  }, [services]);
  useEffect(load, [load]);

  const board = boards?.find((entry) => entry.id === boardId) ?? boards?.[0] ?? null;
  const activeSort: Sort | null = board ? (sort ?? { key: board.sortKey, ascending: board.ascending }) : null;
  const ranked = board ? rankRows(board, activeSort) : [];
  const wanted = fold(query.trim());
  const shown = wanted ? ranked.filter(({ row }) => fold(row.name).includes(wanted)) : ranked;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const mine = ranked.find(({ row }) => isMe(row, me)) ?? null;
  const defaultOrder = board !== null && activeSort !== null && activeSort.key === board.sortKey && activeSort.ascending === board.ascending;
  const podium = !wanted && defaultOrder && current === 0 ? ranked.slice(0, 3) : [];

  const openBoard = (id: string) => {
    setBoardId(id);
    setSort(null);
    setPage(0);
    setFocused(null);
  };
  const sortBy = (key: string) => {
    if (!activeSort) return;
    setSort(activeSort.key === key ? { key, ascending: !activeSort.ascending } : { key, ascending: false });
    setPage(0);
  };
  const showMine = () => {
    if (!mine) return;
    setQuery("");
    setPage(Math.floor((mine.rank - 1) / PAGE_SIZE));
    setFocused(mine.row.name);
    window.setTimeout(() => document.getElementById("leaderboard-me")?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
  };

  if (error && !boards) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center px-10">
        <EmptyState
          className="w-full max-w-lg"
          title="Classement indisponible"
          hint={error}
          action={
            <button type="button" onClick={load} className={secondaryButton}>
              <RotateCcw className="size-4" aria-hidden />
              Réessayer
            </button>
          }
        />
      </main>
    );
  }

  const columns = board ? columnsOf(board) : [];
  const accent = (board?.color && COLORS[board.color]) || COLORS.primary;
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-8 pt-7 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[34px] leading-none">Classement</h1>
          <p className="text-sm text-muted-foreground">Les 100 meilleurs joueurs de chaque classement, comme sur clovergames.fr.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            label="Chercher un joueur"
            placeholder="Chercher un joueur"
            value={query}
            maxLength={16}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            className="w-56"
          />
          <button type="button" onClick={showMine} disabled={!mine} title={mine ? undefined : "Tu n'es pas dans les 100 premiers de ce classement"} className={secondaryButton}>
            <LocateFixed className="size-4" aria-hidden />
            {mine ? `Ma place : ${mine.rank}${mine.rank === 1 ? "er" : "e"}` : "Hors du top 100"}
          </button>
        </div>
      </header>

      {!boards ? (
        <div className="mt-6 flex flex-col gap-4">
          <Skeleton className="h-10 w-96" />
          <Skeleton className="h-[220px]" />
          <Skeleton className="h-[320px]" />
        </div>
      ) : boards.length === 0 || !board ? (
        <EmptyState className="mt-8" title="Aucun classement pour le moment" hint="Les classements apparaîtront ici dès qu'ils seront publiés sur le site." />
      ) : (
        <>
          <Tabs
            label="Classements"
            className="mt-6"
            value={board.id}
            onChange={openBoard}
            items={boards.map((entry) => ({ id: entry.id, label: entry.name, Icon: (entry.icon && ICONS[entry.icon]) || Trophy }))}
          />

          {podium.length > 0 && (
            <section aria-label={`Podium ${board.name}`} className="mx-auto mt-6 w-full max-w-2xl">
              <Podium board={board} entries={podium} onOpen={onOpenPlayer} />
            </section>
          )}

          {shown.length === 0 ? (
            <EmptyState className="mt-6" title={wanted ? "Aucun joueur trouvé" : "Personne n'est encore classé"} hint={wanted ? `Aucun pseudo ne contient « ${query.trim()} » dans les 100 premiers.` : undefined} />
          ) : (
            <div className="mt-6 overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse text-[13px]">
                <caption className="sr-only">
                  Classement {board.name}, page {current + 1} sur {pages}
                </caption>
                <thead className="bg-sunken text-xs">
                  <tr>
                    <th scope="col" className="w-14 px-3 py-2 text-left font-semibold text-muted-foreground">
                      #
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold text-muted-foreground">
                      Joueur
                    </th>
                    {columns.map((stat) => (
                      <SortHeader key={stat.key} stat={stat} sort={activeSort!} onSort={sortBy} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ row, rank }) => {
                    const self = isMe(row, me);
                    return (
                      <tr
                        key={`${row.uuid ?? ""}${row.name}`}
                        id={self ? "leaderboard-me" : undefined}
                        className={cn("border-t border-border transition-colors hover:bg-white/[0.03]", self && "bg-primary/[0.08]", focused === row.name && "outline-2 -outline-offset-2 outline-primary/60")}
                      >
                        <td className="px-3 py-2 font-pixel text-[13px]" style={rank <= 3 ? { color: PODIUM[rank - 1] } : undefined}>
                          {rank}
                        </td>
                        <td className="px-3 py-1.5">
                          <button type="button" onClick={() => onOpenPlayer(row.name)} title={`Voir le profil de ${row.name}`} className="group flex min-w-0 items-center gap-2.5 text-left">
                            <img src={headUrl(row.name, 32)} alt="" width={28} height={28} loading="lazy" draggable={false} className="pixelated size-7 shrink-0 rounded-[4px]" />
                            <span className="truncate font-bold underline-offset-2 group-hover:underline">{row.name}</span>
                            {self && <span className="shrink-0 rounded bg-primary/15 px-1.5 py-px text-[10px] font-bold text-primary">Toi</span>}
                          </button>
                        </td>
                        {columns.map((stat) => (
                          <td
                            key={stat.key}
                            className={cn("px-3 py-2 text-right tabular-nums", stat.key === activeSort?.key ? "font-bold" : "text-muted-foreground")}
                            style={stat.key === activeSort?.key ? { color: accent } : undefined}
                          >
                            {formatValue(row.values[stat.key], stat.format)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => onOpenLink(`${SITE_URL}/leaderboard`)} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
              Voir sur le site
              <ArrowUpRight className="size-3.5" aria-hidden />
            </button>
            {pages > 1 && (
              <nav aria-label="Pages du classement" className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Page précédente" className={cn(secondaryButton, "h-8 px-2")}>
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <span className="tabular-nums text-muted-foreground">
                  Page {current + 1} sur {pages}
                </span>
                <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Page suivante" className={cn(secondaryButton, "h-8 px-2")}>
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </nav>
            )}
          </footer>
        </>
      )}
    </main>
  );
}
