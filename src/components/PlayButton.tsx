import { Square, X } from "lucide-react";
import type { ReactNode } from "react";

import type { InstallPhase, PlayState } from "@/types";

const PHASES: Record<InstallPhase, string> = {
  java: "Installation de Java",
  libraries: "Téléchargement de Minecraft",
  loader: "Préparation du jeu",
  assets: "Téléchargement des ressources",
  mods: "Installation des mods",
};

const number = new Intl.NumberFormat("fr-FR");

type Props = {
  state: PlayState;
  onPlay: () => void;
  onOpenConsole: () => void;
  /** La dalle rouge pendant la partie : « Fermer », puis « Forcer » si le jeu ne répond pas. */
  onStop?: (force: boolean) => void;
  /** Sous « Jouer » : l'instance qui sera lancée et sa version, par exemple « Clover Games · 26.2 ». */
  version: string;
  /** Petite dalle à droite de « Jouer » : le choix de l'instance. */
  picker?: ReactNode;
  /** Taille réduite, dans le panneau de l'accueil. */
  compact?: boolean;
};

/**
 * Le gros bouton « Jouer », l'instance lancée écrite dessous, puis la petite dalle du choix de
 * l'instance. Pendant la partie, la dalle rouge ferme le jeu. Dessous, l'avancement du lancement.
 */
export function PlayButton({ state, onPlay, onOpenConsole, onStop, version, picker, compact = false }: Props) {
  const progress = state.kind === "installing" ? state.progress : undefined;
  const ratio = progress && progress.total > 0 ? progress.done / progress.total : 0;
  const size = compact ? "h-16 min-w-0 flex-1" : "h-[84px] w-[260px]";
  const title = `font-display leading-none tracking-wide uppercase ${compact ? "text-[32px]" : "text-[38px]"}`;

  return (
    <div className={`flex flex-col items-center gap-2.5${compact ? " w-full min-w-0" : ""}`}>
      <div className={`flex items-stretch gap-3${compact ? " w-full min-w-0" : ""}`}>
        {state.kind === "running" && onStop ? (
          // Partie ouverte : la dalle devient rouge et ferme le jeu, comme le bouton d'arrêt de LabyMod.
          <button
            type="button"
            className={`play-slab play-slab-stop overflow-hidden ${size}`}
            disabled={state.closing === "asked"}
            onClick={() => onStop(state.closing === "slow")}
            title={state.closing === "slow" ? "Un monde solo ouvert peut perdre ses dernières minutes." : "Ferme Minecraft comme par la croix de sa fenêtre : le monde ouvert est sauvegardé."}
          >
            <span className="relative flex size-full place-self-stretch">
              <span className="grid w-14 shrink-0 place-items-center bg-black/20" aria-hidden>
                {state.closing === "slow" ? <X className="size-6" strokeWidth={3} /> : <Square className="size-5 fill-current" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 px-3">
                <span className={`${title} [text-shadow:0_2px_0_rgb(0_0_0/0.25)]`}>{state.closing === "slow" ? "Forcer" : "Fermer"}</span>
                <span className="max-w-full truncate text-[11px] leading-none font-bold opacity-85">{version}</span>
              </span>
            </span>
          </button>
        ) : (
          <button type="button" className={`play-slab overflow-hidden px-4 ${size}`} disabled={state.kind !== "ready" || state.busy} onClick={onPlay}>
            {state.kind === "installing" && <span className="play-slab-fill" style={{ transform: `scaleX(${ratio})` }} aria-hidden />}
            <span className="relative flex max-w-full flex-col items-center gap-1.5">
              <span className={`${title} [text-shadow:0_2px_0_rgb(255_255_255/0.35)]`}>
                {state.kind === "ready" && "Jouer"}
                {state.kind === "installing" && (progress ? `${Math.floor(ratio * 100)} %` : "Préparation")}
                {state.kind === "running" && "En jeu"}
              </span>
              <span className="max-w-full truncate text-[11px] leading-none font-bold opacity-75">{version}</span>
            </span>
          </button>
        )}
        {picker}
      </div>

      <p className="relative min-h-4 text-center text-xs font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.7)]" aria-live="polite">
        {state.kind === "installing" && progress && (
          <>
            {PHASES[progress.phase]} · <span className="font-pixel text-[11px]">{number.format(progress.done)}/{number.format(progress.total)}</span>
          </>
        )}
        {state.kind === "running" && state.closing === "asked" && "Fermeture de Minecraft…"}
        {state.kind === "running" && state.closing === "slow" && "Minecraft ne répond pas : « Forcer » le ferme tout de suite."}
        {state.kind === "running" && !state.closing && (
          <>
            Minecraft est ouvert.{" "}
            <button type="button" onClick={onOpenConsole} className="font-bold text-accent underline-offset-2 hover:underline">
              Voir la console
            </button>
          </>
        )}
        {state.kind === "ready" && state.error && <span className="text-[#ffb3b0]">{state.error}</span>}
      </p>
    </div>
  );
}
