import { useCallback, useEffect, useState } from "react";

import type { ShopAccount } from "../types";

type Snapshot = { uuid: string; account: ShopAccount | null; error: string | null };

/** Un seul solde pour la barre de titre et la boutique, lié au compte actif. */
export function useShopAccount(uuid: string | null, load: () => Promise<ShopAccount>) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!uuid) return;
    let cancelled = false;
    let pending = false;
    const update = async () => {
      if (cancelled || pending || document.hidden) return;
      pending = true;
      try {
        const account = await load();
        if (!cancelled) setSnapshot({ uuid, account, error: null });
      } catch (reason) {
        if (!cancelled) setSnapshot({ uuid, account: null, error: String(reason) });
      } finally {
        pending = false;
      }
    };
    void update();
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [uuid, load, revision]);

  const current = snapshot?.uuid === uuid ? snapshot : null;
  return { account: current?.account ?? null, error: current?.error ?? null, refresh };
}
