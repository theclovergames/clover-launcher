import { forwardRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Écran du launcher : mêmes marges, même titre et même place pour les actions partout. Le contenu
 * défile, sauf `fixed`, pour les écrans qui font défiler leurs propres colonnes.
 */
export const Page = forwardRef<HTMLElement, { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; fixed?: boolean; className?: string; children: ReactNode }>(function Page(
  { title, subtitle, actions, fixed, className, children },
  ref,
) {
  return (
    <main ref={ref} className={cn("flex min-h-0 min-w-0 flex-1 flex-col px-10 pt-8 pb-8", !fixed && "overflow-y-auto", className)}>
      {(title || actions) && (
        <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col gap-2">
            {title && <h1 className="font-display text-[30px] leading-none">{title}</h1>}
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </main>
  );
});
