import { Clock, Coins, Flame, Medal, Play, Star, Trophy, Vote } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useState } from "react";

import launcherLogo from "@/assets/brand/launcher.png";
import { primaryButton } from "@/lib/buttons";
import { findMode } from "@/lib/friends";
import { modeArt } from "@/lib/mode-art";
import { formatDuration } from "@/lib/play-history";
import { cn, fold } from "@/lib/utils";
import type { ModeStats, PlayerStats } from "@/types";

/**
 * Blocs de statistiques Clover Games communs au Profil du compte actif et à celui d'un autre
 * joueur : niveau et barre d'inventaire, tuiles des modes avec leur détail, temps de jeu, succès.
 */

export const number = new Intl.NumberFormat("fr-FR");
const plain = new Intl.NumberFormat("fr-FR", { useGrouping: false });
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
/** Chiffres en Monocraft, qui n'a pas l'espace fine des milliers : groupés seulement à partir de 10 000, abrégés à partir de 100 000. */
export const pixel = (value: number) => (value < 10_000 ? plain.format(value) : value < 100_000 ? number.format(value) : compact.format(value));
const ratio = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
export const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

/** Mode du manifeste : nom, illustration et Quick Play. */
export type Mode = { id: string; name: string; icon: string | null; quickPlay: boolean };

export const place = (rank: number) => (rank === 1 ? "1er" : `${rank}e`);
const kd = (kills: number, deaths: number) => ratio.format(deaths ? kills / deaths : kills);

export function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  const id = `profile-${fold(title).replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-display text-xl leading-none">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-lg bg-white/[0.04]", className)} />;
}

/**
 * Barre d'expérience du jeu : niveau en chiffres verts cernés de noir au-dessus d'une barre verte
 * à crans, remplie selon l'XP gagnée dans le niveau.
 */
function XpBar({ level, into, needed }: { level: number; into: number; needed: number }) {
  const progress = Math.min(1, into / needed);
  return (
    <div className="flex w-full flex-col items-center gap-1">
      <span className="font-pixel text-[28px] leading-none text-[#80ff20] [text-shadow:2px_0_0_#000,-2px_0_0_#000,0_2px_0_#000,0_-2px_0_#000,2px_2px_0_#000]">{level}</span>
      <div
        role="progressbar"
        aria-label={`Niveau ${level}`}
        aria-valuemin={0}
        aria-valuemax={needed}
        aria-valuenow={into}
        aria-valuetext={`${number.format(into)} XP sur ${number.format(needed)}`}
        className="relative h-3 w-full overflow-hidden rounded-[3px] border-2 border-black bg-[#1d1b17]"
      >
        <div
          className="absolute inset-y-0 left-0 bg-linear-to-b from-[#a6ff5c] via-[#80ff20] to-[#4f9d14] transition-[width] duration-700 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
        {/* Les crans de la barre du jeu. */}
        <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_calc(100%/18-2px),rgb(0_0_0/0.55)_calc(100%/18-2px),rgb(0_0_0/0.55)_calc(100%/18))]" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-white/25" />
      </div>
    </div>
  );
}

type HotbarItem = { label: string; icon: ReactNode; tone: string; count: string | null; lore: string };

/**
 * Barre d'inventaire sous l'XP, comme dans le jeu : une case par compteur, le nombre en bas à
 * droite de la case. Le survol affiche l'infobulle du jeu (nom, puis détail en gris).
 */
function Hotbar({ items }: { items: HotbarItem[] }) {
  return (
    <ul className="grid w-full gap-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item, index) => (
        // Atteignable au clavier : le focus ouvre la même infobulle que le survol.
        <li key={item.label} tabIndex={0} className="group relative flex flex-col items-center gap-1 rounded-[4px]">
          <span className="mc-slot relative grid aspect-square w-full max-w-12 place-items-center [--mc-radius:4px]">
            <span aria-hidden className={cn("[&>svg]:size-5", item.count === null ? "opacity-35" : item.tone)}>
              {item.icon}
            </span>
            {item.count !== null && (
              <span aria-hidden className="mc-text-shadow absolute right-1 bottom-0.5 font-pixel text-[11px] leading-none text-white">
                {item.count}
              </span>
            )}
          </span>
          <span aria-hidden className="text-[10px] leading-none font-semibold text-white/70">
            {item.label}
          </span>
          <span className="sr-only">
            {item.label} : {item.lore}
          </span>
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-full z-10 mb-1.5 flex flex-col gap-0.5 rounded-[3px] border-2 border-[#2b0a66] bg-[#100010]/95 px-2 py-1.5 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
              index === 0 ? "left-0" : index === items.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2",
            )}
          >
            <span className="text-[12px] leading-none font-semibold text-white">{item.label}</span>
            <span className="text-[11px] leading-tight text-[#aaaaaa]">{item.lore}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Cases de la barre : les pièces seulement sur son propre profil (le site ne les donne pas pour un autre). */
function hotbar(data: PlayerStats, own: boolean): HotbarItem[] {
  const { coins, votes, streak, achievements } = data;
  return [
    ...(own
      ? [
          {
            label: "Pièces",
            icon: <Coins />,
            tone: "text-[#e8bc5c]",
            count: coins === null ? null : pixel(coins),
            lore: coins === null ? "Indisponible" : `${number.format(coins)}, pour la boutique en jeu`,
          },
        ]
      : []),
    {
      label: "Votes",
      icon: <Vote />,
      tone: "text-accent",
      count: votes ? pixel(votes.total) : null,
      lore: votes ? `${number.format(votes.total)} au total, ${number.format(votes.month)} ce mois-ci` : "Indisponible",
    },
    {
      label: "Série",
      icon: <Flame />,
      tone: "text-[#f08c4a]",
      count: streak ? String(streak.current) : null,
      lore: streak ? `${streak.current} jour${streak.current > 1 ? "s" : ""} de connexion d'affilée, record ${streak.best}` : "Indisponible",
    },
    {
      label: "Succès",
      icon: <Trophy />,
      tone: "text-[#e8bc5c]",
      count: achievements ? String(achievements.unlocked) : null,
      lore: achievements
        ? `${achievements.unlocked} sur ${achievements.total}, ${number.format(achievements.points)} points`
        : data.linked || !own
          ? "Indisponible"
          : "Compte du site non lié",
    },
  ];
}

