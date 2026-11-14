import { AppWindow, Box, Check, Clover, Copy, Database, Expand, FolderOpen, FolderSearch, Globe, Heart, Image as ImageIcon, PackageOpen, Play, Plus, RefreshCw, Server, Sprout, SquareTerminal, Sun, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { EmptyState } from "@/components/EmptyState";
import { GameButton } from "@/components/GameButton";
import { InlineRename } from "@/components/InlineRename";
import { InstanceArt } from "@/components/InstanceArt";
import { ModIcon } from "@/components/ModIcon";
import { RunningBadge } from "@/components/RunningBadge";
import { Tabs } from "@/components/Tabs";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { opensWorldsDirectly } from "@/lib/game-versions";
import { instanceSummary, loaderSummary } from "@/lib/instances";
import { formatDuration, playStats, topServers } from "@/lib/play-history";
import { cn, formatSize } from "@/lib/utils";
import { versionImage } from "@/lib/version-art";
import { type Confirmation, ConfirmDialog } from "@/screens/Dialogs";
import type { ContentKind } from "@/lib/content-kinds";
import type { InstanceSection } from "@/lib/routes";
import type { ContentEntry, ContentFolder, InstanceEntry, ModpackUpdate, PlaySession, PlayState, WorldInfo } from "@/types";

type Services = Pick<typeof api, "playHistory" | "instanceContent" | "setContentEnabled" | "trashContent" | "showContent" | "renameWorld" | "modpackUpdate">;

type Props = {
  entry: InstanceEntry;
  play: PlayState;
  running: boolean;
  onPlay: () => void;
  /** Lance le jeu directement dans ce monde (dossier de `saves/`). */
  onPlayWorld?: (world: string) => void;
  /** Export en `.mrpack` ; absent pour l'instance Clover Games, qui suit le serveur. */
  onExport?: () => void;
  /** Installe une version plus récente de son modpack Modrinth ; absent pour Clover Games et Vanilla. */
  onUpdateModpack?: (version: string) => Promise<void>;
  onStop: (force: boolean) => void;
  /** Supprime l'instance, après confirmation ; absent pour Clover Games, qui suit le serveur. */
  onDelete?: () => void;
  /** Contenu de l'onglet Paramètres (réglages propres à l'instance). */
  settings?: ReactNode;
  /** Noms donnés aux serveurs rejoints, par adresse en minuscules. */
  serverNames?: Record<string, string>;
  /** Renomme un serveur hors Clover Games. */
  onRenameServer?: (address: string, name: string) => Promise<void>;
  /** `world` : dossier d'un monde précis. */
  onOpenFolder: (folder: "game" | ContentFolder, world?: string) => void;
  /** Console de l'instance : la partie en cours, ou les journaux des précédentes. */
  onOpenConsole: () => void;
  /** Contenu de l'onglet Mods ; absent pour Vanilla, qui se lance sans mods. */
  mods?: ReactNode;
  /** Change après une installation : l'onglet ouvert relit son dossier. */
  contentRevision?: number;
  /** Ouvre Découvrir pour cette instance ; `world` : monde visé par des datapacks. */
  onSearch?: (kind: ContentKind, world?: string) => void;
  /** Onglet ouvert, tenu par la navigation : « Retour » y ramène. */
  section: Section;
  onSection: (section: Section) => void;
  services?: Services;
};

type Section = InstanceSection;
export type { InstanceSection };

const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Aperçu" },
  { id: "mods", label: "Mods" },
  { id: "saves", label: "Mondes" },
  { id: "datapacks", label: "Datapacks" },
  { id: "resourcepacks", label: "Packs de ressources" },
  { id: "shaderpacks", label: "Shaders" },
  { id: "screenshots", label: "Captures" },
  { id: "settings", label: "Réglages" },
];

/** Nom d'un onglet, pour le fil d'Ariane. */
export const sectionLabel = (section: Section) => SECTIONS.find((item) => item.id === section)?.label ?? section;

const SERVER = "play.clovergames.fr";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const sessionFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const iconButton = cn(secondaryButton, "h-11 w-11 px-0");
const card = "rounded-lg border border-border bg-card";

/**
 * Version plus récente du modpack de l'instance, cherchée à l'ouverture de sa page : rien tant
 * qu'elle est à jour, ou si Modrinth ne répond pas.
 */
