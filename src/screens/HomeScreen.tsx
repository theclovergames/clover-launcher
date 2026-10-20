import { ArrowRight, Wrench } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import lobby from "@/assets/home/lobby.webp";
import { QuickLinks, type ServerStatus, Status } from "@/components/HomeExtras";
import { HERO_TONES, type HeroTone } from "@/lib/appearance";
import { ModeGrid } from "@/components/ModeGrid";
import { NewsList } from "@/components/NewsList";
import { RecentActivity } from "@/components/RecentActivity";
import { type OtherServer, OtherServers } from "@/components/OtherServers";
import { PlayButton } from "@/components/PlayButton";
import { SkinViewer } from "@/components/SkinViewer";
import { VersionPicker } from "@/components/VersionPicker";
import { forClover } from "@/lib/instances";
import type { InstanceEntry, ModeStatus, NewsItem, PlaySession, PlayState, SkinLook } from "@/types";

type Props = {
  /** Pseudo du compte actif, au-dessus de son skin. */
  playerName: string;
  look: SkinLook;
  /** Teinte du dégradé posé sur l'image du lobby, choisie dans Paramètres → Apparence. */
  heroTone?: HeroTone;
  /** Pendant la partie : lien vers la console sous « Jouer ». */
  onOpenConsole: () => void;
  play: PlayState;
  /** Clover Games déjà ouvert ou un lancement en cours : les modes ne lancent rien. */
  modesBusy?: boolean;
  onStop?: (force: boolean) => void;
  /** Sans argument : « Jouer », menu du jeu. Avec un mode : Quick Play sur ce mode. */
  onPlay: (mode?: string) => void;
  instances: InstanceEntry[];
  selectedInstance: string;
  onSelectInstance: (id: string) => void;
  /** Ouvre la page d'une instance depuis le choix d'instance. */
  onOpenInstance: (id: string) => void;
  onCreateInstance: () => void;
  onManageInstances: () => void;
  /** Ouvre d'office le choix d'instance (planche des maquettes). */
  versionOpen?: boolean;
  /** Disponibilité par ping, total des joueurs par mode ; `null` pendant la première mesure. */
  server: ServerStatus;
  animateSkin?: boolean;
  modes: ModeStatus[];
  /** Serveurs hors Clover Games déjà rejoints, du plus récent au plus ancien. */
  otherServers: OtherServer[];
  onPlayServer: (address: string) => void;
  onRenameServer?: (address: string, name: string) => Promise<void>;
  onRenameError?: (message: string) => void;
  /** Du plus récent au plus ancien : le premier passe à la une. */
  news: NewsItem[];
  /** Parties terminées sur ce poste, toutes instances confondues ; null pendant le chargement. */
  sessions: PlaySession[] | null;
  /** Maintenance annoncée sur le site : bandeau au-dessus de l'accueil. */
  maintenance?: boolean;
  onOpenLink: (url: string) => void;
  onOpenShop?: () => void;
  /** « Tout lire » : page Actualités. */
  onOpenNews: () => void;
  /** Page Profil : la grille de l'année et les statistiques complètes. */
  onOpenActivity: () => void;
  /** Article du blog : lu dans le launcher (ou sur le site s'il n'a pas de slug). */
  onReadNews: (item: NewsItem) => void;
};

/** Le pseudo et l'ombre restent dans la zone du personnage. */
const SKIN_MARGIN = 40;

