import { Play, Send, Star } from "lucide-react";

import { StatusDot } from "@/components/StatusMenu";
import { AVAILABILITIES, shownStatus } from "@/lib/availability";
import { iconButton } from "@/lib/buttons";
import { headUrl, presence } from "@/lib/friends";
import { cn } from "@/lib/utils";
import type { ChatFriend, ModeStatus } from "@/types";

/**
 * Ami : tête, pseudo, où il est ; « Rejoindre » s'il l'accepte et que son serveur a une adresse
 * directe, « Écrire » ouvre sa conversation. Profil et accueil.
 */
export function FriendRow({ friend, mode, playBusy, onJoin, onWrite, onOpen }: { friend: ChatFriend & { favorite?: boolean }; mode: Pick<ModeStatus, "id" | "name" | "quickPlay"> | undefined; playBusy: boolean; onJoin: (mode: string) => void; onWrite?: () => void; onOpen?: () => void }) {
  const where = presence(friend, mode?.name);
  const shown = shownStatus(friend);
  const joinable = friend.canJoin && mode?.quickPlay === true;
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03]">
      <span className="relative shrink-0">
        <img src={headUrl(friend.name)} alt="" width={36} height={36} className={cn("pixelated size-9 rounded-[4px]", !shown && "opacity-60 grayscale-[35%]")} />
        <StatusDot availability={shown} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          {onOpen ? (
            <button type="button" onClick={onOpen} title={`Voir le profil de ${friend.name}`} className="truncate text-[13px] font-bold underline-offset-2 hover:underline">
              {friend.name}
            </button>
          ) : (
            <span className="truncate text-[13px] font-bold">{friend.name}</span>
          )}
          {friend.favorite && <Star className="size-3 shrink-0 fill-[#e8bc5c] text-[#e8bc5c]" aria-label="Favori" />}
        </span>
        <span className={cn("truncate text-[11px]", shown ? AVAILABILITIES[shown].text : "text-muted-foreground")}>
          {where}
          {friend.status && <span className="text-muted-foreground italic"> · {friend.status}</span>}
        </span>
      </span>
      {joinable && mode && (
        <button
          type="button"
          disabled={playBusy}
          onClick={() => onJoin(mode.id)}
          title={`Rejoindre ${friend.name} sur ${mode.name}`}
          className="flex shrink-0 items-center gap-1 rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary transition-colors enabled:hover:bg-primary/20 disabled:opacity-60"
        >
          <Play className="size-3 fill-current" aria-hidden />
          Rejoindre
        </button>
      )}
      {onWrite && (
        <button
          type="button"
          onClick={onWrite}
          aria-label={`Écrire à ${friend.name}`}
          title={`Écrire à ${friend.name}`}
          className={cn(iconButton, "shrink-0")}
        >
          <Send className="size-4" aria-hidden />
        </button>
      )}
    </li>
  );
}
