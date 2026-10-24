import { Check, ChevronDown, FolderInput, FolderOpen, Globe, PackageOpen, PackageSearch, Pin, Plus, Puzzle, Settings2, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { GameButton } from "@/components/GameButton";
import { InstanceArt } from "@/components/InstanceArt";
import { type InstanceActions, InstanceMenu } from "@/components/InstanceMenu";
import { RunningBadge } from "@/components/RunningBadge";
import { SearchField } from "@/components/SearchField";
import { Tabs } from "@/components/Tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { groupVersions, versionFamily, type VersionFamily } from "@/lib/game-versions";
import { instanceSummary } from "@/lib/instances";
import { cn } from "@/lib/utils";
import { versionImage } from "@/lib/version-art";
import { type Confirmation, ConfirmDialog } from "@/screens/Dialogs";
import { InstanceDetail, type InstanceSection } from "@/screens/InstanceDetail";
import type { ContentKind } from "@/lib/content-kinds";
import type { AvailableVersion, ContentFolder, ExportParts, InstanceEntry, PlayState } from "@/types";

type Props = {
  instances: InstanceEntry[];
  selected: string;
  /** Vue Expert : liste de toutes les instances ; Simple : une carte par version. */
  expert: boolean;
  /** État du bouton Jouer de chaque instance. */
  playFor: (id: string) => PlayState;
  /** Instances dont le jeu est ouvert (plusieurs à la fois). */
  running: string[];
  onSelect: (id: string) => void;
  onView: (expert: boolean) => void;
  onPlay: (id: string) => void;
  /** Lance l'instance directement dans un de ses mondes. */
  onPlayWorld: (id: string, world: string) => void;
  /** Exporte une instance personnelle en `.mrpack`. */
  onExport: (id: string, parts: ExportParts) => void;
  /** « Fermer », puis « Forcer » si le jeu ne répond pas. */
  onStop: (id: string, force: boolean) => void;
  /** Avec une version : le panneau s'ouvre dessus, ses instances en tête. */
  onCreate: (minecraft?: string) => void;
  /** Version du panneau de création ouvert : sa carte est surlignée plutôt que celle de l'instance choisie. */
  viewing?: string | null;
  /** Onglet Paramètres de la page d'une instance (réglages propres à l'instance). */
  renderSettings?: (entry: InstanceEntry) => ReactNode;
  onOpenFolder: (id: string, folder: "game" | ContentFolder, world?: string) => void;
  /** Console de l'instance, ouverte depuis sa page. */
  onOpenConsole: (id: string) => void;
  /** Dossier de l'instance à la corbeille, puis l'instance retirée de la liste. */
  onDelete: (id: string) => void;
  /** Onglet Mods de la page d'une instance (toutes sauf Vanilla). */
  renderMods?: (entry: InstanceEntry) => ReactNode;
  /** Page d'instance ouverte et son onglet, tenus par la navigation : « Retour » y ramène. */
  opened: { id: string; section?: InstanceSection } | null;
  /** Ouvre la page d'une instance, sur un onglet ; ne change pas l'instance que « Jouer » lance. */
  onOpen: (id: string, section?: InstanceSection) => void;
  /** Autre onglet de la page ouverte. */
  onSection: (section: InstanceSection) => void;
  /** Change après une installation : la page de l'instance relit son dossier. */
  contentRevision?: number;
  /** Instances des autres launchers, importées comme nouvelles instances. */
  onImport: () => void;
  /** Clic droit : épingler, dupliquer, raccourci sur le bureau (absent si impossible). */
  onPin: (id: string, pinned: boolean) => void;
  onDuplicate: (id: string) => void;
  onShortcut?: (id: string) => void;
  /** Ouvre Découvrir sur `kind`, pour `instance` ; `world` : monde visé par des datapacks. */
  onSearch: (kind: ContentKind, instance?: string, world?: string) => void;
  services?: Pick<typeof api, "instanceVersions" | "playHistory" | "instanceContent" | "setContentEnabled" | "trashContent" | "showContent" | "renameWorld" | "modpackUpdate">;
  /** Installe une version plus récente du modpack de l'instance. */
  onUpdateModpack: (id: string, version: string) => Promise<void>;
  /** Noms donnés aux serveurs rejoints, et leur renommage (page d'une instance). */
  serverNames?: Record<string, string>;
  onRenameServer?: (address: string, name: string) => Promise<void>;
};

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const iconButton = cn(secondaryButton, "w-9 px-0");
const lastPlayed = (entry: InstanceEntry) => (entry.lastPlayed ? `Jouée le ${date.format(new Date(entry.lastPlayed * 1000))}` : "Jamais lancée");

/** « Jouer » sur l'accueil lance l'instance choisie ici. */
export function InstancesScreen(props: Props) {
  const { instances, selected, expert, playFor, onView, onCreate, onDelete, opened } = props;
  const [asking, setAsking] = useState<Confirmation | null>(null);
  const [exporting, setExporting] = useState<InstanceEntry | null>(null);
  const current = instances.find((entry) => entry.id === selected) ?? instances[0];
  const onEdit = (entry: InstanceEntry) => props.onOpen(entry.id, "settings");
  /** Son dossier part à la corbeille ; un dossier de jeu commun reste, il sert aussi à Clover Games. */
  const askDelete = (entry: InstanceEntry) =>
    setAsking({
      title: `Supprimer « ${entry.name} » ?`,
      description: entry.separate
        ? "Ses mondes, mods et réglages iront dans la corbeille de l'ordinateur : tu peux les en sortir tant qu'elle n'est pas vidée."
        : "Ses mods iront dans la corbeille de l'ordinateur. Ses mondes et réglages restent : ils sont dans le dossier commun, avec ceux de Clover Games.",
      detail: entry.gameDir,
      confirm: "Supprimer",
      onConfirm: () => onDelete(entry.id),
    });
  const menu: InstanceActions = {
    onPlay: props.onPlay,
    onStop: props.onStop,
    onSettings: onEdit,
    onOpenFolder: (id) => props.onOpenFolder(id, "game"),
    onPin: props.onPin,
    onDuplicate: props.onDuplicate,
    onExport: setExporting,
    onShortcut: props.onShortcut,
    onAskDelete: askDelete,
  };
  const actions = {
    ...props,
    current,
    menu,
    onAskDelete: askDelete,
    onOpenSection: (entry: InstanceEntry, section: InstanceSection) => props.onOpen(entry.id, section),
    onEdit,
  };
  const page = instances.find((entry) => entry.id === opened?.id);

  const exportDialog = <ExportDialog entry={exporting} onExport={(parts) => exporting && props.onExport(exporting.id, parts)} onClose={() => setExporting(null)} />;

  if (page) {
    return (
      <>
        <InstanceDetail
          key={page.id}
          section={opened?.section ?? "overview"}
          onSection={props.onSection}
          settings={props.renderSettings?.(page)}
          serverNames={props.serverNames}
          onRenameServer={props.onRenameServer}
          entry={page}
          play={playFor(page.id)}
          running={props.running.includes(page.id)}
          services={props.services}
          onPlay={() => props.onPlay(page.id)}
          onPlayWorld={(world) => props.onPlayWorld(page.id, world)}
          onExport={page.kind === "clover" ? undefined : () => setExporting(page)}
          onUpdateModpack={page.kind === "clover" || page.kind === "vanilla" ? undefined : (version) => props.onUpdateModpack(page.id, version)}
          onStop={(force) => props.onStop(page.id, force)}
          onOpenFolder={(folder, world) => props.onOpenFolder(page.id, folder, world)}
          onOpenConsole={() => props.onOpenConsole(page.id)}
          onDelete={page.kind === "clover" ? undefined : () => askDelete(page)}
          mods={page.kind === "vanilla" ? undefined : props.renderMods?.(page)}
          contentRevision={props.contentRevision}
          onSearch={(kind, world) => props.onSearch(kind, page.id, world)}
        />
        <ConfirmDialog ask={asking} onClose={() => setAsking(null)} />
        {exportDialog}
      </>
    );
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-10 pt-8 pb-6">
        <header className="flex items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[30px] leading-none">Instances</h1>
            <p className="text-sm text-muted-foreground">Une version de Minecraft avec ses mods, ses mondes et ses réglages.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={props.onImport} className={secondaryButton} title="Instances du launcher officiel, de Modrinth App, Prism, MultiMC ou CurseForge">
              <FolderInput className="size-4" aria-hidden />
              Importer
            </button>
            <button type="button" onClick={() => props.onSearch("modpack")} className={secondaryButton}>
              <PackageSearch className="size-4" aria-hidden />
              Trouver un modpack
            </button>
            <button type="button" onClick={() => onCreate()} className={primaryButton}>
              <Plus className="size-4" aria-hidden />
              Nouvelle instance
            </button>
          </div>
        </header>

        <Tabs
          label="Vue"
          className="mt-5"
          value={expert ? "list" : "versions"}
          onChange={(view) => onView(view === "list")}
          items={[
            { id: "versions", label: "Par version" },
            { id: "list", label: "Toutes les instances" },
          ]}
        />

        {expert ? <Expert {...actions} /> : <Simple {...actions} />}
      </div>

      {!expert && current && <LaunchBar {...actions} current={current} />}

      <ConfirmDialog ask={asking} onClose={() => setAsking(null)} />

      {exportDialog}
    </main>
  );
}

const EXPORT_PARTS: { key: keyof ExportParts; label: string; hint: string; mods?: true }[] = [
  { key: "config", label: "Réglages des mods", hint: "Le dossier config/.", mods: true },
  { key: "resourcePacks", label: "Packs de ressources", hint: "Ceux qui sont activés." },
  { key: "shaderPacks", label: "Shaders", hint: "Ceux qui sont activés.", mods: true },
  { key: "options", label: "Réglages du jeu", hint: "Touches, graphismes et son : ils remplacent ceux de qui importe le modpack." },
];

/** Choix de ce que l'export `.mrpack` ajoute aux mods ; l'emplacement du fichier se choisit ensuite. */
function ExportDialog({ entry, onExport, onClose }: { entry: InstanceEntry | null; onExport: (parts: ExportParts) => void; onClose: () => void }) {
  const [parts, setParts] = useState<ExportParts>({ config: true, resourcePacks: true, shaderPacks: true, options: false });
  // Garde le nom affiché pendant l'animation de fermeture.
  const last = useRef(entry);
  if (entry) last.current = entry;
  const vanilla = last.current?.kind === "vanilla";
  const shown = EXPORT_PARTS.filter((part) => !part.mods || !vanilla);
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="mc-frame gap-5 border-[var(--mc-outline)] bg-card p-6 ring-0 sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Exporter « {last.current?.name} »</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Un modpack .mrpack, que le Clover Launcher, Modrinth App et Prism Launcher savent importer. {vanilla ? "" : "Les mods publiés sur Modrinth seront téléchargés à l'import, les autres sont inclus dans le fichier."}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {shown.map((part) => (
            <li key={part.key} className="flex items-center gap-3">
              <Switch id={`export-${part.key}`} checked={parts[part.key]} onCheckedChange={(checked) => setParts((current) => ({ ...current, [part.key]: checked }))} />
              <label htmlFor={`export-${part.key}`} className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold">{part.label}</span>
                <span className="text-[11px] text-muted-foreground">{part.hint}</span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-[6px] border-border bg-[#17150f] px-6 py-4">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              // Vanilla n'a ni mods ni shaders : seules ses parties partent.
              onExport({ ...parts, config: parts.config && !vanilla, shaderPacks: parts.shaderPacks && !vanilla });
              onClose();
            }}
            className={primaryButton}
          >
            <PackageOpen className="size-4" aria-hidden />
            Exporter
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Actions = Props & {
  current: InstanceEntry | undefined;
  menu: InstanceActions;
  onAskDelete: (entry: InstanceEntry) => void;
  onOpenSection: (entry: InstanceEntry, section: InstanceSection) => void;
  onEdit: (entry: InstanceEntry) => void;
};

/** Choix « Snapshots » de la vue par version, gardé d'une ouverture à l'autre. */
const SNAPSHOTS_KEY = "clover.instances-snapshots";

function storedSnapshots() {
  try {
    return localStorage.getItem(SNAPSHOTS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Depuis la 1.16 (et les versions 26) : la grille principale ; les plus anciennes ont la leur, repliée. */
const recent = (family: string) => /^\d/.test(family) && family.localeCompare("1.16", "en", { numeric: true }) >= 0;

/**
 * Une carte illustrée par famille de versions. Un clic choisit la dernière instance jouée de la
 * famille, que la barre du bas lance ; une version sans instance ouvre sa création. Le « + » d'une
 * carte qui a déjà ses instances en crée une autre de la même version.
 */
function FamilyCard({ family, instances, active, running, playFor, menu, onSelect, onCreate }: Pick<Actions, "instances" | "running" | "playFor" | "menu" | "onSelect" | "onCreate"> & { family: VersionFamily; active: boolean }) {
  const members = instances.filter((entry) => entry.minecraft && versionFamily(entry.minecraft) === family.id);
  const clover = members.some((entry) => entry.kind === "clover");
  // La plus récemment jouée de la famille, pour qu'un clic reprenne là où on s'était arrêté.
  const pick = [...members].sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0];
  // Versions de la famille, celles qui ont une instance d'abord ; deux affichées, le reste en « +N ».
  const used = new Set(members.map((entry) => entry.minecraft));
  const shownVersions = [...family.versions].sort((a, b) => Number(used.has(b)) - Number(used.has(a))).slice(0, 2);
  const card = (
    <li className="relative">
      <button
        type="button"
        aria-pressed={active}
        onClick={() => (pick ? onSelect(pick.id) : onCreate(family.versions[0]))}
        className={cn(
          "group relative flex h-full w-full flex-col overflow-hidden rounded-lg border-2 bg-card text-left transition-colors duration-300 hover:bg-card-hover",
          active ? "border-primary" : "border-border hover:border-[#e9e3d4]/30",
        )}
      >
        <span className="relative block aspect-[16/10] overflow-hidden">
          <img src={versionImage(family.id)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.04]" />
          {family.versions.length > 1 && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1" title={family.versions.join(", ")}>
              {shownVersions.map((version) => (
                <span key={version} className={cn("rounded px-1.5 py-0.5 font-pixel text-[10px] leading-none", used.has(version) ? "bg-primary text-primary-foreground" : "bg-[#14120f]/85 text-white/90")}>
                  {version}
                </span>
              ))}
              {family.versions.length > 2 && <span className="rounded bg-[#14120f]/85 px-1.5 py-0.5 font-pixel text-[10px] leading-none text-white/70">+{family.versions.length - 2}</span>}
            </span>
          )}
        </span>
        {members.some((entry) => running.includes(entry.id)) && <RunningBadge className="absolute top-2 left-2 bg-[#14120f]/85 px-2 py-0.5 text-[10px]" />}
        {active && (
          <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-md bg-primary text-primary-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 motion-safe:duration-300">
            <Check className="size-4" strokeWidth={3} aria-hidden />
          </span>
        )}
        <span className={cn("flex h-8 items-end justify-between gap-2 px-3.5", pick && "pr-12")}>
          <span className="font-pixel text-lg leading-none">{family.id}</span>
          {clover ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Serveur</span>
          ) : (
            family.snapshot && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">Snapshot</span>
          )}
        </span>
        <span className={cn("truncate px-3.5 pt-1 pb-3.5 text-xs text-muted-foreground", pick && "pr-12")}>
          {members.length > 0 ? (
            members.length === 1 ? members[0].name : `${members.length} instances`
          ) : (
            <span className="flex items-center gap-1.5 font-semibold text-accent opacity-80 group-hover:opacity-100">
              <Plus className="size-3.5" aria-hidden />
              Créer une instance
            </span>
          )}
        </span>
      </button>
      {/* À côté de la carte, pas dedans : un bouton ne peut pas en contenir un autre. */}
      {pick && (
        <button
          type="button"
          onClick={() => onCreate(family.versions[0])}
          title={`Nouvelle instance en ${family.id}`}
          aria-label={`Nouvelle instance en ${family.id}`}
          className="absolute right-2.5 bottom-2.5 grid size-8 place-items-center rounded-md border border-border bg-sunken text-accent transition-colors hover:border-accent/60 hover:bg-card-hover"
        >
          <Plus className="size-4" strokeWidth={2.5} aria-hidden />
        </button>
      )}
    </li>
  );
  // Clic droit : l'instance qu'un clic reprendrait.
  return pick ? (
    <InstanceMenu entry={pick} play={playFor(pick.id)} actions={menu}>
      {card}
    </InstanceMenu>
  ) : (
    card
  );
}

/**
 * Toutes les versions de Minecraft, par famille : les récentes dans la grille principale, puis,
 * repliées, celles de la 1.15 à la 1.0 et celles d'avant (Bêta, Alpha), chacune dans sa grille.
 * Elles s'ouvrent d'office quand l'instance choisie y est.
 */
function Simple(props: Actions) {
  const { instances, current, viewing, services = api } = props;
  const [versions, setVersions] = useState<AvailableVersion[]>([]);
  const [failed, setFailed] = useState(false);
  const [older, setOlder] = useState(false);
  const [snapshots, setSnapshots] = useState(storedSnapshots);
  const showSnapshots = (next: boolean) => {
    setSnapshots(next);
    try {
      localStorage.setItem(SNAPSHOTS_KEY, next ? "1" : "0");
    } catch {
      // Préférence de confort : sans stockage, elle vaut pour cette session.
    }
  };

  useEffect(() => {
    let cancelled = false;
    services
      .instanceVersions()
      .then((list) => !cancelled && setVersions(list))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [services]);

  const families = groupVersions(versions, instances.flatMap((entry) => (entry.minecraft ? [entry.minecraft] : [])), snapshots);
  const activeFamily = viewing ? versionFamily(viewing) : current?.minecraft && versionFamily(current.minecraft);
  const sections = [
    { title: "De la 1.15 à la 1.0", families: families.filter((family) => /^\d/.test(family.id) && !recent(family.id)) },
    { title: "Avant la 1.0", families: families.filter((family) => !/^\d/.test(family.id)) },
  ].filter((section) => section.families.length > 0);
  const olderCount = sections.reduce((sum, section) => sum + section.families.length, 0);
  const olderOpen = older || sections.some((section) => section.families.some((family) => family.id === activeFamily));
  const grid = (list: VersionFamily[], label: string) => (
    <ul aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      {list.map((family) => (
        <FamilyCard key={family.id} {...props} family={family} active={family.id === activeFamily} />
      ))}
    </ul>
  );

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="text-sm text-muted-foreground">
          {failed ? "Liste des versions indisponible : seules tes instances sont affichées." : "Choisis la version à lancer. Le « + » d'une carte crée une autre instance de cette version."}
        </p>
        <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground" title="Versions en test de Mojang : snapshots, préversions et candidates">
          <Switch checked={snapshots} onCheckedChange={showSnapshots} aria-label="Afficher les snapshots" className="scale-90" />
          Snapshots
        </label>
      </div>
      <div className="mt-5">{grid(families.filter((family) => recent(family.id)), "Versions récentes de Minecraft")}</div>
      {olderCount > 0 && (
        <div className="mt-8 flex flex-col gap-5">
          <button
            type="button"
            aria-expanded={olderOpen}
            onClick={() => setOlder(!olderOpen)}
            className="flex items-center gap-2 self-start font-display text-xl transition-colors hover:text-primary"
          >
            Anciennes versions
            <span className="font-sans text-sm font-semibold text-muted-foreground tabular-nums">{olderCount}</span>
            <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", olderOpen && "rotate-180")} aria-hidden />
          </button>
          {olderOpen &&
            sections.map((section) => (
              <section key={section.title} aria-label={section.title} className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold text-muted-foreground">{section.title}</h3>
                {grid(section.families, section.title)}
              </section>
            ))}
        </div>
      )}
    </>
  );
}

/**
 * Sous les cartes : l'instance choisie, la variante à lancer quand la version en a plusieurs, ses
 * raccourcis (mods, mondes, dossier, paramètres) et « Jouer ». Les raccourcis perdent leur nom
 * quand la fenêtre est étroite.
 */
function LaunchBar({ instances, current, playFor, running, onSelect, onPlay, onStop, onEdit, onOpenSection, onOpenFolder }: Actions & { current: InstanceEntry }) {
  const play = playFor(current.id);
  const siblings = instances.filter((entry) => entry.minecraft && current.minecraft && versionFamily(entry.minecraft) === versionFamily(current.minecraft));
  const isRunning = running.includes(current.id);
  const shortcuts = [
    ...(current.kind === "vanilla" ? [] : [{ label: "Mods", Icon: Puzzle, onClick: () => onOpenSection(current, "mods") }]),
    { label: "Mondes", Icon: Globe, onClick: () => onOpenSection(current, "saves") },
    { label: "Dossier", Icon: FolderOpen, onClick: () => onOpenFolder(current.id, "game") },
    { label: "Réglages", Icon: Settings2, onClick: () => onEdit(current) },
  ];
  return (
    <aside aria-label="Instance choisie" className="@container flex shrink-0 items-center gap-4 border-t border-border bg-sunken px-10 py-4">
      <span key={`${current.id}-art`} className="relative shrink-0 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300">
        <InstanceArt entry={current} className="size-14 rounded-lg" badge="absolute -right-1.5 -bottom-1.5 size-6 rounded-md border-2 border-sunken" />
      </span>
      <div key={`${current.id}-info`} className="flex min-w-0 flex-col gap-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
        <span className="flex min-w-0 items-center gap-2.5">
          {siblings.length > 1 ? (
            <Select value={current.id} onValueChange={(id) => id && onSelect(id)}>
              <SelectTrigger aria-label="Instance à lancer" className="h-10 w-72 text-sm font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {siblings.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name} · {entry.minecraft}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <button type="button" onClick={() => onOpenSection(current, "overview")} title={`Ouvrir la page de ${current.name}`} className="truncate font-display text-xl leading-none hover:text-primary">
              {current.name}
            </button>
          )}
          {isRunning && <RunningBadge />}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          <span className="font-pixel text-[12px] text-foreground/80">{instanceSummary(current)}</span>
          {` · ${lastPlayed(current)}`}
        </span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {shortcuts.map(({ label, Icon: ShortcutIcon, onClick }) => (
          <button key={label} type="button" title={label} aria-label={`${label} de ${current.name}`} onClick={onClick} className={cn(secondaryButton, "h-11 w-11 px-0 @[60rem]:w-auto @[60rem]:px-3.5")}>
            <ShortcutIcon className="size-4" aria-hidden />
            <span className="hidden @[60rem]:inline">{label}</span>
          </button>
        ))}
      </div>
      <GameButton state={play} name={current.name} onPlay={() => onPlay(current.id)} onStop={(force) => onStop(current.id, force)} disabled={!current.minecraft} className="h-12 w-40 text-[15px]" />
    </aside>
  );
}

/** Toutes les instances, avec recherche et tri. */
function Expert({ instances, selected, playFor, running, menu, onOpen, onPlay, onStop, onEdit, onOpenFolder, onAskDelete }: Actions) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "recent">("recent");
  const shown = instances
    .filter((entry) => `${entry.name} ${instanceSummary(entry)}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort(sort === "recent" ? (a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) : (a, b) => a.name.localeCompare(b.name, "fr"))
    // Épinglées en haut, dans l'ordre choisi.
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

  return (
    <>
      <div className="mt-5 flex items-center gap-3">
        <SearchField className="flex-1" label="Rechercher une instance" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, version…" />
        <Select value={sort} onValueChange={(value) => value && setSort(value as typeof sort)}>
          <SelectTrigger aria-label="Trier" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Dernière partie</SelectItem>
            <SelectItem value="name">Nom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ul aria-label="Instances" className="mt-4 flex flex-col gap-2.5">
        {shown.map((entry) => {
          const active = entry.id === selected;
          const play = playFor(entry.id);
          // Pas de modification ni de suppression pendant le lancement ou la partie de l'instance.
          const locked = play.kind !== "ready";
          return (
            <InstanceMenu key={entry.id} entry={entry} play={play} actions={menu}>
            <li className="relative flex items-center gap-4 px-4 py-3">
              <button
                type="button"
                aria-pressed={active}
                aria-label={`Ouvrir ${entry.name}`}
                onClick={() => onOpen(entry.id)}
                className={cn("absolute inset-0 rounded-lg border bg-card transition-colors hover:bg-card-hover", active ? "border-primary" : "border-border")}
              />
              <span className="pointer-events-none relative shrink-0">
                <InstanceArt entry={entry} className="size-14 rounded-md" badge="absolute -right-1.5 -bottom-1.5 size-6 rounded-md border-2 border-card" />
              </span>
              <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1">
                <p className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{entry.name}</span>
                  {entry.pinned && <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-label="Épinglée" />}
                  {active && <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Choisie</span>}
                  {running.includes(entry.id) && <RunningBadge />}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-pixel text-[11px] text-foreground/80">{instanceSummary(entry)}</span>
                  {entry.id !== "clover" && ` · ${entry.separate ? "Dossier séparé" : "Dossier commun"}`}
                  {` · ${lastPlayed(entry)}`}
                </p>
              </div>
              <div className="relative flex shrink-0 items-center gap-2">
                <button type="button" title="Ouvrir le dossier" aria-label={`Ouvrir le dossier de ${entry.name}`} onClick={() => onOpenFolder(entry.id, "game")} className={iconButton}>
                  <FolderOpen className="size-4" aria-hidden />
                </button>
                <button type="button" title="Réglages" aria-label={`Réglages de ${entry.name}`} onClick={() => onEdit(entry)} className={iconButton}>
                  <Settings2 className="size-4" aria-hidden />
                </button>
                {entry.id !== "clover" && (
                  <button type="button" title="Supprimer" aria-label={`Supprimer ${entry.name}`} onClick={() => onAskDelete(entry)} disabled={locked} className={cn(iconButton, "hover:text-destructive")}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
                <GameButton state={play} name={entry.name} onPlay={() => onPlay(entry.id)} onStop={(force) => onStop(entry.id, force)} disabled={!entry.minecraft} className="ml-1 w-28" />
              </div>
            </li>
            </InstanceMenu>
          );
        })}
        {shown.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Aucune instance ne correspond à ta recherche.</p>}
      </ul>
    </>
  );
}
