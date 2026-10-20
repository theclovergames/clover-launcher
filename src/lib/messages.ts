/**
 * Messages entre amis, sans interface : ordre et filtre des conversations, fusion des pages
 * relevées, jours, suites de messages, « Vu », non-lus et nouveaux messages à annoncer. Testé par
 * `tests/messages.test.ts`.
 */
import type { ChatMessage, Conversation, FriendRequest, MessagePreview } from "../types";

/** Longueur d'un message, en points de code comme le site. */
export const BODY_MAX = 1000;
/** Le compteur du champ apparaît près de la limite. */
export const COUNTER_FROM = 900;
/** Un message se modifie jusqu'à 15 minutes après son envoi. */
export const EDIT_WINDOW_MS = 15 * 60_000;
/** Messages du même auteur à moins de 5 minutes d'écart : une suite, avec une seule heure. */
export const RUN_GAP_MS = 5 * 60_000;
/** Longueur d'un aperçu (liste des conversations, citation). */
const PREVIEW_MAX = 200;

/** Points de code : un émoji simple compte pour un, comme sur le site. */
export const codePoints = (text: string) => [...text].length;

/** Aperçu d'un message, pour la liste des conversations ou une citation. */
export function toPreview(message: ChatMessage): MessagePreview {
  const text = message.deleted ? "" : [...message.body.replace(/\s+/g, " ").trim()].slice(0, PREVIEW_MAX).join("");
  return { id: message.id, fromMe: message.fromMe, kind: message.kind, preview: text, at: message.at, deleted: message.deleted };
}

/**
 * Texte d'un aperçu : « Message supprimé », « GIF · chat qui danse ». Le site écrit déjà « GIF · »
 * devant le titre ; un aperçu fait ici (message envoyé) n'a que le titre.
 */
export function previewText(preview: MessagePreview): string {
  if (preview.deleted) return "Message supprimé";
  if (preview.kind === "gif") {
    const title = preview.preview.replace(/^GIF(?: · |$)/, "").trim();
    return title ? `GIF · ${title}` : "GIF";
  }
  return preview.preview;
}

/**
 * Messages connus après une relève : `incoming` ajoute ou remplace, `updates` ne remplace que des
 * messages déjà chargés (les plus anciens se chargeront à jour). Les citations d'un message modifié
 * ou supprimé suivent. Ordre croissant, sans doublon ; la même liste si rien ne change.
 */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[], updates: ChatMessage[] = []): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  const changed = new Map<number, ChatMessage>();
  for (const message of incoming) {
    byId.set(message.id, message);
    changed.set(message.id, message);
  }
  for (const message of updates) {
    if (!byId.has(message.id)) continue;
    byId.set(message.id, message);
    changed.set(message.id, message);
  }
  if (changed.size === 0) return current;
  return [...byId.values()]
    .map((message) => {
      const quoted = message.replyTo && changed.get(message.replyTo.id);
      return quoted ? { ...message, replyTo: toPreview(quoted) } : message;
    })
    .sort((a, b) => a.id - b.id);
}

const startOfDay = (at: number) => {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/** « Aujourd'hui », « Hier », « Lundi 12 octobre », avec l'année si ce n'est pas la même. */
export function dayLabel(at: number, now: number): string {
  // Arrondi : un jour de changement d'heure dure 23 ou 25 heures.
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const label = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: sameYear ? undefined : "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export type Day<T> = { key: number; label: string; items: T[] };

/** Messages rangés par jour (heure locale), dans l'ordre reçu. */
export function groupByDay<T extends { at: number }>(items: T[], now: number): Day<T>[] {
  const days: Day<T>[] = [];
  for (const item of items) {
    const key = startOfDay(item.at);
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(item);
    else days.push({ key, label: dayLabel(item.at, now), items: [item] });
  }
  return days;
}

/** Deux messages qui se suivent dans la même suite : même auteur, même origine, moins de 5 minutes. */
export function sameRun(previous: Pick<ChatMessage, "fromMe" | "source" | "at"> | undefined, next: Pick<ChatMessage, "fromMe" | "source" | "at"> | undefined): boolean {
  return Boolean(previous && next && previous.fromMe === next.fromMe && previous.source === next.source && Math.abs(next.at - previous.at) < RUN_GAP_MS);
}

/**
 * Message sous lequel afficher « Vu » : mon dernier message vu par l'ami (`seenUpTo`), tant que
 * l'ami n'a pas répondu après lui (sa réponse dit déjà qu'il a lu).
 */
export function seenMessageId(messages: ChatMessage[], seenUpTo: number): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.deleted) continue;
    if (!message.fromMe) return null;
    if (message.id <= seenUpTo) return message.id;
  }
  return null;
}

/** Dernier message reçu de l'ami, jusqu'où marquer la conversation lue. */
export function lastIncomingId(messages: ChatMessage[]): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) if (!messages[index].fromMe) return messages[index].id;
  return null;
}

