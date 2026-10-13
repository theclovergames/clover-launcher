import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Liste vide : une phrase, une aide, et l'action qui la remplit. */
export function EmptyState({ title, hint, action, className }: { title: string; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-border px-6 py-12 text-center", className)}>
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
