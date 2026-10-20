import { Boxes, Compass, House, MessageCircle, Newspaper, Shirt, ShoppingBag, SquareTerminal, Trophy } from "lucide-react";
import type { ReactNode } from "react";

import launcherLogo from "@/assets/brand/launcher.png";
import { PlayerHead } from "@/components/PlayerHead";
import { navItem } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { Tab } from "@/types";

export const TAB_LABELS: Record<Tab, string> = {
  home: "Accueil",
  news: "Actualités",
  leaderboard: "Classement",
  shop: "Boutique",
  instances: "Instances",
  discover: "Découvrir",
  skins: "Skins",
  console: "Console",
  messages: "Messages",
  profile: "Profil",
  player: "Joueur",
  settings: "Paramètres",
};

/** Sections du menu ; le profil d'un autre joueur n'en est pas une, il s'ouvre depuis une page. */
export type NavTab = Exclude<Tab, "player">;

type Item = { id: Exclude<NavTab, "settings" | "messages" | "profile">; Icon: typeof House };

/** Le serveur (accueil, actualités, classement, boutique), puis le jeu (instances, contenu, skins, console). */
const GROUPS: Item[][] = [
  [
    { id: "home", Icon: House },
    { id: "news", Icon: Newspaper },
    { id: "leaderboard", Icon: Trophy },
    { id: "shop", Icon: ShoppingBag },
  ],
  [
    { id: "instances", Icon: Boxes },
    { id: "discover", Icon: Compass },
    { id: "skins", Icon: Shirt },
    { id: "console", Icon: SquareTerminal },
  ],
];

/** Pastille d'une entrée : nombre à traiter (messages non lus, demandes d'amis), « 9+ » au-delà. */
function Badge({ count }: { count: number }) {
  return (
    <span aria-hidden className="absolute -top-1.5 -right-2 grid h-[17px] min-w-[17px] place-items-center rounded-full border-2 border-background bg-destructive px-1 font-pixel text-[10px] leading-none text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function Divider() {
  return <div aria-hidden className="mx-3 my-1 h-px shrink-0 bg-border short:my-0.5" />;
}

function Entry({ active, label, ariaLabel, onClick, children }: { active: boolean; label: string; ariaLabel?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn("flex shrink-0 flex-col items-center gap-1.5 rounded-lg px-1 pt-3 pb-2 transition-colors short:gap-1 short:pt-1.5 short:pb-1.5", navItem(active))}
    >
      {children}
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  );
}

/**
 * Navigation principale en colonne, coiffée du logo, en trois groupes à la suite : le serveur
 * (accueil, actualités, classement, boutique), le jeu (instances, contenu, skins, console), puis
 * les autres joueurs : les Messages, avec en pastille leurs non-lus et les demandes d'amis reçues,
 * et le profil du compte actif, avec la tête de son skin pour icône. La section ouverte est teintée
 * de la couleur principale (réglable dans Paramètres › Apparence). Fenêtre basse, les entrées se
 * resserrent ; interface agrandie, la colonne défile.
 */
export function SideNav({ tab, onTab, head, unread = 0, requests = 0 }: { tab: Tab; onTab: (tab: NavTab) => void; head?: string | null; unread?: number; requests?: number }) {
  const pending = unread + requests;
  const pendingLabel = [unread > 0 && `${unread} non lu${unread > 1 ? "s" : ""}`, requests > 0 && `${requests} demande${requests > 1 ? "s" : ""} d'ami`].filter(Boolean).join(", ");
  return (
    <nav aria-label="Sections" className="tile flex w-[84px] shrink-0 flex-col gap-1 overflow-y-auto p-1.5 [scrollbar-width:none] short:gap-0.5">
      <img src={launcherLogo} alt="Clover Launcher" width={44} height={44} className="pixelated mx-auto mt-2 mb-1 shrink-0 short:mt-1 short:mb-0.5 short:size-9" />
      {GROUPS.map((group, index) => (
        <div key={index} className="contents">
          <Divider />
          {group.map(({ id, Icon }) => (
            <Entry key={id} active={tab === id} label={TAB_LABELS[id]} onClick={() => onTab(id)}>
              <Icon className="size-5" strokeWidth={2.25} aria-hidden />
            </Entry>
          ))}
        </div>
      ))}
      <Divider />
      <Entry active={tab === "messages"} label={TAB_LABELS.messages} ariaLabel={pending > 0 ? `${TAB_LABELS.messages}, ${pendingLabel}` : undefined} onClick={() => onTab("messages")}>
        <span className="relative">
          <MessageCircle className={cn("size-5", tab === "messages" && "text-primary")} strokeWidth={2.25} aria-hidden />
          {pending > 0 && <Badge count={pending} />}
        </span>
      </Entry>
      <Entry active={tab === "profile"} label={TAB_LABELS.profile} onClick={() => onTab("profile")}>
        <PlayerHead skin={head ?? null} size={22} className={cn("ring-1", tab === "profile" ? "ring-primary/60" : "ring-white/10")} />
      </Entry>
    </nav>
  );
}
