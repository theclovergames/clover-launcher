import { Copy, Minus, Settings, Square, SquareTerminal, X } from "lucide-react";
import type { ReactNode } from "react";

import launcherLogo from "@/assets/brand/launcher.png";
import { iconButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { Tab } from "@/types";

type Props = {
  /** Absent avant la connexion : ni compte ni paramètres. La navigation vit dans `SideNav`. */
  session?: { tab: Tab; onTab: (tab: Exclude<Tab, "player">) => void };
  /** Menu des comptes (`AccountMenu`). */
  account?: ReactNode;
  /** Cloche des notifications, à gauche des paramètres. */
  notifications?: ReactNode;
  /** Un jeu tourne : pastille verte sur le bouton de la console. */
  playing?: boolean;
  maximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
};

/** Petits blocs en relief, comme les boutons du jeu. */
const windowButton =
  "mc-bevel grid size-7 place-items-center bg-secondary text-muted-foreground [--mc-radius:5px] hover:text-foreground";

/**
 * Barre de titre de la fenêtre sans cadre : zone de déplacement (double-clic pour agrandir),
 * compte, console (celle de la dernière instance lancée), notifications, paramètres, boutons de
 * fenêtre.
 */
export function TitleBar({ session, account, notifications, playing = false, maximized, onMinimize, onToggleMaximize, onClose }: Props) {
  return (
    <header data-tauri-drag-region className="flex h-13 shrink-0 items-center gap-6 pl-5">
      {/* Avec une session, le logo coiffe la navigation (`SideNav`). */}
      {!session && <img src={launcherLogo} alt="Clover Launcher" width={36} height={36} className="pixelated" data-tauri-drag-region />}

      <div data-tauri-drag-region className="h-full flex-1" />

      {session && account}

      {session && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={playing ? "Console, jeu en cours" : "Console"}
            title="Console"
            aria-current={session.tab === "console" ? "page" : undefined}
            onClick={() => session.onTab("console")}
            className={cn(iconButton, session.tab === "console" && "text-accent hover:text-accent")}
          >
            <SquareTerminal className="size-[18px]" aria-hidden />
            {playing && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-primary" />}
          </button>
          {notifications}
          <button
            type="button"
            aria-label="Paramètres"
            title="Paramètres"
            aria-current={session.tab === "settings" ? "page" : undefined}
            onClick={() => session.onTab("settings")}
            className={cn(iconButton, session.tab === "settings" && "text-accent hover:text-accent")}
          >
            <Settings className="size-[18px]" aria-hidden />
          </button>
        </div>
      )}

      <div className="flex gap-1.5 pr-3">
        <button type="button" onClick={onMinimize} aria-label="Réduire" className={windowButton}>
          <Minus className="size-3.5" strokeWidth={2.75} aria-hidden />
        </button>
        <button type="button" onClick={onToggleMaximize} aria-label={maximized ? "Restaurer" : "Agrandir"} className={windowButton}>
          {maximized ? <Copy className="size-3 -scale-x-100" strokeWidth={2.75} aria-hidden /> : <Square className="size-3" strokeWidth={2.75} aria-hidden />}
        </button>
        <button type="button" onClick={onClose} aria-label="Fermer" className={`${windowButton} hover:bg-destructive hover:text-white`}>
          <X className="size-3.5" strokeWidth={2.75} aria-hidden />
        </button>
      </div>
    </header>
  );
}