/** Chiffre clé d'une tuile, détail du mode (quatre chiffres) et classement. */
function modeNumbers(mode: ModeStats): { key: { value: string; unit: string }; badge: ReactNode; stats: { label: string; value: string }[]; season: boolean } {
  if (mode.id === "bedwars") {
    const s = mode.stats;
    return {
      season: true,
      key: { value: pixel(s.wins), unit: s.wins > 1 ? "victoires" : "victoire" },
      badge: (
        <span title={`${s.stars} étoiles BedWars`} className="flex shrink-0 items-center gap-0.5 rounded bg-[#d9a441]/12 px-1.5 py-px text-[11px] font-bold text-[#e8bc5c]">
          <Star className="size-3 fill-current" aria-hidden />
          {s.stars}
        </span>
      ),
      stats: [
        { label: "Victoires", value: pixel(s.wins) },
        { label: "Lits détruits", value: pixel(s.beds) },
        { label: "Éliminations finales", value: pixel(s.finalKills) },
        { label: "Ratio V / D", value: kd(s.wins, s.losses) },
      ],
    };
  }
  if (mode.id === "practice") {
    const s = mode.stats;
    return {
      season: true,
      key: s.rating === null ? { value: pixel(s.wins), unit: s.wins > 1 ? "victoires" : "victoire" } : { value: pixel(s.rating), unit: "ELO" },
      badge: null,
      stats: [
        { label: "ELO (saison)", value: s.rating === null ? "—" : pixel(s.rating) },
        { label: "Record", value: s.peakRating === null ? "—" : pixel(s.peakRating) },
        { label: "Victoires", value: pixel(s.wins) },
        { label: "Ratio E / M", value: kd(s.kills, s.deaths) },
      ],
    };
  }
  const s = mode.stats;
  return {
    season: false,
    key: { value: pixel(s.kills), unit: s.kills > 1 ? "éliminations" : "élimination" },
    badge: null,
    stats: [
      { label: "Éliminations", value: pixel(s.kills) },
      { label: "Morts", value: pixel(s.deaths) },
      { label: "Ratio E / M", value: kd(s.kills, s.deaths) },
      { label: "Meilleure série", value: pixel(s.bestStreak) },
    ],
  };
}

