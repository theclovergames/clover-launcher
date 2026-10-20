/**
 * Amis du compte, communs au Profil et aux Messages : où ils sont et si on peut les rejoindre.
 */
import { fold } from "@/lib/utils";
import type { ChatFriend } from "@/types";

const relative = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

/** « il y a 2 heures », « hier », « il y a 3 jours ». */
export function ago(milliseconds: number) {
  const minutes = Math.round((Date.now() - milliseconds) / 60_000);
  if (minutes < 60) return relative.format(-Math.max(1, minutes), "minute");
  if (minutes < 24 * 60) return relative.format(-Math.round(minutes / 60), "hour");
  return relative.format(-Math.round(minutes / (24 * 60)), "day");
}

/** Mode du manifeste désigné par le site, par son identifiant ou son nom (« Practice », « creatif »). */
export function findMode<T extends { id: string; name: string }>(modes: T[], server: string): T | undefined {
  return modes.find((mode) => fold(mode.id) === fold(server) || fold(mode.name) === fold(server));
}

/**
 * Mode où rejoindre l'ami en un clic (Quick Play) : il l'accepte, et son serveur a une adresse
 * directe dans le manifeste.
 */
export function joinableMode<T extends { id: string; name: string; quickPlay: boolean }>(friend: Pick<ChatFriend, "canJoin" | "server">, modes: T[]): T | undefined {
  const mode = friend.server ? findMode(modes, friend.server) : undefined;
  return friend.canJoin && mode?.quickPlay ? mode : undefined;
}

/** « En ligne · Practice », « Vu il y a 2 heures », « Hors ligne ». */
export function presence(friend: Pick<ChatFriend, "online" | "server" | "lastSeen">, modeName?: string): string {
  if (friend.online) return friend.server ? `En ligne · ${modeName ?? friend.server}` : "En ligne";
  return friend.lastSeen ? `Vu ${ago(friend.lastSeen)}` : "Hors ligne";
}
