import assert from "node:assert/strict";
import test from "node:test";

import {
  canEdit,
  codePoints,
  EDIT_WINDOW_MS,
  filterConversations,
  firstUnreadId,
  freshIncoming,
  freshRequests,
  groupByDay,
  isEmojiOnly,
  lastIncomingId,
  masonry,
  mergeMessages,
  previewText,
  reactionChips,
  sameRun,
  seenMessageId,
  sortConversations,
  toggledReaction,
  unreadCount,
  withLast,
} from "../src/lib/messages.ts";
import type { ChatMessage, Conversation } from "../src/types.ts";

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

function message(id: number, fromMe: boolean, time: number, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id, fromMe, kind: "text", body: `message ${id}`, gif: null, replyTo: null, source: "launcher", at: time, editedAt: null, deleted: false, reactions: { mine: null, theirs: null }, ...extra };
}

function conversation(name: string, extra: Partial<Conversation> = {}, online = false): Conversation {
  return {
    friend: { uuid: `uuid-${name}`, name, online, server: null, lastSeen: null, status: null, canJoin: false },
    last: null,
    unread: 0,
    archived: false,
    muted: false,
    canWrite: true,
    ...extra,
  };
}

const last = (id: number, time: number, fromMe = false) => ({ id, fromMe, kind: "text" as const, preview: `message ${id}`, at: time, deleted: false });

test("une relève ajoute les nouveaux messages et applique les modifications aux messages chargés", () => {
  const current = [message(10, false, at(20, 10)), message(11, true, at(20, 10, 1), { replyTo: last(10, at(20, 10)) })];
  const edited = message(10, false, at(20, 10), { body: "corrigé", editedAt: at(20, 10, 2) });
  const older = message(3, true, at(19, 9), { deleted: true, body: "" });
  const merged = mergeMessages(current, [message(12, false, at(20, 10, 3)), message(11, true, at(20, 10, 1), { replyTo: last(10, at(20, 10)) })], [edited, older]);
  assert.deepEqual(merged.map((entry) => entry.id), [10, 11, 12]);
  assert.equal(merged[0].body, "corrigé");
  // La citation suit le message modifié ; un message plus ancien que la page n'est pas ajouté.
  assert.equal(merged[1].replyTo?.preview, "corrigé");
  // Rien de nouveau : la même liste, sans nouveau rendu.
  assert.equal(mergeMessages(merged, [], [older]), merged);
});

test("une page plus ancienne se place avant, sans doublon", () => {
  const current = [message(50, true, at(20, 12)), message(51, false, at(20, 12, 1))];
  const merged = mergeMessages(current, [message(48, false, at(19, 8)), message(49, true, at(19, 8, 5)), message(50, true, at(20, 12))]);
  assert.deepEqual(merged.map((entry) => entry.id), [48, 49, 50, 51]);
});

test("un message supprimé pour tous efface aussi sa citation", () => {
  const current = [message(1, false, at(20, 9)), message(2, true, at(20, 9, 1), { replyTo: last(1, at(20, 9)) })];
  const merged = mergeMessages(current, [], [message(1, false, at(20, 9), { deleted: true, body: "" })]);
  assert.equal(merged[1].replyTo?.deleted, true);
  assert.equal(previewText(merged[1].replyTo!), "Message supprimé");
});

test("les messages se rangent par jour, avec Aujourd'hui et Hier", () => {
  const now = at(20, 18);
  const days = groupByDay([message(1, true, at(12, 9)), message(2, false, at(19, 23, 59)), message(3, true, at(20, 0, 1)), message(4, false, at(20, 17))], now);
  assert.deepEqual(days.map((day) => day.label), ["Lundi 12 octobre", "Hier", "Aujourd'hui"]);
  assert.deepEqual(days.map((day) => day.items.map((item) => item.id)), [[1], [2], [3, 4]]);
  assert.match(groupByDay([message(1, true, new Date(2025, 11, 31, 12).getTime())], now)[0].label, /2025/);
});