/** Modes qui ont des statistiques, dans cet ordre : chaque tuile garde sa place. */
const STAT_MODES = ["bedwars", "practice", "skypvp", "pvpsoup"];

export type Tile = { id: string; name: string; art: string | null; info: Mode | undefined; stats: ModeStats | null; seconds: number | null };

/** Rang à la même place sur chaque tuile ; or dans le top 10. */
function RankChip({ rank }: { rank: number | null }) {
  return (
    <span
      className={cn(
        "absolute top-1 left-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-none font-bold",
        rank === null ? "bg-black/55 text-white/60" : rank <= 10 ? "bg-[#d9a441] text-[#3b1905]" : "bg-black/65 text-white",
      )}
    >
      {rank !== null && <Medal className="size-3" aria-hidden />}
      {rank === null ? "Non classé" : place(rank)}
    </span>
  );
}

function ModeTile({ tile, selected, onSelect }: { tile: Tile; selected: boolean; onSelect: () => void }) {
  const numbers = tile.stats && modeNumbers(tile.stats);
  return (
    <button
      type="button"
      role="tab"
      id={`profile-mode-${tile.id}`}
      aria-selected={selected}
      aria-controls="profile-mode-panel"
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={cn(
        "group @container relative flex h-full w-full flex-col items-stretch gap-2 overflow-hidden rounded-lg border bg-card px-1 pt-1 pb-2.5 text-left transition-colors duration-200",
        selected ? "border-[#e9e3d4]/80 bg-card-hover" : "border-border hover:border-[#e9e3d4]/40",
      )}
    >
      <img
        src={tile.art ?? launcherLogo}
        alt=""
        aria-hidden
        draggable={false}
        className={cn(
          "pointer-events-none absolute inset-0 size-full scale-125 object-cover blur-2xl saturate-150 transition-opacity duration-300",
          selected ? "opacity-75" : "opacity-40 group-hover:opacity-60",
          !tile.stats && "grayscale",
        )}
      />
      <span className="relative block aspect-square max-h-[clamp(72px,17vh,150px)] w-full">
        {tile.art ? (
          <img src={tile.art} alt="" draggable={false} className={cn("size-full object-contain transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5", !tile.stats && "opacity-70 grayscale")} />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-2">
            <img src={launcherLogo} alt="" draggable={false} className={cn("w-[42%]", !tile.stats && "grayscale")} />
            <span className="max-w-full truncate font-display text-base leading-none">{tile.name}</span>
          </span>
        )}
        {tile.stats && <RankChip rank={tile.stats.rank} />}
      </span>
      <span className="sr-only">{tile.name}</span>
      <span className="relative flex min-w-0 items-baseline justify-center gap-1.5 px-1">
        {numbers ? (
          <>
            <span className="mc-text-shadow font-pixel text-[15px] leading-none text-white">{numbers.key.value}</span>
            <span className="truncate text-[11px] font-semibold text-white/75">{numbers.key.unit}</span>
          </>
        ) : (
          <span className="truncate text-[11px] font-semibold text-white/60">Pas encore joué</span>
        )}
      </span>
    </button>
  );
}

/**
 * Détail du mode choisi : son classement, quatre chiffres, le temps passé et, sur son propre
 * profil, « Jouer ».
 */
