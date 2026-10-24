import type { ComponentType, ReactNode } from "react";

import { SegmentBar } from "@/components/SegmentBar";
import { countBadge, slidingSegment } from "@/lib/buttons";
import { cn } from "@/lib/utils";

export type TabItem<T extends string> = { id: T; label: ReactNode; Icon?: ComponentType<{ className?: string }>; count?: number };

/**
 * Barre d'onglets du launcher, la même partout : onglets d'une page, vues d'un écran, filtres
 * exclusifs. `count` ajoute une pastille.
 */
export function Tabs<T extends string>({ items, value, onChange, label, className }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string; className?: string }) {
  return (
    <SegmentBar role="tablist" aria-label={label} value={value} className={cn("w-fit max-w-full flex-wrap self-start", className)}>
      {items.map(({ id, label: text, Icon, count }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={slidingSegment(active)}
          >
            {Icon && <Icon className="size-3.5" aria-hidden />}
            {text}
            {count !== undefined && <span className={cn(countBadge, active ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground")}>{count}</span>}
          </button>
        );
      })}
    </SegmentBar>
  );
}
