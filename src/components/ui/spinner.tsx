import type * as React from "react"
import { cn } from "cn"

// Anneau de huit blocs (grille 3×3 sans le centre), parcouru dans le sens horaire.
const BLOCKS = [
  [1.5, 1.5],
  [9, 1.5],
  [16.5, 1.5],
  [16.5, 9],
  [16.5, 16.5],
  [9, 16.5],
  [1.5, 16.5],
  [1.5, 9],
] as const

/**
 * Indicateur de chargement « bloc », le même que sur le site : les cases s'allument tour à tour,
 * sans aucun déplacement. Décoratif par défaut ; avec un `aria-label`, il est annoncé comme image.
 * Taille par `className`, comme une icône lucide.
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const labelled = props["aria-label"] !== undefined
  return (
    <svg
      data-slot="spinner"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      role={labelled ? "img" : undefined}
      aria-hidden={labelled ? undefined : true}
      className={cn("shrink-0", className)}
      {...props}
    >
      {BLOCKS.map(([x, y], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width="6"
          height="6"
          rx="1"
          className="animate-block-chase"
          // Délais négatifs : l'anneau tourne déjà au premier rendu, sans flash « tout allumé ».
          style={{ animationDelay: `${(i - BLOCKS.length) * 100}ms` }}
        />
      ))}
    </svg>
  )
}

export { Spinner }
