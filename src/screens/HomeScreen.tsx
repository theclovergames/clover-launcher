import { Wrench } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import lobby from "@/assets/home/lobby.webp";
import { QuickLinks, type ServerStatus, Status, WeekActivity } from "@/components/HomeExtras";
import { HERO_TONES, type HeroTone } from "@/lib/appearance";
import { ModeGrid } from "@/components/ModeGrid";
import { NewsList } from "@/components/NewsList";
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
  /** Maintenance annoncée sur le site : bandeau au-dessus de l'accueil. */
  maintenance?: boolean;
  onOpenLink: (url: string) => void;
  /** « Tout lire » : page Actualités. */
  onOpenNews: () => void;
  /** Article du blog : lu dans le launcher (ou sur le site s'il n'a pas de slug). */
  onReadNews: (item: NewsItem) => void;
  /** Parties de toutes les instances, pour « Ta semaine » ; `null` pendant la lecture. */
  sessions: PlaySession[] | null;
};

/** Hauteur du bandeau que le skin laisse libre : pastilles du haut, pseudo, marge du bas. */
const SKIN_MARGIN = 96;

/** Skin à la taille que le bandeau permet, debout à côté de « Jouer ». */
function useHeroSkin() {
  const hero = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(240);
  useLayoutEffect(() => {
    const node = hero.current;
    if (!node) return;
    // Quatre tailles seulement : le rendu 3D se recrée à chaque changement.
    const measure = () => {
      const free = node.clientHeight - SKIN_MARGIN;
      setHeight(free >= 380 ? 380 : free >= 300 ? 300 : free >= 240 ? 240 : 190);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  return { hero, height };
}

/**
 * Accueil à la manière du launcher officiel : le lobby de Clover Games en grand, ton joueur debout
 * devant, à côté de l'instance à lancer et de « Jouer ». Dessous, les modes sur une ligne, puis les
 * actualités et ta semaine.
 */
export function HomeScreen({ playerName, look, heroTone = "forest", onOpenConsole, play, modesBusy, onStop, onPlay, instances, selectedInstance, onSelectInstance, onCreateInstance, onManageInstances, versionOpen, server, animateSkin, modes, otherServers, onPlayServer, onRenameServer, onRenameError, news, maintenance = false, onOpenLink, onOpenNews, onReadNews, sessions }: Props) {
  const skin = useHeroSkin();
  const busy = modesBusy ?? play.kind !== "ready";
  const shade = HERO_TONES[heroTone].shade;
  const current = instances.find((entry) => entry.id === selectedInstance) ?? instances[0];

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3">
      {maintenance && (
        <p role="status" className="flex shrink-0 items-center gap-2.5 rounded-[calc(var(--radius)+4px)] border border-[var(--mc-outline)] bg-accent px-6 py-2 text-[13px] font-semibold text-accent-foreground">
          <Wrench className="size-4 shrink-0" aria-hidden />
          Maintenance en cours : les serveurs peuvent être indisponibles ou redémarrer. Suis les annonces sur le Discord.
        </p>
      )}

      <section ref={skin.hero} aria-label="Jouer à Clover Games" className="tile relative flex min-h-[260px] flex-1 flex-col overflow-hidden text-white">
        <img src={lobby} alt="" draggable={false} className="absolute inset-0 size-full object-cover object-[50%_38%]" />
        {/* Haut assombri pour les pastilles, bas teinté pour le joueur et « Jouer ». */}
        <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(to bottom, rgb(0 0 0 / 0.5), transparent 26%), linear-gradient(to top, ${shade} 0%, ${shade}cc 16%, transparent 58%)` }} />

        <div className="relative flex items-start justify-between gap-4 px-4 pt-4">
          <div className="rounded-lg bg-black/45 px-3 py-1.5 backdrop-blur-sm">
            <Status server={server} />
          </div>
          <QuickLinks onOpenLink={onOpenLink} />
        </div>

        <div className="relative mt-auto flex items-end justify-center gap-5 px-6 pb-5">
          <div className="relative flex shrink-0 flex-col items-center">
            {playerName && <p className="max-w-40 truncate bg-black/40 px-2 pt-1 pb-0.5 font-pixel text-[15px] leading-none">{playerName}</p>}
            <div aria-hidden className="absolute bottom-1 left-1/2 h-4 w-24 -translate-x-1/2 rounded-[50%] bg-black/60 blur-[6px]" />
            <SkinViewer look={look} width={Math.round(skin.height * 0.62)} height={skin.height} animate={animateSkin} />
          </div>
          <div className="pb-1">
            <PlayButton
              state={play}
              onPlay={() => onPlay()}
              onOpenConsole={onOpenConsole}
              onStop={onStop}
              version={current ? `${current.name} · ${current.minecraft ?? "…"}${forClover(current) ? "" : " · solo"}` : ""}
              picker={<VersionPicker instances={instances} selected={selectedInstance} onSelect={onSelectInstance} onCreate={onCreateInstance} onManage={onManageInstances} defaultOpen={versionOpen} />}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="modes-title" className="flex shrink-0 flex-col gap-2.5 px-1">
        <div className="flex min-w-0 items-center gap-6">
          <h2 id="modes-title" className="shrink-0 font-display text-xl">
            Modes de jeu
          </h2>
          {/* Conteneur de requêtes : sans largeur propre, il prend celle qui reste à côté du titre. */}
          {otherServers.length > 0 && (
            <div className="min-w-0 flex-1">
              <OtherServers servers={otherServers} onPlay={onPlayServer} busy={busy} onRename={onRenameServer} onError={onRenameError} />
            </div>
          )}
        </div>
        <ModeGrid modes={modes} onPlay={onPlay} busy={busy} />
      </section>

      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_clamp(250px,24vw,320px)] items-end gap-4 px-1">
        <NewsList news={news} onOpen={onReadNews} onAll={onOpenNews} />
        <WeekActivity sessions={sessions} size="medium" surface="rounded-lg border border-border bg-card" />
      </div>
    </main>
  );
}
