import { TrendingDown, TrendingUp } from "lucide-react";
import { useRef, useState } from "react";

import { formatDuration, recentActivity } from "@/lib/play-history";
import { cn } from "@/lib/utils";
import type { PlaySession } from "@/types";

const weekdayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const shortDateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const fullDayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

const RANGES = {
  week: { label: "7 jours", days: 7 },
  month: { label: "30 jours", days: 30 },
} as const;
type Range = keyof typeof RANGES;

/** Haut de l'échelle : au quart d'heure sous une heure, à l'heure au-delà ; une heure sans partie. */
const scaleTop = (max: number) => (max <= 0 ? 3600 : max < 3600 ? Math.ceil(max / 900) * 900 : Math.ceil(max / 3600) * 3600);
const parties = (count: number) => `${count} partie${count > 1 ? "s" : ""}`;

/**
 * Temps joué jour par jour sur les 7 ou 30 derniers jours, en barres : le total de la période
 * comparé à la précédente, puis parties, série en cours et plus longue partie. Survol, ou flèches
 * du clavier, pour le détail d'un jour. La grille de l'année reste sur la page Profil.
 */
export function RecentActivity({ sessions }: { sessions: PlaySession[] }) {
  const [range, setRange] = useState<Range>("week");
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const bars = useRef<(HTMLButtonElement | null)[]>([]);
  const { label, days: count } = RANGES[range];
  const { days, total, sessions: played, daysPlayed, previous, longest, streak } = recentActivity(sessions, new Date(), count);
  const top = scaleTop(Math.max(...days.map((day) => day.seconds)));
  const delta = total - previous;
  const today = count - 1;
  const shownIndex = hovered ?? focused;
  const shown = shownIndex === null ? null : days[shownIndex];
  const columns = { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`, columnGap: count > 7 ? "3px" : "10px" };
  const height = (seconds: number) => (seconds ? `max(4px, ${(seconds / top) * 100}%)` : "2px");
  // Sur 30 jours, une date par semaine en remontant depuis aujourd'hui, sans déborder à gauche.
  const dayLabel = (date: Date, index: number) => (index === today ? "auj." : count === 7 ? weekdayFormat.format(date) : (today - index) % 7 === 0 && index >= 4 ? shortDateFormat.format(date) : "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-display text-[26px] leading-none">{total ? formatDuration(total) : "0 min"}</span>
          <span className="text-xs text-muted-foreground">{daysPlayed ? `${daysPlayed} jour${daysPlayed > 1 ? "s" : ""} de jeu sur ${count}` : `Pas joué sur ${label}`}</span>
          {Math.abs(delta) >= 60 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {delta > 0 ? <TrendingUp className="size-3.5 shrink-0 text-primary" aria-hidden /> : <TrendingDown className="size-3.5 shrink-0" aria-hidden />}
              {formatDuration(Math.abs(delta))} {delta > 0 ? "de plus" : "de moins"} qu'avant
            </span>
          )}
        </div>
        <div role="group" aria-label="Période d'activité" className="flex shrink-0 gap-0.5 rounded-md border border-border bg-sunken p-0.5">
          {(Object.keys(RANGES) as Range[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={range === id}
              onClick={() => {
                setRange(id);
                setHovered(null);
                setFocused(null);
                setActive(null);
              }}
              className={cn("rounded px-2.5 py-1 text-[11px] font-semibold transition-colors", range === id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {RANGES[id].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pt-3">
        <div className="relative h-20 tall:h-28" onMouseLeave={() => setHovered(null)}>
          {/* Haut de l'échelle, discret ; la ligne de base porte les barres. */}
          <span aria-hidden className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
          <span aria-hidden className="absolute top-0 right-0 -translate-y-full pb-0.5 text-[10px] leading-none text-muted-foreground">{formatDuration(top)}</span>
          <div role="group" aria-label={`Temps de jeu par jour sur ${label}`} className="absolute inset-0 grid border-b border-border" style={columns}>
            {days.map((day, index) => (
              <button
                key={day.date.getTime()}
                ref={(node) => { bars.current[index] = node; }}
                type="button"
                aria-label={`${fullDayFormat.format(day.date)} : ${day.seconds ? `${formatDuration(day.seconds)}, ${parties(day.sessions)}` : "pas joué"}`}
                tabIndex={index === (active ?? today) ? 0 : -1}
                onMouseEnter={() => setHovered(index)}
                onFocus={() => {
                  setFocused(index);
                  setActive(index);
                }}
                onBlur={() => setFocused(null)}
                onKeyDown={(event) => {
                  const next = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: today }[event.key];
                  if (next === undefined) return;
                  event.preventDefault();
                  bars.current[Math.min(today, Math.max(0, next))]?.focus();
                }}
                className="flex h-full cursor-default items-end justify-center outline-none"
              >
                <span
                  className={cn("w-full max-w-8 rounded-t-[4px] transition-[filter,box-shadow]", day.seconds ? "bg-primary" : "bg-[#24201a]", shownIndex === index && "ring-1 ring-accent brightness-110")}
                  style={{ height: height(day.seconds) }}
                />
              </button>
            ))}
          </div>
          {shown && shownIndex !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute z-10 flex -translate-x-1/2 flex-col gap-0.5 rounded-md border border-border bg-sunken px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-lg"
              style={{
                left: `${Math.min(85, Math.max(15, ((shownIndex + 0.5) / count) * 100))}%`,
                bottom: `calc(${shown.seconds ? Math.max(0, (shown.seconds / top) * 100) : 0}% + 8px)`,
              }}
            >
              <span className="text-muted-foreground">{fullDayFormat.format(shown.date)}</span>
              <span className="font-semibold">{shown.seconds ? `${formatDuration(shown.seconds)} · ${parties(shown.sessions)}` : "Pas joué"}</span>
            </div>
          )}
        </div>
        <div aria-hidden className="grid text-[10px] leading-none text-muted-foreground" style={columns}>
          {days.map((day, index) => (
            <span key={day.date.getTime()} className={cn("justify-self-center whitespace-nowrap", index === today && "font-semibold text-foreground")}>
              {dayLabel(day.date, index)}
            </span>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3">
        {[
          ["Parties", played ? String(played) : "—"],
          ["Série en cours", streak ? `${streak} jour${streak > 1 ? "s" : ""}` : "—"],
          ["Plus longue", longest ? formatDuration(longest) : "—"],
        ].map(([name, value]) => (
          <div key={name} className="flex min-w-0 flex-col gap-0.5">
            <dt className="truncate text-[10px] text-muted-foreground">{name}</dt>
            <dd className="truncate text-sm font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
