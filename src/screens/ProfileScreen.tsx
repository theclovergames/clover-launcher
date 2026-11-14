import { ArrowRight, ArrowUpRight, Check, CircleAlert, Copy, PenLine, Play, RotateCcw, Share2, Shirt, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { CharacterColumn } from "@/components/CharacterColumn";
import { LevelBlock, longDate, type Mode, ModeTiles, ModeTilesSkeleton, number, Playtime, RecentAchievements, Section, Skeleton, useModeTiles } from "@/components/PlayerStats";
import { type CardData, cardFacts, ProfileCardDialog } from "@/components/ProfileCard";
import { FriendRow } from "@/components/FriendRow";
import { CapeFront } from "@/components/SkinFront";
import { api } from "@/lib/api";
import { shownStatus } from "@/lib/availability";
import { secondaryButton } from "@/lib/buttons";
import { ownedCapeText, textureHash } from "@/lib/capes";
import { ago, findMode } from "@/lib/friends";
import { locatorBarColor } from "@/lib/locator";
import { modeArt } from "@/lib/mode-art";
import { rankBadge } from "@/lib/ranks";
import { SITE_URL } from "@/lib/site";
import { cn, fold } from "@/lib/utils";
import type { CatalogueCape, PlaySession, PlayerStats, Profile, SkinLook } from "@/types";

/** Une cape que moins de joueurs recensés possèdent est marquée rare. */
const RARE_BELOW = 10_000;

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
  /** Ouvre le profil d'un ami. */
  onOpenPlayer?: (name: string) => void;
  onOpenLink: (url: string) => void;
  /** Sources de données, remplacées par des exemples sur la planche. */
  services?: Pick<typeof api, "playerStats" | "nameChangeInfo" | "discoverCapes" | "savePng">;
};

/**
 * Profil du compte actif, organisé autour des modes : à gauche le personnage avec son niveau et sa
 * barre d'inventaire, teinté par le mode choisi ; à droite l'identité, une tuile par mode (rang,
 * chiffre clé) dont le détail s'ouvre dessous, puis les amis, le temps de jeu et la collection.
 */
export function ProfileScreen({ profile, look, animateSkin, sessions, skinCount, modes, playBusy, onPlay, onRename, onOpenSkins, onWrite, onOpenPlayer, onOpenLink, services = api }: Props) {
  const [stats, setStats] = useState<{ uuid: string; data: PlayerStats } | { uuid: string; error: string } | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueCape[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [card, setCard] = useState<CardData | null>(null);
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
  const { tiles, selected, pick } = useModeTiles(data, modes);
  // Autre compte : le mode choisi repart du meilleur classement.
  useEffect(() => pick(null), [uuid, pick]);

  const friends = data?.friends ?? null;
  const onlineFriends = friends?.filter((friend) => shownStatus(friend)).length ?? 0;

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
        <LevelBlock data={data} loading={loading} own />
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
            {loading ? <ModeTilesSkeleton /> : <ModeTiles tiles={tiles} selected={selected} onPick={pick} own playBusy={playBusy} onPlay={onPlay} />}
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
                          onOpen={onOpenPlayer && (() => onOpenPlayer(friend.name))}
                        />
                      ))}
                    </ul>
                    <p className="text-[11px] text-muted-foreground">Ajoute des amis depuis le Classement, les Messages ou le profil d'un joueur, ou en jeu avec /amis. Leur serveur s'affiche s'ils l'autorisent.</p>
                  </>
                )}
              </Section>
            )}

            {(loading || data?.playtime) && (
              <Section title="Temps de jeu">
                {loading ? (
                  <Skeleton className="h-[176px]" />
                ) : (
                  data?.playtime && <Playtime playtime={data.playtime} modes={modes} selected={selected} />
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
              <RecentAchievements achievements={data.achievements} />
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
