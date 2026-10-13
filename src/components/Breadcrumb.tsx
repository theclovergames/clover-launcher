import { ArrowLeft, ChevronRight } from "lucide-react";
import { Fragment } from "react";

import type { Crumb, Route } from "@/lib/routes";

/**
 * Bandeau de toute sous-page : « Retour » ramène à la page d'où l'on vient, et chaque maillon du
 * chemin (Instances › Survie 1.21 › Shaders) ouvre sa page.
 */
export function Breadcrumb({ crumbs, onBack, onOpen }: { crumbs: Crumb[]; onBack: () => void; onOpen: (route: Route) => void }) {
  return (
    <nav aria-label="Fil d'Ariane" className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-6 text-[13px]">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 rounded-md py-1 pr-2 font-semibold text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Retour
      </button>
      <span aria-hidden className="h-4 w-px bg-border" />
      <ol className="flex min-w-0 items-center gap-1.5">
        {crumbs.map((crumb, index) => (
          <Fragment key={`${index}-${crumb.label}`}>
            {index > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />}
            <li className="min-w-0">
              {crumb.to ? (
                <button type="button" onClick={() => crumb.to && onOpen(crumb.to)} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                  {crumb.label}
                </button>
              ) : (
                <span aria-current="page" className="block truncate font-semibold text-foreground">
                  {crumb.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
