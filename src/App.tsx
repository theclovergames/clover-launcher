import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NotificationBell } from "@/components/NotificationBell";
import { SideNav, TAB_LABELS } from "@/components/SideNav";
import { AccountMenu } from "@/components/AccountMenu";
import { TitleBar } from "@/components/TitleBar";
import { type UpdateState, UpdateToast } from "@/components/UpdateToast";
import { VoteTicker } from "@/components/VoteTicker";
import { api, type Catalogue, type MachineLevel, type ServerStatus, type SiteFeed, type SkinEntry, type Stored, type StorageUsage, type SystemInfo } from "@/lib/api";
import { ownedCapeText } from "@/lib/capes";
import { accent, heroTone } from "@/lib/appearance";
import { setCrashReports } from "@/lib/crash-reports";
import { formatLog } from "@/lib/log";
import { networkPlayers, SITE_URL } from "@/lib/site";
import { ConsoleScreen } from "@/screens/ConsoleScreen";
import { CrashDialog, NameDialog } from "@/screens/Dialogs";
import { Breadcrumb } from "@/components/Breadcrumb";
import { HomeScreen } from "@/screens/HomeScreen";
import { InstancePanel, type InstanceDraft, newInstance } from "@/screens/InstancePanel";
import { InstancesScreen } from "@/screens/InstancesScreen";
import { NewsScreen } from "@/screens/NewsScreen";
import { ArticleReader, type ReaderTarget } from "@/components/ArticleReader";
import { InstanceSettings } from "@/screens/InstanceSettings";
import { ownLoader } from "@/lib/instances";
import { Page } from "@/components/Page";
import { CONTENT_KINDS, type ContentKind, installKey } from "@/lib/content-kinds";
import { back, canGoBack, type Names, openFromCrumb, route, type Route, trail } from "@/lib/routes";
import { DiscoverScreen } from "@/screens/DiscoverScreen";
import { sectionLabel } from "@/screens/InstanceDetail";
import { InstanceMods, ModDetail } from "@/screens/InstanceMods";
import { DEFAULT_IMPORT, OnboardingAccounts, OnboardingDone, OnboardingImport, type LoginState } from "@/screens/OnboardingScreen";
import { type Account, type Settings, SettingsScreen, type SettingsTab, type HiddenSetting, type SteamState } from "@/screens/SettingsScreen";
import { type SkinStatus, SkinsScreen } from "@/screens/SkinsScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import type { Cape, ConsoleSnapshot, DetectedInstance, GameExited, ImportItem, ImportResult, ImportScan, LauncherNotification, InstanceEntry, InstanceInput, ModInfo, PersonalMod, SearchFilters, PlaySession, PlayState, Profile, Progress, SavedSkin, SkinLook, SkinModel, Tab } from "@/types";

/** Paquet du Microsoft Store : le Store gère les mises à jour du launcher. */
const STORE_HIDDEN: HiddenSetting[] = ["autoUpdate"];

const STORAGE_COLORS: Record<string, string> = {
  assets: "#52a96c",
  java: "#d9a441",
  minecraft: "#5aafd6",
  mods: "#a57bc9",
  worlds: "#e08a4d",
  screenshots: "#8a8477",
  logs: "#c96f6f",
};

const SERVER_POLL_MS = 60_000;
/** Après un échec (souvent le premier ping, lancé pendant le démarrage), on réessaie plus vite. */
const SERVER_RETRY_MS = 8_000;
/** Actualités, joueurs par mode et votes : le site les met en cache 30 s à 5 min. */
const SITE_POLL_MS = 60_000;
/** Les réglages sont enregistrés 300 ms après le dernier changement. */
const SETTINGS_SAVED_MS = 600;
/** Notifications du site : toutes les minutes fenêtre ouverte, toutes les 5 min sinon. */
const NOTIFICATIONS_POLL_MS = 60_000;
const NOTIFICATIONS_HIDDEN_POLL_MS = 5 * 60_000;
/** Compte Minecraft lié à aucun compte du site : la cloche explique comment le lier. */
const LINK_NOTIFICATION: LauncherNotification = {
  id: "link-account",
  kind: "announcement",
  source: "site",
  title: "Lie ton compte Minecraft au site",
  message: "Achats, récompenses et annonces de ton compte clovergames.fr apparaîtront ici.",
  url: "/settings/minecraft",
  createdAt: new Date(0).toISOString(),
  read: false,
};
/** Mise à jour du launcher : vérification périodique, même fenêtre fermée. */
const UPDATE_POLL_MS = 6 * 60 * 60_000;
/** Console ouverte : nouvelles lignes du jeu. */
const CONSOLE_POLL_MS = 500;
/** Comme le cœur Rust (`game/console.rs`) : au-delà, les plus anciennes lignes tombent. */
const CONSOLE_MAX_ENTRIES = 10_000;
/** Fin de la sortie montrée par l'écran de plantage. */
const CRASH_LOG_ENTRIES = 40;
/** Délai laissé au jeu pour se fermer (sauvegarde du monde) avant de proposer « Forcer ». */
const CLOSE_GRACE_MS = 15_000;


/** `import` : import depuis les autres launchers ouvert depuis les paramètres. */
type Phase = "loading" | "onboarding-accounts" | "onboarding-import" | "onboarding-done" | "signin" | "import" | "app";

/** « Modrinth App · Fabulously Optimized : réglages, 2 serveurs, 3 mods activés, 40 mods copiés ». */
function importSummary(instance: DetectedInstance, result: ImportResult, mods: number): string {
  const count = (n: number, one: string, many: string) => (n > 0 ? [`${n} ${n > 1 ? many : one}`] : []);
  const parts = [
    ...(result.options ? ["réglages"] : []),
    ...count(result.servers, "serveur", "serveurs"),
    ...count(result.resourcePacks, "pack de ressources", "packs de ressources"),
    ...count(result.shaderPacks, "shader", "shaders"),
    ...count(result.screenshots, "capture", "captures"),
    ...count(result.worlds, "monde", "mondes"),
    ...count(mods, "mod activé", "mods activés"),
    ...count(result.mods, "mod copié", "mods copiés"),
    ...count(result.dependencies, "dépendance ajoutée", "dépendances ajoutées"),
  ];
  return `${instance.launcher} · ${instance.name} : ${parts.length > 0 ? parts.join(", ") : "déjà à jour"}`;
}

const LEVEL_LABEL: Record<MachineLevel, string> = { modest: "machine modeste", standard: "machine standard", powerful: "machine puissante" };

/** « 32 Go de mémoire · 32 cœurs · NVIDIA GeForce RTX 5080 (16 Go) ». */
function machineSummary(system: SystemInfo): string {
  const { gpu, cores } = system.machine;
  const card = gpu ? ` · ${gpu.name}${gpu.vramMb ? ` (${Math.round(gpu.vramMb / 1024)} Go)` : ""}` : "";
  return `${system.totalMemoryGb} Go de mémoire · ${cores} cœurs${card}`;
}

/** Compte listé dans le manifeste pour tester le canal bêta (UUID avec ou sans tirets). */
function isBetaTester(catalogue: Catalogue | null, uuid: string | undefined): boolean {
  const plain = (id: string) => id.replace(/-/g, "").toLowerCase();
  return Boolean(uuid && catalogue?.betaTesters?.some((tester) => plain(tester) === plain(uuid)));
}

/** `undefined` tant que le site n'a rien dit de ce mode, `null` s'il est hors ligne. */
function modePlayers(feed: SiteFeed, id: string): number | null | undefined {
  const mode = feed.modes?.find((entry) => entry.id === id);
  if (!mode || mode.online === null) return undefined;
  return mode.online ? mode.players : null;
}

