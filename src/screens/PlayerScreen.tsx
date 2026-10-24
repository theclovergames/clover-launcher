import { ArrowUpRight, Check, CircleAlert, Clock, LoaderCircle, Play, RotateCcw, Send, UserMinus, UserPlus, UserRoundX, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CharacterColumn } from "@/components/CharacterColumn";
import { EmptyState } from "@/components/EmptyState";
import { LevelBlock, longDate, type Mode, ModeTiles, ModeTilesSkeleton, Playtime, RecentAchievements, Section, Skeleton, useModeTiles } from "@/components/PlayerStats";
import { api } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { ago, findMode, joinableMode } from "@/lib/friends";
import { rankBadge } from "@/lib/ranks";
import { SITE_URL } from "@/lib/site";
import { type Confirmation, ConfirmDialog } from "@/screens/Dialogs";
import type { ChatFriend, OtherPlayer, PlayerLook, Relation, SkinLook } from "@/types";

type Props = {
  name: string;
  /** Modes du manifeste : nom, illustration et Quick Play. */
  modes: Mode[];
  /** Conversation avec ce joueur s'il est ami : « Rejoindre » s'il l'accepte. */
  friend: ChatFriend | null;
  animateSkin?: boolean;
  playBusy: boolean;
  onPlay: (mode: string) => void;
  /** Ouvre la conversation (page Messages), par l'UUID. */
  onWrite: (uuid: string) => void;
  onOpenLink: (url: string) => void;
  /** Une demande a changé : la liste des conversations et la pastille se relisent. */
  onFriendsChanged: () => void;
  onNotice: (message: string) => void;
  services?: Pick<typeof api, "playerProfile" | "playerLook" | "sendFriendRequest" | "answerFriendRequest" | "removeFriend">;
};

/** Skin par défaut de Mojang (Steve ou Alex selon l'UUID), quand le compte n'en porte pas d'autre. */
const defaultSkin = (name: string) => `https://minotar.net/skin/${encodeURIComponent(name)}`;

function skinLook(name: string, look: PlayerLook | null | undefined): SkinLook {
  if (look === undefined) return { texture: "", model: "classic", cape: null };
  return {
    texture: look?.texture ?? defaultSkin(name),
    model: look?.model ?? "classic",
    cape: look?.cape ? { id: "cape", name: "Cape", texture: look.cape } : null,
  };
}

const ACTION_DONE: Record<"accept" | "decline" | "cancel", string> = {
  accept: "Demande acceptée : vous êtes maintenant amis.",
  decline: "Demande refusée.",
  cancel: "Demande annulée.",
};

/**
 * Boutons d'amitié selon le lien avec le joueur : l'ajouter, voir sa demande en attente (et
 * l'annuler), accepter ou refuser la sienne, ou lui écrire et le retirer une fois amis.
 */
function FriendActions(props: {
  player: OtherPlayer;
  relation: Relation;
  canRequest: boolean;
  busy: boolean;
  onRequest: () => void;
  onAnswer: (action: "accept" | "decline" | "cancel") => void;
  onWrite: () => void;
  onRemove: () => void;
}) {
  const { player, relation, busy } = props;
  const spinner = busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />;
  if (relation === "friend") {
    return (
      <>
        <button type="button" onClick={props.onWrite} className={primaryButton}>
          <Send className="size-4" aria-hidden />
          Écrire à {player.name}
        </button>
        <button type="button" disabled={busy} onClick={props.onRemove} className={secondaryButton}>
          {spinner || <UserMinus className="size-4" aria-hidden />}
          Retirer des amis
        </button>
      </>
    );
  }
  if (relation === "incoming") {
    return (
      <>
        <button type="button" disabled={busy} onClick={() => props.onAnswer("accept")} className={primaryButton}>
          {spinner || <Check className="size-4" aria-hidden />}
          Accepter sa demande
        </button>
        <button type="button" disabled={busy} onClick={() => props.onAnswer("decline")} className={secondaryButton}>
          <X className="size-4" aria-hidden />
          Refuser
        </button>
      </>
    );
  }
  if (relation === "outgoing") {
    return (
      <>
        <span className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-[13px] font-semibold text-muted-foreground">
          <Clock className="size-4" aria-hidden />
          Demande envoyée
        </span>
        <button type="button" disabled={busy} onClick={() => props.onAnswer("cancel")} className={secondaryButton}>
          {spinner || <UserRoundX className="size-4" aria-hidden />}
          Annuler la demande
        </button>
      </>
    );
  }
  if (!props.canRequest) {
    return (
      <span className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-[13px] font-semibold text-muted-foreground">
        <UserRoundX className="size-4" aria-hidden />
        N'accepte pas les demandes d'amis
      </span>
    );
  }
  return (
    <button type="button" disabled={busy} onClick={props.onRequest} className={primaryButton}>
      {spinner || <UserPlus className="size-4" aria-hidden />}
      Ajouter en ami
    </button>
  );
}