/** Premier message reçu après `lastReadId` : la ligne « Nouveaux messages » se pose avant lui. */
export function firstUnreadId(messages: ChatMessage[], lastReadId: number): number | null {
  return messages.find((message) => !message.fromMe && !message.deleted && message.id > lastReadId)?.id ?? null;
}

/** Modifiable : mon texte, non supprimé, envoyé il y a moins de 15 minutes (heure du site). */
export function canEdit(message: ChatMessage, now: number): boolean {
  return message.fromMe && message.kind === "text" && !message.deleted && now - message.at <= EDIT_WINDOW_MS;
}

/** Ordre du site : dernier message le plus récent, puis les amis en ligne, puis le nom. */
export function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort(
    (a, b) =>
      (b.last?.at ?? -1) - (a.last?.at ?? -1) ||
      Number(b.friend.online) - Number(a.friend.online) ||
      a.friend.name.localeCompare(b.friend.name, "fr", { sensitivity: "base" }),
  );
}

/** Conversations affichées : archivées ou non ; une recherche par pseudo parcourt les deux. */
export function filterConversations(list: Conversation[], query: string, archived: boolean): Conversation[] {
  const wanted = query.trim().toLowerCase();
  if (wanted) return list.filter((conversation) => conversation.friend.name.toLowerCase().includes(wanted));
  return list.filter((conversation) => conversation.archived === archived);
}

/** Non-lus de la pastille : une conversation coupée ne compte pas. */
export function unreadCount(list: Conversation[]): number {
  return list.reduce((total, conversation) => total + (conversation.muted ? 0 : conversation.unread), 0);
}

/** Conversation avec `friend` modifiée par `change`, liste remise dans l'ordre. */
export function updateConversation(list: Conversation[], friend: string, change: (conversation: Conversation) => Conversation): Conversation[] {
  return sortConversations(list.map((conversation) => (conversation.friend.uuid === friend ? change(conversation) : conversation)));
}

/** Message envoyé ou reçu : il devient le dernier de sa conversation s'il est plus récent. */
export function withLast(list: Conversation[], friend: string, message: ChatMessage): Conversation[] {
  return updateConversation(list, friend, (conversation) => (conversation.last && conversation.last.id > message.id ? conversation : { ...conversation, last: toPreview(message) }));
}

/**
 * Nouveaux messages reçus depuis la dernière relève, à annoncer par une bulle du système. `known`
 * garde le dernier message vu de chaque conversation ; à `null` (première relève, autre compte),
 * rien n'est annoncé : pas de rafale au démarrage. Une conversation coupée n'est pas annoncée.
 */
export function freshIncoming(known: ReadonlyMap<string, number> | null, list: Conversation[]): { known: Map<string, number>; fresh: Conversation[] } {
  const next = new Map(known ?? []);
  const fresh: Conversation[] = [];
  for (const conversation of list) {
    const last = conversation.last;
    if (!last) continue;
    const before = next.get(conversation.friend.uuid) ?? 0;
    if (last.id <= before) continue;
    next.set(conversation.friend.uuid, last.id);
    if (known && !last.fromMe && !last.deleted && conversation.unread > 0 && !conversation.muted) fresh.push(conversation);
  }
  return { known: next, fresh };
}

/**
 * Demandes d'amis reçues depuis la relève précédente, pour les bulles du système ; aucune à la
 * première relève (`known` à `null`), qui ne fait que les noter.
 */
export function freshRequests(known: ReadonlySet<string> | null, incoming: FriendRequest[]): { known: Set<string>; fresh: FriendRequest[] } {
  const key = (request: FriendRequest) => `${request.uuid}:${request.at}`;
  const next = new Set(incoming.map(key));
  return { known: next, fresh: known ? incoming.filter((request) => !known.has(key(request))) : [] };
}

/** Message fait seulement d'un à quelques émojis : affiché en grand. */
export function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim();
  return codePoints(trimmed) <= 16 && /\p{Extended_Pictographic}/u.test(trimmed) && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u{200d}|\u{fe0f}|\s)+$/u.test(trimmed);
}

/** Répartit des images en colonnes de hauteurs proches (grille de GIF), dans l'ordre donné. */
export function masonry<T extends { width: number; height: number }>(items: T[], columns: number): T[][] {
  const heights = Array.from({ length: columns }, () => 0);
  const result = Array.from({ length: columns }, () => [] as T[]);
  for (const item of items) {
    const column = heights.indexOf(Math.min(...heights));
    result[column].push(item);
    heights[column] += item.width > 0 && item.height > 0 ? item.height / item.width : 1;
  }
  return result;
}

const clockFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const weekdayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

/** Heure d'un message : « 14:32 ». */
export const clock = (at: number) => clockFormat.format(at);

/** Date du dernier message dans la liste : « 14:32 », « hier », « lun. », « 12 oct. ». */
export function shortWhen(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return clock(at);
  if (days === 1) return "hier";
  if (days < 7) return weekdayFormat.format(at);
  return dateFormat.format(at);
}