const toCape = (cape: { id: string; name: string; url: string }): Cape => ({ id: cape.id, name: cape.name, texture: cape.url });

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [stored, setStored] = useState<Stored | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [login, setLogin] = useState<LoginState>({ kind: "idle" });
  // ── Import depuis les autres launchers ──
  const [detected, setDetected] = useState<DetectedInstance[] | null>(null);
  const [importScan, setImportScan] = useState<ImportScan>({ found: [], identifying: null });
  const [importSelected, setImportSelected] = useState<string | null>(null);
  const [importChoices, setImportChoices] = useState<Record<ImportItem, boolean>>(DEFAULT_IMPORT);
  const [importing, setImporting] = useState<{ id: string; ratio: number } | null>(null);
  /** Installations importées et une ligne de récapitulatif pour chacune. */
  const [imports, setImports] = useState<{ id: string; summary: string }[]>([]);
  /** Import ouvert depuis les Instances : chaque installation devient une nouvelle instance. */
  const [importTarget, setImportTarget] = useState<"clover" | "instance">("clover");
  const [importedInstances, setImportedInstances] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  /** Lecture des réglages impossible au démarrage : message affiché à la place du chargement figé. */
  const [startupError, setStartupError] = useState<string | null>(null);

  /** Pages ouvertes, de la première à celle affichée : « Retour » dépile (voir `lib/routes.ts`). */
  const [stack, setStack] = useState<Route[]>([{ tab: "home" }]);
  const current = stack[stack.length - 1];
  const tab = current.tab;
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  /** Menu, roue dentée : une pile neuve, sans fil d'Ariane. */
  const navigate = useCallback((next: Tab | Route) => {
    const target = typeof next === "string" ? route(next) : next;
    if (target.tab !== "instances") setInstanceDraft(null);
    setStack([target]);
  }, []);
  /** Sous-page, ou lien d'un écran à l'autre : « Retour » ramène ici. */
  const push = (next: Route) => setStack((pages) => [...pages, next]);
  /** Même page, autre onglet ou autre filtre : « Retour » n'y repasse pas. */
  const replace = (next: Route) => setStack((pages) => [...pages.slice(0, -1), next]);
  const goBack = () => setStack(back);
  /** Maillon du fil d'Ariane : dépile jusqu'à cette page si elle est dans la pile, sinon la remplace. */
  const openCrumb = (target: Route) => setStack((pages) => openFromCrumb(pages, target));

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [serverIcons, setServerIcons] = useState<Record<string, string>>({});
  const [feed, setFeed] = useState<SiteFeed>({ news: null, modes: null, maintenance: null, votes: null });
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  /** Mods du joueur d'une instance : celle de la page ouverte, sinon celle choisie. */
  const [personal, setPersonal] = useState<{ instance: string; mods: PersonalMod[] } | null>(null);
  const [personalError, setPersonalError] = useState<{ instance: string; message: string } | null>(null);
  /** Installations en cours (`instance:type:projet[:monde]`), gardées ici : elles survivent à un aller-retour dans Découvrir. */
  const [installing, setInstalling] = useState<ReadonlySet<string>>(new Set());
  const personalGeneration = useRef(0);
  const installingRef = useRef(new Set<string>());
  const [instances, setInstances] = useState<InstanceEntry[]>([]);
  const selectedInstance = stored?.selectedInstance ?? "clover";
  const [instanceDraft, setInstanceDraft] = useState<InstanceDraft | null>(null);

  // Jeux : un lancement à la fois, plusieurs instances ouvertes ensemble.
  const [launching, setLaunching] = useState<{ instance: string; progress?: Progress } | null>(null);
  const [launchError, setLaunchError] = useState<{ instance: string; message: string } | null>(null);
  const [running, setRunning] = useState<string[]>([]);
  /** Parties de toutes les instances, pour l'activité de la page Profil. */
  const [sessions, setSessions] = useState<PlaySession[] | null>(null);
  const [closing, setClosing] = useState<Record<string, "asked" | "slow">>({});
  const closingRef = useRef(closing);
  closingRef.current = closing;
  const playFor = useCallback(
    (id: string): PlayState =>
      launching?.instance === id ? { kind: "installing", progress: launching.progress }
      : running.includes(id) ? { kind: "running", closing: closing[id] }
      : { kind: "ready", error: launchError?.instance === id ? launchError.message : undefined, busy: launching !== null },
    [launching, launchError, running, closing],
  );
  const play = playFor(selectedInstance);
  /** `log` : fin de la sortie, affichée ; `full` : toute la sortie gardée, pour « Partager ». */
  const [crash, setCrash] = useState<{ instance: string; code: number | null; log: string; full: string } | null>(null);
  /** Instance dont la console montre la partie (la dernière lancée, ou celle choisie dans la console). */
  const [consoleInstance, setConsoleInstance] = useState("clover");
  const consoleInstanceRef = useRef(consoleInstance);
  const [gameLog, setGameLog] = useState<ConsoleSnapshot>({ session: -1, running: false, entries: [] });
  const gameLogRef = useRef(gameLog);
  const pulling = useRef<Promise<ConsoleSnapshot> | null>(null);

  const [skins, setSkins] = useState<{ library: SkinEntry[] }>({ library: [] });
  const [selectedSkin, setSelectedSkin] = useState<string | null>(null);
  const [skinStatus, setSkinStatus] = useState<SkinStatus | null>(null);

  const [update, setUpdate] = useState<UpdateState | null>(null);

  const [maximized, setMaximized] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  const refreshStored = useCallback(async () => setStored(await api.getStored()), []);
  const refreshInstances = useCallback(async () => {
    const [entries, current] = await Promise.all([api.listInstances(), api.getStored()]);
    setInstances(entries); setStored(current);
  }, []);
  const selectInstance = useCallback(async (id: string) => {
    await api.selectInstance(id);
    // Vidée seulement si l'instance change : l'effet qui recharge la liste suit `selectedInstance`
    // et ne repasserait pas pour la même instance.
    if (id !== selectedInstance) personalGeneration.current += 1;
    await refreshStored();
  }, [refreshStored, selectedInstance]);

  useEffect(() => { if (phase === "app") refreshInstances().catch((reason) => setNotice(String(reason))); }, [phase, refreshInstances]);

  // ── Démarrage : réglages, session du compte actif, puis l'écran qui convient ──
  useEffect(() => {
    (async () => {
      let restored: Profile | null = null;
      let error: string | null = null;
      try {
        restored = await api.restoreSession();
      } catch (reason) {
        error = String(reason);
      }
      try {
        const current = await api.getStored();
        setStored(current);
        setConsoleInstance(current.lastLaunchedInstance ?? "clover");
        // Fenêtre rechargée pendant une partie : les jeux ouverts restent suivis.
        setRunning(await api.runningGames().catch(() => []));
        setProfile(restored);
        if (!current.onboarded) setPhase("onboarding-accounts");
        else if (restored) setPhase("app");
        else {
          if (error) setLogin({ kind: "error", message: error });
          setPhase("signin");
        }
      } catch (reason) {
        setStartupError(String(reason));
        api.appReady().catch(() => {});
      }
    })();
    api.systemInfo().then(setSystem).catch(() => {});
    api.getCatalogue().then(setCatalogue).catch((reason) => setNotice(String(reason)));
    api.listSkins().then(setSkins).catch(() => {});
  }, []);

  // Premier écran prêt (session comprise) : la fenêtre de chargement laisse la place.
  const loaded = phase !== "loading" && Boolean(stored);
  useEffect(() => {
    if (loaded) api.appReady().catch(() => {});
  }, [loaded]);

  // ── Fenêtre sans cadre : état agrandi ──
  useEffect(() => {
    const appWindow = getCurrentWindow();
    appWindow.isMaximized().then(setMaximized).catch(() => {});
    const unlisten = appWindow.onResized(() => appWindow.isMaximized().then(setMaximized).catch(() => {}));
    return () => void unlisten.then((stop) => stop());
  }, []);

  // ── Console du jeu : nouvelles lignes après la dernière reçue ; tout est remplacé à chaque partie ──
  const pullConsole = useCallback(() => {
    pulling.current ??= (async () => {
      const current = gameLogRef.current;
      const instance = consoleInstanceRef.current;
      try {
        const next = await api.gameConsole(instance, current.entries[current.entries.length - 1]?.id ?? 0);
        // Console effacée ou instance changée pendant la requête : sa réponse remettrait d'autres lignes.
        if (gameLogRef.current !== current || consoleInstanceRef.current !== instance) return gameLogRef.current;
        const fresh = next.session !== current.session;
        if (!fresh && next.entries.length === 0 && next.running === current.running) return current;
        const entries = fresh ? next.entries : [...current.entries, ...next.entries];
        const updated = { session: next.session, running: next.running, entries: entries.slice(-CONSOLE_MAX_ENTRIES) };
        gameLogRef.current = updated;
        setGameLog(updated);
        return updated;
      } catch {
        return current;
      } finally {
        pulling.current = null;
      }
    })();
    return pulling.current;
  }, []);

  // Le cœur Rust vide aussi sa console : les lignes suivantes repartent de là, même au plantage.
  const clearConsole = useCallback(async () => {
    await api.clearConsole(consoleInstanceRef.current);
    const cleared = { ...gameLogRef.current, entries: [] };
    gameLogRef.current = cleared;
    setGameLog(cleared);
  }, []);

  // Autre instance : sa console repart de zéro.
  useEffect(() => {
    if (consoleInstanceRef.current === consoleInstance) return;
    consoleInstanceRef.current = consoleInstance;
    const empty = { session: -1, running: false, entries: [] };
    gameLogRef.current = empty;
    setGameLog(empty);
  }, [consoleInstance]);

  useEffect(() => {
    if (tab !== "console") return;
    pullConsole();
    const timer = window.setInterval(pullConsole, CONSOLE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [tab, pullConsole, consoleInstance]);

  // ── Installation et fin de partie ──
  useEffect(() => {
    const unlisten = [
      listen<Progress>("install-progress", ({ payload }) => setLaunching((current) => current && { ...current, progress: payload })),
      listen<GameExited>("game-exited", async ({ payload: { instance, code } }) => {
        setRunning((current) => current.filter((id) => id !== instance));
        const asked = instance in closingRef.current;
        setClosing(({ [instance]: _, ...rest }) => rest);
        // Serveurs rejoints pendant la partie.
        refreshStored();
        // Fermé par le joueur depuis le launcher : pas un plantage, même tué.
        if (code === 0 || asked) return;
        const log = await api.gameConsole(instance, 0).catch(() => null);
        const entries = log?.entries ?? [];
        setCrash({ instance, code, log: formatLog(entries.slice(-CRASH_LOG_ENTRIES)), full: formatLog(entries) });
      }),
    ];
    return () => unlisten.forEach((promise) => promise.then((stop) => stop()));
  }, [refreshStored, pullConsole]);

  // ── Statut du serveur ──
  useEffect(() => {
    if (!catalogue) return;
    let cancelled = false;
    let timer: number | undefined;
    const ping = async () => {
      const status = await api.serverStatus(catalogue.server.host).catch(() => null);
      if (cancelled) return;
      if (status) setServer(status);
      timer = window.setTimeout(ping, status?.online ? SERVER_POLL_MS : SERVER_RETRY_MS);
    };
    ping();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [catalogue]);

  // ── Contenu du site : une partie illisible garde la version précédente ──
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await api.siteFeed().catch(() => null);
      if (cancelled || !next) return;
      setFeed((previous) => ({
        news: next.news ?? previous.news,
        modes: next.modes ?? previous.modes,
        maintenance: next.maintenance ?? previous.maintenance,
        votes: next.votes ?? previous.votes,
      }));
    };
    refresh();
    const timer = window.setInterval(refresh, SITE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // ── Apparence : taille de l'interface et animations ──
  const settings = stored?.settings;
  const retentionDays = settings?.logRetentionDays;
  useEffect(() => {
    if (!settings) return;
    getCurrentWebview().setZoom(settings.scale / 100).catch(() => {});
    document.documentElement.classList.toggle("reduce-motion", settings.animations === "reduced");
    document.documentElement.dataset.accent = accent(settings.accent);
    document.documentElement.dataset.corners = settings.corners === "square" ? "square" : "rounded";
  }, [settings?.scale, settings?.animations, settings?.accent, settings?.corners]);

  // ── Rapports de plantage de l'interface : démarrés ou arrêtés selon l'accord du joueur ──
  useEffect(() => {
    if (settings && system) setCrashReports(settings.crashReports, system.crash, settings.betaChannel);
  }, [settings?.crashReports, settings?.betaChannel, system]);

  // ── Mise à jour du launcher : vérifiée au démarrage puis toutes les 6 h (le launcher peut rester des
  // jours dans la zone de notification), installée d'office si le réglage le demande et sans partie ──
  const installUpdate = useCallback(async () => {
    setUpdate((current) => current && { ...current, installing: true, ratio: null, error: undefined });
    try {
      await api.installUpdate();
    } catch (reason) {
      setUpdate((current) => current && { ...current, installing: false, error: String(reason) });
    }
  }, []);

  // Le serveur change de version (26.2 → 26.4) : l'instance Clover suit d'office, on le dit une fois.
  const serverVersion = catalogue?.minecraft.version;
  useEffect(() => {
    if (!serverVersion) return;
    api
      .noteServerVersion(serverVersion)
      .then((previous) => {
        if (previous) setNotice(`Clover Games passe de Minecraft ${previous} à ${serverVersion} : l'instance Clover Games se met à jour au prochain lancement. Tes mondes et tes réglages sont gardés.`);
      })
      .catch(() => {});
  }, [serverVersion]);

  // Canal bêta changé : manifeste et mise à jour du nouveau canal, une fois le réglage enregistré.
  const channel = settings?.betaChannel;
  const firstChannel = useRef(true);
  useEffect(() => {
    if (channel === undefined) return;
    if (firstChannel.current) {
      firstChannel.current = false;
      return;
    }
    const timer = window.setTimeout(() => api.getCatalogue().then(setCatalogue).catch((reason) => setNotice(String(reason))), SETTINGS_SAVED_MS);
    return () => window.clearTimeout(timer);
  }, [channel]);

  const autoUpdate = useRef(false);
  const offered = useRef<string | null>(null);
  autoUpdate.current = Boolean(settings?.autoUpdate) && running.length === 0;
  const settingsReady = Boolean(settings);
  useEffect(() => {
    if (!settingsReady) return;
    const check = () =>
      api
        .checkUpdate()
        .then((info) => {
          // Une version déjà proposée ne l'est pas deux fois.
          if (!info || info.version === offered.current) return;
          offered.current = info.version;
          setUpdate({ info, installing: false, ratio: null });
          if (autoUpdate.current) installUpdate();
        })
        // CDN injoignable ou aucune version publiée : nouvel essai à la prochaine vérification.
        .catch(() => {});
    // Après l'enregistrement du réglage : un changement de canal vérifie le nouveau canal.
    const first = window.setTimeout(check, SETTINGS_SAVED_MS);
    const timer = window.setInterval(check, UPDATE_POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [settingsReady, channel, installUpdate]);

  useEffect(() => {
    const unlisten = listen<{ done: number; total: number | null }>("update-progress", ({ payload }) =>
      setUpdate((current) => current && { ...current, ratio: payload.total ? payload.done / payload.total : null }),
    );
    return () => void unlisten.then((stop) => stop());
  }, []);

  useEffect(() => {
    if (tab === "settings" && settingsTab === "storage" && retentionDays !== undefined) api.storageUsage(retentionDays).then(setStorage).catch(() => {});
  }, [tab, settingsTab, retentionDays]);

  // ── Notifications du site ──
  const [notifications, setNotifications] = useState<LauncherNotification[]>([]);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  /** Déjà vues : seules les nouvelles font une bulle du système. `null` avant la première relève. */
  const seenNotifications = useRef<Set<string> | null>(null);
  const desktopNotifications = useRef(true);
  desktopNotifications.current = settings?.systemNotifications ?? true;
  const signedIn = phase === "app" && Boolean(profile);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer = 0;
    seenNotifications.current = null;
    const poll = async () => {
      try {
        const feed = await api.notifications();
        if (cancelled) return;
        const items: LauncherNotification[] = feed.linked ? feed.items.map((item) => ({ ...item, source: item.source ?? "site" })) : [LINK_NOTIFICATION];
        const seen = seenNotifications.current;
        const away = document.hidden || !document.hasFocus();
        if (seen && away && desktopNotifications.current) {
          for (const item of items.filter((entry) => !entry.read && !seen.has(entry.id))) void api.systemNotification(item.title, item.message).catch(() => {});
        }
        seenNotifications.current = new Set(items.map((item) => item.id));
        setNotifications(items);
        setNotificationsError(null);
      } catch (reason) {
        // Site injoignable ou session refusée : la cloche garde sa liste et dit pourquoi.
        if (!cancelled) setNotificationsError(String(reason));
      }
      if (!cancelled) timer = window.setTimeout(poll, document.hidden ? NOTIFICATIONS_HIDDEN_POLL_MS : NOTIFICATIONS_POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [signedIn, profile?.uuid]);

  const openNotification = (item: LauncherNotification) => {
    if (item.url) open(item.url.startsWith("/") ? `${SITE_URL}${item.url}` : item.url);
    if (item.id === LINK_NOTIFICATION.id || item.read) return;
    setNotifications((items) => items.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)));
    api.markNotificationsRead([item.id]).catch(() => {});
  };
  const readAllNotifications = () => {
    setNotifications((items) => items.map((entry) => (entry.id === LINK_NOTIFICATION.id ? entry : { ...entry, read: true })));
    if (notifications.some((entry) => entry.id !== LINK_NOTIFICATION.id && !entry.read)) api.markNotificationsRead().catch(() => {});
  };

  // ── Dossier du launcher : déplacé puis redémarrage ──
  const [moving, setMoving] = useState<number | null>(null);
  useEffect(() => {
    const unlisten = listen<number>("move-progress", ({ payload }) => setMoving(payload));
    return () => void unlisten.then((stop) => stop());
  }, []);
  const changeGameDir = async () => {
    const chosen = await api.pickGameDir().catch(() => null);
    if (!chosen) return;
    setMoving(0);
    try {
      await api.moveGameDir(chosen);
    } catch (reason) {
      setNotice(String(reason));
    } finally {
      setMoving(null);
    }
  };

  // Steam : état relu toutes les 3 s sur l'onglet Intégrations, le joueur doit souvent le fermer.
  const [steam, setSteam] = useState<SteamState>("absent");
  useEffect(() => {
    if (tab !== "settings" || settingsTab !== "integrations") return;
    const refresh = () => api.steamStatus().then(setSteam).catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => window.clearInterval(timer);
  }, [tab, settingsTab]);

  const refreshPersonalMods = useCallback((instance: string) => {
    const request = ++personalGeneration.current;
    return api.personalMods(instance).then((mods) => { if (request === personalGeneration.current) { setPersonal({ instance, mods }); setPersonalError(null); } })
      .catch((reason) => { if (request === personalGeneration.current) { setPersonalError({ instance, message: String(reason) }); setNotice(String(reason)); } });
  }, []);
  /** Instance dont les mods comptent : celle de la page ouverte, sinon celle que « Jouer » lance. */
  const modsInstance = current.tab === "instances" && current.instance ? current.instance : selectedInstance;
  const modsKind = instances.find((entry) => entry.id === modsInstance)?.kind;
  const modsOf = (instance: string) => (personal?.instance === instance ? personal.mods : null);

  useEffect(() => {
    if ((tab === "instances" || tab === "home") && modsKind && modsKind !== "vanilla") refreshPersonalMods(modsInstance);
  }, [tab, modsInstance, modsKind, refreshPersonalMods]);

  /** Réglage modifié : appliqué tout de suite, enregistré peu après (le curseur de mémoire bouge vite). */
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setStored((current) => {
      if (!current) return current;
      const next = { ...current, settings: { ...current.settings, ...patch } };
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => api.saveSettings(next.settings).catch((reason) => setNotice(String(reason))), 300);
      return next;
    });
  }, []);

  // ── Comptes ──
  const addAccount = async () => {
    setLogin({ kind: "waiting" });
    try {
      const added = await api.login();
      await refreshStored();
      setProfile((current) => current ?? added);
      setLogin({ kind: "idle" });
    } catch (reason) {
      setLogin({ kind: "error", message: String(reason) });
    }
  };

  const useAccount = async (uuid: string) => {
    try {
      setProfile(await api.useAccount(uuid));
      await refreshStored();
    } catch (reason) {
      setNotice(String(reason));
    }
  };

  const [renaming, setRenaming] = useState(false);
  const changeName = async (name: string) => {
    setProfile(await api.changeName(name));
    await refreshStored();
    setRenaming(false);
    setNotice(`Ton pseudo est maintenant ${name}.${running.length > 0 ? " Relance Minecraft pour jouer sous ce pseudo." : ""}`);
  };

  const removeAccount = async (uuid: string) => {
    try {
      const next = await api.removeAccount(uuid);
      setProfile(next);
      await refreshStored();
      if (!next && phase === "app") setPhase("signin");
    } catch (reason) {
      setNotice(String(reason));
    }
  };

  const accounts: Account[] = (stored?.accounts ?? []).map((account) => ({
    profile: { uuid: account.uuid, name: account.name },
    skin: account.skinUrl,
    active: account.uuid === stored?.activeAccount,
  }));

  // ── Jeu ──
  const startGame = useCallback(async (instance: string, start: () => Promise<void>) => {
    setLaunching({ instance });
    setLaunchError(null);
    try {
      await start();
      setConsoleInstance(instance);
    } catch (reason) {
      setLaunchError({ instance, message: String(reason) });
      setNotice(String(reason));
    } finally {
      // Relu plutôt que supposé : le jeu a pu se fermer avant la fin de `play`.
      setRunning(await api.runningGames().catch(() => []));
      setLaunching(null);
    }
  }, []);

  // ── Raccourci d'instance sur le bureau ou lien clover:// : la partie se lance dès que le compte est prêt ──
  const launchReady = phase === "app" && Boolean(profile);
  useEffect(() => {
    if (!launchReady) return;
    const take = () =>
      api
        .takeLaunchRequest()
        .then((request) => {
          if (request?.kind === "instance") void startGame(request.id, () => selectInstance(request.id).then(() => api.playInstance(request.id)));
          if (request?.kind === "mode") void startGame("clover", () => selectInstance("clover").then(() => api.play(request.id)));
        })
        .catch((reason) => setNotice(String(reason)));
    void take();
    const unlisten = listen("launch-request", () => void take());
    return () => void unlisten.then((stop) => stop());
  }, [launchReady, startGame, selectInstance]);

  /** « Fermer » : comme la croix de la fenêtre du jeu ; sans réponse, « Forcer » le tue. */
  const stopGame = useCallback(async (instance: string, force: boolean) => {
    setClosing((current) => ({ ...current, [instance]: "asked" }));
    try {
      const sent = await api.stopGame(instance, force);
      if (force) return;
      if (!sent) {
        setClosing((current) => ({ ...current, [instance]: "slow" }));
        return;
      }
      window.setTimeout(() => setClosing((current) => (current[instance] === "asked" ? { ...current, [instance]: "slow" } : current)), CLOSE_GRACE_MS);
    } catch (reason) {
      setClosing(({ [instance]: _, ...rest }) => rest);
      setNotice(String(reason));
    }
  }, []);

  const trayAvailable = phase === "app" && Boolean(profile && stored);
  const trayReady = play.kind === "ready" && !play.busy;
  useEffect(() => {
    let cancelled = false;
    const unlisten = listen<"play" | "instances" | "settings">("tray-action", ({ payload }) => {
      if (!trayAvailable) return;
      if (payload === "play") {
        if (!trayReady) return;
        navigate("home");
        void startGame(selectedInstance, () => api.playInstance(selectedInstance));
      } else if (payload === "instances" || payload === "settings") {
        navigate(payload);
      }
    });
    // Enable the native shortcuts only after their listener is ready.
    void unlisten.then(() => {
      if (!cancelled) return api.setTrayState(trayAvailable, trayReady);
    }).catch((reason) => console.error("[tray]", reason));
    return () => {
      cancelled = true;
      void unlisten.then((stop) => stop());
    };
  }, [trayAvailable, trayReady, selectedInstance, navigate, startGame]);

  const defaultMods = useMemo(() => (catalogue?.mods ?? []).filter((mod) => mod.default && !mod.hidden && mod.available).map((mod) => mod.id), [catalogue]);
  // Le catalogue est celui de l'instance dont on ouvre la page, pas de l'instance sélectionnée.
  const enabledIdsOf = (instanceId: string) =>
    (instanceId === "clover" ? settings?.enabledMods : instances.find((entry) => entry.id === instanceId)?.enabledMods) ?? defaultMods;
  const modInfosOf = (instanceId: string): ModInfo[] => {
    const enabledIds = enabledIdsOf(instanceId);
    return (catalogue?.mods ?? [])
      .filter((mod) => !mod.hidden && mod.category)
      .map((mod) => ({
        id: mod.id,
        name: mod.name,
        description: mod.description ?? "",
        category: mod.category!,
        version: mod.version,
        icon: mod.icon,
        available: mod.available,
        enabled: enabledIds.includes(mod.id),
      }));
  };

  const toggleMod = (instanceId: string, id: string, enabled: boolean) => {
    const enabledIds = enabledIdsOf(instanceId);
    const next = enabled ? [...new Set([...enabledIds, id])] : enabledIds.filter((other) => other !== id);
    if (instanceId === "clover") updateSettings({ enabledMods: next });
    else {
      setInstances((entries) => entries.map((entry) => entry.id === instanceId ? { ...entry, enabledMods: next } : entry));
      api.setInstanceCatalogue(next, instanceId).then(refreshInstances).catch((reason) => setNotice(String(reason)));
    }
  };

  // ── Import depuis les autres launchers : nouvelle recherche à chaque ouverture ──
  /**
   * La première ouverture anime la recherche. Les suivantes affichent tout de suite le dernier
   * résultat et le remplacent quand la nouvelle recherche répond : le cœur Rust ne relit que les mods
   * ajoutés ou modifiés depuis, la mise à jour est presque immédiate.
   */
  const detection = useRef(0);
  const openImport = (next: "onboarding-import" | "import", target: "clover" | "instance" = "clover") => {
    const request = ++detection.current;
    setImportTarget(target);
    setPhase(next);
    setImportScan({ found: [], identifying: null });
    api
      .detectInstallations()
      .then((found) => {
        if (request !== detection.current) return;
        setDetected(found);
        setImportSelected((current) => (found.some((entry) => entry.id === current) ? current : (found[0]?.id ?? null)));
      })
      .catch((reason) => {
        if (request !== detection.current) return;
        setDetected((current) => current ?? []);
        setNotice(String(reason));
      });
  };

  useEffect(() => {
    type ScanEvent = { kind: "installation"; launcher: string; name: string; mods: number } | { kind: "identify"; mods: number };
    const unlisten = [
      listen<number>("import-progress", ({ payload }) => setImporting((current) => current && { ...current, ratio: payload })),
      listen<ScanEvent>("import-scan", ({ payload }) =>
        setImportScan((scan) =>
          payload.kind === "identify"
            ? { ...scan, identifying: payload.mods }
            : { ...scan, found: [...scan.found, { launcher: payload.launcher, name: payload.name, mods: payload.mods }] },
        ),
      ),
    ];
    return () => unlisten.forEach((promise) => void promise.then((stop) => stop()));
  }, []);

  const runImport = async () => {
    const instance = detected?.find((entry) => entry.id === importSelected);
    if (!instance || importing) return;
    setImporting({ id: instance.id, ratio: 0 });
    if (importTarget === "instance") {
      try {
        await api.importAsInstance(instance.id, importChoices);
        setImportedInstances((done) => [...done.filter((id) => id !== instance.id), instance.id]);
        await refreshInstances();
        setNotice(`Instance « ${instance.name} » créée.`);
      } catch (reason) {
        setNotice(String(reason));
      } finally {
        setImporting(null);
      }
      return;
    }
    try {
      const result = await api.importInstallation(instance.id, importChoices);
      // Les mods ne sont pas copiés : leurs équivalents du catalogue sont activés pour Clover Games.
      const current = settings?.enabledMods ?? defaultMods;
      const added = importChoices.mods ? instance.catalogueMods.map((mod) => mod.id).filter((id) => !current.includes(id)) : [];
      if (added.length > 0) updateSettings({ enabledMods: [...current, ...added] });
      const summary = importSummary(instance, result, added.length);
      if (result.dependenciesUnchecked) setNotice("Modrinth ne répond pas : les dépendances des mods copiés n'ont pas été vérifiées. Relance l'import plus tard.");
      else if (result.missingDependencies > 0)
        setNotice(`${result.missingDependencies} dépendance${result.missingDependencies > 1 ? "s" : ""} de tes mods n'existe${result.missingDependencies > 1 ? "nt" : ""} pas pour cette version de Minecraft : désactive les mods signalés si le jeu plante.`);
      setImports((done) => [...done.filter((entry) => entry.id !== instance.id), { id: instance.id, summary }]);
    } catch (reason) {
      setNotice(String(reason));
    } finally {
      setImporting(null);
    }
  };

  // ── Mods du joueur ──
  const togglePersonalMod = (instance: string, id: string, enabled: boolean) => {
    setPersonal((all) => all && all.instance === instance ? { instance, mods: all.mods.map((mod) => (mod.id === id ? { ...mod, enabled } : mod)) } : all);
    api.setPersonalModEnabled(id, enabled, instance).catch((reason) => setNotice(String(reason)));
  };

  /** Ajoute les fichiers un par un : un .jar refusé n'empêche pas les autres d'être ajoutés. */
  const addPersonalMods = async (instance: string, files: File[]) => {
    const errors: string[] = [];
    const added: string[] = [];
    for (const file of files) await api.addPersonalMod(file, instance).then(() => added.push(file.name), (reason) => errors.push(String(reason)));
    // Un mod qui exige Fabric API, Cloth Config… planterait sans elles : elles viennent de Modrinth.
    if (added.length > 0) {
      await api
        .installPersonalDependencies(added, instance)
        .then(({ missing }) => {
          if (missing.length > 0) errors.push(`Dépendances introuvables pour cette version de Minecraft : ${missing.join(", ")}. Le jeu risque de planter avec ces mods.`);
        })
        .catch((reason) => errors.push(`Dépendances non vérifiées : ${reason}`));
    }
    if (errors.length > 0) setNotice(errors.join(" "));
    await refreshPersonalMods(instance);
  };

  /** Onglet Mods de la page d'une instance : le catalogue Clover pour Clover Games, puis les mods du joueur. */
  const modsTab = (entry: InstanceEntry) => (
    <InstanceMods
      catalogue={entry.kind === "clover" ? modInfosOf(entry.id) : undefined}
      personal={modsOf(entry.id)}
      error={personalError?.instance === entry.id ? personalError.message : null}
      onRetry={() => void refreshPersonalMods(entry.id)}
      minecraftVersion={entry.minecraft ?? catalogue?.minecraft.version ?? ""}
      onToggle={(id, enabled) => toggleMod(entry.id, id, enabled)}
      onTogglePersonal={(id, enabled) => togglePersonalMod(entry.id, id, enabled)}
      onUpdatePersonal={(id) => changePersonalMod(entry.id, api.updatePersonalMods(id, entry.id))}
      onRemovePersonal={(id) => changePersonalMod(entry.id, api.removePersonalMod(id, entry.id))}
      onAddFiles={(files) => void addPersonalMods(entry.id, files)}
      onUpdateAll={() => changePersonalMod(entry.id, api.updatePersonalMods(null, entry.id))}
      onAdd={() => push({ tab: "discover", kind: "mod", target: entry.id })}
      onOpen={(mod) => push({ tab: "instances", instance: entry.id, section: "mods", mod })}
    />
  );

  /** Ouvre Découvrir sur `kind`, pour `target` (l'instance choisie sans elle) ; `world` : monde d'un datapack. */
  const openDiscover = (kind: ContentKind, target?: string, world?: string) => push({ tab: "discover", kind, target, world });

  /** Noms du fil d'Ariane. */
  const names: Names = {
    tab: (id) => TAB_LABELS[id],
    instance: (id) => instances.find((entry) => entry.id === id)?.name ?? "Instance",
    section: sectionLabel,
    kind: (kind) => CONTENT_KINDS[kind].label,
    mod: (mod) => (mod.list === "catalogue" ? modInfosOf("clover").find((other) => other.id === mod.id)?.name : personal?.mods.find((other) => other.id === mod.id)?.name) ?? "Mod",
  };

  /** Fichiers posés pendant la création d'une instance depuis un modpack. */
  const [modpackProgress, setModpackProgress] = useState<[number, number] | null>(null);
  /** Octets reçus et attendus du monde en cours de téléchargement. */
  const [worldProgress, setWorldProgress] = useState<[number, number] | null>(null);
  /** Change après chaque installation : la page de l'instance relit son dossier. */
  const [contentRevision, setContentRevision] = useState(0);
  useEffect(() => {
    const modpack = listen<[number, number]>("modpack-progress", ({ payload }) => setModpackProgress(payload));
    const world = listen<[number, number]>("world-progress", ({ payload }) => setWorldProgress(payload));
    return () => {
      void modpack.then((stop) => stop());
      void world.then((stop) => stop());
    };
  }, []);
  const worlds = useCallback((instance: string) => api.instanceContent(instance, "saves"), []);
  /** Mondes sur CurseForge, tout le reste sur Modrinth. */
  const searchContent = useCallback(
    (kind: ContentKind, query: string, filters: SearchFilters, offset: number, instance: string) =>
      kind === "world" ? api.searchWorlds(query, filters, offset, instance) : api.searchModrinth(kind, query, filters, offset, instance),
    [],
  );
  const contentPage = useCallback((kind: ContentKind, project: string) => (kind === "world" ? api.worldPage(project) : api.modrinthProject(project)), []);
  /** Projets Modrinth déjà installés : « Mes mods », ou packs du dossier (d'un monde pour les datapacks). */
  const installedProjects = useCallback(async (kind: ContentKind, instance: string, world?: string) => {
    if (kind === "mod") return (await api.personalMods(instance)).flatMap((mod) => (mod.projectId ? [mod.projectId] : []));
    const folder = kind === "shader" ? "shaderpacks" : kind === "resourcepack" ? "resourcepacks" : kind === "datapack" ? "datapacks" : null;
    if (!folder) return [];
    const list = await api.instanceContent(instance, folder);
    return list.flatMap((entry) => (entry.projectId && (kind !== "datapack" || entry.world === world) ? [entry.projectId] : []));
  }, []);
  /** Modpack d'un fichier : l'instance créée devient l'instance choisie. */
  const importModpackFile = async () => {
    setModpackProgress(null);
    try {
      const result = await api.importModpackFile();
      if (result) {
        await refreshInstances();
        setContentRevision((value) => value + 1);
      }
      return result;
    } finally {
      setModpackProgress(null);
    }
  };
  /**
   * Installe dans `instance`, choisie dans la recherche : pas forcément celle choisie dans le
   * launcher. Un monde renvoie le nom de son dossier, pour y jouer aussitôt.
   */
  const installFromModrinth = async (kind: ContentKind, project: string, instance: string, world?: string, version?: string): Promise<string | void> => {
    const key = installKey(kind, project, instance, world);
    if (installingRef.current.has(key)) return;
    installingRef.current.add(key);
    setInstalling(new Set(installingRef.current));
    try {
      return await installContent(kind, project, instance, world, version);
    } finally {
      installingRef.current.delete(key);
      setInstalling(new Set(installingRef.current));
    }
  };
  const installContent = async (kind: ContentKind, project: string, instance: string, world?: string, version?: string): Promise<string | void> => {
    const target = instances.find((entry) => entry.id === instance);
    if (kind === "world") {
      setWorldProgress(null);
      try {
        const folder = await api.installWorld(project, instance);
        setContentRevision((value) => value + 1);
        return folder;
      } finally {
        setWorldProgress(null);
      }
    }
    if (kind === "mod") {
      await api.installModrinthMod(project, instance);
      if (instance === modsInstance) await refreshPersonalMods(instance);
    } else if (kind === "modpack") {
      setModpackProgress(null);
      try {
        await api.installModpack(project, version);
      } finally {
        setModpackProgress(null);
      }
      await refreshInstances();
    } else {
      await api.installModrinthContent(kind, project, world, instance);
      // Les shaders passent par Iris : activé dans le catalogue Clover, installé d'office ailleurs.
      const cloverMods = settings?.enabledMods ?? defaultMods;
      if (kind === "shader" && instance === "clover" && !cloverMods.includes("iris")) updateSettings({ enabledMods: [...cloverMods, "iris"] });
      if (kind === "shader" && ownLoader(target?.kind) && instance === modsInstance) await refreshPersonalMods(instance);
    }
    setContentRevision((value) => value + 1);
  };

  /** Version et type d'une instance personnelle ; Clover Games suit le manifeste. */
  const editInstance = (entry: InstanceEntry) => {
    if (entry.id === "clover") return;
    const { name, kind, minecraft, loader, separate, memoryMb } = entry;
    setInstanceDraft({ id: entry.id, input: { name, kind, minecraft, loader, separate, memoryMb } });
  };

  const saveInstance = async (id: string | null, input: InstanceInput) => {
    await selectInstance(await api.saveInstance(id, input));
    await refreshInstances();
    setInstanceDraft(null);
  };

  const changePersonalMod = (instance: string, action: Promise<unknown>) =>
    action.then(() => refreshPersonalMods(instance)).catch((reason) => setNotice(String(reason)));

  // Serveurs Clover Games exclus : l'adresse du serveur, celles des modes et leurs sous-domaines.
  const cloverHosts = catalogue ? [catalogue.server.host, ...catalogue.modes.flatMap((mode) => mode.host ?? [])] : [];
  const isClover = (address: string) => {
    const host = address.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
    return cloverHosts.some((clover) => host === clover || host.endsWith(`.${clover}`));
  };
  const recentOthers = catalogue ? (stored?.recentServers ?? []).filter((server) => !isClover(server.address)).slice(0, 3) : [];
  // Nom donné dans le launcher, sinon celui du jeu (souvent « Serveur Minecraft » sans nom choisi en jeu).
  const otherServers = recentOthers.map((server) => ({ ...server, name: stored?.serverNames?.[server.address.toLowerCase()] ?? server.name, icon: serverIcons[server.address] ?? null }));
  const renameServer = async (address: string, name: string) => {
    await api.renameServer(address, name);
    await refreshStored();
  };

  // Icônes des autres serveurs : celle que le serveur renvoie au ping, comme dans la liste du jeu.
  // Adresses jointes en une clé stable pour l'effet ; une adresse ne contient jamais d'espace.
  const otherAddresses = recentOthers.map((server) => server.address).join(" ");
  useEffect(() => {
    let cancelled = false;
    for (const address of otherAddresses.split(" ").filter(Boolean)) {
      api
        .serverStatus(address)
        .then(({ favicon }) => !cancelled && favicon && setServerIcons((icons) => ({ ...icons, [address]: favicon })))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [otherAddresses]);

  // Relu quand la liste des instances change ou qu'une partie se termine.
  const instanceIds = instances.map((entry) => entry.id).join("|");
  const runningCount = running.length;
  useEffect(() => {
    if (!instanceIds) return;
    let alive = true;
    Promise.all(instanceIds.split("|").map((id) => api.playHistory(id).catch(() => [] as PlaySession[])))
      .then((lists) => alive && setSessions(lists.flat()))
      .catch(() => alive && setSessions([]));
    return () => {
      alive = false;
    };
  }, [instanceIds, runningCount]);

  // ── Skins ──
  const activeCape = profile?.capes?.find((cape) => cape.active);
  const look: SkinLook = {
    texture: profile?.skin?.url ?? "",
    model: profile?.skin?.model ?? "classic",
    cape: activeCape ? toCape(activeCape) : null,
  };

  /** Skin porté avant un changement : l'annulation le remet (texture de Mojang, acceptée telle quelle). */
  const wornBefore = () => (profile?.skin ? { texture: profile.skin.url, model: profile.skin.model } : null);

  const restoreSkin = async (previous: { texture: string; model: SkinModel }, previousId: string | null) => {
    setSkinStatus({ kind: "busy", message: "Retour à ton skin précédent…" });
    try {
      setProfile(await api.applySkin(previous.texture, previous.model, activeCape?.id ?? null));
      await refreshStored();
      setSelectedSkin(previousId);
      setSkinStatus({ kind: "done", message: "Skin précédent remis sur ton compte." });
    } catch (reason) {
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  const applySkin = async (skin: SavedSkin) => {
    const previous = wornBefore();
    const previousId = selectedSkin;
    setSelectedSkin(skin.id);
    setSkinStatus({ kind: "busy", message: `Application de « ${skin.name} » sur ton compte…` });
    try {
      setProfile(await api.applySkin(skin.texture, skin.model, activeCape?.id ?? null));
      await refreshStored();
      setSkinStatus({
        kind: "done",
        message: `« ${skin.name} » est porté sur ton compte.`,
        undo: previous ? () => void restoreSkin(previous, previousId) : undefined,
      });
    } catch (reason) {
      setSelectedSkin(previousId);
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  /** Skin de la Découverte ou du compte : rangé dans la bibliothèque, puis porté si demandé. */
  const addRemoteSkin = async (skin: { texture: string; model: SkinModel; name: string }, wear: boolean) => {
    try {
      const entry = await api.addRemoteSkin(skin.texture, skin.name, skin.model);
      setSkins(await api.listSkins());
      if (wear) await applySkin(entry);
      else setSkinStatus({ kind: "done", message: `« ${entry.name} » ajouté à Mes skins.` });
    } catch (reason) {
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  const wearCape = async (cape: Cape | null, undoable = true) => {
    const previous = activeCape ? toCape(activeCape) : null;
    setSkinStatus({ kind: "busy", message: cape ? `Application de la cape « ${ownedCapeText(cape.name).name} »…` : "Retrait de la cape…" });
    try {
      setProfile(await api.applySkin(look.texture, look.model, cape?.id ?? null));
      await refreshStored();
      setSkinStatus({
        kind: "done",
        message: cape ? `Cape « ${ownedCapeText(cape.name).name} » portée.` : "Cape enlevée.",
        undo: undoable ? () => void wearCape(previous, false) : undefined,
      });
    } catch (reason) {
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  const addSkinFile = async (file: File) => {
    try {
      const entry = await api.addSkin(new Uint8Array(await file.arrayBuffer()), file.name, "classic");
      setSkins(await api.listSkins());
      setSkinStatus({ kind: "done", message: `« ${entry.name} » ajouté à Mes skins.` });
    } catch (reason) {
      setSkinStatus({ kind: "error", message: `${file.name} : ${String(reason)}` });
    }
  };

  const renameSkin = async (skin: SavedSkin, name: string) => {
    try {
      const kept = await api.renameSkin(skin.id, name);
      setSkins((current) => ({ ...current, library: current.library.map((entry) => (entry.id === skin.id ? { ...entry, name: kept } : entry)) }));
      setSkinStatus(null);
    } catch (reason) {
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  /** Retiré de la bibliothèque locale ; l'annulation le remet depuis sa texture, gardée en mémoire. */
  const removeSkin = async (skin: SavedSkin) => {
    try {
      await api.removeSkin(skin.id);
      setSkins(await api.listSkins());
      setSkinStatus({
        kind: "done",
        message: `« ${skin.name} » retiré de Mes skins.`,
        undo: () => void addRemoteSkin(skin, false),
      });
    } catch (reason) {
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  const exportSkin = async (skin: { texture: string; name: string }) => {
    try {
      const path = await api.exportSkin(skin.texture, skin.name);
      if (path) setSkinStatus({ kind: "done", message: `Skin enregistré : ${path}` });
    } catch (reason) {
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  /** Bras du skin porté, changés directement sur le compte ; annulable. */
  const wearModel = async (model: SkinModel, undoable = true) => {
    const previous = look.model;
    const arms = model === "slim" ? "fins" : "classiques";
    setSkinStatus({ kind: "busy", message: `Passage aux bras ${arms}…` });
    try {
      setProfile(await api.applySkin(look.texture, model, activeCape?.id ?? null));
      await refreshStored();
      setSkinStatus({ kind: "done", message: `Bras ${arms} appliqués à ton skin.`, undo: undoable ? () => void wearModel(previous, false) : undefined });
    } catch (reason) {
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  /** Bras d'un skin de la bibliothèque, choisis pendant son essai : gardés pour la prochaine fois. */
  const setSkinModel = async (skin: SavedSkin, model: SkinModel) => {
    setSkins((current) => ({ ...current, library: current.library.map((entry) => (entry.id === skin.id ? { ...entry, model } : entry)) }));
    try {
      await api.setSkinModel(skin.id, model);
    } catch (reason) {
      setSkins(await api.listSkins());
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  // ── Rendu ──
  const appWindow = getCurrentWindow();
  const chrome = {
    maximized,
    onMinimize: () => void appWindow.minimize(),
    onToggleMaximize: () => void appWindow.toggleMaximize(),
    onClose: () => void appWindow.close(),
  };
  const open = (url: string) => void openUrl(url).catch((reason) => setNotice(`Le lien n'a pas pu être ouvert : ${reason}`));
  /** Article ouvert dans le lecteur (blog ou note de version), depuis l'accueil ou les Actualités. */
  const [reading, setReading] = useState<ReaderTarget | null>(null);

  if (startupError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-10 text-center">
        <h1 className="font-display text-[26px] leading-none">Le launcher n'a pas pu démarrer</h1>
        <p className="max-w-[520px] text-sm text-muted-foreground">{startupError}</p>
        <button type="button" onClick={() => window.location.reload()} className="mc-frame bg-card px-4 py-2 text-sm font-semibold">
          Recharger
        </button>
      </div>
    );
  }
  if (phase === "loading" || !stored || !settings) {
    return <div className="h-full bg-background" />;
  }

  const noticeToast = notice && (
    <div role="alert" className="mc-frame flex max-w-[420px] items-start gap-3 bg-card px-4 py-3 text-[13px] shadow-[0_12px_32px_rgb(0_0_0/0.5)]">
      <p className="flex-1 leading-snug">{notice}</p>
      <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
        Fermer
      </button>
    </div>
  );

  if (phase !== "app") {
    const onboarding = phase === "onboarding-accounts" || phase === "onboarding-import" || phase === "onboarding-done";
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <TitleBar {...chrome} />
        {phase === "onboarding-import" || phase === "import" ? (
          <OnboardingImport
            standalone={phase === "import"}
            target={phase === "import" ? importTarget : "clover"}
            instances={detected}
            scan={importScan}
            selectedId={importSelected}
            onSelect={setImportSelected}
            choices={importChoices}
            onChoice={(item, value) => setImportChoices((choices) => ({ ...choices, [item]: value }))}
            importing={importing}
            imported={phase === "import" && importTarget === "instance" ? importedInstances : imports.map((entry) => entry.id)}
            onImport={() => void runImport()}
            onBack={() => setPhase("onboarding-accounts")}
            onContinue={() => {
              setPhase(phase === "import" ? "app" : "onboarding-done");
              if (phase === "import" && importTarget === "instance") navigate("instances");
            }}
          />
        ) : phase === "onboarding-done" ? (
          <OnboardingDone
            accounts={accounts}
            imports={imports.map((entry) => entry.summary)}
            machine={{
              summary: system ? machineSummary(system) : "Configuration détectée au premier lancement",
              preset: system && catalogue?.presets?.[system.machine.level] ? LEVEL_LABEL[system.machine.level] : undefined,
              memoryGb: settings.memoryAuto ? (system?.autoMemoryGb ?? 4) : settings.memoryGb,
            }}
            crashReports={settings.crashReports}
            onCrashReports={(crashReports) => updateSettings({ crashReports })}
            onBack={() => setPhase("onboarding-import")}
            busy={starting}
            onStart={async () => {
              if (starting) return;
              setStarting(true);
              try {
                await api.finishOnboarding();
                await refreshStored();
                setPhase("app");
              } catch (reason) {
                setNotice(String(reason));
              } finally {
                setStarting(false);
              }
            }}
          />
        ) : (
          <OnboardingAccounts
            standalone={!onboarding}
            accounts={accounts}
            login={login}
            onAdd={addAccount}
            onMakeMain={useAccount}
            onRemove={removeAccount}
            onContinue={async () => {
              if (onboarding) return openImport("onboarding-import");
              try {
                const restored = await api.restoreSession();
                if (restored) {
                  setProfile(restored);
                  setPhase("app");
                }
              } catch (reason) {
                setLogin({ kind: "error", message: String(reason) });
              }
            }}
          />
        )}
        <div className="fixed right-4 bottom-4 z-50">{noticeToast}</div>
      </div>
    );
  }

  const activeAccount = stored.accounts.find((account) => account.uuid === stored.activeAccount);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas">
      <TitleBar
        {...chrome}
        session={profile ? { tab, onTab: navigate } : undefined}
        account={
          profile && (
            <AccountMenu
              profile={profile}
              skin={profile.skin?.url ?? activeAccount?.skinUrl ?? null}
              accounts={accounts}
              onUse={useAccount}
              onRemove={removeAccount}
              onAdd={addAccount}
              onRename={() => setRenaming(true)}
            />
          )
        }
        activity={settings.showVotes && feed.votes ? <VoteTicker votes={feed.votes} onVote={() => open(`${SITE_URL}/vote`)} /> : undefined}
        notifications={<NotificationBell items={notifications} error={notificationsError} onOpen={openNotification} onReadAll={readAllNotifications} />}
      />

      {/* Panneaux flottants : l'accueil pose ses propres blocs, les autres écrans tiennent dans un seul. */}
      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
        <SideNav tab={tab} onTab={navigate} head={profile?.skin?.url ?? activeAccount?.skinUrl ?? null} />
        <div className={tab === "home" ? "flex min-h-0 min-w-0 flex-1 flex-col gap-2" : "tile flex min-w-0 flex-1 flex-col overflow-hidden"}>
          {tab !== "home" && canGoBack(stack) && <Breadcrumb crumbs={trail(current, names)} onBack={goBack} onOpen={openCrumb} />}
          {tab === "home" && (
            <HomeScreen
              playerName={profile?.name ?? activeAccount?.name ?? ""}
              look={look}
              heroTone={heroTone(settings.hero)}
              animateSkin={settings.animatedSkin && settings.animations !== "reduced"}
              onOpenConsole={() => push(route("console"))}
              play={play}
              modesBusy={playFor("clover").kind !== "ready" || Boolean(launching)}
              onStop={(force) => void stopGame(selectedInstance, force)}
              onPlay={(mode) => {
                const id = mode ? "clover" : selectedInstance;
                startGame(id, () => mode ? selectInstance("clover").then(() => api.play(mode)) : api.playInstance(id));
              }}
              instances={instances}
              selectedInstance={selectedInstance}
              onSelectInstance={(id) => selectInstance(id).catch((reason) => setNotice(String(reason)))}
              onOpenInstance={(id) => push({ tab: "instances", instance: id })}
              onCreateInstance={() => { setInstanceDraft(newInstance()); push(route("instances")); }}
              onManageInstances={() => push(route("instances"))}
              server={server && { online: server.online, players: networkPlayers(feed, catalogue?.modes ?? []) }}
              modes={(catalogue?.modes ?? []).map((mode) => ({
                id: mode.id,
                name: mode.name,
                icon: mode.image,
                players: modePlayers(feed, mode.id),
                quickPlay: Boolean(mode.host),
                soon: mode.soon,
              }))}
              otherServers={otherServers}
              onRenameServer={renameServer}
              onRenameError={setNotice}
              onPlayServer={(address) => { startGame("clover", () => selectInstance("clover").then(() => api.playServer(address))); }}
              news={feed.news ?? []}
              sessions={sessions}
              maintenance={feed.maintenance === true}
              onOpenLink={open}
              onOpenNews={() => push(route("news"))}
              onOpenActivity={() => navigate("profile")}
              onReadNews={(item) =>
                item.slug ? setReading({ source: "clover", slug: item.slug, title: item.title, category: item.category ?? null, publishedAt: item.publishedAt, url: item.url }) : open(item.url)
              }
            />
          )}

          {tab === "news" && <NewsScreen onOpenLink={open} onRead={setReading} />}

          {current.tab === "instances" && current.mod && (
            <Page>
              <ModDetail
                key={`${current.instance}-${current.mod.id}`}
                open={current.mod}
                catalogue={instances.find((entry) => entry.id === current.instance)?.kind === "clover" ? modInfosOf(current.instance ?? selectedInstance) : undefined}
                personal={modsOf(current.instance ?? selectedInstance)}
                minecraftVersion={instances.find((entry) => entry.id === current.instance)?.minecraft ?? catalogue?.minecraft.version ?? ""}
                onToggle={(id, enabled) => toggleMod(current.instance ?? selectedInstance, id, enabled)}
                onTogglePersonal={(id, enabled) => togglePersonalMod(current.instance ?? selectedInstance, id, enabled)}
                onUpdatePersonal={(id) => changePersonalMod(current.instance ?? selectedInstance, api.updatePersonalMods(id, current.instance))}
                onRemovePersonal={(id) => changePersonalMod(current.instance ?? selectedInstance, api.removePersonalMod(id, current.instance))}
                onRemoved={goBack}
                load={api.modrinthProject}
                onOpenLink={open}
              />
            </Page>
          )}
          {current.tab === "instances" && !current.mod && (
            <div className="flex min-h-0 flex-1">
            <InstancesScreen
              opened={current.instance ? { id: current.instance, section: current.section } : null}
              onOpen={(id, section) => (current.instance === id ? replace({ tab: "instances", instance: id, section }) : push({ tab: "instances", instance: id, section }))}
              onSection={(section) => replace({ tab: "instances", instance: current.instance, section })}
              instances={instances}
              selected={selectedInstance}
              viewing={instanceDraft && !instanceDraft.id ? instanceDraft.input.minecraft : null}
              expert={stored.expertInstances}
              playFor={playFor}
              running={running}
              onStop={(id, force) => void stopGame(id, force)}
              onSelect={(id) => selectInstance(id).catch((reason) => setNotice(String(reason)))}
              onView={(expert) => { setStored((current) => current && { ...current, expertInstances: expert }); api.setInstancesView(expert).catch((reason) => setNotice(String(reason))); }}
              onPlay={(id) => { startGame(id, () => selectInstance(id).then(() => api.playInstance(id)).then(refreshInstances)); }}
              onPlayWorld={(id, world) => { startGame(id, () => selectInstance(id).then(() => api.playWorld(id, world)).then(refreshInstances)); }}
              onExport={(id, parts) =>
                api
                  .exportModpack(id, parts)
                  .then((pack) => pack && setNotice(`Modpack exporté : ${pack.listed} fichier${pack.listed > 1 ? "s" : ""} pris sur Modrinth, ${pack.included} inclus.`))
                  .catch((reason) => setNotice(String(reason)))
              }
              onCreate={(minecraft) => setInstanceDraft(newInstance(minecraft))}
              serverNames={stored.serverNames}
              onRenameServer={renameServer}
              renderSettings={(entry) => (
                <InstanceSettings
                  entry={entry}
                  locked={playFor(entry.id).kind !== "ready"}
                  launcherMemoryGb={settings.memoryAuto ? (system?.autoMemoryGb ?? 4) : settings.memoryGb}
                  launcherOptimizedJava={settings.optimizedJava}
                  onSaved={() => void refreshInstances()}
                  onChangeVersion={entry.kind === "clover" ? undefined : () => editInstance(entry)}
                  onNotice={setNotice}
                />
              )}
              onOpenFolder={(id, folder, world) => api.openInstanceFolder(id, folder, world).catch((reason) => setNotice(String(reason)))}
              renderMods={modsTab}
              contentRevision={contentRevision}
              onSearch={openDiscover}
              onImport={() => openImport("import", "instance")}
              onPin={(id, pinned) => api.setInstancePinned(id, pinned).then(refreshInstances).catch((reason) => setNotice(String(reason)))}
              onDuplicate={(id) =>
                api
                  .duplicateInstance(id)
                  .then(refreshInstances)
                  .then(() => setNotice("Instance dupliquée."))
                  .catch((reason) => setNotice(String(reason)))
              }
              onShortcut={
                system?.desktopShortcuts
                  ? (id) => api.createDesktopShortcut(id).then(() => setNotice("Raccourci créé sur le bureau.")).catch((reason) => setNotice(String(reason)))
                  : undefined
              }
              onDelete={(id) =>
                api
                  .deleteInstance(id)
                  .then(() => {
                    // Sa page n'existe plus : retour à la liste.
                    if (current.instance === id) navigate("instances");
                    setNotice("Instance supprimée : son dossier est dans la corbeille.");
                  })
                  .then(refreshInstances)
                  .catch((reason) => setNotice(String(reason)))
              }
            />
            {instanceDraft && <InstancePanel draft={instanceDraft} onClose={() => setInstanceDraft(null)} onSave={saveInstance} existing={{ instances, selected: selectedInstance, onSelect: (id) => selectInstance(id).catch((reason) => setNotice(String(reason))) }} serverVersion={serverVersion} onImportModpack={(minecraft) => { setInstanceDraft(null); push({ tab: "discover", kind: "modpack", minecraft: minecraft ?? undefined }); }} />}
            </div>
          )}

          {current.tab === "discover" && (
            <DiscoverScreen
              route={current}
              onRoute={replace}
              onOpenProject={(project) => push({ ...current, project })}
              instances={instances}
              defaultTarget={selectedInstance}
              installed={installedProjects}
              search={searchContent}
              onInstall={installFromModrinth}
              installing={installing}
              contentRevision={contentRevision}
              modpackVersions={api.modpackVersions}
              worlds={worlds}
              progress={{ modpack: modpackProgress ?? undefined, world: worldProgress ?? undefined }}
              onImportFile={importModpackFile}
              load={contentPage}
              onPlayWorld={launching ? undefined : (id, world) => startGame(id, () => selectInstance(id).then(() => api.playWorld(id, world)).then(refreshInstances))}
              onOpenLink={open}
            />
          )}

          {tab === "skins" && profile && (
            <SkinsScreen
              playerName={profile.name}
              look={look}
              animateSkin={settings.animatedSkin && settings.animations !== "reduced"}
              saved={skins.library}
              activeId={selectedSkin}
              onSelect={applySkin}
              onAddFile={addSkinFile}
              onRename={(skin, name) => void renameSkin(skin, name)}
              onRemove={(skin) => void removeSkin(skin)}
              onWornModel={(model) => void wearModel(model)}
              onSkinModel={(skin, model) => void setSkinModel(skin, model)}
              capes={(profile.capes ?? []).map(toCape)}
              onRemoteSkin={(skin, wear) => void addRemoteSkin(skin, wear)}
              onWearCape={(cape) => void wearCape(cape)}
              onExport={(skin) => void exportSkin(skin)}
              status={skinStatus}
              onDismissStatus={() => setSkinStatus(null)}
            />
          )}

          {tab === "profile" && profile && (
            <ProfileScreen
              profile={profile}
              look={look}
              animateSkin={settings.animatedSkin && settings.animations !== "reduced"}
              sessions={sessions}
              skinCount={skins.library.length}
              modes={(catalogue?.modes ?? []).map((mode) => ({ id: mode.id, name: mode.name, icon: mode.image, quickPlay: Boolean(mode.host) }))}
              playBusy={playFor("clover").kind !== "ready" || Boolean(launching)}
              onPlay={(mode) => startGame("clover", () => selectInstance("clover").then(() => (mode ? api.play(mode) : api.playInstance("clover"))))}
              onRename={() => setRenaming(true)}
              onOpenSkins={() => push(route("skins"))}
              onOpenLink={open}
            />
          )}

          {tab === "console" && (
            <ConsoleScreen
              entries={gameLog.entries}
              running={gameLog.running}
              onClear={() => void clearConsole()}
              onOpenLogs={() => api.openInstanceFolder(consoleInstance, "logs").catch((reason) => setNotice(String(reason)))}
              instances={instances.map((entry) => ({ id: entry.id, name: entry.name, running: running.includes(entry.id) }))}
              instance={consoleInstance}
              onInstance={setConsoleInstance}
            />
          )}

          {tab === "settings" && (
            <SettingsScreen
              hidden={system?.store ? STORE_HIDDEN : []}
              tab={settingsTab}
              onTab={setSettingsTab}
              settings={settings}
              onChange={updateSettings}
              system={{ totalMemoryGb: system?.totalMemoryGb ?? 8, autoMemoryGb: system?.autoMemoryGb ?? 4, java: system?.java ?? null, tray: system?.tray ?? true }}
              accounts={accounts}
              onUseAccount={useAccount}
              onRemoveAccount={removeAccount}
              onAddAccount={addAccount}
              onResetRecommended={() =>
                api
                  .resetRecommended()
                  .then((written) => setNotice(written.length > 0 ? "Réglages recommandés rétablis : les anciens fichiers sont gardés en .bak dans le dossier du jeu." : "Réglages déjà à jour."))
                  .catch((reason) => setNotice(String(reason)))
              }
              storage={{
                parts: (storage?.parts ?? []).filter((part) => part.bytes > 0).map((part) => ({ ...part, color: STORAGE_COLORS[part.id] ?? "#8a8477" })),
                reclaimable: storage?.reclaimable ?? 0,
                gameDir: storage?.gameDir ?? "",
              }}
              onOpenGameDir={() => void api.openGameDir()}
              onImport={() => openImport("import")}
              onChangeGameDir={() => void changeGameDir()}
              moving={moving}
              onCleanStorage={async () => {
                await api.cleanStorage(settings.logRetentionDays);
                setStorage(await api.storageUsage(settings.logRetentionDays));
              }}
              steam={{
                state: steam,
                onAdd: () => api.steamAdd().then(setSteam).catch((reason) => setNotice(String(reason))),
                onRemove: () => api.steamRemove().then(setSteam).catch((reason) => setNotice(String(reason))),
              }}
              isStaff={isBetaTester(catalogue, profile?.uuid) || settings.betaChannel}
              about={{ launcher: system?.launcher ?? "", minecraft: catalogue?.minecraft.version ?? "", fabric: catalogue?.fabric.loader ?? "" }}
              onOpenLink={open}
            />
          )}
        </div>
      </div>

      {profile && (
        <NameDialog
          open={renaming}
          current={profile.name}
          skin={profile.skin?.url ?? activeAccount?.skinUrl ?? null}
          info={api.nameChangeInfo}
          check={api.nameAvailability}
          onSubmit={changeName}
          onOpenChange={setRenaming}
        />
      )}

      <ArticleReader target={reading} onClose={() => setReading(null)} onOpenLink={open} />

      <CrashDialog
        open={crash !== null}
        exitCode={crash?.code ?? null}
        logTail={crash?.log ?? ""}
        log={crash?.full ?? ""}
        onCopyLog={() => void navigator.clipboard.writeText(crash?.log ?? "")}
        onOpenLogs={() => crash && api.openInstanceFolder(crash.instance, "logs").catch((reason) => setNotice(String(reason)))}
        onRelaunch={() => {
          if (!crash) return;
          setCrash(null);
          startGame(crash.instance, () => api.playInstance(crash.instance));
        }}
        onOpenChange={(openDialog) => !openDialog && setCrash(null)}
      />

      <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3">
        {update && <UpdateToast update={update} onInstall={() => void installUpdate()} onDismiss={() => setUpdate(null)} />}
        {noticeToast}
      </div>
    </div>
  );
}
