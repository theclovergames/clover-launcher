import { ArrowRight, Trophy, Users, Wrench } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { FriendRow } from "@/components/FriendRow";
import { type ServerStatus, Status } from "@/components/HomeExtras";
import { HomeSky } from "@/components/HomeSky";
import type { Scene } from "@/lib/appearance";
import { NewsList } from "@/components/NewsList";
import { RecentActivity } from "@/components/RecentActivity";
import { type OtherServer } from "@/components/OtherServers";
import { PlayButton } from "@/components/PlayButton";
import { BELOW_FEET, nameOverhang, StandingSkin } from "@/components/SkinViewer";
import { VersionPicker } from "@/components/VersionPicker";
import { VoteCard } from "@/components/VoteCard";
import { shownStatus } from "@/lib/availability";
import { secondaryButton } from "@/lib/buttons";
import { findMode } from "@/lib/friends";
import { forClover } from "@/lib/instances";
import { clickBehindSkin } from "@/lib/skin-click";
import { cn } from "@/lib/utils";
import type { ChatFriend, InstanceEntry, MinecraftNewsItem, ModeStatus, NewsItem, PlaySession, PlayState, SkinLook } from "@/types";

type Props = {
  /** Pseudo du compte actif, au-dessus de son skin. */
  playerName: string;
  look: SkinLook;
  /** Teinte du ciel derrière le personnage, choisie dans Paramètres → Apparence. */
  scene?: Scene;
  /** Météo réelle dans le ciel (Paramètres → Apparence). */
  skyWeather?: boolean;
  /** Pseudos des vrais joueurs qui passent en élytres dans le ciel : amis, puis haut du classement. */
  skyPlayers?: string[];
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
  /** Annonces de Minecraft : complètent les actualités quand le bloc a de la place. */
  minecraftNews?: MinecraftNewsItem[];
  /** Parties terminées sur ce poste, toutes instances confondues ; null pendant le chargement. */
  sessions: PlaySession[] | null;
  /** Maintenance annoncée sur le site : bandeau au-dessus de l'accueil. */
  maintenance?: boolean;
  /** « Tout lire » : page Actualités. */
  onOpenNews: () => void;
  /** Page Profil : la grille de l'année et les statistiques complètes. */
  onOpenActivity: () => void;
  /** Article du blog : lu dans le launcher (ou sur le site s'il n'a pas de slug). */
  onReadNews: (item: NewsItem) => void;
  /** Annonce de Minecraft : note de version lue dans le launcher, sinon minecraft.net. */
  onReadMinecraft?: (item: MinecraftNewsItem) => void;
  /** Page de vote du site, dans le navigateur. */
  onVote: () => void;
  /** Amis du compte (ceux des Messages) ; `null` avant la première relève. Carte des fenêtres larges. */
  friends?: ChatFriend[] | null;
  /** Ouvre la conversation avec un ami. */
  onWrite?: (friend: string) => void;
  /** Ouvre le profil d'un ami. */
  onOpenPlayer?: (name: string) => void;
  /** Lien de la carte des amis : page Messages. */
  onOpenFriends?: () => void;
  /** Encart « Joue à plusieurs » de la carte des amis : page Classement. */
  onOpenLeaderboard?: () => void;
};

/** Tailles du personnage, du plus grand au plus petit : quelques paliers seulement, le rendu 3D se recrée à chaque changement. */
const SKIN_STEPS = [720, 660, 600, 560, 520, 480, 440, 400, 370, 340, 310, 280, 250, 220, 190, 150, 120];

