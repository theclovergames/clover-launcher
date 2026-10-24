import { Globe, Vote } from "lucide-react";

import { DiscordLogo } from "@/components/DiscordLogo";
import { DISCORD_URL, VOTE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Clover Games sur le web, dans le menu du compte (la boutique a son entrée dans le menu). */
export const SITE_LINKS = [
  { id: "vote", label: "Voter", hint: "Gratuit, récompenses en jeu", url: VOTE_URL, Icon: Vote },
  { id: "discord", label: "Discord", hint: "Annonces et entraide", url: DISCORD_URL, Icon: DiscordLogo },
  { id: "site", label: "Site", hint: "Classements, wiki", url: "https://clovergames.fr", Icon: Globe },
] as const;

/** Le vote, gratuit et récompensé en jeu, est en or ; Discord garde son bleu. */
export const linkTone = (id: string) => (id === "vote" ? "text-accent" : id === "discord" ? "text-[#8b95f7]" : "text-muted-foreground");

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