/** Mesure la scène libre, indépendamment des commandes sous le personnage. */
function useHeroSkin() {
  const stage = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(240);
  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    // Quelques tailles seulement : le rendu 3D se recrée à chaque changement.
    const measure = () => {
      const free = node.clientHeight - SKIN_MARGIN;
      setHeight(free >= 460 ? 460 : free >= 380 ? 380 : free >= 300 ? 300 : free >= 240 ? 240 : free >= 190 ? 190 : free >= 150 ? 150 : 120);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  return { stage, height };
}

/**
 * Hub en cartes flottantes, comme le reste de la coquille : « Jouer » (personnage, commandes) et les
 * modes à gauche ; l'activité et les articles à droite, colonne qui défile si la fenêtre manque de
 * hauteur.
 */
export function HomeScreen({ playerName, look, heroTone = "forest", onOpenConsole, play, modesBusy, onStop, onPlay, instances, selectedInstance, onSelectInstance, onOpenInstance, onCreateInstance, onManageInstances, versionOpen, server, animateSkin, modes, otherServers, onPlayServer, onRenameServer, onRenameError, news, sessions, maintenance = false, onOpenLink, onOpenShop, onOpenNews, onOpenActivity, onReadNews }: Props) {
  const skin = useHeroSkin();
  const busy = modesBusy ?? play.kind !== "ready";
  const shade = HERO_TONES[heroTone].shade;
  const current = instances.find((entry) => entry.id === selectedInstance) ?? instances[0];

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {maintenance && (
        <p role="status" className="flex shrink-0 items-center gap-2.5 rounded-[calc(var(--radius)+4px)] border border-[var(--mc-outline)] bg-accent px-6 py-2 text-[13px] font-semibold text-accent-foreground">
          <Wrench className="size-4 shrink-0" aria-hidden />
          Maintenance en cours : les serveurs peuvent être indisponibles ou redémarrer. Suis les annonces sur le Discord.
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_clamp(300px,32%,440px)] gap-2">
        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <section aria-label="Jouer à Clover Games" className="tile relative flex min-h-[260px] flex-1 flex-col overflow-hidden text-white">
            <img src={lobby} alt="" draggable={false} className="absolute inset-0 size-full object-cover object-center" />
            <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(to bottom, rgb(0 0 0 / 0.35), transparent 28%), linear-gradient(to top, ${shade}f0 0%, ${shade}99 18%, transparent 55%)` }} />

            <div className="relative flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 pt-3">
              <div className="rounded-lg bg-black/45 px-3 py-1.5 backdrop-blur-sm">
                <Status server={server} />
              </div>
              <QuickLinks onOpenLink={onOpenLink} onOpenShop={onOpenShop} compact />
            </div>

            <div ref={skin.stage} className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-2">
              <div className="relative flex shrink-0 flex-col items-center">
                {playerName && <p className="max-w-48 truncate bg-black/40 px-2.5 pt-1.5 pb-1 font-pixel text-[18px] leading-none">{playerName}</p>}
                <div aria-hidden className="absolute bottom-1 left-1/2 h-4 w-24 -translate-x-1/2 rounded-[50%] bg-black/60 blur-[6px]" />
                <SkinViewer look={look} width={Math.round(skin.height * 0.78)} height={skin.height} animate={animateSkin} />
              </div>
            </div>
            <div className="relative flex shrink-0 justify-center px-5 pt-1 pb-5">
              <div className="w-full max-w-[300px] min-[1400px]:max-w-[344px]">
                <PlayButton
                  compact
                  state={play}
                  onPlay={() => onPlay()}
                  onOpenConsole={onOpenConsole}
                  onStop={onStop}
                  version={current ? `${current.name} · ${current.minecraft ?? "…"}${forClover(current) ? "" : " · solo"}` : ""}
                  picker={<VersionPicker compact instances={instances} selected={selectedInstance} onSelect={onSelectInstance} onOpen={onOpenInstance} onCreate={onCreateInstance} onManage={onManageInstances} defaultOpen={versionOpen} />}
                />
              </div>
            </div>
          </section>

          <section aria-labelledby="modes-title" className="tile flex shrink-0 flex-col gap-3 p-4">
            <h2 id="modes-title" className="font-display text-xl leading-none">
              Modes de jeu
            </h2>
            <ModeGrid modes={modes} onPlay={onPlay} busy={busy} />
            {otherServers.length > 0 && (
              <div className="min-w-0">
                <OtherServers servers={otherServers} onPlay={onPlayServer} busy={busy} onRename={onRenameServer} onError={onRenameError} />
              </div>
            )}
          </section>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto">
          <section aria-labelledby="home-activity-title" className="tile flex shrink-0 flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 id="home-activity-title" className="font-display text-xl leading-none">Ton activité</h2>
              <button type="button" onClick={onOpenActivity} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
                Tout voir
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            </div>
            {sessions === null ? (
              <p role="status" className="py-8 text-xs text-muted-foreground">Chargement de ton activité…</p>
            ) : (
              <RecentActivity sessions={sessions} />
            )}
            {sessions?.length === 0 && <p className="text-[10px] leading-relaxed text-muted-foreground">Lance une partie : elle apparaîtra ici une fois terminée.</p>}
          </section>
          <NewsList news={news} onOpen={onReadNews} onAll={onOpenNews} className="tile shrink-0 grow p-4" />
        </div>
      </div>
    </main>
  );
}
