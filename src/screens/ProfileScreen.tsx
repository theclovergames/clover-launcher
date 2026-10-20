import { ArrowRight, ArrowUpRight, Check, CircleAlert, Clock, Coins, Copy, Flame, Medal, MessageCircle, PenLine, Play, RotateCcw, Share2, Shirt, Star, Trophy, Users, Vote } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useState } from "react";

import launcherLogo from "@/assets/brand/launcher.png";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { CharacterColumn } from "@/components/CharacterColumn";
import { type CardData, cardFacts, ProfileCardDialog } from "@/components/ProfileCard";
import { CapeFront } from "@/components/SkinFront";
import { api } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { ownedCapeText, textureHash } from "@/lib/capes";
import { ago, findMode, presence } from "@/lib/friends";
import { locatorBarColor } from "@/lib/locator";
import { modeArt } from "@/lib/mode-art";
import { formatDuration } from "@/lib/play-history";
import { rankBadge } from "@/lib/ranks";
import { SITE_URL } from "@/lib/site";
import { cn, fold } from "@/lib/utils";
import type { CatalogueCape, Friend, ModeStats, PlaySession, PlayerStats, Profile, SkinLook } from "@/types";

/** Une cape que moins de joueurs recensés possèdent est marquée rare. */
const RARE_BELOW = 10_000;

const number = new Intl.NumberFormat("fr-FR");
const plain = new Intl.NumberFormat("fr-FR", { useGrouping: false });
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
/** Chiffres en Monocraft, qui n'a pas l'espace fine des milliers : groupés seulement à partir de 10 000, abrégés à partir de 100 000. */
const pixel = (value: number) => (value < 10_000 ? plain.format(value) : value < 100_000 ? number.format(value) : compact.format(value));
const ratio = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

type Mode = { id: string; name: string; icon: string | null; quickPlay: boolean };

type Props = {
  profile: Profile;
  look: SkinLook;
  animateSkin?: boolean;
  /** Parties de toutes les instances ; `null` pendant la lecture. */
  sessions: PlaySession[] | null;
  skinCount: number;
  /** Modes du manifeste : nom, illustration et Quick Play. */
  modes: Mode[];
  /** Jeu en préparation ou déjà lancé : « Jouer » ne lance rien. */
  playBusy: boolean;
  onPlay: (mode?: string) => void;
  onRename: () => void;
  onOpenSkins: () => void;
  /** Ouvre la conversation avec un ami (page Messages). */
  onWrite?: (friend: string) => void;
  onOpenLink: (url: string) => void;
  /** Sources de données, remplacées par des exemples sur la planche. */
  services?: Pick<typeof api, "playerStats" | "nameChangeInfo" | "discoverCapes" | "savePng">;
};

const place = (rank: number) => (rank === 1 ? "1er" : `${rank}e`);
const kd = (kills: number, deaths: number) => ratio.format(deaths ? kills / deaths : kills);

function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
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