function ModpackUpdateButton({ id, disabled, check, onUpdate }: { id: string; disabled: boolean; check: (id: string) => Promise<ModpackUpdate | null>; onUpdate: (version: string) => Promise<void> }) {
  const [update, setUpdate] = useState<ModpackUpdate | null>(null);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    let live = true;
    check(id).then((found) => live && setUpdate(found), () => {});
    return () => {
      live = false;
    };
  }, [id, check]);
  if (!update) return null;
  return (
    <button
      type="button"
      disabled={disabled || updating}
      title={`Version installée : ${update.installed}. Les mods du modpack sont remplacés ; tes réglages et les mods que tu as ajoutés restent.`}
      onClick={() => {
        setUpdating(true);
        onUpdate(update.id).then(() => setUpdate(null), () => {}).finally(() => setUpdating(false));
      }}
      className={cn(secondaryButton, "h-11")}
    >
      <RefreshCw className={cn("size-4 text-primary", updating && "motion-safe:animate-spin")} aria-hidden />
      {updating ? "Mise à jour…" : `Mettre à jour en ${update.number}`}
    </button>
  );
}

/** Page d'une instance : son temps de jeu, son activité, ses serveurs et le contenu de son dossier. */
export function InstanceDetail({ entry, play, running, onPlay, onPlayWorld, onExport, onUpdateModpack, onStop, onDelete, settings, serverNames = {}, onRenameServer, onOpenFolder, onOpenConsole, mods, contentRevision = 0, onSearch, section: requested, onSection, services = api }: Props) {
  // Les shaders passent par Iris, un mod : Vanilla n'en charge pas.
  const sections = SECTIONS.filter((item) => (item.id !== "shaderpacks" || entry.kind !== "vanilla") && (item.id !== "mods" || mods) && (item.id !== "settings" || settings));
  // Un onglet absent (Mods d'une instance Vanilla) ramène à l'aperçu.
  const section = sections.some((item) => item.id === requested) ? requested : "overview";

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-8">
        <header className="relative shrink-0 overflow-hidden border-b border-border">
          <img src={versionImage(entry.minecraft ?? "")} alt="" className="absolute inset-0 size-full object-cover opacity-45" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#14120f] via-[#14120f]/85 to-[#14120f]/30" aria-hidden />
          <div className="relative flex items-end gap-5 px-10 pt-8 pb-6">
            <span className="relative shrink-0">
              <InstanceArt entry={entry} className="size-20 rounded-lg border-2 border-[var(--mc-outline)]" badge="absolute -right-2 -bottom-2 size-8 rounded-md border-2 border-[#14120f]" icon="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <h1 className="truncate font-display text-[30px] leading-none">{entry.name}</h1>
              <p className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-border bg-sunken/80 px-2 py-1 font-pixel text-[11px]">{instanceSummary(entry)}</span>
                {entry.kind === "clover" && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Serveur</span>}
                {running && <RunningBadge />}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onUpdateModpack && <ModpackUpdateButton id={entry.id} disabled={play.kind !== "ready"} check={services.modpackUpdate} onUpdate={onUpdateModpack} />}
              <button type="button" onClick={() => onOpenFolder("game")} className={cn(secondaryButton, "h-11")}>
                <FolderOpen className="size-4" aria-hidden />
                Ouvrir le dossier
              </button>
              <button type="button" title="Console" aria-label={`Console de ${entry.name}`} onClick={onOpenConsole} className={iconButton}>
                <SquareTerminal className="size-4" aria-hidden />
              </button>
              {onExport && (
                <button type="button" title="Exporter en modpack" aria-label={`Exporter ${entry.name} en modpack`} onClick={onExport} disabled={!entry.minecraft} className={iconButton}>
                  <PackageOpen className="size-4" aria-hidden />
                </button>
              )}
              {onDelete && (
                <button type="button" title="Supprimer l'instance" aria-label={`Supprimer ${entry.name}`} onClick={onDelete} disabled={play.kind !== "ready"} className={cn(iconButton, "hover:text-destructive")}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
              <GameButton state={play} name={entry.name} onPlay={onPlay} onStop={onStop} disabled={!entry.minecraft} className="h-11 w-36 text-sm" />
            </div>
          </div>
        </header>

        <nav className="px-10 pt-5">
          <Tabs label="Sections" value={section} onChange={onSection} items={sections} />
        </nav>

        <div className="px-10 pt-5">
          {section === "overview" ? (
            <Overview entry={entry} running={running} services={services} serverNames={serverNames} onRenameServer={onRenameServer} />
          ) : section === "mods" ? (
            mods
          ) : section === "settings" ? (
            settings
          ) : (
            <Content
              key={`${section}-${contentRevision}`}
              entry={entry}
              folder={section}
              services={services}
              running={running}
              // Comme « Jouer » : un lancement à la fois, et Minecraft 1.20 au moins.
              onPlayWorld={onPlayWorld && entry.minecraft && opensWorldsDirectly(entry.minecraft) && play.kind === "ready" && !play.busy ? onPlayWorld : undefined}
              onOpenFolder={(world) => onOpenFolder(section, world)}
              onSearch={onSearch && SEARCH[section] ? () => onSearch(SEARCH[section]!) : undefined}
              onAddDatapacks={onSearch && ((world) => onSearch("datapack", world))}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function Overview({
  entry,
  running,
  services,
  serverNames,
  onRenameServer,
}: {
  entry: InstanceEntry;
  running: boolean;
  services: Services;
  serverNames: Record<string, string>;
  onRenameServer?: (address: string, name: string) => Promise<void>;
}) {
  const [renameError, setRenameError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<PlaySession[] | null>(null);

  // Rechargé à la fermeture du jeu : la partie vient d'être enregistrée.
  useEffect(() => {
    if (running) return;
    let alive = true;
    services.playHistory(entry.id).then((list) => alive && setSessions(list)).catch(() => alive && setSessions([]));
    return () => {
      alive = false;
    };
  }, [entry.id, running, services]);

  const stats = playStats(sessions ?? []);
  const servers = topServers(sessions ?? []);
  const recent = [...(sessions ?? [])].reverse().slice(0, 5);
  const facts: [string, string][] = [
    ["Version", entry.minecraft ?? "…"],
    ["Type", loaderSummary(entry)],
    ["Dossier", entry.id === "clover" || !entry.separate ? "Commun" : "Séparé"],
    ["Mémoire", entry.memoryMb ? `${entry.memoryMb / 1024} Go` : "Comme le launcher"],
    ["Dernière partie", entry.lastPlayed ? dateFormat.format(new Date(entry.lastPlayed * 1000)) : "Jamais"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-3">
        {(
          [
            ["Temps de jeu", stats.count ? formatDuration(stats.total) : "—"],
            ["Parties", String(stats.count)],
            ["Moyenne", stats.count ? formatDuration(stats.average) : "—"],
            ["Plus longue", stats.count ? formatDuration(stats.longest) : "—"],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className={cn(card, "flex flex-col gap-1.5 px-4 py-3.5")}>
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
            <span className="font-display text-2xl leading-none">{sessions ? value : "…"}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4">
        <section className={cn(card, "flex flex-col gap-3 p-4")}>
          <h2 className="text-[13px] font-bold">Activité</h2>
          <ActivityHeatmap sessions={sessions ?? []} />
          {sessions?.length === 0 && <p className="text-xs text-muted-foreground">Aucune partie enregistrée pour l'instant : le temps de jeu se compte à partir de cette version du launcher.</p>}
        </section>
        <section className={cn(card, "flex flex-col p-4")}>
          <h2 className="text-[13px] font-bold">Fiche</h2>
          <dl className="mt-2 flex flex-col">
            {facts.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="truncate text-right text-[13px] font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-auto truncate pt-2 font-mono text-[11px] text-muted-foreground select-text" title={entry.gameDir}>
            {entry.gameDir}
          </p>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section className={cn(card, "flex flex-col gap-2 p-4")}>
          <h2 className="text-[13px] font-bold">Dernières parties</h2>
          {recent.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Aucune partie.</p>}
          <ul className="flex flex-col gap-1.5">
            {recent.map((session) => (
              <li key={session.started} className="flex items-center gap-3 rounded-md bg-sunken px-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{sessionFormat.format(new Date(session.started * 1000))}</span>
                <span className="font-semibold">{formatDuration(session.seconds)}</span>
                {session.code === 0 ? (
                  <span className="w-20 rounded-full bg-primary/15 px-2 py-0.5 text-center text-[10px] font-bold text-primary">Terminée</span>
                ) : (
                  <span title={session.code === null ? "Jeu arrêté" : `Code de sortie ${session.code}`} className="w-20 rounded-full bg-destructive/15 px-2 py-0.5 text-center text-[10px] font-bold text-destructive">
                    Plantage
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className={cn(card, "flex flex-col gap-2 p-4")}>
          <h2 className="text-[13px] font-bold">Serveurs</h2>
          {renameError && <p className="text-xs text-error">{renameError}</p>}
          {servers.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Aucun serveur rejoint.</p>}
          <ul className="flex flex-col gap-1.5">
            {servers.slice(0, 5).map((server) => {
              const clover = server.address === SERVER || server.address.endsWith(`.${SERVER}`);
              const ServerIcon = clover ? Clover : Server;
              return (
                <li key={server.address} className="flex items-center gap-3 rounded-md bg-sunken px-3 py-2">
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", clover ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
                    <ServerIcon className="size-4" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    {clover || !onRenameServer ? (
                      <span className="truncate text-[13px] font-semibold">{server.address}</span>
                    ) : (
                      <InlineRename
                        value={serverNames[server.address.toLowerCase()] ?? server.address}
                        label={`le serveur ${server.address}`}
                        placeholder={server.address}
                        onRename={(name) => onRenameServer(server.address, name)}
                        onError={setRenameError}
                        className="text-[13px] font-semibold"
                      />
                    )}
                    <span className="text-[11px] text-muted-foreground">{server.sessions > 1 ? `${server.sessions} parties` : "1 partie"}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDuration(server.seconds)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Contenu ajouté depuis chaque onglet, dans Découvrir : les datapacks vont dans un monde. */
const SEARCH: Partial<Record<ContentFolder, ContentKind>> = { saves: "world", datapacks: "datapack", resourcepacks: "resourcepack", shaderpacks: "shader" };
const SEARCH_LABEL: Record<string, string> = { world: "Ajouter des mondes", datapack: "Ajouter des datapacks", resourcepack: "Ajouter des packs", shader: "Ajouter des shaders" };

const MODES: Record<NonNullable<WorldInfo["mode"]>, string> = { survival: "Survie", creative: "Créatif", adventure: "Aventure", spectator: "Spectateur" };
const DIFFICULTIES: Record<NonNullable<WorldInfo["difficulty"]>, string> = { peaceful: "Paisible", easy: "Facile", normal: "Normale", hard: "Difficile" };
const relativeFormat = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

/** Nom donné en jeu, sinon celui du dossier. */
const worldName = (world: ContentEntry) => world.level?.name ?? world.name;

/** « Joué aujourd'hui », « Joué il y a 3 jours », puis la date. */
function playedAgo(seconds: number | null): string {
  if (!seconds) return "Jamais joué";
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(new Date(seconds * 1000))) / 86_400_000);
  return days < 7 ? `Joué ${relativeFormat.format(-days, "day")}` : `Joué le ${dateFormat.format(new Date(seconds * 1000))}`;
}

/** Monde : miniature, nom donné en jeu, mode et difficulté, version, puis dernière partie et taille. */
function WorldCard({
  world,
  minecraft,
  onPlay,
  onOpenFolder,
  onAddDatapacks,
  onRename,
  onError,
  locked,
  trashButton,
}: {
  world: ContentEntry;
  minecraft: string | null;
  /** Absent pendant un lancement ou une partie, et avant Minecraft 1.20. */
  onPlay?: () => void;
  onOpenFolder: () => void;
  onAddDatapacks?: () => void;
  onRename: (name: string) => Promise<void>;
  onError: (message: string) => void;
  /** Partie en cours : le jeu réécrirait le nom en sauvegardant. */
  locked: boolean;
  trashButton: ReactNode;
}) {
  const level = world.level;
  const name = worldName(world);
  const [copied, setCopied] = useState(false);
  // Un monde rouvert dans une autre version est converti par le jeu : mieux vaut le savoir avant.
  const otherVersion = level?.version && minecraft && level.version !== minecraft;
  const chip = "flex items-center gap-1 rounded-md border border-border bg-sunken px-1.5 py-0.5 text-[11px] text-muted-foreground";
  return (
    <li className={cn(card, "flex overflow-hidden transition-colors hover:border-[#4a4237]")}>
      {world.image ? (
        <img src={world.image} alt="" className="size-[104px] shrink-0 border-r border-border object-cover [image-rendering:pixelated]" />
      ) : (
        <span className="grid size-[104px] shrink-0 place-items-center border-r border-border bg-gradient-to-b from-[#2b3a2a] to-[#1b2418] text-primary/70">
          <Globe className="size-8" aria-hidden />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <InlineRename value={name} label={`le monde ${name}`} onRename={onRename} onError={onError} disabled={locked} className="text-sm font-semibold" />
          {level?.version && (
            <span
              title={otherVersion ? `Dernière partie en ${level.version} : l'ouvrir en ${minecraft} le convertit.` : `Dernière partie en ${level.version}`}
              className={cn("shrink-0 rounded-md px-1.5 py-0.5 font-pixel text-[10px]", otherVersion ? "bg-accent/15 text-accent" : "bg-sunken text-muted-foreground")}
            >
              {level.version}
            </span>
          )}
        </div>
        {level && (
          <p className="flex flex-wrap items-center gap-1.5">
            {level.mode && <span className={chip}>{MODES[level.mode]}</span>}
            {level.hardcore ? (
              <span className={cn(chip, "border-destructive/40 text-destructive")}>
                <Heart className="size-3 fill-current" aria-hidden />
                Hardcore
              </span>
            ) : (
              level.difficulty && <span className={chip}>{DIFFICULTIES[level.difficulty]}</span>
            )}
            {level.commands && (
              <span className={chip}>
                <SquareTerminal className="size-3" aria-hidden />
                Commandes
              </span>
            )}
            {level.datapacks > 0 && (
              <span className={chip}>
                <Database className="size-3" aria-hidden />
                {level.datapacks} datapack{level.datapacks > 1 ? "s" : ""}
              </span>
            )}
          </p>
        )}
        {level?.seed && (
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <Sprout className="size-3 shrink-0" aria-hidden />
            Seed
            <span className="min-w-0 truncate font-pixel text-[11px] text-foreground/85 select-text">{level.seed}</span>
            <button
              type="button"
              onClick={() => {
                const seed = level.seed ?? "";
                navigator.clipboard.writeText(seed).then(() => setCopied(true), () => onError("La seed n'a pas pu être copiée."));
              }}
              aria-label={`Copier la seed de ${name}`}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {copied ? <Check className="size-3 text-primary" aria-hidden /> : <Copy className="size-3" aria-hidden />}
              {copied ? "Copiée" : "Copier"}
            </button>
          </p>
        )}
        <div className="mt-auto flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {playedAgo(world.modified)} · {formatSize(world.size)}
          </span>
          {onPlay && (
            <button
              type="button"
              onClick={onPlay}
              aria-label={`Jouer dans ${name}`}
              title="Jouer dans ce monde"
              className="grid size-8 shrink-0 place-items-center rounded-md text-primary transition-colors hover:bg-primary/15"
            >
              <Play className="size-4 fill-current" aria-hidden />
            </button>
          )}
          {onAddDatapacks && (
            <button
              type="button"
              onClick={onAddDatapacks}
              aria-label={`Ajouter des datapacks à ${name}`}
              title="Ajouter des datapacks"
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Database className="size-4" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenFolder}
            aria-label={`Ouvrir le dossier de ${name}`}
            title="Ouvrir le dossier"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <FolderOpen className="size-4" aria-hidden />
          </button>
          {trashButton}
        </div>
      </div>
    </li>
  );
}

const EMPTY: Record<ContentFolder, { title: string; hint: string }> = {
  saves: { title: "Aucun monde", hint: "Crée-en un en jeu, ou ajoute une carte prête à jouer." },
  datapacks: { title: "Aucun datapack", hint: "Ajoute-en un à l'un de tes mondes." },
  resourcepacks: { title: "Aucun pack de ressources", hint: "Ajoute-en un, puis active-le en jeu dans Options › Packs de ressources." },
  shaderpacks: { title: "Aucun shader", hint: "Ajoute-en un, puis choisis-le en jeu dans Options › Vidéo › Shaders." },
  screenshots: { title: "Aucune capture", hint: "Appuie sur F2 en jeu pour en prendre une." },
};

function Content({
  entry,
  folder,
  services,
  running,
  onPlayWorld,
  onOpenFolder,
  onSearch,
  onAddDatapacks,
}: {
  entry: InstanceEntry;
  folder: ContentFolder;
  services: Services;
  running: boolean;
  onPlayWorld?: (world: string) => void;
  onOpenFolder: (world?: string) => void;
  onSearch?: () => void;
  onAddDatapacks?: (world: string) => void;
}) {
  const [list, setList] = useState<ContentEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ContentEntry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Suppression qui attend confirmation. */
  const [asking, setAsking] = useState<Confirmation | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    services.instanceContent(entry.id, folder).then((items) => alive && setList(items)).catch((reason) => alive && setError(String(reason)));
    return () => {
      alive = false;
    };
  }, [entry.id, folder, services, revision]);

  const key = (item: ContentEntry) => `${item.world ?? ""}/${item.enabled ? "" : "-"}${item.name}`;
  /** Une erreur (pack ouvert par le jeu…) s'affiche, puis la liste est relue depuis le disque. */
  const change = async (action: Promise<void>, optimistic?: (items: ContentEntry[]) => ContentEntry[]) => {
    setError(null);
    if (optimistic) setList((items) => items && optimistic(items));
    await action.catch((reason) => setError(String(reason)));
    setRevision((value) => value + 1);
  };
  const toggle = (item: ContentEntry, enabled: boolean) =>
    change(services.setContentEnabled(entry.id, folder, item, enabled), (items) => items.map((other) => (key(other) === key(item) ? { ...other, enabled } : other)));
  const trash = (item: ContentEntry) => change(services.trashContent(entry.id, folder, item), (items) => items.filter((other) => key(other) !== key(item)));
  const total = (list ?? []).reduce((sum, item) => sum + item.size, 0);
  const shared = entry.id === "clover" || !entry.separate;
  /** Tout ce qui part à la corbeille se confirme : monde, pack ou capture. */
  const askTrash = (item: ContentEntry, label: string) =>
    setAsking({
      title: `Supprimer ${label} ?`,
      description: `Il ira dans la corbeille de l'ordinateur : tu peux l'en sortir tant qu'elle n'est pas vidée.${shared ? " Il disparaît aussi des instances qui partagent ce dossier." : ""}`,
      detail: item.world ? `${item.world} › ${item.name}` : item.name,
      confirm: "Supprimer",
      onConfirm: () => void trash(item),
    });
  const show = (item: ContentEntry, reveal: boolean) => services.showContent(entry.id, folder, item, reveal).catch((reason) => setError(String(reason)));
  /** L'image passe par le protocole `asset`, lisible par la WebView : elle va telle quelle dans le presse-papiers. */
  const copyImage = async (item: ContentEntry) => {
    setError(null);
    try {
      const image = await (await fetch(item.image!)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [image.type || "image/png"]: image })]);
      setNotice("Capture copiée : colle-la où tu veux.");
      window.setTimeout(() => setNotice(null), 2500);
    } catch {
      setError("La capture n'a pas pu être copiée.");
    }
  };
  const trashButton = (item: ContentEntry, label: string) => (
    <button
      type="button"
      onClick={() => askTrash(item, label)}
      aria-label={`Supprimer ${label}`}
      title="Supprimer"
      className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
          {list ? `${list.length} ${folder === "saves" ? "monde" : "élément"}${list.length > 1 ? "s" : ""} · ${formatSize(total)}` : error ? "" : "Chargement…"}
          {shared && " · dossier commun aux instances qui le partagent"}
        </p>
        <button type="button" onClick={() => onOpenFolder()} className={secondaryButton}>
          <FolderOpen className="size-4" aria-hidden />
          Ouvrir le dossier
        </button>
        {onSearch && SEARCH[folder] && (
          <button type="button" onClick={onSearch} className={primaryButton}>
            <Plus className="size-4" aria-hidden />
            {SEARCH_LABEL[SEARCH[folder]]}
          </button>
        )}
      </div>

      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
      {notice && (
        <p role="status" className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-[13px] text-primary">
          {notice}
        </p>
      )}
      {list?.length === 0 && <EmptyState title={EMPTY[folder].title} hint={EMPTY[folder].hint} />}

      {list && folder === "saves" && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
          {list.map((world) => (
            <WorldCard
              key={world.name}
              world={world}
              minecraft={entry.minecraft}
              onPlay={onPlayWorld && (() => onPlayWorld(world.name))}
              onOpenFolder={() => onOpenFolder(world.name)}
              onAddDatapacks={onAddDatapacks && (() => onAddDatapacks(world.name))}
              onRename={(name) => services.renameWorld(entry.id, world.name, name).then(() => setRevision((value) => value + 1))}
              onError={setError}
              locked={running}
              trashButton={trashButton(world, `le monde ${worldName(world)}`)}
            />
          ))}
        </ul>
      )}

      {list && (folder === "resourcepacks" || folder === "shaderpacks" || folder === "datapacks") && (
        <ul className="flex flex-col gap-2">
          {list.map((pack) => {
            const PackIcon = folder === "shaderpacks" ? Sun : folder === "datapacks" ? Database : Box;
            // Comme « Mes mods » : nom du projet Modrinth, le fichier en dessous. Sans projet, le nom
            // du fichier, sans extension ni codes couleur de Minecraft (« §6 »).
            const title = pack.title ?? pack.name.replace(/\.zip$/i, "").replace(/§./g, "");
            return (
              <li key={key(pack)} className={cn(card, "flex items-center gap-3 px-3 py-2", !pack.enabled && "bg-[#17150f]")}>
                <Switch
                  id={`pack-${key(pack)}`}
                  checked={pack.enabled}
                  onCheckedChange={(enabled) => void toggle(pack, enabled)}
                  aria-label={`${pack.enabled ? "Désactiver" : "Activer"} ${title}`}
                />
                <ModIcon src={pack.icon} fallback={<PackIcon className="size-5 text-muted-foreground" />} className={cn("size-10", !pack.enabled && "opacity-50")} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("truncate text-[13px] font-semibold", !pack.enabled && "text-muted-foreground")}>{title}</span>
                  <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                    {pack.world && (
                      <span className="flex shrink-0 items-center gap-1 rounded-[4px] bg-secondary px-1.5 py-px text-foreground">
                        <Globe className="size-3" aria-hidden />
                        {pack.world}
                      </span>
                    )}
                    {pack.title && <span className="truncate font-mono">{pack.name}</span>}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{pack.modified ? dateFormat.format(new Date(pack.modified * 1000)) : ""}</span>
                <span className="w-20 text-right text-xs text-muted-foreground">{formatSize(pack.size)}</span>
                {trashButton(pack, title)}
              </li>
            );
          })}
        </ul>
      )}

      {list && folder === "screenshots" && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {list.map((shot) => (
            // Clic droit : agrandir, copier, ouvrir avec le système, montrer dans le dossier, supprimer.
            <ContextMenu key={shot.name}>
              <ContextMenuTrigger asChild>
                <li className="group/shot relative">
                  <span className="absolute top-1.5 right-1.5 z-10 rounded-md bg-card/90 opacity-0 transition-opacity group-focus-within/shot:opacity-100 group-hover/shot:opacity-100">
                    {trashButton(shot, `la capture ${shot.name}`)}
                  </span>
                  <button type="button" onClick={() => setViewing(shot)} className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-accent">
                    {shot.image ? (
                      <img src={shot.image} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                    ) : (
                      <ImageIcon className="aspect-video w-full p-8 text-muted-foreground" aria-hidden />
                    )}
                    <span className="truncate px-3 py-2 text-[11px] text-muted-foreground group-hover:text-foreground">{shot.modified ? sessionFormat.format(new Date(shot.modified * 1000)) : shot.name}</span>
                  </button>
                </li>
              </ContextMenuTrigger>
              <ContextMenuContent aria-label={`Actions pour ${shot.name}`}>
                <ContextMenuItem onSelect={() => setViewing(shot)}>
                  <Expand aria-hidden />
                  Agrandir
                </ContextMenuItem>
                <ContextMenuItem disabled={!shot.image} onSelect={() => void copyImage(shot)}>
                  <Copy aria-hidden />
                  Copier l'image
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void show(shot, false)}>
                  <AppWindow aria-hidden />
                  Ouvrir avec l'application d'images
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void show(shot, true)}>
                  <FolderSearch aria-hidden />
                  Afficher dans le dossier
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem destructive onSelect={() => askTrash(shot, `la capture ${shot.name}`)}>
                  <Trash2 aria-hidden />
                  Supprimer
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </ul>
      )}

      <ConfirmDialog ask={asking} onClose={() => setAsking(null)} />

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="mc-frame gap-3 border-[var(--mc-outline)] bg-card p-3 ring-0 sm:max-w-[min(1100px,90vw)]">
          <DialogTitle className="truncate pr-8 text-[13px] font-semibold">{viewing?.name}</DialogTitle>
          {viewing?.image && <img src={viewing.image} alt={viewing.name} className="max-h-[75vh] w-full rounded-md object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