function ModePanel({ tile, own, playBusy, onPlay }: { tile: Tile; own: boolean; playBusy: boolean; onPlay?: (mode: string) => void }) {
  const numbers = tile.stats && modeNumbers(tile.stats);
  const rank = tile.stats?.rank ?? null;
  const canPlay = tile.info?.quickPlay === true;
  return (
    <div role="tabpanel" id="profile-mode-panel" aria-labelledby={`profile-mode-${tile.id}`} className="flex flex-col gap-4 rounded-lg border border-border bg-sunken px-4 pt-3.5 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="font-display text-[22px] leading-none">{tile.name}</h3>
          {numbers?.badge}
          {numbers &&
            (rank !== null ? (
              <span className={cn("flex items-center gap-1 text-xs font-bold", rank <= 10 ? "text-[#e8bc5c]" : "text-muted-foreground")}>
                <Medal className="size-3.5" aria-hidden />
                {place(rank)}
                {numbers.season ? " de la saison" : " du classement"}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Hors classement</span>
            ))}
        </div>
        {tile.info && onPlay && (
          <button
            type="button"
            disabled={playBusy || !canPlay}
            onClick={() => onPlay(tile.id)}
            title={canPlay ? undefined : `${tile.name} n'a pas de connexion directe`}
            className={primaryButton}
          >
            <Play className="size-4 fill-current" aria-hidden />
            Jouer à {tile.name}
          </button>
        )}
      </div>
      {numbers ? (
        // Le chiffre clé de la tuile mène, les autres suivent plus petits ; valeurs alignées en haut, libellés sur une ou deux lignes.
        <dl className="grid grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))] items-end gap-x-4 gap-y-3">
          {/* Monocraft donne une case entière à chaque espace : « 23h41 » plutôt que « 23 h 41 ». */}
          {[...numbers.stats, { label: "Temps de jeu", value: tile.seconds === null ? "—" : formatDuration(tile.seconds).replace(/\s/g, "") }].map((stat, index) => (
            <div key={stat.label} className="flex min-w-0 flex-col-reverse justify-end gap-1.5">
              <dt className="line-clamp-2 min-h-[2lh] text-[11px] leading-tight text-muted-foreground">{stat.label}</dt>
              <dd className={cn("truncate font-pixel leading-none", index === 0 ? "text-[30px] text-[#e9e3d4]" : "text-[17px]")}>{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{own ? `Pas encore joué : lance ta première partie de ${tile.name} pour obtenir ton rang.` : `Pas encore joué à ${tile.name}.`}</p>
      )}
    </div>
  );
}

/**
 * Tuiles des modes et mode choisi : par défaut celui où le joueur est le mieux classé, sinon celui
 * où il a le plus joué. `seconds` : temps passé sur le serveur du mode.
 */
export function useModeTiles(data: PlayerStats | null, modes: Mode[]) {
  const [picked, setPicked] = useState<string | null>(null);
  const played = data?.modes ?? [];
  const secondsOn = (id: string, name: string) => data?.playtime?.servers.find((server) => fold(server.id) === fold(id) || fold(server.id) === fold(name))?.seconds ?? null;
  const tiles: Tile[] = data
    ? STAT_MODES.flatMap((id) => {
        const info = findMode(modes, id);
        const entry = played.find((mode) => mode.id === id) ?? null;
        if (!info && !entry) return [];
        const name = info?.name ?? id;
        return [{ id, name, art: modeArt(id, info?.icon ?? null), info, stats: entry, seconds: secondsOn(id, name) }];
      })
    : [];
  const fallback =
    [...tiles].filter((tile) => tile.stats?.rank != null).sort((a, b) => a.stats!.rank! - b.stats!.rank!)[0] ??
    [...tiles].filter((tile) => tile.stats).sort((a, b) => (b.seconds ?? 0) - (a.seconds ?? 0))[0] ??
    tiles[0];
  const selected = tiles.find((tile) => tile.id === picked) ?? fallback ?? null;
  return { tiles, selected, pick: setPicked };
}

/** Une tuile par mode, le détail du mode choisi dessous ; flèches, Début et Fin changent de mode. */
export function ModeTiles({
  tiles,
  selected,
  onPick,
  own,
  playBusy = false,
  onPlay,
}: {
  tiles: Tile[];
  selected: Tile | null;
  onPick: (id: string) => void;
  own: boolean;
  playBusy?: boolean;
  onPlay?: (mode: string) => void;
}) {
  const moveSelection = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tiles.findIndex((tile) => tile.id === selected?.id);
    const next =
      event.key === "ArrowRight" ? (index + 1) % tiles.length : event.key === "ArrowLeft" ? (index - 1 + tiles.length) % tiles.length : event.key === "Home" ? 0 : event.key === "End" ? tiles.length - 1 : null;
    if (next === null || index === -1) return;
    event.preventDefault();
    onPick(tiles[next].id);
    document.getElementById(`profile-mode-${tiles[next].id}`)?.focus();
  };
  return (
    <>
      <div role="tablist" aria-label="Modes de jeu" onKeyDown={moveSelection} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
        {tiles.map((tile) => (
          <ModeTile key={tile.id} tile={tile} selected={tile.id === selected?.id} onSelect={() => onPick(tile.id)} />
        ))}
      </div>
      {selected && <ModePanel tile={selected} own={own} playBusy={playBusy} onPlay={onPlay} />}
    </>
  );
}

/** Squelette des tuiles pendant la lecture. */
export function ModeTilesSkeleton() {
  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="aspect-[5/6] max-h-[190px]" />
        ))}
      </div>
      <Skeleton className="h-[118px]" />
    </>
  );
}