test("une suite réunit les messages proches du même auteur et de la même origine", () => {
  const first = message(1, true, at(20, 10));
  assert.equal(sameRun(first, message(2, true, at(20, 10, 4))), true);
  assert.equal(sameRun(first, message(2, true, at(20, 10, 6))), false);
  assert.equal(sameRun(first, message(2, false, at(20, 10, 1))), false);
  assert.equal(sameRun(first, message(2, true, at(20, 10, 1), { source: "game" })), false);
  assert.equal(sameRun(undefined, first), false);
});

test("« Vu » se place sous mon dernier message lu, tant que l'ami n'a pas répondu", () => {
  const messages = [message(1, false, at(20, 9)), message(2, true, at(20, 9, 1)), message(3, true, at(20, 9, 2))];
  assert.equal(seenMessageId(messages, 3), 3);
  assert.equal(seenMessageId(messages, 2), 2);
  assert.equal(seenMessageId(messages, 1), null);
  assert.equal(seenMessageId([...messages, message(4, false, at(20, 9, 3))], 3), null);
  // Mon dernier message supprimé : le « Vu » remonte au précédent.
  assert.equal(seenMessageId([...messages.slice(0, 2), message(3, true, at(20, 9, 2), { deleted: true })], 3), 2);
});

test("non-lus : premier message à lire et dernier message reçu", () => {
  const messages = [message(1, false, at(20, 9)), message(2, true, at(20, 9, 1)), message(3, false, at(20, 9, 2), { deleted: true }), message(4, false, at(20, 9, 3)), message(5, true, at(20, 9, 4))];
  assert.equal(firstUnreadId(messages, 1), 4);
  assert.equal(firstUnreadId(messages, 4), null);
  assert.equal(lastIncomingId(messages), 4);
  assert.equal(lastIncomingId([message(1, true, at(20, 9))]), null);
});

test("la pastille ignore les conversations coupées", () => {
  assert.equal(unreadCount([conversation("A", { unread: 2 }), conversation("B", { unread: 5, muted: true }), conversation("C", { unread: 1, archived: true })]), 3);
});

test("ordre : dernier message le plus récent, puis en ligne, puis le nom", () => {
  const list = [
    conversation("zed"),
    conversation("Alpha"),
    conversation("Online", {}, true),
    conversation("Recent", { last: last(9, at(20, 12)) }),
    conversation("Older", { last: last(5, at(19, 12)) }),
  ];
  assert.deepEqual(sortConversations(list).map((entry) => entry.friend.name), ["Recent", "Older", "Online", "Alpha", "zed"]);
});

test("filtre : archivées à part, la recherche parcourt tout", () => {
  const list = [conversation("Kanname"), conversation("Kaysuto", { archived: true }), conversation("Bob")];
  assert.deepEqual(filterConversations(list, "", false).map((entry) => entry.friend.name), ["Kanname", "Bob"]);
  assert.deepEqual(filterConversations(list, "", true).map((entry) => entry.friend.name), ["Kaysuto"]);
  assert.deepEqual(filterConversations(list, " ka", false).map((entry) => entry.friend.name), ["Kanname", "Kaysuto"]);
});

test("un message envoyé devient le dernier de sa conversation et la remonte", () => {
  const list = [conversation("A", { last: last(9, at(20, 12)) }), conversation("B", { last: last(5, at(19, 12)) })];
  const next = withLast(list, "uuid-B", message(10, true, at(20, 13), { body: "salut\ntoi" }));
  assert.deepEqual(next.map((entry) => entry.friend.name), ["B", "A"]);
  assert.equal(next[0].last?.preview, "salut toi");
  // Un message plus ancien que le dernier connu ne le remplace pas.
  assert.equal(withLast(next, "uuid-B", message(7, false, at(19, 13)))[0].last?.id, 10);
});

