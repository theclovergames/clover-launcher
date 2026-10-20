import { Clock, Smile } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EMOJI_GROUPS, recentEmojis, rememberEmoji } from "@/lib/emojis";
import { cn } from "@/lib/utils";

const RECENT = "recent";

/**
 * Émojis Unicode natifs, rangés par famille, les récents en premier. Le choix reste ouvert pour
 * en ajouter plusieurs ; Échap le ferme et rend le focus au champ.
 */
export function EmojiPicker({ onPick, disabled }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  const [recent, setRecent] = useState<string[]>([]);
  const [group, setGroup] = useState<string>(RECENT);
  const groups = [...(recent.length > 0 ? [{ id: RECENT, label: "Récents", icon: null, emojis: recent }] : []), ...EMOJI_GROUPS];
  const shown = groups.find((entry) => entry.id === group) ?? groups[0];

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) return;
        const stored = recentEmojis();
        setRecent(stored);
        setGroup(stored.length > 0 ? RECENT : EMOJI_GROUPS[0].id);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Ajouter un émoji"
          title="Émojis"
          className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-50 data-[state=open]:bg-white/[0.06] data-[state=open]:text-primary"
        >
          <Smile className="size-5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="mc-frame w-[328px] gap-2 border-[var(--mc-outline)] bg-card p-2 ring-0">
        <div role="group" aria-label="Familles d'émojis" className="flex gap-0.5 border-b border-border pb-1.5">
          {groups.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={entry.id === shown.id}
              aria-label={entry.label}
              title={entry.label}
              onClick={() => setGroup(entry.id)}
              className={cn("grid size-8 place-items-center rounded-md text-lg transition-colors", entry.id === shown.id ? "bg-secondary" : "opacity-70 hover:bg-white/[0.05] hover:opacity-100")}
            >
              {entry.icon ?? <Clock className="size-4 text-muted-foreground" aria-hidden />}
            </button>
          ))}
        </div>
        <p className="px-1 text-[11px] font-semibold text-muted-foreground">{shown.label}</p>
        <div role="group" aria-label={shown.label} className="grid max-h-[216px] grid-cols-8 gap-0.5 overflow-y-auto pr-0.5">
          {shown.emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                // Récents relus à la prochaine ouverture : la grille ne bouge pas sous le pointeur.
                rememberEmoji(emoji);
                onPick(emoji);
              }}
              className="grid aspect-square place-items-center rounded-md text-[22px] leading-none transition-transform hover:bg-white/[0.06] motion-safe:hover:scale-110"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
