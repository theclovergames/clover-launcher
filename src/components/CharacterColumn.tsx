import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { nameOverhang, StandingSkin } from "@/components/SkinViewer";
import { cn } from "@/lib/utils";
import type { SkinLook } from "@/types";

/** Hauteur du personnage selon la place libre ; quelques tailles seulement, le rendu 3D se recrée à chaque changement. */
function useSkinStage() {
  const stage = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(300);
  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    // Le plus grand qui tienne en hauteur, pseudo et marge du bas (12 px) compris, et en largeur.
    const measure = () => {
      setHeight([480, 420, 360, 300, 250, 210, 170].find((size) => nameOverhang(size) + size + 12 <= node.clientHeight && size * 0.78 <= node.clientWidth - 24) ?? 140);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  return { stage, height };
}

type Props = {
  label: string;
  /** Pseudo affiché au-dessus de la tête. */
  name: string;
  /** Nom du rendu 3D pour les lecteurs d'écran ; par défaut, celui du skin du compte. */
  skinLabel?: string;
  look: SkinLook;
  animate?: boolean;
  elytra?: boolean;
  /** Voir `SkinViewer`. */
  recenter?: boolean;
  /** Images floutées derrière le personnage ; celle de `tint` est visible, les autres en fondu. */
  tints: { id: string; src: string }[];
  tint: string | null;
  /** En haut de la colonne (présence, essai en cours). */
  top?: ReactNode;
  /** Posé sur le bas du personnage (dos : cape ou élytres). */
  overlay?: ReactNode;
  /** Sous le personnage (niveau, réglages de l'aperçu, actions). */
  children?: ReactNode;
};

/**
 * Colonne du personnage des pages Profil, Skins et d'un joueur : le même personnage debout que sur
 * l'accueil (`StandingSkin`), juste au-dessus de son contenu, sur un fond classique (le ciel animé
 * reste à l'accueil) teinté par une image floutée qui change en fondu (mode choisi, skin essayé),
 * lueur verte du launcher sans image.
 */
export function CharacterColumn({ label, name, skinLabel, look, animate, elytra, recenter, tints, tint, top, overlay, children }: Props) {
  const skin = useSkinStage();
  const tinted = tints.some((entry) => entry.id === tint);
  return (
    <aside aria-label={label} className="relative isolate flex w-[clamp(250px,29%,420px)] shrink-0 flex-col overflow-hidden border-r border-border bg-[#0e0d0a] text-white">
      <div aria-hidden className={cn("absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgb(82_169_108/0.16),transparent_65%)] transition-opacity duration-500", tinted && "opacity-0")} />
      {tints.map((entry) => (
        <img
          key={entry.id}
          src={entry.src}
          alt=""
          aria-hidden
          draggable={false}
          className={cn("pointer-events-none absolute inset-0 size-full scale-150 object-cover object-top blur-3xl saturate-150 transition-opacity duration-500 ease-out", entry.id === tint ? "opacity-60" : "opacity-0")}
        />
      ))}
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(14_13_10/0.55),transparent_22%,transparent_52%,rgb(14_13_10/0.92)_82%)]" />

      <div className="relative flex min-h-[44px] shrink-0 items-start px-3 pt-3">{top}</div>

      {/* Le personnage se tient juste au-dessus de son contenu, quelle que soit la hauteur de la fenêtre. */}
      <div ref={skin.stage} className="relative flex min-h-0 flex-1 items-end justify-center px-3 pb-3">
        <StandingSkin name={name} look={look} height={skin.height} animate={animate} elytra={elytra} recenter={recenter} label={skinLabel}>
          {overlay}
        </StandingSkin>
      </div>

      {children && <div className="relative flex shrink-0 justify-center px-5 pb-5">{children}</div>}
    </aside>
  );
}
