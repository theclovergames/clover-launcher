import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import launcherLogo from "@/assets/brand/launcher.png";
import { api, type SplashStatus } from "@/lib/api";

/**
 * Fenêtre de chargement (`src-tauri/src/splash.rs`) : recherche et installation des mises à jour,
 * puis chargement de l'interface. Barre remplie selon `ratio`, sinon un bloc qui la balaie.
 */
export function Splash() {
  const [status, setStatus] = useState<SplashStatus>({ message: "Chargement…", ratio: null });
  useEffect(() => {
    let received = false;
    const listener = listen<SplashStatus>("splash-status", ({ payload }) => {
      received = true;
      setStatus(payload);
    });
    // Écoute posée d'abord : un état envoyé avant le chargement de la page n'est pas perdu.
    void listener.then(() => api.splashStatus()).then((snapshot) => {
      if (!received) setStatus(snapshot);
    }).catch(() => {});
    return () => void listener.then((stop) => stop());
  }, []);

  const percent = status.ratio === null ? null : Math.round(status.ratio * 100);
  return (
    <div className="flex h-full cursor-default flex-col items-center justify-center gap-6 bg-background px-10 select-none">
      <div className="flex items-center gap-3">
        <img src={launcherLogo} alt="" className="size-11 motion-safe:animate-splash-breathe" />
        <p className="font-display text-[28px] leading-none">
          Clover <span className="text-primary">Launcher</span>
        </p>
      </div>
      <div className="flex w-full flex-col items-center gap-3">
        <p role="status" className="text-[13px] font-semibold text-muted-foreground">
          {status.message}
          {percent !== null && <span className="font-pixel text-[12px] text-foreground"> {percent} %</span>}
        </p>
        <div
          role="progressbar"
          aria-label={status.message}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
          className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary"
        >
          {percent === null ? (
            <span className="absolute inset-y-0 left-0 w-[35%] rounded-full bg-primary motion-safe:animate-import-sweep" />
          ) : (
            <span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
          )}
        </div>
      </div>
    </div>
  );
}
