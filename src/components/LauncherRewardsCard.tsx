import { Gift } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { LauncherRewards } from "@/types";

/** Relève de l'état : les récompenses tombent pendant la partie, au premier signal du mod. */
const REFRESH_MS = 60_000;

const days = (count: number) => `${count} jour${count > 1 ? "s" : ""}`;

/**
 * Récompenses du launcher, sous le vote : cadeau de bienvenue à la première partie, puis une
 * récompense par jour joué et une clef au bout de chaque série. Rien tant que le site ne répond pas.
 */
export function LauncherRewardsCard() {
  const [rewards, setRewards] = useState<LauncherRewards | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => api.launcherRewards().then((next) => !cancelled && setRewards(next), () => {});
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  if (!rewards) return null;

  const { welcome, today, keyEvery } = rewards;
  // Place dans la série en cours : 1 à `keyEvery`, la clef tombe à `keyEvery`.
  const step = today.streak === 0 ? 0 : ((today.streak - 1) % keyEvery) + 1;
  const [title, text] = !welcome.received
    ? ["Cadeau de bienvenue", "Joue sur Clover avec le launcher pour le recevoir."]
    : today.received
      ? [`Série de ${days(today.streak)}`, step === keyEvery ? "Clef cosmétique reçue aujourd'hui !" : `Récompense du jour reçue. Clef dans ${days(keyEvery - step)}.`]
      : ["Récompense du jour", today.streak > 0 ? `Joue aujourd'hui avec le launcher pour garder ta série de ${days(today.streak)}.` : "Joue aujourd'hui avec le launcher pour la recevoir."];

  return (
    <section aria-label="Récompenses du launcher" className="tile relative flex shrink-0 items-center gap-3 overflow-hidden py-2.5 pr-3 pl-4">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <span className="mc-slot grid size-11 shrink-0 place-items-center text-primary">
        <Gift className="size-6" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-display text-base leading-none">{title}</span>
        <span className="text-xs text-muted-foreground">{text}</span>
      </span>
      {welcome.received && (
        <span className="flex shrink-0 gap-0.5" role="img" aria-label={`${step} sur ${keyEvery} jours avant la clef`}>
          {Array.from({ length: keyEvery }, (_, index) => (
            <span key={index} className={cn("size-2 rounded-[1px]", index < step ? "bg-primary" : "bg-secondary")} />
          ))}
        </span>
      )}
    </section>
  );
}
