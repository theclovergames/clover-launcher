import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** Champ de recherche du launcher : loupe, fond enfoncé, contour doré au focus. */
export function SearchField({ label, className, ...input }: { label: string; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type">) {
  return (
    <label className={cn("relative block min-w-0", className)}>
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        {...input}
        className="h-10 w-full rounded-md border border-border bg-sunken pr-3 pl-9 text-sm text-foreground outline-none select-text placeholder:text-muted-foreground/70 focus:border-accent disabled:opacity-60"
      />
    </label>
  );
}
