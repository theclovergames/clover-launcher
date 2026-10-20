import { Globe, ShoppingBag, Vote } from "lucide-react";

import { DiscordLogo } from "@/components/DiscordLogo";
import { DISCORD_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

const LINKS = [
  { id: "vote", label: "Voter", hint: "Gratuit, récompenses en jeu", url: "https://clovergames.fr/vote", Icon: Vote },
  { id: "discord", label: "Discord", hint: "Annonces et entraide", url: DISCORD_URL, Icon: DiscordLogo },
  { id: "store", label: "Boutique", hint: "Grades et cosmétiques", url: "https://store.clovergames.fr", Icon: ShoppingBag },
  { id: "site", label: "Site", hint: "Classements, wiki", url: "https://clovergames.fr", Icon: Globe },
] as const;

const iconTone = (id: string) => (id === "vote" ? "text-accent" : id === "discord" ? "text-[#8b95f7]" : "text-white/75");

/** Disponibilité par ping, total des joueurs par mode ; `null` pendant la première mesure. */
export type ServerStatus = { online: boolean; players: number | null } | null;

/** « En ligne · 271 joueurs », « Hors ligne », ou la mesure en cours. */
export function Status({ server }: { server: ServerStatus }) {
  return (
    <p className="flex items-center gap-2 text-xs whitespace-nowrap text-white/80">
      <span className={cn("size-2 rounded-full", server === null ? "animate-pulse bg-muted-foreground" : server.online ? "bg-primary" : "bg-destructive")} aria-hidden />
      {server === null ? (
        "Recherche du serveur…"
      ) : server.online ? (
        <>
          <span className="font-semibold text-white">En ligne</span>
          {server.players !== null && (
            <>
              <span aria-hidden>·</span>
              <span>
                <span className="font-pixel text-[12px] text-white">{server.players}</span> joueurs
              </span>
            </>
          )}
        </>
      ) : (
        <span className="font-semibold text-[#ffb3b0]">Hors ligne</span>
      )}
    </p>
  );
}

/**
 * Raccourcis vers le vote, le Discord, la boutique et le site, posés sur l'image du lobby ; tous
 * s'ouvrent dans le navigateur. Le vote, gratuit et récompensé en jeu, est en or.
 */
export function QuickLinks({ onOpenLink, compact = false }: { onOpenLink: (url: string) => void; compact?: boolean }) {
  return (
    <nav aria-label="Clover Games sur le web">
      <ul className="flex gap-1.5">
        {LINKS.map(({ id, label, hint, url, Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => onOpenLink(url)}
              title={hint}
              aria-label={compact ? label : undefined}
              className={cn(
                "flex h-9 items-center justify-center gap-2 rounded-lg border text-xs font-bold backdrop-blur-sm transition-colors",
                compact ? "w-9" : "px-3",
                id === "vote" ? "border-accent/50 bg-black/55 text-accent hover:bg-black/70" : "border-white/10 bg-black/45 text-white hover:bg-black/65",
              )}
            >
              <Icon className={cn("size-4 shrink-0", iconTone(id))} aria-hidden />
              {!compact && label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
