import { TrendingDown, TrendingUp } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";

import { HeatmapGrid } from "@/components/ActivityHeatmap";
import { activity, formatDuration, recentActivity } from "@/lib/play-history";
import { SegmentBar } from "@/components/SegmentBar";
import { slidingSegment } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { PlaySession } from "@/types";

const weekdayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const fullDayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

const RANGES = { week: "7 jours", quarter: "3 mois" } as const;
type Range = keyof typeof RANGES;
/** « 3 mois » : treize semaines de cases, la dernière étant celle en cours. */
const QUARTER_WEEKS = 13;

/** Haut de l'échelle : au quart d'heure sous une heure, à l'heure au-delà ; une heure sans partie. */
const scaleTop = (max: number) => (max <= 0 ? 3600 : max < 3600 ? Math.ceil(max / 900) * 900 : Math.ceil(max / 3600) * 3600);
const parties = (count: number) => `${count} partie${count > 1 ? "s" : ""}`;

/** Plein écran : accueil en deux colonnes (`min-[1600px]` dans HomeScreen), assez haut pour garder la place des amis sous la grille. */
const wideQuery = () => window.matchMedia("(min-width: 1600px) and (min-height: 1000px)");
const subscribeWide = (change: () => void) => {
  const query = wideQuery();
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};

/**
 * Temps joué jour par jour : les 7 derniers jours en barres, ou les trois derniers mois en cases
 * (la régularité) ; en plein écran, les deux à la fois, sans choix de période. Le total de la
 * période comparé à la précédente, puis parties, série en cours et plus longue partie. Survol, ou
 * flèches du clavier, pour le détail d'un jour. La grille de l'année reste sur la page Profil.
 */
export function RecentActivity({ sessions }: { sessions: PlaySession[] }) {
  const [picked, setRange] = useState<Range>("week");
  const wide = useSyncExternalStore(subscribeWide, () => wideQuery().matches);
  const range = wide ? "week" : picked;
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const bars = useRef<(HTMLButtonElement | null)[]>([]);
  const label = RANGES[range];
  const now = new Date();
  const grid = range === "quarter" ? activity(sessions, now, QUARTER_WEEKS).days : null;
  // Chiffres sur les mêmes jours que la grille : du lundi de sa première semaine à aujourd'hui.
  const count = grid ? grid.filter((day) => !day.future).length : 7;
  const { days, total, sessions: played, daysPlayed, previous, longest, streak } = recentActivity(sessions, now, count);
  const top = scaleTop(Math.max(...days.map((day) => day.seconds)));
  const delta = total - previous;
  const today = count - 1;
  const shownIndex = hovered ?? focused;
  const shown = shownIndex === null ? null : days[shownIndex];
  const columns = { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`, columnGap: "10px" };
  const height = (seconds: number) => (seconds ? `max(4px, ${(seconds / top) * 100}%)` : "2px");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-display text-[26px] leading-none">{total ? formatDuration(total) : "0 min"}</span>
          <span className="text-xs text-muted-foreground">{daysPlayed ? `${daysPlayed} jour${daysPlayed > 1 ? "s" : ""} de jeu sur ${count}` : `Pas joué sur ${label}`}</span>
          {Math.abs(delta) >= 60 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {delta > 0 ? <TrendingUp className="size-3.5 shrink-0 text-primary" aria-hidden /> : <TrendingDown className="size-3.5 shrink-0" aria-hidden />}
              {/* Colonne étroite : deux lignes équilibrées plutôt que « qu'avant » seul. */}
              <span className="text-balance">
                {formatDuration(Math.abs(delta))} {delta > 0 ? "de plus" : "de moins"} qu'avant
              </span>
            </span>
          )}
        </div>
        {!wide && (
          <SegmentBar role="group" aria-label="Période d'activité" value={range} className="shrink-0 gap-0.5 p-0.5 [--mc-radius:5px]">
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
                className={cn(slidingSegment(range === id), "px-2.5 py-0.5 text-[11px]")}
              >
                {RANGES[id]}
              </button>
            ))}
          </SegmentBar>
        )}
      </div>

      {grid ? (
        <HeatmapGrid key={range} days={grid} weeks={QUARTER_WEEKS} label={`Temps de jeu sur ${label} : ${total ? formatDuration(total) : "aucun"}, ${daysPlayed} jour${daysPlayed > 1 ? "s" : ""} de jeu`} />
      ) : (
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
                {index === today ? "auj." : weekdayFormat.format(day.date)}
              </span>
            ))}
          </div>
        </div>
      )}

      {wide && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-[10px] text-muted-foreground">3 derniers mois</span>
          <HeatmapGrid days={activity(sessions, now, QUARTER_WEEKS).days} weeks={QUARTER_WEEKS} label="Temps de jeu sur les 3 derniers mois" />
        </div>
      )}

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
