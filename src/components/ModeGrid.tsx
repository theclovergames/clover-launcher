import { Play } from "lucide-react";

import launcherLogo from "@/assets/brand/launcher.png";
import { modeArt } from "@/lib/mode-art";
import { cn } from "@/lib/utils";
import type { ModeStatus } from "@/types";

type Props = {
  modes: ModeStatus[];
  /** Lance le jeu connecté directement à ce mode (Quick Play). */
  onPlay: (mode: string) => void;
  /** Jeu en préparation ou déjà lancé : les cartes ne lancent rien. */
  busy?: boolean;
};

/**
 * Les modes qui ont une adresse directe dans le manifeste, en cartes : illustration du mode (son nom
 * y est lettré), joueurs connectés. Un mode sans illustration montre le trèfle du launcher et son
 * nom. Derrière, la même image floutée teinte toute la carte aux couleurs du mode. Un clic lance le
 * jeu connecté à ce mode. Un mode annoncé, encore en développement, est grisé, sans clic. Une
 * seule rangée tant qu'il y a au plus six modes.
 */
export function ModeGrid({ modes, onPlay, busy = false }: Props) {
  const shown = modes.filter((mode) => mode.quickPlay || mode.soon);
  return (
    <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(shown.length, 6)}, minmax(0, 1fr))` }}>
      {shown.map((mode) => {
        const soon = Boolean(mode.soon);
        const offline = !soon && mode.players === null;
        const art = modeArt(mode.id, mode.icon);
        const status = soon ? "en développement" : offline ? "hors ligne" : mode.players === undefined ? null : `${mode.players} joueur${mode.players === 1 ? "" : "s"}`;

        return (
          <li key={mode.id} className="min-w-0">
            <button
              type="button"
              disabled={busy || offline || soon}
              onClick={() => onPlay(mode.id)}
              aria-label={soon ? `${mode.name}, en développement, pas encore joignable` : `Jouer à ${mode.name}${status ? `, ${status}` : ""}`}
              className={cn(
                "group @container relative flex h-full w-full flex-col items-stretch gap-1.5 overflow-hidden rounded-lg border border-border bg-card px-1 pt-1 pb-2 text-left transition-colors",
                "enabled:hover:border-[#e9e3d4]/50 disabled:cursor-default",
                "motion-safe:enabled:hover:[&_.mode-art]:-translate-y-0.5 motion-safe:enabled:hover:[&_.mode-art]:scale-[1.04]",
                (offline || soon) && "opacity-60",
              )}
            >
              <img
                src={art ?? launcherLogo}
                alt=""
                aria-hidden
                draggable={false}
                className={cn(
                  "pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-55 blur-2xl saturate-150 transition-opacity duration-300 group-enabled:group-hover:opacity-80",
                  (offline || soon) && "grayscale",
                )}
              />
              {/* Illustration carrée, entière ; plafonnée en hauteur pour laisser la place à « Jouer ». */}
              <span className="relative block aspect-square max-h-[clamp(64px,15vh,150px)] w-full">
                {art ? (
                  <img src={art} alt={mode.name} draggable={false} className={cn("mode-art size-full object-contain transition-transform duration-200", (offline || soon) && "grayscale")} />
                ) : (
                  <span className="flex size-full flex-col items-center justify-center gap-2">
                    <img src={launcherLogo} alt="" draggable={false} className={cn("mode-art w-[46%] transition-transform duration-200", offline && "grayscale")} />
                    <span className="max-w-full truncate font-display text-base leading-none @[8rem]:text-2xl">{mode.name}</span>
                  </span>
                )}
                {/* Au survol, « lancer » en coin, sans rien décaler. */}
                <span
                  aria-hidden
                  className="absolute top-0 right-0 grid size-6 place-items-center rounded-md bg-black/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:opacity-0"
                >
                  <Play className="size-3.5 fill-current text-accent" />
                </span>
              </span>
              {soon ? (
                <span className="relative text-center text-[11px] font-semibold whitespace-nowrap text-accent">
                  <span className="@[7rem]:hidden">En dév.</span>
                  <span className="hidden @[7rem]:inline">En développement</span>
                </span>
              ) : mode.players === undefined ? null : offline ? (
                <span className="relative flex items-center justify-center gap-1.5 text-[11px] whitespace-nowrap text-destructive">
                  <span aria-hidden className="hidden size-1.5 shrink-0 rounded-full bg-destructive @[5.5rem]:block" />
                  Hors ligne
                </span>
              ) : (
                <span className="relative flex items-center justify-center gap-1.5 text-[11px] whitespace-nowrap text-foreground/80">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="font-pixel text-[11px] text-foreground">{mode.players}</span>
                  <span className="hidden @[6rem]:inline">en jeu</span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