/** Mesure la scène libre, indépendamment des commandes sous le personnage. */
function useHeroSkin() {
  const stage = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(240);
  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    // Le plus grand qui tienne : pseudo à 8 px sous la pastille d'état, et le vide sous les pieds
    // derrière « Jouer » (il se tient juste au-dessus).
    const measure = () => {
      setHeight(SKIN_STEPS.find((step) => nameOverhang(step) + (1 - BELOW_FEET) * step + 8 <= node.clientHeight) ?? 120);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  return { stage, height };
}

/** Amis en ligne d'abord, puis par pseudo. */
const byPresence = (a: ChatFriend, b: ChatFriend) => Number(Boolean(shownStatus(b))) - Number(Boolean(shownStatus(a))) || a.name.localeCompare(b.name, "fr");

/** Comment ajouter des amis, en bas de leur carte : seul s'il n'y en a pas, sous une liste courte. */
function FriendsInvite({ onOpen, className }: { onOpen?: () => void; className?: string }) {
  return (
    <div className={cn("mc-slot flex shrink-0 flex-col items-start gap-2 p-3 [--mc-radius:8px]", className)}>
      <p className="font-display text-base leading-none">Joue à plusieurs</p>
      <p className="text-xs leading-relaxed text-muted-foreground">Ajoute des joueurs depuis le Classement, les Messages ou leur profil, ou en jeu avec /amis.</p>
      {onOpen && (
        <button type="button" onClick={onOpen} className={cn(secondaryButton, "h-8 text-xs")}>
          <Trophy className="size-3.5" aria-hidden />
          Voir le classement
        </button>
      )}
    </div>
  );
}

/** Amis, sous l'activité quand la fenêtre est large : où ils sont, les rejoindre, leur écrire. */
function FriendsCard({ friends, modes, busy, onPlay, onWrite, onOpenPlayer, onOpenFriends, onOpenLeaderboard }: { friends: ChatFriend[] | null; modes: ModeStatus[]; busy: boolean; onPlay: (mode: string) => void; onWrite?: (friend: string) => void; onOpenPlayer?: (name: string) => void; onOpenFriends?: () => void; onOpenLeaderboard?: () => void }) {
  const online = friends?.filter((friend) => shownStatus(friend)).length ?? 0;
  return (
    <section aria-labelledby="home-friends-title" className="tile flex min-h-40 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="home-friends-title" className="font-display text-xl leading-none">Amis</h2>
        <span className="flex items-center gap-3">
          {friends && friends.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" aria-hidden />
              {online > 0 ? `${online} en ligne sur ${friends.length}` : `${friends.length} ami${friends.length > 1 ? "s" : ""}`}
            </span>
          )}
          {onOpenFriends && (
            <button type="button" onClick={onOpenFriends} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
              Messages
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          )}
        </span>
      </div>
      {friends === null ? (
        <p role="status" className="py-6 text-xs text-muted-foreground">Chargement de tes amis…</p>
      ) : friends.length === 0 ? (
        <FriendsInvite onOpen={onOpenLeaderboard} />
      ) : (
        // L'encart suit la liste dans le défilement : en bas de la carte si elle est courte, après le dernier ami sinon.
        <div className="-mx-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <ul className="flex flex-col">
            {[...friends].sort(byPresence).map((friend) => (
              <FriendRow
                key={friend.uuid}
                friend={friend}
                mode={friend.server ? findMode(modes, friend.server) : undefined}
                playBusy={busy}
                onJoin={onPlay}
                onWrite={onWrite && (() => onWrite(friend.uuid))}
                onOpen={onOpenPlayer && (() => onOpenPlayer(friend.name))}
              />
            ))}
          </ul>
          <FriendsInvite onOpen={onOpenLeaderboard} className="mx-2 mt-auto" />
        </div>
      )}
    </section>
  );
}

/**
 * Le joueur d'abord : à gauche, son personnage sous un ciel animé et « Jouer », toute la hauteur ; les
 * modes et les autres serveurs sont dans la dalle ⇆ à côté de « Jouer ». À droite, l'activité et
 * les articles, colonne qui défile si la fenêtre manque de hauteur ; fenêtre large (plein écran),
 * deux colonnes : l'activité et les amis, puis les articles et le vote.
 */
