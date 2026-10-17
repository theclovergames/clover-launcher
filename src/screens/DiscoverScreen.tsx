import { Boxes, Check, Download, ExternalLink, FileUp, Globe, Layers, LoaderCircle, Palette, Play, Puzzle, SlidersHorizontal, Sun, X } from "lucide-react";
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { acceptsMods, InstancePicker } from "@/components/InstancePicker";
import { LoaderBadges } from "@/components/LoaderBadges";
import { ModIcon } from "@/components/ModIcon";
import { ModpackVersionSelect } from "@/components/ModpackVersionSelect";
import { Page } from "@/components/Page";
import { SearchField } from "@/components/SearchField";
import { Tabs } from "@/components/Tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { CATEGORIES, CONTENT_KINDS, type ContentKind, installKey, KIND_ORDER, kindAllowed, LOADER_FILTERS, sortsFor } from "@/lib/content-kinds";
import { opensWorldsDirectly, preferredModpackVersion } from "@/lib/game-versions";
import { modLoader } from "@/lib/instances";
import type { OpenProject, Route } from "@/lib/routes";
import { cn, formatSize } from "@/lib/utils";
import { type Confirmation, ConfirmDialog, ModpackDialog, type ModpackRequest } from "@/screens/Dialogs";
import { ModPage } from "@/screens/ModPage";
import type { ContentEntry, ImportedModpack, InstanceEntry, ModpackVersion, ModrinthHit, ModrinthPage, ModrinthProject, SearchFilters, SearchSort } from "@/types";

const number = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const NO_FILTERS: SearchFilters = { sort: "relevance", categories: [] };
/** Valeur de la liste des chargeurs sans filtre (une valeur vide n'est pas permise). */
const ALL_LOADERS = "all";

const ICONS: Record<ContentKind, ComponentType<{ className?: string }>> = {
  mod: Puzzle,
  shader: Sun,
  resourcepack: Palette,
  datapack: Layers,
  world: Globe,
  modpack: Boxes,
};

export type DiscoverRoute = Extract<Route, { tab: "discover" }>;

type Props = {
  route: DiscoverRoute;
  /** Même page, autre type, autre instance ou autre monde : la page est remplacée, pas empilée. */
  onRoute: (route: DiscoverRoute) => void;
  /** Ouvre la page d'un projet. */
  onOpenProject: (project: OpenProject) => void;
  instances: InstanceEntry[];
  /** Instance visée sans autre choix : celle choisie dans le launcher. */
  defaultTarget: string;
  /** Projets déjà installés de ce type (dans `world` pour un datapack). */
  installed: (kind: ContentKind, instance: string, world?: string) => Promise<string[]>;
  search: (kind: ContentKind, query: string, filters: SearchFilters, offset: number, instance: string) => Promise<ModrinthPage>;
  /**
   * Installe le projet ; rejette avec un message à afficher. Un monde renvoie le nom de son dossier.
   * `version` : celle du modpack choisie sur sa page ; la dernière stable sans elle.
   */
  onInstall: (kind: ContentKind, projectId: string, instance: string, world?: string, version?: string) => Promise<string | void>;
  /** Installations en cours (`installKey`), tenues par `App` : elles survivent à un retour sur cet écran. */
  installing: ReadonlySet<string>;
  /** Change après chaque installation, même finie après un départ de cet écran : les « installés » sont relus. */
  contentRevision?: number;
  /** Versions installables d'un modpack, pour en choisir une sur sa page. */
  modpackVersions: (project: string) => Promise<ModpackVersion[]>;
  /** Mondes de l'instance, cibles des datapacks. */
  worlds: (instance: string) => Promise<ContentEntry[]>;
  /** Avancement en cours : fichiers d'un modpack, octets d'un monde. */
  progress?: Partial<Record<ContentKind, [number, number]>>;
  /** Importe un modpack depuis un fichier ; `null` si le joueur annule. */
  onImportFile: () => Promise<ImportedModpack | null>;
  /** Page d'un projet (Modrinth, ou CurseForge pour un monde). */
  load: (kind: ContentKind, project: string) => Promise<ModrinthProject>;
  /** Lance l'instance dans ce monde ; absent si une partie démarre déjà. */
  onPlayWorld?: (instance: string, world: string) => void;
  onOpenLink: (url: string) => void;
};

