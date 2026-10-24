import type { Availability, ChatFriend } from "@/types";

/** Statuts du menu de Messages, dans l'ordre : libellé, explication, pastille et couleur du texte. */
export const AVAILABILITIES: Record<Availability, { label: string; hint: string | null; dot: string; text: string }> = {
  online: { label: "En ligne", hint: null, dot: "bg-primary", text: "text-primary" },
  busy: { label: "Occupé", hint: "Ni son ni bulle pour les nouveaux messages.", dot: "bg-destructive", text: "text-error" },
  away: { label: "Absent", hint: null, dot: "bg-[#e0a63a]", text: "text-[#e0a63a]" },
  invisible: { label: "Invisible", hint: "Tes amis te voient hors ligne, tu les vois toujours.", dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

/** Durées d'un statut, comme sur Discord ; `null` : jusqu'à ce que le joueur le change. */
export const DURATIONS: { label: string; ms: number | null }[] = [
  { label: "Pendant 15 minutes", ms: 15 * 60_000 },
  { label: "Pendant 1 heure", ms: 60 * 60_000 },
  { label: "Pendant 8 heures", ms: 8 * 60 * 60_000 },
  { label: "Pendant 24 heures", ms: 24 * 60 * 60_000 },
  { label: "Pendant 3 jours", ms: 3 * 24 * 60 * 60_000 },
  { label: "Jusqu'à ce que je le change", ms: null },
];

/** Statut choisi et son échéance (millisecondes), `null` sans échéance. */
export type ChosenStatus = { availability: Availability; until: number | null };
export const ONLINE: ChosenStatus = { availability: "online", until: null };

const KEY = "clover.availability";

/** Statut enregistré (`raw`, JSON) ; « En ligne » s'il est échu, inconnu ou illisible. */
export function parseStatus(raw: string | null, now = Date.now()): ChosenStatus {
  try {
    const value = JSON.parse(raw ?? "null") as Partial<ChosenStatus> | null;
    const known = typeof value?.availability === "string" && Object.prototype.hasOwnProperty.call(AVAILABILITIES, value.availability);
    const until = value?.until ?? null;
    if (known && (until === null || (typeof until === "number" && until > now))) return { availability: value!.availability!, until };
  } catch {
    // Illisible : on repart en ligne.
  }
  return ONLINE;
}

/** Statut du compte `owner`, gardé d'un lancement à l'autre ; rien de choisi : « En ligne ». */
export function readStatus(owner: string): ChosenStatus {
  try {
    return parseStatus(localStorage.getItem(`${KEY}.${owner}`));
  } catch {
    return ONLINE;
  }
}

export function saveStatus(owner: string, status: ChosenStatus) {
  try {
    localStorage.setItem(`${KEY}.${owner}`, JSON.stringify(status));
  } catch {
    // Sans stockage, le statut vaut pour cette session seulement.
  }
}

/** Ce qu'on voit d'un ami : son statut du launcher, sinon « En ligne » s'il joue ; `null` hors ligne. */
export function shownStatus(friend: Pick<ChatFriend, "online" | "availability">): Exclude<Availability, "invisible"> | null {
  return friend.availability ?? (friend.online ? "online" : null);
}
