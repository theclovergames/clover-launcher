import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type TabItem<T extends string> = { id: T; label: ReactNode; Icon?: ComponentType<{ className?: string }>; count?: number };

/**
 * Barre d'onglets du launcher, la même partout : onglets d'une page, vues d'un écran, filtres
 * exclusifs. `count` ajoute une pastille.
 */
export function Tabs<T extends string>({ items, value, onChange, label, className }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex w-fit max-w-full flex-wrap gap-1 self-start rounded-lg border border-border bg-sunken p-1", className)}>
      {items.map(({ id, label: text, Icon, count }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="size-3.5" aria-hidden />}
            {text}
            {count !== undefined && <span className={cn("rounded-full px-1.5 font-pixel text-[11px]", active ? "bg-accent text-accent-foreground" : "bg-secondary")}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