type Results = { key: string; hits: ModrinthHit[]; total: number } | { key: string; error: string };

/**
 * Découvrir : tout le contenu à installer (mods, shaders, packs, datapacks, mondes, modpacks), pour
 * l'instance visée, qui n'est pas forcément celle que « Jouer » lance. Un résultat ouvre sa page.
 * Le texte et les filtres de chaque type restent quand on va et vient entre la liste et une page.
 */
export function DiscoverScreen(props: Props) {
  const { route, instances, defaultTarget, installed, search, onInstall, installing, contentRevision, modpackVersions, worlds, progress, load, onPlayWorld, onOpenLink } = props;
  const kind = route.kind;
  const text = CONTENT_KINDS[kind];
  // Mods et shaders demandent un loader : une instance Vanilla visée cède la place à une autre.
  const choices = kind === "mod" || kind === "shader" ? instances.filter(acceptsMods) : instances;
  const instance = choices.find((entry) => entry.id === (route.target ?? defaultTarget)) ?? choices.find((entry) => entry.id === defaultTarget) ?? choices[0];
  const id = instance?.id ?? "";
  const minecraft = instance?.minecraft ?? "";
  const allowed = kindAllowed(kind, instance);

  const [queries, setQueries] = useState<Partial<Record<ContentKind, string>>>({});
  const [filtersByKind, setFiltersByKind] = useState<Partial<Record<ContentKind, SearchFilters>>>({});
  const query = queries[kind] ?? "";
  const filters = filtersByKind[kind] ?? NO_FILTERS;
  const setFilters = (patch: Partial<SearchFilters>) => setFiltersByKind((current) => ({ ...current, [kind]: { ...filters, ...patch } }));
  /** Modpacks : version de Minecraft de la nouvelle instance voulue (panneau « Nouvelle instance »). */
  const packMinecraft = kind === "modpack" ? route.minecraft : undefined;
  const searchFilters = useMemo(() => (packMinecraft ? { ...filters, version: packMinecraft } : filters), [filters, packMinecraft]);

  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [installedSet, setInstalledSet] = useState<{ key: string; projects: Set<string> } | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Record<string, string>>({});
  /** Dossier de chaque monde installé ici, pour y jouer aussitôt. */
  const [played, setPlayed] = useState<Record<string, string>>({});
  /** Mondes de l'instance visée ; ceux d'une autre instance ne sont jamais proposés. */
  const [worldState, setWorldState] = useState<{ instance: string; list: ContentEntry[] } | null>(null);
  const worldList = worldState?.instance === id ? worldState.list : null;
  /** Erreur de « Voir plus » : la liste déjà chargée reste affichée. */
  const [moreError, setMoreError] = useState<{ key: string; message: string } | null>(null);
  const [imported, setImported] = useState<{ busy: true } | { busy: false; result?: ImportedModpack; error?: string } | null>(null);
  /** Versions du modpack ouvert (`null` : en lecture), et celle choisie pour chaque modpack. */
  const [packVersions, setPackVersions] = useState<{ project: string; list: ModpackVersion[] | null; error?: string } | null>(null);
  const [chosenVersion, setChosenVersion] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState<Confirmation | null>(null);
  const [packRequest, setPackRequest] = useState<ModpackRequest | null>(null);
  /** Résultats déjà vus, pour la page d'un projet : lien externe, taille, catalogue Clover. */
  const seen = useRef(new Map<string, ModrinthHit>());
  /** Dernière recherche lancée : une réponse plus ancienne arrivée en retard est ignorée. */
  const latest = useRef("");
  const world = kind === "datapack" ? (route.world && worldList?.some((other) => other.name === route.world) ? route.world : (worldList?.[0]?.name ?? null)) : null;
  const searchKey = `${id}:${kind}:${query}:${filters.sort}:${filters.categories.join(",")}:${packMinecraft ?? ""}`;

  const run = useCallback(async (key: string, searched: ContentKind, value: string, chosen: SearchFilters, offset: number, into: string) => {
    latest.current = key;
    setLoading(true);
    setMoreError(null);
    try {
      const page = await search(searched, value, chosen, offset, into);
      if (latest.current !== key) return;
      for (const hit of page.hits) seen.current.set(`${searched}:${hit.projectId}`, hit);
      setResults((current) =>
        offset > 0 && current && "hits" in current && current.key === key
          ? { key, hits: [...current.hits, ...page.hits], total: page.totalHits }
          : { key, hits: page.hits, total: page.totalHits },
      );
    } catch (reason) {
      if (latest.current !== key) return;
      // « Voir plus » en échec : on garde les résultats et on affiche l'erreur dessous.
      if (offset > 0) setMoreError({ key, message: String(reason) });
      else setResults({ key, error: String(reason) });
    } finally {
      if (latest.current === key) setLoading(false);
    }
  }, [search]);

  const loadedKey = results?.key;
  useEffect(() => {
    // Retour d'une page : la liste déjà chargée reste, sans nouvelle recherche.
    if (!allowed || !id || route.project || loadedKey === searchKey) return;
    const timer = window.setTimeout(() => void run(searchKey, kind, query, searchFilters, 0, id), query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [allowed, searchKey, loadedKey, kind, query, searchFilters, id, run, route.project]);

  const openedPack = kind === "modpack" ? route.project?.id : undefined;
  useEffect(() => {
    if (!openedPack) return;
    let alive = true;
    setPackVersions({ project: openedPack, list: null });
    modpackVersions(openedPack)
      .then((list) => alive && setPackVersions({ project: openedPack, list }))
      .catch((reason) => alive && setPackVersions({ project: openedPack, list: [], error: String(reason) }));
    return () => {
      alive = false;
    };
  }, [openedPack, modpackVersions]);

  useEffect(() => {
    if (kind !== "datapack" || !id) return;
    let alive = true;
    worlds(id)
      .then((list) => alive && setWorldState({ instance: id, list }))
      .catch(() => alive && setWorldState({ instance: id, list: [] }));
    return () => {
      alive = false;
    };
  }, [kind, id, worlds]);

  const installedKey = `${id}:${kind}:${world ?? ""}`;
  useEffect(() => {
    if (!allowed || !id || kind === "modpack" || kind === "world" || (kind === "datapack" && !world)) return;
    let alive = true;
    installed(kind, id, world ?? undefined)
      .then((projects) => alive && setInstalledSet({ key: installedKey, projects: new Set(projects) }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [allowed, id, kind, world, installedKey, installed, contentRevision]);

  const keyOf = (projectId: string) => installKey(kind, projectId, id, world);
  const installedHere = installedSet?.key === installedKey ? installedSet.projects : null;
  const isDone = (hit: ModrinthHit) => Boolean(hit.providedByClover) || Boolean(installedHere?.has(hit.projectId)) || added.has(keyOf(hit.projectId));

  const install = async (hit: ModrinthHit, version?: string) => {
    const key = keyOf(hit.projectId);
    if (installing.has(key)) return;
    setFailed(({ [key]: _, ...rest }) => rest);
    try {
      const folder = await onInstall(kind, hit.projectId, id, world ?? undefined, version);
      setAdded((current) => new Set(current).add(key));
      if (kind === "world" && folder) setPlayed((current) => ({ ...current, [key]: folder }));
    } catch (reason) {
      setFailed((current) => ({ ...current, [key]: String(reason) }));
    }
  };

  /** Instance déjà créée depuis ce modpack ; une plus ancienne que `modpack` est reconnue à son nom. */
  const existingPack = (hit: ModrinthHit) => instances.find((entry) => (entry.modpack ? entry.modpack === hit.projectId : entry.name === hit.title));
  /**
   * Modpack de la liste : sa version se choisit d'abord dans une fenêtre. Sur sa page, où elle est
   * déjà choisie, un modpack déjà installé demande confirmation : l'installer encore crée une
   * seconde instance.
   */
  const requestInstall = (hit: ModrinthHit, version?: string) => {
    if (kind !== "modpack") return void install(hit, version);
    const existing = existingPack(hit);
    if (!route.project) {
      setPackRequest({ project: hit.projectId, title: hit.title, minecraft: packMinecraft, existing: existing?.name, onInstall: (chosen) => void install(hit, chosen) });
      return;
    }
    if (!existing) return void install(hit, version);
    setAsking({
      title: "Modpack déjà installé",
      description: "Tu as déjà une instance de ce modpack. L'installer à nouveau en crée une seconde, sans toucher à la première.",
      detail: existing.name,
      confirm: "Installer quand même",
      install: true,
      onConfirm: () => void install(hit, version),
    });
  };
  const dialogs = (
    <>
      <ConfirmDialog ask={asking} onClose={() => setAsking(null)} />
      <ModpackDialog request={packRequest} versions={modpackVersions} onClose={() => setPackRequest(null)} />
    </>
  );

  const importFile = async () => {
    setImported({ busy: true });
    try {
      const result = await props.onImportFile();
      setImported(result ? { busy: false, result } : null);
    } catch (reason) {
      setImported({ busy: false, error: String(reason) });
    }
  };
  // Une fonction stable : la page d'un projet se recharge quand elle change.
  const loadPage = useCallback((project: string) => load(kind, project), [load, kind]);
  const importedName = imported && !imported.busy && imported.result && instances.find((entry) => entry.id === imported.result?.instance)?.name;

  /** Avancement affiché sur le bouton d'une installation en cours. */
  const busyText = () => {
    const [done, total] = progress?.[kind] ?? [0, 0];
    if (kind === "modpack" && total > 0) return `${done} / ${total}`;
    if (kind === "world" && total > 0) return `${Math.floor((done * 100) / total)} %`;
    return "Installation…";
  };

  /** Bouton d'installation d'un résultat, dans la liste et sur sa page (`version` : celle du modpack choisie). */
  const control = (hit: ModrinthHit, version?: string, unavailable = false) => {
    const key = keyOf(hit.projectId);
    if (hit.external) {
      const page = hit.external;
      return (
        <button type="button" onClick={() => onOpenLink(page)} title="Son auteur ne permet de le télécharger que sur CurseForge" className={cn(secondaryButton, "relative shrink-0")}>
          <ExternalLink className="size-4" aria-hidden />
          Sur CurseForge
        </button>
      );
    }
    const folder = played[key];
    if (kind === "world" && folder && onPlayWorld && opensWorldsDirectly(minecraft)) {
      return (
        <button type="button" onClick={() => onPlayWorld(id, folder)} aria-label={`Jouer dans ${hit.title}`} className={cn(primaryButton, "relative shrink-0")}>
          <Play className="size-4 fill-current" aria-hidden />
          Jouer
        </button>
      );
    }
    if (isDone(hit)) {
      return (
        <span className="relative flex h-9 shrink-0 items-center gap-1.5 px-2 text-[13px] font-semibold text-primary">
          <Check className="size-4" aria-hidden />
          {hit.providedByClover ? "Dans le catalogue Clover" : text.done}
        </span>
      );
    }
    const busy = installing.has(key);
    return (
      <button
        type="button"
        disabled={!allowed || busy || unavailable || (kind === "datapack" && !world)}
        onClick={() => requestInstall(hit, version)}
        aria-label={`${text.install} : ${hit.title}`}
        className={cn(primaryButton, "relative shrink-0")}
      >
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {busy ? busyText() : text.install}
      </button>
    );
  };

  const picker = kind !== "modpack" && choices.length > 0 && (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      Pour
      <InstancePicker instances={choices} value={id} onChange={(target) => props.onRoute({ ...route, target })} label="Instance où installer" className="w-60" />
    </span>
  );

  if (route.project) {
    const project = route.project;
    const hit = seen.current.get(`${kind}:${project.id}`) ?? { projectId: project.id, slug: project.id, title: project.title, description: "", author: "", iconUrl: project.icon, downloads: 0 };
    const error = failed[keyOf(project.id)];
    // Modpack : la version à installer, la dernière stable (pour la version de Minecraft voulue) d'office.
    const versions = kind === "modpack" && packVersions?.project === project.id ? packVersions : null;
    const chosen = chosenVersion[project.id] ?? (versions?.list ? preferredModpackVersion(versions.list, packMinecraft)?.id : undefined);
    const noVersion = versions?.list?.length === 0;
    const versionPicker = kind === "modpack" && (
      <ModpackVersionSelect versions={versions?.list ?? null} value={chosen} onChange={(value) => setChosenVersion((current) => ({ ...current, [project.id]: value }))} className="h-9 w-80" />
    );
    return (
      <Page>
        <ModPage
          kind={kind === "world" ? undefined : kind}
          project={project.id}
          name={project.title}
          icon={project.icon}
          version={null}
          notice={
            <>
              {kind !== "modpack" && instance && (
                <p className="mt-4 text-[13px] text-muted-foreground">
                  S'installe dans <span className="font-semibold text-foreground">{instance.name}</span>
                  {world && ` · monde ${worldList?.find((other) => other.name === world)?.level?.name ?? world}`}
                  {hit.size != null && ` · ${formatSize(hit.size)}`}
                </p>
              )}
              {noVersion && (
                <p className="mt-4 text-[13px] text-muted-foreground">
                  {versions?.error ?? "Aucune version pour Fabric, Quilt, Forge ou NeoForge : ce modpack ne s'installe pas dans le launcher."}
                </p>
              )}
              {error && <p className="mt-3 rounded-lg border border-error/30 bg-error/8 px-4 py-3 text-[13px] text-error">{error}</p>}
            </>
          }
          actions={
            <>
              {versionPicker}
              {control(hit, chosen, noVersion)}
            </>
          }
          load={loadPage}
          onOpenLink={onOpenLink}
        />
        {dialogs}
      </Page>
    );
  }

  const current = results?.key === searchKey ? results : null;
  const hits = current && "hits" in current ? current.hits : [];
  const noWorld = kind === "datapack" && worldList !== null && worldList.length === 0;

  return (
    <Page title="Découvrir" subtitle="Mods, shaders, packs, mondes et modpacks à installer en un clic." actions={picker} fixed>
      <Tabs
        label="Type de contenu"
        className="mt-5"
        value={kind}
        onChange={(next) => props.onRoute({ tab: "discover", kind: next, target: route.target, minecraft: route.minecraft })}
        items={KIND_ORDER.map((other) => ({ id: other, label: CONTENT_KINDS[other].label, Icon: ICONS[other] }))}
      />
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{text.hint(minecraft)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <SearchField
          className="flex-1"
          label={`Rechercher des ${text.label.toLowerCase()}`}
          autoFocus
          value={query}
          disabled={!allowed}
          onChange={(event) => setQueries((all) => ({ ...all, [kind]: event.target.value }))}
          placeholder={text.placeholder}
        />
        {kind === "modpack" && (
          <button type="button" onClick={() => void importFile()} disabled={imported?.busy} className={cn(secondaryButton, "h-10 shrink-0")}>
            {imported?.busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
            {imported?.busy ? (progress?.modpack ? `${progress.modpack[0]} / ${progress.modpack[1]}` : "Import…") : "Importer un fichier"}
          </button>
        )}
        {kind === "datapack" && worldList && worldList.length > 0 && (
          <Select value={world ?? undefined} onValueChange={(value) => value && props.onRoute({ ...route, world: value })}>
            <SelectTrigger aria-label="Monde" className="h-10 w-56">
              <SelectValue placeholder="Monde" />
            </SelectTrigger>
            <SelectContent>
              {worldList.map((other) => (
                <SelectItem key={other.name} value={other.name}>
                  {other.level?.name ?? other.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {allowed && (
        <Filters
          kind={kind}
          filters={filters}
          onChange={setFilters}
          instanceLoader={kind === "mod" && instance ? (instance.kind === "quilt" ? "Quilt et Fabric" : modLoader(instance.kind)) : null}
          minecraft={packMinecraft}
          onClearMinecraft={() => props.onRoute({ ...route, minecraft: undefined })}
        />
      )}

      {kind === "modpack" && imported && !imported.busy && (imported.error || imported.result) && (
        <div role="status" className={cn("mt-3 rounded-lg border px-4 py-3 text-[13px] leading-relaxed", imported.error ? "border-error/30 bg-error/8 text-error" : "border-primary/30 bg-primary/8")}>
          {imported.error ?? (
            <>
              <p className="font-semibold text-primary">{importedName ? `L'instance « ${importedName} » est prête dans tes instances.` : "Le modpack est prêt dans tes instances."}</p>
              {imported.result && imported.result.missing.length > 0 && (
                <>
                  <p className="mt-1 text-muted-foreground">À télécharger toi-même sur CurseForge, puis à ajouter dans l'onglet Mods de l'instance :</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {imported.result.missing.map((entry) => (
                      <li key={entry.url}>
                        <button type="button" onClick={() => onOpenLink(entry.url)} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-semibold hover:text-primary">
                          {entry.name}
                          <ExternalLink className="size-3" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
      {noWorld && <p className="mt-3 text-xs text-error">Aucun monde dans {instance?.name ?? "cette instance"} : crée-en un en jeu, puis reviens ajouter des datapacks.</p>}

      <div className="mt-4 -mx-2 min-h-0 flex-1 overflow-y-auto px-2" aria-busy={loading}>
        {!allowed ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            {instance?.name ?? "Cette instance"} se lance sans mods. Choisis une autre instance pour y ajouter des {text.label.toLowerCase()}.
          </p>
        ) : current && "error" in current ? (
          <p className="px-3 py-10 text-center text-sm text-error">{current.error}</p>
        ) : !current ? (
          // Frappe en attente (300 ms) ou première recherche : pas de « Aucun résultat » qui clignote.
          <p role="status" className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Recherche…
          </p>
        ) : hits.length === 0 && !loading ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">Aucun résultat{kind === "modpack" ? "" : ` pour Minecraft ${minecraft}`}.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {hits.map((hit) => {
              const error = failed[keyOf(hit.projectId)];
              return (
                <li key={hit.projectId} className="relative flex items-center gap-4 px-4 py-3 [contain-intrinsic-size:auto_76px] [content-visibility:auto]">
                  <button
                    type="button"
                    onClick={() => props.onOpenProject({ id: hit.projectId, title: hit.title, icon: hit.iconUrl })}
                    aria-label={`Ouvrir la page de ${hit.title}`}
                    className="absolute inset-0 rounded-lg border border-border bg-card transition-colors hover:bg-card-hover"
                  />
                  <ModIcon src={hit.iconUrl} className="pointer-events-none relative" />
                  <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="flex items-baseline gap-2 text-sm font-semibold">
                      <span className="truncate">{hit.title}</span>
                      {hit.author && <span className="shrink-0 text-[11px] font-normal text-muted-foreground">par {hit.author}</span>}
                    </p>
                    <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{hit.description}</p>
                    <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] text-muted-foreground">
                      <Download className="size-3" aria-hidden />
                      {number.format(hit.downloads)} téléchargements
                      {hit.size != null && ` · ${formatSize(hit.size)}`}
                      <LoaderBadges loaders={hit.loaders} className="ml-1.5" />
                    </p>
                    {error && <p className="text-xs text-error">{error}</p>}
                  </div>
                  {control(hit)}
                </li>
              );
            })}
          </ul>
        )}

        {moreError?.key === searchKey && <p role="alert" className="px-3 py-3 text-center text-sm text-error">{moreError.message}</p>}
        {loading && hits.length > 0 && (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Recherche…
          </p>
        )}
        {!loading && current && "hits" in current && hits.length < current.total && (
          <div className="flex justify-center py-3">
            <button type="button" onClick={() => void run(searchKey, kind, query, searchFilters, hits.length, id)} className={secondaryButton}>
              {moreError?.key === searchKey ? "Réessayer" : "Voir plus"}
            </button>
          </div>
        )}
      </div>
      {dialogs}
    </Page>
  );
}

/** Tri et catégories du type ; les catégories choisies restent visibles, chacune retirable. */
/**
 * Tri, chargeur (modpacks) et catégories de la recherche. Le chargeur est une catégorie Modrinth
 * comme les autres, choisi dans sa propre liste ; pour les mods, c'est celui de l'instance visée.
 * `minecraft` : version voulue pour un modpack, retirable comme une catégorie.
 */
function Filters({ kind, filters, onChange, instanceLoader, minecraft, onClearMinecraft }: { kind: ContentKind; filters: SearchFilters; onChange: (patch: Partial<SearchFilters>) => void; instanceLoader: string | null; minecraft?: string; onClearMinecraft: () => void }) {
  const groups = CATEGORIES[kind];
  const loaders = LOADER_FILTERS[kind] ?? [];
  const isLoader = (category: string) => loaders.some(([id]) => id === category);
  const loader = filters.categories.find(isLoader) ?? ALL_LOADERS;
  const others = filters.categories.filter((category) => !isLoader(category));
  const label = (category: string) => groups.flatMap((group) => group.items).find(([id]) => id === category)?.[1] ?? category;
  const toggle = (category: string) =>
    onChange({ categories: filters.categories.includes(category) ? filters.categories.filter((other) => other !== category) : [...filters.categories, category] });
  const chooseLoader = (value: string) => onChange({ categories: [...filters.categories.filter((category) => !isLoader(category)), ...(value === ALL_LOADERS ? [] : [value])] });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Select value={filters.sort} onValueChange={(value) => value && onChange({ sort: value as SearchSort })}>
        <SelectTrigger aria-label="Trier par" className="h-8 w-44 text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sortsFor(kind).map(([id, name]) => (
            <SelectItem key={id} value={id}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {loaders.length > 0 && (
        <Select value={loader} onValueChange={(value) => value && chooseLoader(value)}>
          <SelectTrigger aria-label="Chargeur" className="h-8 w-44 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_LOADERS}>Tous les chargeurs</SelectItem>
            {loaders.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {instanceLoader && (
        <span className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground" title="Seuls les mods de ce chargeur s'installent dans l'instance visée : change d'instance avec « Pour ».">
          Chargeur : <span className="font-semibold text-foreground">{instanceLoader}</span>
        </span>
      )}
      {groups.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={cn(secondaryButton, "h-8")}>
              <SlidersHorizontal className="size-3.5" aria-hidden />
              Catégories
              {others.length > 0 && <span className="rounded-full bg-accent px-1.5 font-pixel text-[11px] text-accent-foreground">{others.length}</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-[min(420px,70vh)] w-80 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.title} className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-muted-foreground">{group.title}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {group.items.map(([id, name]) => {
                    const on = filters.categories.includes(id);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(id)}
                          className={cn("rounded-md px-2 py-1 text-xs font-semibold transition-colors", on ? "bg-primary text-primary-foreground" : "bg-secondary hover:text-primary")}
                        >
                          {name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </PopoverContent>
        </Popover>
      )}
      {minecraft && (
        <button
          type="button"
          onClick={onClearMinecraft}
          aria-label={`Retirer le filtre Minecraft ${minecraft}`}
          className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/25"
        >
          Minecraft {minecraft}
          <X className="size-3" aria-hidden />
        </button>
      )}
      {others.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => toggle(category)}
          aria-label={`Retirer le filtre ${label(category)}`}
          className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/25"
        >
          {label(category)}
          <X className="size-3" aria-hidden />
        </button>
      ))}
    </div>
  );
}