/**
 * Sous le personnage : niveau, barre d'inventaire et rang du réseau. Sur le profil d'un autre,
 * seules les cases connues s'affichent.
 */
export function LevelBlock({ data, loading, own }: { data: PlayerStats | null; loading: boolean; own: boolean }) {
  if (loading) {
    return (
      <div className="flex w-full max-w-[220px] flex-col items-center gap-2.5">
        <Skeleton className="h-[42px] w-full" />
        <Skeleton className="h-[62px] w-full" />
      </div>
    );
  }
  const items = data && (own ? data.coins !== null || data.votes !== null || data.streak !== null || data.achievements !== null : true) ? hotbar(data, own).filter((item) => own || item.count !== null) : [];
  if (!data?.level && items.length === 0) return null;
  return (
    <div className="flex w-full max-w-[220px] flex-col items-center gap-2.5">
      {data?.level && <XpBar level={data.level.level} into={data.level.into} needed={data.level.needed} />}
      {items.length > 0 && <Hotbar items={items} />}
      {data?.level && (
        <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-center text-[11px] text-white/70">
          <span className="font-semibold text-white tabular-nums">
            {number.format(data.level.into)} / {number.format(data.level.needed)} XP
          </span>
          {data.level.rank !== null && (
            <span className={cn("flex items-center gap-1 font-bold", data.level.rank <= 10 ? "text-[#e8bc5c]" : "text-white/70")}>
              <Trophy className="size-3" aria-hidden />
              {place(data.level.rank)} du réseau
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** Temps de jeu sur le réseau, une barre par serveur à la même échelle ; celle du mode choisi en clair. */
export function Playtime({ playtime, modes, selected }: { playtime: NonNullable<PlayerStats["playtime"]>; modes: Mode[]; selected: Tile | null }) {
  const top = playtime.servers[0]?.seconds ?? 1;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="flex items-baseline gap-2">
          <span className="font-display text-[28px] leading-none">{formatDuration(playtime.total)}</span>
          <span className="text-xs text-muted-foreground">sur Clover Games, hors inactivité</span>
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          {number.format(playtime.joins)} connexions · plus longue session {formatDuration(playtime.longest)}
        </span>
      </div>
      {/* Une seule échelle pour tous les serveurs : la barre la plus longue est le plus joué. */}
      <ul className="flex flex-col gap-2">
        {playtime.servers.map((server) => (
          <li key={server.id} className="grid grid-cols-[84px_minmax(0,1fr)_60px] items-center gap-3 text-xs">
            <span className="truncate font-semibold">{findMode(modes, server.id)?.name ?? server.id}</span>
            <span className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
              <span
                className={cn("block h-full rounded-full", fold(server.id) === fold(selected?.id ?? "") || fold(server.id) === fold(selected?.name ?? "") ? "bg-[#e9e3d4]" : "bg-primary/70")}
                style={{ width: `${Math.max(2, (server.seconds / top) * 100)}%` }}
              />
            </span>
            <span className="text-right text-muted-foreground tabular-nums">{formatDuration(server.seconds)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Derniers succès débloqués, avec leur date. */
export function RecentAchievements({ achievements }: { achievements: NonNullable<PlayerStats["achievements"]> }) {
  if (achievements.recent.length === 0) return <p className="text-sm text-muted-foreground">Aucun succès débloqué pour l'instant.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {achievements.recent.map((achievement) => (
        <li key={achievement.name} title={achievement.description} className="flex items-center gap-3 rounded-md bg-card px-3 py-2">
          <span aria-hidden className="mc-slot grid size-8 shrink-0 place-items-center text-base [--mc-radius:5px]">
            {achievement.icon}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{achievement.name}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{shortDate.format(new Date(achievement.unlockedAt))}</span>
        </li>
      ))}
    </ul>
  );
}