test("bulles du système : rien à la première relève, puis seulement les nouveaux messages reçus", () => {
  const first = [conversation("A", { last: last(9, at(20, 12)), unread: 1 }), conversation("B", { last: last(5, at(19, 12), true) })];
  const start = freshIncoming(null, first);
  assert.equal(start.fresh.length, 0);
  const later = [
    conversation("A", { last: last(11, at(20, 13)), unread: 2 }),
    conversation("B", { last: last(6, at(20, 13), true) }),
    conversation("C", { last: last(12, at(20, 13)), unread: 1, muted: true }),
    conversation("D", { last: last(13, at(20, 13)), unread: 1 }),
  ];
  const next = freshIncoming(start.known, later);
  assert.deepEqual(next.fresh.map((entry) => entry.friend.name), ["A", "D"]);
  // Relevé une seconde fois : déjà annoncé.
  assert.equal(freshIncoming(next.known, later).fresh.length, 0);
});

test("modifiable 15 minutes après l'envoi, ses textes seulement", () => {
  const sent = message(1, true, at(20, 10));
  assert.equal(canEdit(sent, sent.at + EDIT_WINDOW_MS), true);
  assert.equal(canEdit(sent, sent.at + EDIT_WINDOW_MS + 1), false);
  assert.equal(canEdit(message(1, false, at(20, 10)), at(20, 10)), false);
  assert.equal(canEdit(message(1, true, at(20, 10), { kind: "gif" }), at(20, 10)), false);
  assert.equal(canEdit(message(1, true, at(20, 10), { deleted: true }), at(20, 10)), false);
});

test("longueur en points de code, émojis seuls affichés en grand", () => {
  assert.equal(codePoints("🍀🍀"), 2);
  assert.equal(isEmojiOnly("🍀"), true);
  assert.equal(isEmojiOnly(" 👍🏽 ❤️ "), true);
  assert.equal(isEmojiOnly("gg 🍀"), false);
  assert.equal(isEmojiOnly("123"), false);
});

test("la grille de GIF équilibre la hauteur de ses colonnes", () => {
  const columns = masonry(
    [
      { id: "a", width: 200, height: 400 },
      { id: "b", width: 200, height: 100 },
      { id: "c", width: 200, height: 100 },
      { id: "d", width: 0, height: 0 },
    ],
    2,
  );
  assert.deepEqual(columns.map((column) => column.map((item) => item.id)), [["a"], ["b", "c", "d"]]);
});

test("une demande d'ami ne fait une bulle qu'à son arrivée, pas à la première relève", () => {
  const kanname = { uuid: "f1", name: "Kanname", at: 1, expiresAt: 2 };
  const first = freshRequests(null, [kanname]);
  assert.deepEqual(first.fresh, []);
  const again = freshRequests(first.known, [kanname]);
  assert.deepEqual(again.fresh, []);
  const steve = { uuid: "f2", name: "Steve", at: 3, expiresAt: 4 };
  assert.deepEqual(freshRequests(again.known, [steve, kanname]).fresh, [steve]);
  // Refusée puis renvoyée : une nouvelle demande.
  assert.deepEqual(freshRequests(again.known, [{ ...kanname, at: 5 }]).fresh.length, 1);
});

test("un GIF s'annonce une seule fois « GIF · », qu'il vienne du site ou d'un envoi", () => {
  const gif = { id: 1, fromMe: true, kind: "gif" as const, at: 1, deleted: false };
  assert.equal(previewText({ ...gif, preview: "GIF · Good Game Fist Bump GIF" }), "GIF · Good Game Fist Bump GIF");
  assert.equal(previewText({ ...gif, preview: "Good Game Fist Bump GIF" }), "GIF · Good Game Fist Bump GIF");
  assert.equal(previewText({ ...gif, preview: "GIF" }), "GIF");
  assert.equal(previewText({ ...gif, preview: "" }), "GIF");
});

test("réactions : la même retire, une autre remplace, deux identiques en une pastille", () => {
  assert.equal(toggledReaction({ mine: "❤️", theirs: null }, "❤️"), null);
  assert.equal(toggledReaction({ mine: "❤️", theirs: null }, "😂"), "😂");
  assert.deepEqual(reactionChips({ mine: null, theirs: null }), []);
  assert.deepEqual(reactionChips({ mine: "👍", theirs: "👍" }), [{ emoji: "👍", mine: true, theirs: true }]);
  assert.deepEqual(
    reactionChips({ mine: "😂", theirs: "❤️" }).map((chip) => chip.emoji),
    ["❤️", "😂"],
  );
});