/**
 * Profil d'un autre joueur, ouvert depuis le Classement, les Messages ou les amis : son personnage
 * avec son niveau, ses modes (rang et chiffres), son temps de jeu et ses succès, et ce qui le lie
 * au compte actif (demande d'ami, conversation).
 */
export function PlayerScreen({ name, modes, friend, animateSkin, playBusy, onPlay, onWrite, onOpenLink, onFriendsChanged, onNotice, services = api }: Props) {
  /** `player` à `null` : aucun joueur de ce pseudo n'est venu sur le serveur. */
  const [state, setState] = useState<{ name: string; player: OtherPlayer | null } | { name: string; error: string } | null>(null);
  const [look, setLook] = useState<{ name: string; look: PlayerLook | null } | null>(null);
  const [link, setLink] = useState<{ relation: Relation; canRequest: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<Confirmation | null>(null);

  const load = useCallback(() => {
    setState(null);
    setLink(null);
    services
      .playerProfile(name)
      .then((player) => setState({ name, player }))
      .catch((reason) => setState({ name, error: String(reason) }));
  }, [name, services]);

  useEffect(() => {
    load();
    setLook(null);
    services
      .playerLook(name)
      .then((found) => setLook({ name, look: found }))
      .catch(() => setLook({ name, look: null }));
  }, [load, name, services]);

  /** Lien relu sans recharger la page, après une demande : l'affichage suit le site. */
  const refreshLink = () => {
    services
      .playerProfile(name)
      .then((found) => found && setLink({ relation: found.relation, canRequest: found.canRequest }))
      .catch(() => {});
  };

  const current = state?.name === name ? state : null;
  const player = current && "player" in current ? current.player : null;
  const error = current && "error" in current ? current.error : null;
  const loading = current === null;
  const data = player?.stats ?? null;
  const shownName = player?.name ?? name;
  const relation = link?.relation ?? player?.relation ?? "none";
  const canRequest = link?.canRequest ?? player?.canRequest ?? false;
  const { tiles, selected, pick } = useModeTiles(data, modes);
  useEffect(() => pick(null), [name, pick]);

  const played = data?.modes ?? [];
  const newcomer = data !== null && !data.presence?.firstSeen && !data.level && !data.playtime && played.length === 0;
  const join = friend && relation === "friend" ? joinableMode(friend, modes) : undefined;
  const modeName = (server: string) => findMode(modes, server)?.name ?? server;

  const request = async () => {
    if (!player) return;
    setBusy(true);
    try {
      const sent = await services.sendFriendRequest(player.name);
      setLink({ relation: sent.result === "accepted" ? "friend" : "outgoing", canRequest: false });
      onNotice(sent.result === "accepted" ? `${player.name} t'avait déjà demandé : vous êtes maintenant amis.` : `Demande d'ami envoyée à ${player.name}.`);
      onFriendsChanged();
    } catch (reason) {
      onNotice(String(reason));
      refreshLink();
    } finally {
      setBusy(false);
    }
  };

  const answer = async (action: "accept" | "decline" | "cancel") => {
    if (!player) return;
    setBusy(true);
    try {
      await services.answerFriendRequest(player.uuid, action);
      setLink({ relation: action === "accept" ? "friend" : "none", canRequest: action !== "accept" });
      onNotice(ACTION_DONE[action]);
      onFriendsChanged();
    } catch (reason) {
      onNotice(String(reason));
    } finally {
      // Refus des demandes, demande expirée ou traitée ailleurs : le lien réel est relu.
      refreshLink();
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!player) return;
    setBusy(true);
    try {
      await services.removeFriend(player.uuid);
      setLink({ relation: "none", canRequest: true });
      onNotice(`${player.name} ne fait plus partie de tes amis.`);
      onFriendsChanged();
    } catch (reason) {
      onNotice(String(reason));
    } finally {
      // Ses réglages décident s'il accepte une nouvelle demande : le lien réel est relu.
      refreshLink();
      setBusy(false);
    }
  };

  const askRemove = (target: OtherPlayer) =>
    setAsking({
      title: `Retirer ${target.name} de tes amis ?`,
      description: "Vous ne pourrez plus vous écrire. Votre conversation reste lisible, et tu pourras lui renvoyer une demande plus tard.",
      confirm: "Retirer",
      onConfirm: () => void remove(),
    });

  if (current && "player" in current && current.player === null) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center px-10">
        <EmptyState className="w-full max-w-lg" title="Joueur introuvable" hint={`${name} n'est encore jamais venu sur Clover Games.`} />
      </main>
    );
  }

  const presence = data?.presence;
  return (
    <main className="flex min-h-0 flex-1">
      <CharacterColumn
        label={`Personnage de ${shownName}`}
        name={shownName}
        skinLabel={`Aperçu 3D du skin de ${shownName}`}
        look={skinLook(shownName, look?.name === name ? look.look : undefined)}
        animate={animateSkin}
        tints={tiles.flatMap((tile) => (tile.art ? [{ id: tile.id, src: tile.art }] : []))}
        tint={selected?.id ?? null}
        top={
          presence?.online ? (
            <span className="flex items-center gap-2 rounded-lg bg-black/45 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm">
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
                <span className="relative size-2 rounded-full bg-primary" />
              </span>
              En ligne sur {modeName(presence.online)}
            </span>
          ) : presence?.lastSeen ? (
            <span className="rounded-lg bg-black/45 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm">
              Vu {ago(presence.lastSeen)}
              {presence.lastServer && ` sur ${modeName(presence.lastServer)}`}
            </span>
          ) : null
        }
      >
        <LevelBlock data={data} loading={loading} own={false} />
      </CharacterColumn>

      <div className="min-w-0 flex-1 overflow-y-auto px-8 pt-7 pb-10">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-display text-[34px] leading-none">{shownName}</h1>
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
            {relation === "friend" && <span className="rounded-md bg-primary/12 px-2 py-0.5 text-xs font-bold text-primary">Ami</span>}
          </div>
          {presence?.firstSeen && (
            <p className="flex gap-1.5 text-xs">
              <span className="text-muted-foreground">Sur Clover Games depuis le</span>
              <span className="font-semibold">{longDate.format(new Date(presence.firstSeen))}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {loading ? (
              <Skeleton className="h-9 w-40" />
            ) : (
              player && (
                <FriendActions player={player} relation={relation} canRequest={canRequest} busy={busy} onRequest={() => void request()} onAnswer={(action) => void answer(action)} onWrite={() => onWrite(player.uuid)} onRemove={() => askRemove(player)} />
              )
            )}
            {join && (
              <button type="button" disabled={playBusy} onClick={() => onPlay(join.id)} title={`Rejoindre ${shownName} sur ${join.name}`} className={secondaryButton}>
                <Play className="size-4 fill-current" aria-hidden />
                Rejoindre
              </button>
            )}
            <button type="button" onClick={() => onOpenLink(`${SITE_URL}/player/${encodeURIComponent(shownName)}`)} className={secondaryButton}>
              Voir sur le site
              <ArrowUpRight className="size-4" aria-hidden />
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="mt-6 flex items-center gap-2.5 rounded-lg border border-[#ffb3b0]/25 bg-[#ffb3b0]/[0.07] px-3 py-2 text-sm text-[#ffb3b0]">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">Profil indisponible. {error}</span>
            <button type="button" onClick={load} className="flex shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline">
              <RotateCcw className="size-3.5" aria-hidden />
              Réessayer
            </button>
          </div>
        )}

        {newcomer && <p className="mt-6 text-sm text-muted-foreground">{shownName} n'a pas encore de statistiques sur Clover Games.</p>}

        {!error && (loading || tiles.length > 0) && (
          <Section title="Modes de jeu" className="mt-8">
            {loading ? <ModeTilesSkeleton /> : <ModeTiles tiles={tiles} selected={selected} onPick={pick} own={false} />}
          </Section>
        )}

        {!error && !newcomer && (
          <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-x-8 gap-y-9">
            {(loading || data?.playtime) && (
              <Section title="Temps de jeu">{loading ? <Skeleton className="h-[176px]" /> : data?.playtime && <Playtime playtime={data.playtime} modes={modes} selected={selected} />}</Section>
            )}
            {(loading || data?.achievements) && (
              <Section
                title="Succès"
                aside={
                  data?.achievements && (
                    <span className="text-xs text-muted-foreground">
                      {data.achievements.unlocked} sur {data.achievements.total}
                    </span>
                  )
                }
              >
                {loading ? <Skeleton className="h-[120px]" /> : data?.achievements && <RecentAchievements achievements={data.achievements} />}
              </Section>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog ask={asking} onClose={() => setAsking(null)} />
    </main>
  );
}
