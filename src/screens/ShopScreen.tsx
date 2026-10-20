import { ArrowUpRight, ShoppingBag } from "lucide-react";

import { primaryButton } from "@/lib/buttons";

/** Boutique en ligne du serveur : grades et cosmétiques. */
const STORE_URL = "https://store.clovergames.fr";

/**
 * Boutique : sa place dans la navigation est prête, la page arrive avec une prochaine version. En
 * attendant, elle mène à la boutique en ligne.
 */
export function ShopScreen({ onOpenLink }: { onOpenLink: (url: string) => void }) {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center px-10">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <ShoppingBag className="size-10 text-muted-foreground/60" strokeWidth={1.75} aria-hidden />
        <h1 className="font-display text-[28px] leading-none">Boutique</h1>
        <p className="text-sm text-muted-foreground">La boutique arrive bientôt dans le launcher. En attendant, grades et cosmétiques t'attendent sur la boutique en ligne.</p>
        <button type="button" onClick={() => onOpenLink(STORE_URL)} className={primaryButton}>
          Ouvrir la boutique en ligne
          <ArrowUpRight className="size-4" aria-hidden />
        </button>
      </div>
    </main>
  );
}