function Skeleton({ className }: { className?: string }) {
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
    <ul className="grid w-full grid-cols-4 gap-1">
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

function hotbar(data: PlayerStats): HotbarItem[] {
  const { coins, votes, streak, achievements } = data;
  return [
    {
      label: "Pièces",
      icon: <Coins />,
      tone: "text-[#e8bc5c]",
      count: coins === null ? null : pixel(coins),
      lore: coins === null ? "Indisponible" : `${number.format(coins)}, pour la boutique en jeu`,
    },
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
        : data.linked
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

type Tile = { id: string; name: string; art: string | null; info: Mode | undefined; stats: ModeStats | null; seconds: number | null };

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

/** Détail du mode choisi : son classement, quatre chiffres, le temps passé et « Jouer ». */
function ModePanel({ tile, playBusy, onPlay }: { tile: Tile; playBusy: boolean; onPlay: (mode: string) => void }) {
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
        {tile.info && (
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
        <p className="text-sm text-muted-foreground">
          Pas encore joué : lance ta première partie de {tile.name} pour obtenir ton rang.
        </p>
      )}
    </div>
  );
}

/**
 * Ami : tête, pseudo, où il est ; « Rejoindre » s'il l'accepte et que son serveur a une adresse
 * directe, « Écrire » ouvre sa conversation.
 */
function FriendRow({ friend, mode, playBusy, onJoin, onWrite }: { friend: Friend; mode: Mode | undefined; playBusy: boolean; onJoin: (mode: string) => void; onWrite?: () => void }) {
  const where = presence(friend, mode?.name);
  const joinable = friend.canJoin && mode?.quickPlay === true;
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03]">
      <span className="relative shrink-0">
        <img src={`https://minotar.net/helm/${encodeURIComponent(friend.name)}/48.png`} alt="" width={36} height={36} className={cn("pixelated size-9 rounded-[4px]", !friend.online && "opacity-60 grayscale-[35%]")} />
        {friend.online && <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-background bg-primary" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-bold">{friend.name}</span>
          {friend.favorite && <Star className="size-3 shrink-0 fill-[#e8bc5c] text-[#e8bc5c]" aria-label="Favori" />}
        </span>
        <span className={cn("truncate text-[11px]", friend.online ? "text-primary" : "text-muted-foreground")}>
          {where}
          {friend.status && <span className="text-muted-foreground italic"> · {friend.status}</span>}
        </span>
      </span>
      {joinable && mode && (
        <button
          type="button"
          disabled={playBusy}
          onClick={() => onJoin(mode.id)}
          title={`Rejoindre ${friend.name} sur ${mode.name}`}
          className="flex shrink-0 items-center gap-1 rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary transition-colors enabled:hover:bg-primary/20 disabled:opacity-60"
        >
          <Play className="size-3 fill-current" aria-hidden />
          Rejoindre
        </button>
      )}
      {onWrite && (
        <button
          type="button"
          onClick={onWrite}
          aria-label={`Écrire à ${friend.name}`}
          title={`Écrire à ${friend.name}`}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <MessageCircle className="size-4" aria-hidden />
        </button>
      )}
    </li>
  );
}

/**
 * Profil du compte actif, organisé autour des modes : à gauche le personnage avec son niveau et sa
 * barre d'inventaire, teinté par le mode choisi ; à droite l'identité, une tuile par mode (rang,
 * chiffre clé) dont le détail s'ouvre dessous, puis les amis, le temps de jeu et la collection.
 */
export function ProfileScreen({ profile, look, animateSkin, sessions, skinCount, modes, playBusy, onPlay, onRename, onOpenSkins, onWrite, onOpenLink, services = api }: Props) {
  const [stats, setStats] = useState<{ uuid: string; data: PlayerStats } | { uuid: string; error: string } | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueCape[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [card, setCard] = useState<CardData | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const uuid = profile.uuid;

  const load = useCallback(() => {
    setStats(null);
    services
      .playerStats()
      .then((data) => setStats({ uuid, data }))
      .catch((reason) => setStats({ uuid, error: String(reason) }));
  }, [services, uuid]);

  useEffect(() => {
    load();
    setPicked(null);
    setCreatedAt(null);
    services
      .nameChangeInfo()
      .then((info) => setCreatedAt(info.createdAt ?? null))
      .catch(() => {});
  }, [load, services]);

  useEffect(() => {
    services.discoverCapes().then(setCatalogue).catch(() => {});
  }, [services]);

  const current = stats?.uuid === uuid ? stats : null;
  const data = current && "data" in current ? current.data : null;
  const error = current && "error" in current ? current.error : null;
  const loading = current === null;
  const color = locatorBarColor(uuid);
  const modeInfo = (id: string) => findMode(modes, id);
  const played = data?.modes ?? [];
  const newcomer = data !== null && !data.presence && !data.level && !data.playtime && played.length === 0;
  const capes = profile.capes ?? [];
  const owners = (url: string) => catalogue?.find((cape) => cape.hashes.includes(textureHash(url)))?.owners ?? null;
  const topServer = data?.playtime?.servers[0]?.seconds ?? 1;
  const secondsOn = (id: string, name: string) =>
    data?.playtime?.servers.find((server) => fold(server.id) === fold(id) || fold(server.id) === fold(name))?.seconds ?? null;

  const tiles: Tile[] = data
    ? STAT_MODES.flatMap((id) => {
        const info = modeInfo(id);
        const entry = played.find((mode) => mode.id === id) ?? null;
        if (!info && !entry) return [];
        const name = info?.name ?? id;
        return [{ id, name, art: modeArt(id, info?.icon ?? null), info, stats: entry, seconds: secondsOn(id, name) }];
      })
    : [];
  /** Par défaut, le mode où il est le mieux classé, sinon celui où il a le plus joué. */
  const fallback =
    [...tiles].filter((tile) => tile.stats?.rank != null).sort((a, b) => a.stats!.rank! - b.stats!.rank!)[0] ??
    [...tiles].filter((tile) => tile.stats).sort((a, b) => (b.seconds ?? 0) - (a.seconds ?? 0))[0] ??
    tiles[0];
  const selected = tiles.find((tile) => tile.id === picked) ?? fallback ?? null;

  const moveSelection = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tiles.findIndex((tile) => tile.id === selected?.id);
    const next =
      event.key === "ArrowRight" ? (index + 1) % tiles.length : event.key === "ArrowLeft" ? (index - 1 + tiles.length) % tiles.length : event.key === "Home" ? 0 : event.key === "End" ? tiles.length - 1 : null;
    if (next === null || index === -1) return;
    event.preventDefault();
    setPicked(tiles[next].id);
    document.getElementById(`profile-mode-${tiles[next].id}`)?.focus();
  };

  const friends = data?.friends ?? null;
  const onlineFriends = friends?.filter((friend) => friend.online).length ?? 0;
  const showHotbar = data !== null && (data.coins !== null || data.votes !== null || data.streak !== null || data.achievements !== null);

  /** Meilleur classement parmi les modes, pour la carte. */
  const bestRank = played
    .filter((mode) => mode.rank !== null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((mode) => ({ rank: mode.rank!, mode: modeInfo(mode.id)?.name ?? mode.id }))[0] ?? null;
  /** Mode le plus joué qui a une illustration (le Lobby n'en est pas un), pour la carte. */
  const favoriteMode =
    [...(data?.playtime?.servers ?? [])]
      .sort((a, b) => b.seconds - a.seconds)
      .map((server) => modeInfo(server.id))
      .find((mode) => mode && fold(mode.id) !== "lobby" && modeArt(mode.id, mode.icon)) ?? null;
  const share = () =>
    setCard({
      name: profile.name,
      texture: look.texture,
      model: look.model,
      cape: look.cape?.texture ?? null,
      rank: data?.rank ? { label: data.rank.label, badge: rankBadge(data.rank.id) } : null,
      grade: data?.grade ?? null,
      level: data?.level ?? null,
      since: data?.presence?.firstSeen ?? null,
      favorite: favoriteMode && {
        name: favoriteMode.name,
        art: [...new Set([modeArt(favoriteMode.id, favoriteMode.icon), modeArt(favoriteMode.id, null)])].filter((url): url is string => url !== null),
      },
      facts: cardFacts({
        playtime: data?.playtime?.total ?? null,
        bestRank,
        votes: data?.votes?.total ?? null,
        streak: data?.streak?.current ?? null,
        achievements: data?.achievements ?? null,
      }),
    });

  const copyUuid = () => {
    navigator.clipboard.writeText(uuid).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }, () => {});
  };

  return (
    <main className="flex min-h-0 flex-1">
      {/* Le personnage, teinté par l'illustration du mode choisi. */}
      <CharacterColumn
        label="Ton personnage"
        name={profile.name}
        look={look}
        animate={animateSkin}
        tints={tiles.flatMap((tile) => (tile.art ? [{ id: tile.id, src: tile.art }] : []))}
        tint={selected?.id ?? null}
        top={
          data?.presence?.online ? (
            <span className="flex items-center gap-2 rounded-lg bg-black/45 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm">
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
                <span className="relative size-2 rounded-full bg-primary" />
              </span>
              En ligne sur {modeInfo(data.presence.online)?.name ?? data.presence.online}
            </span>
          ) : data?.presence?.lastSeen ? (
            <span className="rounded-lg bg-black/45 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm">
              Vu {ago(data.presence.lastSeen)}
              {data.presence.lastServer && ` sur ${modeInfo(data.presence.lastServer)?.name ?? data.presence.lastServer}`}
            </span>
          ) : null
        }
      >
        {loading ? (
          <div className="flex w-full max-w-[220px] flex-col items-center gap-2.5">
            <Skeleton className="h-[42px] w-full" />
            <Skeleton className="h-[62px] w-full" />
          </div>
        ) : (
          (data?.level || showHotbar) && (
            <div className="flex w-full max-w-[220px] flex-col items-center gap-2.5">
              {data?.level && <XpBar level={data.level.level} into={data.level.into} needed={data.level.needed} />}
              {data && showHotbar && <Hotbar items={hotbar(data)} />}
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
          )
        )}
      </CharacterColumn>

      <div className="min-w-0 flex-1 overflow-y-auto px-8 pt-7 pb-10">
        {/* Identité */}
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-display text-[34px] leading-none">{profile.name}</h1>
            <button
              type="button"
              onClick={onRename}
              aria-label="Changer de pseudo"
              title="Changer de pseudo"
              className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <PenLine className="size-4" aria-hidden />
            </button>
            {/* Grade en jeu avec son badge du chat ; à défaut, le grade du compte du site. */}
            {data?.rank ? (
              rankBadge(data.rank.id) ? (
                <img src={rankBadge(data.rank.id)!} alt={`Grade ${data.rank.label}`} title={`Grade en jeu : ${data.rank.label}`} draggable={false} className="pixelated h-6 w-auto" />
              ) : (
                <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-bold">{data.rank.label}</span>
              )
            ) : (
              data?.grade && (
                <span
                  className="rounded-md border px-2 py-0.5 text-xs font-bold"
                  style={{ color: data.grade.color, borderColor: `${data.grade.color}55`, backgroundColor: `${data.grade.color}1f` }}
                >
                  {data.grade.label}
                </span>
              )
            )}
          </div>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
            {data?.presence?.firstSeen && (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Sur Clover Games depuis le</dt>
                <dd className="font-semibold">{longDate.format(new Date(data.presence.firstSeen))}</dd>
              </div>
            )}
            {createdAt && (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Compte Minecraft créé le</dt>
                <dd className="font-semibold">{longDate.format(new Date(createdAt))}</dd>
              </div>
            )}
            {color && (
              <div className="flex items-center gap-1.5" title="Couleur de ton point sur la barre de localisation, en jeu">
                <dt className="text-muted-foreground">Barre de localisation</dt>
                <dd className="flex items-center gap-1.5 font-semibold">
                  <span aria-hidden className="size-3 rounded-full border border-black/60" style={{ backgroundColor: color }} />
                  {color}
                </dd>
              </div>
            )}
            <div className="flex">
              <dt className="sr-only">UUID</dt>
              <dd>
                <button
                  type="button"
                  onClick={copyUuid}
                  title="Copier l'UUID"
                  className="-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
                >
                  {copied ? <Check className="size-3.5 text-primary" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                  {copied ? "UUID copié" : uuid}
                </button>
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={share} disabled={!look.texture} className={secondaryButton}>
              <Share2 className="size-4" aria-hidden />
              Partager ma carte
            </button>
            <button type="button" onClick={onOpenSkins} className={secondaryButton}>
              <Shirt className="size-4" aria-hidden />
              Modifier le skin
            </button>
            <button type="button" onClick={() => onOpenLink(`${SITE_URL}/player/${encodeURIComponent(profile.name)}`)} className={secondaryButton}>
              Voir sur le site
              <ArrowUpRight className="size-4" aria-hidden />
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="mt-6 flex items-center gap-2.5 rounded-lg border border-[#ffb3b0]/25 bg-[#ffb3b0]/[0.07] px-3 py-2 text-sm text-[#ffb3b0]">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">Statistiques Clover Games indisponibles. {error}</span>
            <button type="button" onClick={load} className="flex shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline">
              <RotateCcw className="size-3.5" aria-hidden />
              Réessayer
            </button>
          </div>
        )}

        {newcomer && (
          <div className="mt-6 flex items-center gap-4 rounded-lg border border-primary/25 bg-primary/[0.07] px-4 py-3.5">
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-bold">Tu n'as pas encore joué sur Clover Games.</span> Ton niveau et ton temps de jeu apparaîtront ici dès ta première partie.
            </span>
            {/* Avec des modes, le détail du mode choisi porte déjà « Jouer ». */}
            {tiles.length === 0 && (
              <button type="button" disabled={playBusy} onClick={() => onPlay()} className={cn(secondaryButton, "shrink-0")}>
                <Play className="size-4 fill-current" aria-hidden />
                Jouer
              </button>
            )}
          </div>
        )}

        {/* Modes de jeu : une tuile par mode, le détail du mode choisi dessous. */}
        {!error && (loading || tiles.length > 0) && (
          <Section title="Modes de jeu" className="mt-8">
            {loading ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} className="aspect-[5/6] max-h-[190px]" />
                  ))}
                </div>
                <Skeleton className="h-[118px]" />
              </>
            ) : (
              <>
                <div role="tablist" aria-label="Modes de jeu" onKeyDown={moveSelection} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
                  {tiles.map((tile) => (
                    <ModeTile key={tile.id} tile={tile} selected={tile.id === selected?.id} onSelect={() => setPicked(tile.id)} />
                  ))}
                </div>
                {selected && <ModePanel tile={selected} playBusy={playBusy} onPlay={onPlay} />}
              </>
            )}
          </Section>
        )}

        {/* Amis et temps de jeu sur le réseau */}
        {!error && !newcomer && (
          <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-x-8 gap-y-9">
            {(loading || (friends && friends.length > 0)) && (
              <Section
                title="Amis"
                aside={
                  friends && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="size-3.5" aria-hidden />
                      {onlineFriends > 0 ? `${onlineFriends} en ligne sur ${friends.length}` : `${friends.length} ami${friends.length > 1 ? "s" : ""}`}
                    </span>
                  )
                }
              >
                {loading ? (
                  <div className="flex flex-col gap-2">
                    {[0, 1, 2].map((index) => (
                      <Skeleton key={index} className="h-[52px]" />
                    ))}
                  </div>
                ) : (
                  <>
                    <ul className="-mx-2 flex flex-col">
                      {friends!.map((friend) => (
                        <FriendRow
                          key={friend.uuid}
                          friend={friend}
                          mode={friend.server ? modeInfo(friend.server) : undefined}
                          playBusy={playBusy}
                          onJoin={(mode) => onPlay(mode)}
                          onWrite={onWrite && (() => onWrite(friend.uuid))}
                        />
                      ))}
                    </ul>
                    <p className="text-[11px] text-muted-foreground">Ajoute des amis en jeu avec /amis. Leur serveur s'affiche s'ils l'autorisent.</p>
                  </>
                )}
              </Section>
            )}

            {(loading || data?.playtime) && (
              <Section title="Temps de jeu">
                {loading ? (
                  <Skeleton className="h-[176px]" />
                ) : (
                  data?.playtime && (
                    <div className="flex flex-col gap-3.5">
                      <div className="flex flex-col gap-1.5">
                        <span className="flex items-baseline gap-2">
                          <span className="font-display text-[28px] leading-none">{formatDuration(data.playtime.total)}</span>
                          <span className="text-xs text-muted-foreground">sur Clover Games, hors inactivité</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="size-3.5" aria-hidden />
                          {number.format(data.playtime.joins)} connexions · plus longue session {formatDuration(data.playtime.longest)}
                        </span>
                      </div>
                      {/* Une seule échelle pour tous les serveurs : la barre la plus longue est le plus joué. */}
                      <ul className="flex flex-col gap-2">
                        {data.playtime.servers.map((server) => (
                          <li key={server.id} className="grid grid-cols-[84px_minmax(0,1fr)_60px] items-center gap-3 text-xs">
                            <span className="truncate font-semibold">{modeInfo(server.id)?.name ?? server.id}</span>
                            <span className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                              <span
                                className={cn("block h-full rounded-full", fold(server.id) === fold(selected?.id ?? "") || fold(server.id) === fold(selected?.name ?? "") ? "bg-[#e9e3d4]" : "bg-primary/70")}
                                style={{ width: `${Math.max(2, (server.seconds / topServer) * 100)}%` }}
                              />
                            </span>
                            <span className="text-right text-muted-foreground tabular-nums">{formatDuration(server.seconds)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                )}
              </Section>
            )}
          </div>
        )}

        <Section title="Activité dans le launcher" className="mt-9">
          <div className="rounded-lg border border-border bg-card p-4">{sessions === null ? <Skeleton className="h-[160px]" /> : <ActivityHeatmap sessions={sessions} />}</div>
        </Section>

        {/* Collection */}
        <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-x-8 gap-y-9">
          <Section
            title="Capes"
            aside={
              <button type="button" onClick={onOpenSkins} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
                {skinCount} skin{skinCount > 1 ? "s" : ""} dans Mes skins
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            }
          >
            {capes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ce compte ne possède aucune cape.</p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                {capes.map((cape) => {
                  const count = owners(cape.url);
                  const { name } = ownedCapeText(cape.name);
                  return (
                    <li
                      key={cape.id}
                      title={count === null ? name : `${name} · ${number.format(count)} propriétaires recensés`}
                      className={cn("mc-slot relative flex flex-col items-center gap-1.5 px-1 pt-3 pb-2", cape.active && "outline-[#e9e3d4]")}
                    >
                      {count !== null && count < RARE_BELOW && (
                        <span className="absolute top-1 left-1 rounded bg-[#a68ae6]/20 px-1 text-[10px] font-bold tracking-wide text-[#c8b5f5] uppercase">Rare</span>
                      )}
                      {cape.active && <Check className="absolute top-1.5 right-1.5 size-3.5 text-[#e9e3d4]" strokeWidth={3} aria-label="Portée" />}
                      <CapeFront texture={cape.url} scale={3.5} />
                      <span className="w-full truncate text-center text-[11px] font-semibold">{name}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Succès">
            {loading ? (
              <Skeleton className="h-[120px]" />
            ) : data?.achievements ? (
              data.achievements.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun succès débloqué pour l'instant.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.achievements.recent.map((achievement) => (
                    <li key={achievement.name} title={achievement.description} className="flex items-center gap-3 rounded-md bg-card px-3 py-2">
                      <span aria-hidden className="mc-slot grid size-8 shrink-0 place-items-center text-base [--mc-radius:5px]">
                        {achievement.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{achievement.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{shortDate.format(new Date(achievement.unlockedAt))}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : data && !data.linked ? (
              <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
                Lie ton compte Minecraft à ton compte du site pour voir tes succès et ton grade.
                <button type="button" onClick={() => onOpenLink(`${SITE_URL}/profile`)} className={secondaryButton}>
                  Lier sur le site
                  <ArrowUpRight className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Succès indisponibles pour le moment.</p>
            )}
          </Section>
        </div>
      </div>

      <ProfileCardDialog data={card} link={`${SITE_URL}/player/${encodeURIComponent(profile.name)}`} onOpenChange={(open) => !open && setCard(null)} onSave={services.savePng} />
    </main>
  );
}
