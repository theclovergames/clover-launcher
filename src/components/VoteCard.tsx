import { ChevronUp, Vote } from "lucide-react";
import { useState } from "react";

import voteIcon from "@/assets/icons/vote.png";
import { cells } from "@/lib/pixels";
import { iconButton, primaryButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";

const FOLDED_KEY = "clover.vote-card-folded";

const SPARKLE = ["...X...", "...X...", "..XXX..", "XXXXXXX", "..XXX..", "...X...", "...X..."];
const SPARKLES = [
  { top: "16%", left: "30%", delay: "0s" },
  { top: "26%", right: "10%", delay: "-0.6s" },
  { bottom: "36%", left: "20%", delay: "-1.1s" },
];

/** Choix du joueur, sinon dépliée si la fenêtre a la hauteur de la loger avec les actualités. */
function storedFolded() {
  try {
    const value = localStorage.getItem(FOLDED_KEY);
    if (value !== null) return value === "1";
  } catch {
    // Stockage indisponible : on décide sur la hauteur de la fenêtre.
  }
  return !window.matchMedia("(min-height: 900px)").matches;
}

const free = <span className="text-accent">Gratuit</span>;

/**
 * Le vote, sous les actualités : gratuit, il fait monter les paliers de récompenses du joueur.
 * Dépliée : l'urne du serveur et « Voter » ; repliée, une ligne et le bouton seul.
 */
export function VoteCard({ onVote }: { onVote: () => void }) {
  const [folded, setFolded] = useState(storedFolded);
  const fold = (next: boolean) => {
    setFolded(next);
    try {
      localStorage.setItem(FOLDED_KEY, next ? "1" : "0");
    } catch {
      // Préférence de confort : sans stockage, la carte reprend sa forme d'office au prochain lancement.
    }
  };

  return (
    <section aria-label="Vote pour Clover Games" className="tile relative shrink-0 overflow-hidden">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" />
      {folded ? (
        <div className="flex items-center gap-3 py-2.5 pr-3 pl-4">
          <button
            type="button"
            aria-expanded={false}
            title="Déplier"
            onClick={() => fold(false)}
            className="group flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="mc-slot grid size-11 shrink-0 place-items-center">
              <img src={voteIcon} alt="" width={32} height={32} className="pixelated" />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-display text-base leading-none transition-colors group-hover:text-accent">Vote</span>
              <span className="truncate text-xs text-muted-foreground">{free}, et ça rapporte</span>
            </span>
          </button>
          <button type="button" onClick={onVote} title="Voter" aria-label="Voter" className={iconButton}>
            <Vote className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="relative flex flex-col gap-3 py-4 pr-4 pl-5">
          <div aria-hidden className="absolute inset-y-0 right-0 w-[40%]">
            <span className="absolute inset-0 bg-card [clip-path:polygon(30%_0,100%_0,100%_100%,0_100%)]" />
            <span className="absolute inset-0 bg-[radial-gradient(closest-side,rgb(217_164_65/0.2),transparent)]" />
            <span className="sky-bob absolute inset-0 grid place-items-center pb-3">
              <img src={voteIcon} alt="" width={80} height={80} className="pixelated" />
            </span>
            {SPARKLES.map(({ delay, ...place }) => (
              <svg key={delay} width={14} height={14} viewBox="0 0 7 7" shapeRendering="crispEdges" className="sky-twinkle absolute text-[#ffe08a]" style={{ ...place, animationDelay: delay }}>
                <path d={cells(SPARKLE, "X")} fill="currentColor" />
              </svg>
            ))}
            <span className="absolute right-3 bottom-3 -rotate-[4deg] rounded-[3px] border-2 border-[var(--mc-outline)] bg-accent px-1.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-accent-foreground">
              10 clefs à gagner !
            </span>
          </div>
          <div className="relative flex items-center justify-between gap-3">
            <h2 className="font-display text-xl leading-none">Vote</h2>
            <button
              type="button"
              aria-expanded
              title="Replier"
              aria-label="Replier"
              onClick={() => fold(true)}
              className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ChevronUp className="size-4" aria-hidden />
            </button>
          </div>
          <div className="relative flex max-w-[58%] flex-col items-start gap-1.5">
            <p className="text-[15px] leading-tight font-bold">{free}, et ça rapporte</p>
            <p className="text-xs leading-relaxed text-muted-foreground">Tes votes débloquent des paliers : pièces, XP et clefs cosmétiques.</p>
            <button type="button" onClick={onVote} className={cn(primaryButton, "mt-1.5 h-8 px-3")}>
              <Vote className="size-4" aria-hidden />
              Voter
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