export function HomeScreen({ playerName, look, scene = "forest", skyWeather, skyPlayers = [], onOpenConsole, play, modesBusy, onStop, onPlay, instances, selectedInstance, onSelectInstance, onOpenInstance, onCreateInstance, onManageInstances, versionOpen, server, animateSkin, modes, otherServers, onPlayServer, onRenameServer, onRenameError, news, minecraftNews, sessions, maintenance = false, onOpenNews, onOpenActivity, onReadNews, onReadMinecraft, onVote, friends = null, onWrite, onOpenPlayer, onOpenFriends, onOpenLeaderboard }: Props) {
  const skin = useHeroSkin();
  const busy = modesBusy ?? play.kind !== "ready";
  const current = instances.find((entry) => entry.id === selectedInstance) ?? instances[0];

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {maintenance && (
        <p role="status" className="flex shrink-0 items-center gap-2.5 rounded-[calc(var(--radius)+4px)] border border-[var(--mc-outline)] bg-accent px-6 py-2 text-[13px] font-semibold text-accent-foreground">
          <Wrench className="size-4 shrink-0" aria-hidden />
          Maintenance en cours : les serveurs peuvent être indisponibles ou redémarrer. Suis les annonces sur le Discord.
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_clamp(300px,34%,400px)] gap-2 min-[1600px]:grid-cols-[minmax(0,1fr)_clamp(640px,46%,960px)]">
        <section aria-label="Jouer à Clover Games" className="tile relative flex min-h-0 min-w-0 flex-col overflow-hidden text-white">
          <HomeSky scene={scene} players={skyPlayers} skyWeather={skyWeather} />

          {/* Les conteneurs laissent passer la souris jusqu'aux mobs ; les contrôles visibles la reprennent. */}
          <div className="pointer-events-none relative shrink-0 px-3 pt-3">
            <div className="pointer-events-auto w-fit rounded-lg bg-black/45 px-3 py-1.5 backdrop-blur-sm">
              <Status server={server} />
            </div>
          </div>

          <div ref={skin.stage} className="pointer-events-none relative flex min-h-0 flex-1 items-end justify-center px-4 pt-2">
            <StandingSkin name={playerName} look={look} height={skin.height} animate={animateSkin} onEmptyClick={clickBehindSkin} style={{ marginBottom: -Math.round(skin.height * BELOW_FEET) }} />
          </div>
          <div className="pointer-events-none relative flex shrink-0 justify-center px-5 pt-1 pb-5">
            <div className="pointer-events-auto w-full max-w-[300px] min-[1400px]:max-w-[344px]">
              <PlayButton
                compact
                state={play}
                onPlay={() => onPlay()}
                onOpenConsole={onOpenConsole}
                onStop={onStop}
                version={current ? `${current.name} · ${current.minecraft ?? "…"}${forClover(current) ? "" : " · solo"}` : ""}
                picker={
                  <VersionPicker
                    compact
                    instances={instances}
                    selected={selectedInstance}
                    onSelect={onSelectInstance}
                    onOpen={onOpenInstance}
                    onCreate={onCreateInstance}
                    onManage={onManageInstances}
                    defaultOpen={versionOpen}
                    games={{ modes, servers: otherServers, busy, onPlayMode: onPlay, onPlayServer, onRenameServer, onRenameError }}
                  />
                }
              />
            </div>
          </div>
        </section>

        {/* Étroite, une colonne : les colonnes intérieures s'effacent (`contents`), la carte des amis aussi. */}
        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto min-[1600px]:flex-row">
          <div className="contents min-[1600px]:flex min-[1600px]:min-w-0 min-[1600px]:flex-1 min-[1600px]:flex-col min-[1600px]:gap-2">
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
            <div className="hidden min-h-0 flex-1 flex-col min-[1600px]:flex">
              <FriendsCard friends={friends} modes={modes} busy={busy} onPlay={onPlay} onWrite={onWrite} onOpenPlayer={onOpenPlayer} onOpenFriends={onOpenFriends} onOpenLeaderboard={onOpenLeaderboard} />
            </div>
          </div>
          <div className="contents min-[1600px]:flex min-[1600px]:min-w-0 min-[1600px]:flex-1 min-[1600px]:flex-col min-[1600px]:gap-2">
            <NewsList news={news} minecraft={minecraftNews} onOpen={onReadNews} onOpenMinecraft={onReadMinecraft} onAll={onOpenNews} className="tile min-h-32 flex-1 p-4" />
            <VoteCard onVote={onVote} />
          </div>
        </div>
      </div>
    </main>
  );
}
