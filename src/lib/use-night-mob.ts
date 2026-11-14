import { useEffect, useRef, useState } from "react";

import { reducedMotion } from "./appearance.ts";
import { between } from "./flight.ts";

export const NIGHT_MOB_HIT_MS = 600;
export const NIGHT_MOB_DAWN_MS = 2400;
export type NightMobPhase = "alive" | "hit" | "dawn" | "absent";

/** Un monstre éliminé revient après une attente ; l'aube annule ce retour et termine sa sortie. */
export function useNightMob(dark: boolean) {
  const [phase, setPhase] = useState<NightMobPhase>(dark ? "alive" : "absent");
  const current = useRef(phase);
  const timer = useRef(0);
  const update = (next: NightMobPhase) => {
    current.current = next;
    setPhase(next);
  };

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (dark) update("alive");
    else if (current.current === "alive" && !reducedMotion()) {
      update("dawn");
      timer.current = window.setTimeout(() => update("absent"), NIGHT_MOB_DAWN_MS);
    } else update("absent");
    return () => window.clearTimeout(timer.current);
  }, [dark]);

  const defeat = () => {
    if (!dark || current.current !== "alive") return;
    const respawn = () => {
      timer.current = window.setTimeout(() => update("alive"), between(20000, 40000));
    };
    if (reducedMotion()) {
      update("absent");
      respawn();
    } else {
      update("hit");
      timer.current = window.setTimeout(() => {
        update("absent");
        respawn();
      }, NIGHT_MOB_HIT_MS);
    }
  };

  return { phase, defeat };
}
