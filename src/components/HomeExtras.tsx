import { Flame, Globe, ShoppingBag, Vote } from "lucide-react";

import { DiscordLogo } from "@/components/DiscordLogo";
import { activity, activityLevel, formatDuration } from "@/lib/play-history";
import { DISCORD_URL } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { PlaySession } from "@/types";

/**
 * Taille des blocs de l'accueil : `full` avec les lignes de détail, `medium` sans elles quand la
 * fenêtre est un peu juste (le détail passe en info-bulle).
 */
export type ExtrasSize = "full" | "medium";

/** Teintes des cases, celles de la carte Activité des instances. */
const LEVELS = ["bg-[#24201a]", "bg-primary/25", "bg-primary/50", "bg-primary/75", "bg-primary"];
const DAYS = ["L", "M", "M", "J", "V", "S", "D"];
const dayName = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const relative = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

/** « il y a 2 heures », « hier », « il y a 3 jours ». */
function ago(seconds: number, now: Date) {
  const minutes = Math.round((now.getTime() / 1000 - seconds) / 60);
  if (minutes < 60) return relative.format(-Math.max(1, minutes), "minute");
  if (minutes < 24 * 60) return relative.format(-Math.round(minutes / 60), "hour");
  return relative.format(-Math.round(minutes / (24 * 60)), "day");
}

/**
 * Semaine de jeu, toutes instances confondues : temps joué du lundi à aujourd'hui, une case par
 * jour, série en cours et dernière partie. `sessions` à `null` : encore en lecture.
 */
export function WeekActivity({ sessions, size = "full", surface = "tile", className }: { sessions: PlaySession[] | null; size?: ExtrasSize; surface?: string; className?: string }) {
  const now = new Date();
  const stats = activity(sessions ?? [], now, "half");
  const week = stats.days.slice(-7);
  const total = week.reduce((sum, day) => sum + day.seconds, 0);
  const parties = week.reduce((sum, day) => sum + day.sessions, 0);
  const before = stats.days.slice(-14, -7).reduce((sum, day) => sum + day.seconds, 0);
  const summary =
    (parties ? `${parties} partie${parties > 1 ? "s" : ""} depuis lundi` : "Pas encore joué cette semaine") +
    (Math.abs(total - before) >= 60 && before > 0 ? ` · ${formatDuration(Math.abs(total - before))} ${total > before ? "de plus" : "de moins"} que la semaine dernière` : "");
  const last = sessions?.reduce<PlaySession | null>((latest, session) => (!latest || session.started > latest.started ? session : latest), null) ?? null;
  const lastLine = last
    ? `Dernière partie ${ago(last.started + last.seconds, now)}${last.seconds >= 60 ? ` · ${formatDuration(last.seconds)}` : ""}`
    : "Ton temps de jeu se compte à chaque partie lancée depuis le launcher.";
  const medium = size === "medium";
  const value = sessions === null ? "…" : total ? formatDuration(total) : "0 min";

  return (
    <section
      aria-labelledby="week-title"
      title={medium ? `${summary}\n${lastLine}` : undefined}
      className={cn(surface, "flex flex-col gap-2.5 px-5 py-3.5", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="week-title" className="font-display text-xl whitespace-nowrap">
          Ta semaine
        </h2>
        <span className="flex items-baseline gap-2.5 whitespace-nowrap">
          {stats.streak > 1 && (
            <span
              className="flex items-center gap-1 self-center text-xs font-semibold text-accent"
              title={`${stats.streak} jours d'affilée · record : ${stats.best} jours`}
              aria-label={`${stats.streak} jours d'affilée`}
            >
              <Flame className="size-3.5" aria-hidden />
              {medium ? stats.streak : `${stats.streak} jours d'affilée`}
            </span>
          )}
          {medium && <span className="font-display text-xl leading-none">{value}</span>}
        </span>
      </div>

      {!medium &&
        (sessions === null ? (
          <span className="h-[42px] w-28 animate-pulse rounded-md bg-white/[0.05]" aria-label="Chargement" />
        ) : (
          <div className="flex flex-col gap-1">
            <span className="font-display text-2xl leading-none">{value}</span>
            {/* Une seule ligne : la hauteur du bloc reste celle que l'accueil réserve. */}
            <span title={summary} className="truncate text-xs text-muted-foreground">
              {summary}
            </span>
          </div>
        ))}

      <ol aria-label="Temps de jeu par jour" className="grid grid-cols-7 gap-1.5">
        {week.map((day, index) => {
          const today = index === (now.getDay() + 6) % 7;
          return (
            <li key={day.date.getTime()} className="flex flex-col items-center gap-1">
              <span
                title={day.future ? undefined : `${dayName.format(day.date)} : ${day.seconds ? formatDuration(day.seconds) : "pas joué"}`}
                className={cn(
                  "w-full rounded-[4px]",
                  medium ? "h-6" : "h-5",
                  day.future ? "border border-dashed border-border" : LEVELS[activityLevel(day.seconds)],
                  today && "ring-1 ring-[#e9e3d4]/50 ring-offset-1 ring-offset-background",
                )}
              />
              <span aria-hidden className={cn("text-[10px] leading-none font-semibold", today ? "text-foreground" : "text-muted-foreground")}>
                {DAYS[index]}
              </span>
              <span className="sr-only">
                {dayName.format(day.date)} : {day.future ? "à venir" : day.seconds ? formatDuration(day.seconds) : "pas joué"}
              </span>
            </li>
          );
        })}
      </ol>

      {!medium && <p className="truncate text-[11px] text-muted-foreground">{lastLine}</p>}
    </section>
  );
}

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
export function QuickLinks({ onOpenLink }: { onOpenLink: (url: string) => void }) {
  return (
    <nav aria-label="Clover Games sur le web">
      <ul className="flex gap-1.5">
        {LINKS.map(({ id, label, hint, url, Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => onOpenLink(url)}
              title={hint}
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold backdrop-blur-sm transition-colors",
                id === "vote" ? "border-accent/50 bg-black/55 text-accent hover:bg-black/70" : "border-white/10 bg-black/45 text-white hover:bg-black/65",
              )}
            >
              <Icon className={cn("size-4 shrink-0", iconTone(id))} aria-hidden />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
