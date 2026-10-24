import { Check, ChevronUp } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AVAILABILITIES, type ChosenStatus, DURATIONS } from "@/lib/availability";
import { headUrl } from "@/lib/friends";
import { cn } from "@/lib/utils";
import type { Availability } from "@/types";

const ORDER: Availability[] = ["online", "busy", "away", "invisible"];
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayTime = new Intl.DateTimeFormat("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** « jusqu'à 18:30 » le jour même, sinon « jusqu'à sam. 18:30 ». */
function untilText(until: number) {
  const same = new Date(until).toDateString() === new Date().toDateString();
  return `jusqu'à ${(same ? time : dayTime).format(until)}`;
}

/** Pastille de statut posée sur le coin d'une tête ; rien hors ligne. */
export function StatusDot({ availability, className }: { availability: Availability | null; className?: string }) {
  if (!availability) return null;
  return <span aria-hidden className={cn("absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-background", AVAILABILITIES[availability].dot, className)} />;
}

/**
 * Ton statut, en bas de la liste des conversations : tête, pseudo, statut et échéance. Le menu le
 * change ; Occupé, Absent et Invisible se choisissent pour une durée, comme sur Discord.
 */
export function StatusMenu({ name, status, onChange }: { name: string; status: ChosenStatus; onChange: (next: ChosenStatus) => void }) {
  const current = AVAILABILITIES[status.availability];
  const pick = (availability: Availability, ms: number | null) => onChange({ availability, until: ms === null ? null : Date.now() + ms });
  const entry = (availability: Availability) => {
    const { label, hint, dot } = AVAILABILITIES[availability];
    return (
      <>
        <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", dot)} />
        <span className="flex min-w-0 flex-col gap-0.5">
          {label}
          {hint && <span className="text-[11px] font-normal text-muted-foreground">{hint}</span>}
        </span>
        {availability === status.availability && <Check className="ml-auto" aria-label="Statut actuel" />}
      </>
    );
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Ton statut : ${current.label}. Changer de statut`} className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04] data-[state=open]:bg-white/[0.04]">
          <span className="relative shrink-0">
            <img src={headUrl(name)} alt="" width={32} height={32} draggable={false} className={cn("pixelated size-8 rounded-[4px]", status.availability === "invisible" && "opacity-60 grayscale-[35%]")} />
            <StatusDot availability={status.availability} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-bold">{name}</span>
            <span className={cn("truncate text-[11px]", current.text)}>
              {current.label}
              {status.until !== null && <span className="text-muted-foreground"> · {untilText(status.until)}</span>}
            </span>
          </span>
          <ChevronUp className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        {ORDER.map((availability) =>
          availability === "online" ? (
            <DropdownMenuItem key={availability} onSelect={() => pick(availability, null)}>
              {entry(availability)}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub key={availability}>
              <DropdownMenuSubTrigger>{entry(availability)}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {DURATIONS.map((duration) => (
                  <DropdownMenuItem key={duration.label} onSelect={() => pick(availability, duration.ms)}>
                    {duration.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
