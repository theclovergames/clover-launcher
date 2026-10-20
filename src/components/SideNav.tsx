import { Boxes, Compass, House, MessageCircle, Newspaper, Shirt, SquareTerminal, Trophy } from "lucide-react";

import launcherLogo from "@/assets/brand/launcher.png";
import { PlayerHead } from "@/components/PlayerHead";
import { navItem } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { Tab } from "@/types";

export const TAB_LABELS: Record<Tab, string> = {
  home: "Accueil",
  news: "Actualités",
  instances: "Instances",
  discover: "Découvrir",
  skins: "Skins",
  profile: "Profil",
  messages: "Messages",
  leaderboard: "Classement",
  player: "Joueur",
  console: "Console",
  settings: "Paramètres",
};

/** Sections du menu ; le profil d'un autre joueur n'en est pas une, il s'ouvre depuis une page. */
export type NavTab = Exclude<Tab, "player">;

const ITEMS: { id: Exclude<Tab, "settings" | "profile" | "messages" | "leaderboard" | "player">; Icon: typeof House }[] = [
  { id: "home", Icon: House },
  { id: "news", Icon: Newspaper },
  { id: "instances", Icon: Boxes },
  { id: "discover", Icon: Compass },
  { id: "skins", Icon: Shirt },
  { id: "console", Icon: SquareTerminal },
];

/** Pastille d'une entrée : nombre à traiter (messages non lus, demandes d'amis), « 9+ » au-delà. */
function Badge({ count }: { count: number }) {
  return (
    <span aria-hidden className="absolute -top-1.5 -right-2 grid h-[17px] min-w-[17px] place-items-center rounded-full border-2 border-background bg-destructive px-1 font-pixel text-[10px] leading-none text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

/**
 * Navigation principale en colonne, coiffée du logo : icône et nom de chaque section, la section
 * ouverte dans un fond teinté de la couleur principale (réglable dans Paramètres › Apparence). Le
 * bas de la colonne réunit ce qui touche aux autres joueurs : le Classement, les Messages, avec en
 * pastille leurs non-lus et les demandes d'amis reçues, puis le profil du compte actif, avec la
 * tête de son skin pour icône.
 */
export function SideNav({ tab, onTab, head, unread = 0, requests = 0 }: { tab: Tab; onTab: (tab: NavTab) => void; head?: string | null; unread?: number; requests?: number }) {
  const pending = unread + requests;
  const pendingLabel = [unread > 0 && `${unread} non lu${unread > 1 ? "s" : ""}`, requests > 0 && `${requests} demande${requests > 1 ? "s" : ""} d'ami`].filter(Boolean).join(", ");
  return (
    <nav aria-label="Sections" className="tile flex w-[84px] shrink-0 flex-col gap-1 p-1.5">
      <img src={launcherLogo} alt="Clover Launcher" width={44} height={44} className="pixelated mx-auto mt-2 mb-1 short:mt-1 short:size-10" />
      <div aria-hidden className="mx-3 mb-1 h-px bg-border" />
      {ITEMS.map(({ id, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onTab(id)}
            className={cn("flex flex-col items-center gap-1.5 rounded-lg px-1 pt-3 pb-2 transition-colors short:pt-2 short:pb-1.5", navItem(active))}
          >
            <Icon className="size-5" strokeWidth={2.25} aria-hidden />
            <span className="text-[11px] font-semibold">{TAB_LABELS[id]}</span>
          </button>
        );
      })}
      <button
        type="button"
        aria-current={tab === "leaderboard" ? "page" : undefined}
        onClick={() => onTab("leaderboard")}
        className={cn("mt-auto flex flex-col items-center gap-1.5 rounded-lg px-1 pt-3 pb-2 transition-colors short:pt-2 short:pb-1.5", navItem(tab === "leaderboard"))}
      >
        <Trophy className="size-5" strokeWidth={2.25} aria-hidden />
        <span className="text-[11px] font-semibold">{TAB_LABELS.leaderboard}</span>
      </button>
      <button
        type="button"
        aria-current={tab === "messages" ? "page" : undefined}
        aria-label={pending > 0 ? `${TAB_LABELS.messages}, ${pendingLabel}` : undefined}
        onClick={() => onTab("messages")}
        className={cn("flex flex-col items-center gap-1.5 rounded-lg px-1 pt-3 pb-2 transition-colors short:pt-2 short:pb-1.5", navItem(tab === "messages"))}
      >
        <span className="relative">
          <MessageCircle className={cn("size-5", tab === "messages" && "text-primary")} strokeWidth={2.25} aria-hidden />
          {pending > 0 && <Badge count={pending} />}
        </span>
        <span className="text-[11px] font-semibold">{TAB_LABELS.messages}</span>
      </button>
      <button
        type="button"
        aria-current={tab === "profile" ? "page" : undefined}
        onClick={() => onTab("profile")}
        className={cn("flex flex-col items-center gap-1.5 rounded-lg px-1 pt-3 pb-2 transition-colors short:pt-2 short:pb-1.5", navItem(tab === "profile"))}
      >
        <PlayerHead skin={head ?? null} size={22} className={cn("ring-1", tab === "profile" ? "ring-primary/60" : "ring-white/10")} />
        <span className="text-[11px] font-semibold">{TAB_LABELS.profile}</span>
      </button>
    </nav>
  );
}
