import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  Ban,
  Bell,
  BellOff,
  CheckCheck,
  CircleAlert,
  CloudOff,
  Copy,
  Ellipsis,
  Eraser,
  Flag,
  Gamepad2,
  Globe,
  LoaderCircle,
  type LucideIcon,
  MessageCircle,
  Monitor,
  PenLine,
  Play,
  Reply,
  RotateCcw,
  SendHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, type KeyboardEvent, type ReactNode, type UIEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { EmojiPicker } from "@/components/EmojiPicker";
import { EmptyState } from "@/components/EmptyState";
import { GifPicker } from "@/components/GifPicker";
import { SearchField } from "@/components/SearchField";
import { Tabs } from "@/components/Tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { secondaryButton } from "@/lib/buttons";
import { findMode, joinableMode, presence } from "@/lib/friends";
import {
  BODY_MAX,
  canEdit,
  clock,
  codePoints,
  COUNTER_FROM,
  filterConversations,
  firstUnreadId,
  groupByDay,
  isEmojiOnly,
  lastIncomingId,
  mergeMessages,
  previewText,
  sameRun,
  seenMessageId,
  shortWhen,
  toPreview,
  updateConversation,
  withLast,
} from "@/lib/messages";
import { cn } from "@/lib/utils";
import { type Confirmation, ConfirmDialog, ReportDialog } from "@/screens/Dialogs";
import type { ChatFriend, ChatMessage, Conversation, GifResult, Inbox, MessagePreview, MessageSource, Thread } from "@/types";

/** Conversation ouverte, fenêtre au premier plan : nouveaux messages toutes les 3 s. */
const THREAD_POLL_MS = 3_000;
/** Liste des conversations, tant que la page est ouverte. */
const LIST_POLL_MS = 15_000;
/** Distance du bas sous laquelle la conversation suit les nouveaux messages. */
const STICK_PX = 64;
/** Distance du haut où les messages plus anciens se chargent. */
const OLDER_PX = 160;
/** Hauteur maximale du champ avant qu'il défile. */
const COMPOSER_MAX_PX = 160;
/** Largeur d'un GIF dans la conversation (rendu `fixed_width` de Giphy). */
const GIF_WIDTH_PX = 240;

type Mode = { id: string; name: string; quickPlay: boolean };

export type MessagesServices = Pick<
  typeof api,
  "messageThread" | "sendMessage" | "sendGif" | "editMessage" | "deleteMessage" | "markMessagesRead" | "setConversationState" | "reportMessage" | "searchGifs"
>;

type Props = {
  /** UUID de l'ami dont la conversation est ouverte. */
  friend: string | null;
  onOpen: (friend: string | null) => void;
  /** Conversations relevées par l'application (pastille de la colonne) ; `null` avant la première relève. */
  inbox: Inbox | null;
  /** Dernière relève échouée (site injoignable, messages pas encore en ligne). */
  inboxError: string | null;
  refreshInbox: () => Promise<void>;
  /** Changement local de la liste (lu, envoyé, archivé), sans attendre la relève suivante. */
  updateInbox: (change: (inbox: Inbox) => Inbox) => void;
  /** Modes du manifeste : nom et Quick Play, pour « Rejoindre ». */
  modes: Mode[];
  /** Jeu en préparation ou déjà lancé : « Rejoindre » ne lance rien. */
  playBusy: boolean;
  onPlay: (mode: string) => void;
  onNotice: (message: string) => void;
  /** Sources de données, remplacées par des exemples sur la planche. */
  services?: MessagesServices;
};

const plain = (uuid: string) => uuid.replace(/-/g, "").toLowerCase();
const headUrl = (name: string) => `https://minotar.net/helm/${encodeURIComponent(name)}/48.png`;
const fullDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" });

const ORIGIN: Record<MessageSource, { Icon: LucideIcon; label: string }> = {
  game: { Icon: Gamepad2, label: "écrit en jeu" },
  launcher: { Icon: Monitor, label: "écrit dans le launcher" },
  site: { Icon: Globe, label: "écrit sur le site" },
};

const windowActive = () => !document.hidden && document.hasFocus();
const smooth = (): ScrollBehavior => (document.documentElement.classList.contains("reduce-motion") ? "auto" : "smooth");

/**
 * Amène `target` dans la zone qui défile, en haut ou au milieu, sans faire défiler les panneaux
 * autour (`scrollIntoView` décalerait aussi les conteneurs en `overflow: hidden`).
 */
function scrollWithin(box: HTMLElement, target: HTMLElement, align: "start" | "center", behavior: ScrollBehavior = "auto") {
  const offset = target.getBoundingClientRect().top - box.getBoundingClientRect().top;
  const top = box.scrollTop + offset - (align === "center" ? (box.clientHeight - target.offsetHeight) / 2 : 12);
  box.scrollTo({ top, behavior });
}

/** Fenêtre visible et au premier plan : la conversation ouverte se relève, et se marque lue. */
function useWindowActive() {
  const [active, setActive] = useState(windowActive);
  useEffect(() => {
    const update = () => setActive(windowActive());
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return active;
}

function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-lg bg-white/[0.04]", className)} />;
}

/** Tête de l'ami, avec le point vert s'il est en ligne. */
function FriendHead({ friend, size }: { friend: ChatFriend; size: number }) {
  return (
    <span className="relative shrink-0">
      <img src={headUrl(friend.name)} alt="" width={size} height={size} draggable={false} style={{ width: size, height: size }} className={cn("pixelated rounded-[4px]", !friend.online && "opacity-60 grayscale-[35%]")} />
      {friend.online && <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-background bg-primary" />}
    </span>
  );
}

function ConversationRow({ conversation, selected, modes, onOpen }: { conversation: Conversation; selected: boolean; modes: Mode[]; onOpen: () => void }) {
  const { friend, last, unread, muted } = conversation;
  const loud = unread > 0 && !muted;
  const where = friend.online ? (friend.server ? (findMode(modes, friend.server)?.name ?? friend.server) : "En ligne") : null;
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onOpen}
        className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors", selected ? "bg-primary/12 ring-1 ring-primary/25 ring-inset" : "hover:bg-white/[0.04]")}
      >
        <FriendHead friend={friend} size={36} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className={cn("truncate text-[13px]", loud ? "font-extrabold" : "font-bold")}>{friend.name}</span>
            {where && <span className="min-w-0 truncate text-[11px] text-primary">{where}</span>}
            {last && <span className={cn("ml-auto shrink-0 text-[11px] tabular-nums", loud ? "text-foreground" : "text-muted-foreground")}>{shortWhen(last.at, Date.now())}</span>}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-xs", loud ? "text-foreground" : "text-muted-foreground", last?.deleted && "italic")}>
              {last ? `${last.fromMe ? "Toi : " : ""}${previewText(last)}` : conversation.canWrite ? "Aucun message" : "Ancien ami"}
            </span>
            {muted && <BellOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Notifications coupées" />}
            {unread > 0 && (
              <span className={cn("grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full px-1 font-pixel text-[10px] leading-none", muted ? "bg-secondary text-muted-foreground" : "bg-primary text-primary-foreground")}>
                {unread > 99 ? "99+" : unread}
                <span className="sr-only"> non lu{unread > 1 ? "s" : ""}</span>
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Colonne des conversations : toutes ou archivées, recherche par pseudo. */
function ConversationList({ inbox, error, selected, modes, onOpen }: { inbox: Inbox | null; error: string | null; selected: string | null; modes: Mode[]; onOpen: (friend: string) => void }) {
  const [view, setView] = useState<"all" | "archived">("all");
  const [query, setQuery] = useState("");
  const conversations = inbox?.conversations ?? [];
  const shown = filterConversations(conversations, query, view === "archived");
  const archived = conversations.filter((conversation) => conversation.archived).length;
  return (
    <aside aria-label="Conversations" className="flex w-[clamp(260px,32%,340px)] shrink-0 flex-col border-r border-border">
      <div className="flex flex-col gap-3 px-4 pt-6 pb-3">
        <h1 className="font-display text-[28px] leading-none">Messages</h1>
        <Tabs
          label="Conversations affichées"
          items={[
            { id: "all", label: "Toutes" },
            { id: "archived", label: "Archivées", count: archived > 0 ? archived : undefined },
          ]}
          value={view}
          onChange={setView}
        />
        <SearchField label="Chercher un ami" placeholder="Chercher un ami" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!inbox ? (
          <div className="flex flex-col gap-1.5 px-1">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-[52px]" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
            {query.trim() ? `Aucun ami ne s'appelle « ${query.trim()} ».` : view === "archived" ? "Aucune conversation archivée." : "Toutes tes conversations sont archivées."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {shown.map((conversation) => (
              <ConversationRow
                key={conversation.friend.uuid}
                conversation={conversation}
                selected={selected !== null && plain(selected) === plain(conversation.friend.uuid)}
                modes={modes}
                onOpen={() => onOpen(conversation.friend.uuid)}
              />
            ))}
          </ul>
        )}
      </div>
      {inbox && error && (
        <p role="status" className="flex items-start gap-2 border-t border-border px-4 py-2.5 text-[11px] leading-snug text-muted-foreground">
          <CloudOff className="mt-px size-3.5 shrink-0" aria-hidden />
          Liste non actualisée : {error}
        </p>
      )}
    </aside>
  );
}

type Draft = { kind: "text"; body: string } | { kind: "gif"; gif: GifResult };
/** Message écrit ici, en route vers le site, ou refusé (avec « Réessayer »). */
type Pending = { local: string; draft: Draft; replyTo: MessagePreview | null; at: number; state: "sending" | "failed"; error?: string };

/** Conversation chargée : messages, curseurs du site et état de la conversation. */
type Loaded = {
  messages: ChatMessage[];
  /** Des messages plus anciens restent à charger. */
  hasMore: boolean;
  lastReadId: number;
  seenUpTo: number;
  canWrite: boolean;
  archived: boolean;
  muted: boolean;
  friend: ChatFriend;
  /** Heure du site à la dernière relève : la suivante demande les modifications depuis. */
  since: number;
  /** Écart entre l'heure du site et celle du poste, pour le délai de modification. */
  offset: number;
};

const fromThread = (thread: Thread): Loaded => ({
  messages: thread.messages,
  hasMore: thread.hasMore,
  lastReadId: thread.lastReadId,
  seenUpTo: thread.seenUpTo,
  canWrite: thread.canWrite,
  archived: thread.archived,
  muted: thread.muted,
  friend: thread.friend,
  since: thread.now,
  offset: thread.now ? thread.now - Date.now() : 0,
});

/** Ligne de la conversation : message du site, ou message en route. */
type Entry = { key: string; at: number; fromMe: boolean; source: MessageSource; message: ChatMessage | null; pending: Pending | null };

const entryOf = (message: ChatMessage): Entry => ({ key: `m${message.id}`, at: message.at, fromMe: message.fromMe, source: message.source, message, pending: null });
const pendingEntry = (pending: Pending): Entry => ({ key: pending.local, at: pending.at, fromMe: true, source: "launcher", message: null, pending });

type MessageActions = {
  onReply?: () => void;
  onEdit?: () => void;
  onCopy?: () => void;
  onDeleteForMe: () => void;
  onDeleteForAll?: () => void;
  onReport?: () => void;
};

function MessageMenu({ mine, actions, open, onOpenChange }: { mine: boolean; actions: MessageActions; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Actions du message"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100 hover:bg-white/[0.06] hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <Ellipsis className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={mine ? "end" : "start"} aria-label="Actions du message">
        {actions.onReply && (
          <DropdownMenuItem onSelect={actions.onReply}>
            <Reply aria-hidden />
            Répondre
          </DropdownMenuItem>
        )}
        {actions.onEdit && (
          <DropdownMenuItem onSelect={actions.onEdit}>
            <PenLine aria-hidden />
            Modifier
          </DropdownMenuItem>
        )}
        {actions.onCopy && (
          <DropdownMenuItem onSelect={actions.onCopy}>
            <Copy aria-hidden />
            Copier
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={actions.onDeleteForMe}>
          <Trash2 aria-hidden />
          Supprimer pour moi
        </DropdownMenuItem>
        {actions.onDeleteForAll && (
          <DropdownMenuItem destructive onSelect={actions.onDeleteForAll}>
            <Trash2 aria-hidden />
            Supprimer pour tous
          </DropdownMenuItem>
        )}
        {actions.onReport && (
          <DropdownMenuItem destructive onSelect={actions.onReport}>
            <Flag aria-hidden />
            Signaler
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Citation du message auquel on répond ; un clic y ramène s'il est chargé. */
function Quote({ preview, friendName, onJump }: { preview: MessagePreview; friendName: string; onJump?: () => void }) {
  return (
    <button
      type="button"
      onClick={onJump}
      disabled={!onJump}
      className="mb-1.5 flex w-full min-w-0 flex-col items-start gap-0.5 border-l-2 border-current/35 pl-2 text-left text-xs transition-opacity enabled:hover:opacity-100 disabled:cursor-default opacity-80"
    >
      <span className="font-bold">{preview.fromMe ? "Toi" : friendName}</span>
      <span className={cn("line-clamp-2 break-words text-muted-foreground [overflow-wrap:anywhere]", preview.deleted && "italic")}>{previewText(preview)}</span>
    </button>
  );
}

/**
 * Un message : bulle à droite pour les siens, à gauche avec la tête de l'ami en fin de suite pour
 * les siens à lui. Sous la dernière bulle d'une suite : l'heure, l'origine (jeu, launcher, site),
 * « modifié » et « Vu ».
 */
function MessageRow(props: {
  entry: Entry;
  friend: ChatFriend;
  runStart: boolean;
  runEnd: boolean;
  seen: boolean;
  highlighted: boolean;
  actions: MessageActions | null;
  onJump: (id: number) => void;
  onRetry: () => void;
  onDiscard: () => void;
  onMediaLoad: () => void;
}) {
  const { entry, friend, runStart, runEnd, seen, highlighted, actions } = props;
  const [menu, setMenu] = useState(false);
  const message = entry.message;
  const pending = entry.pending;
  const mine = entry.fromMe;
  const kind = message?.kind ?? pending?.draft.kind ?? "text";
  const deleted = message?.deleted ?? false;
  const body = message ? message.body : pending?.draft.kind === "text" ? pending.draft.body : pending?.draft.kind === "gif" ? pending.draft.gif.title : "";
  const gif = message ? message.gif : pending?.draft.kind === "gif" ? pending.draft.gif : null;
  const replyTo = message?.replyTo ?? pending?.replyTo ?? null;
  const emojiOnly = kind === "text" && !deleted && !replyTo && isEmojiOnly(body);
  const failed = pending?.state === "failed";
  const origin = ORIGIN[entry.source];
  const showMeta = runEnd || Boolean(message?.editedAt) || seen || pending !== null;

  return (
    <li id={message ? `message-${message.id}` : undefined} className={cn("group/message flex items-end gap-2", mine && "flex-row-reverse", runStart ? "mt-3" : "mt-0.5")}>
      {!mine && <span className="w-7 shrink-0">{runEnd && <img src={headUrl(friend.name)} alt="" width={28} height={28} draggable={false} className="pixelated size-7 rounded-[4px]" />}</span>}
      <div className={cn("flex max-w-[min(72%,540px)] min-w-0 flex-col gap-1", mine ? "items-end" : "items-start")}>
        <div className={cn("flex max-w-full min-w-0 items-center gap-1", mine && "flex-row-reverse")}>
          <div
            onContextMenu={(event) => {
              if (!actions) return;
              event.preventDefault();
              setMenu(true);
            }}
            className={cn(
              "relative max-w-full min-w-0 rounded-xl text-[14px] leading-snug transition-[outline-color] duration-300",
              deleted
                ? "border border-dashed border-border px-3 py-2 text-muted-foreground italic"
                : emojiOnly
                  ? "px-0.5 text-[34px] leading-tight"
                  : cn(
                      kind === "gif" && gif ? "p-1" : "px-3 py-2",
                      mine ? "bg-primary/15 ring-1 ring-primary/25 ring-inset" : "bg-card ring-1 ring-border ring-inset",
                      runEnd && (mine ? "rounded-br-sm" : "rounded-bl-sm"),
                    ),
              pending?.state === "sending" && "opacity-70",
              failed && "ring-destructive/60",
              highlighted ? "outline-2 outline-offset-2 outline-accent" : "outline-2 outline-offset-2 outline-transparent",
            )}
          >
            {replyTo && !deleted && (
              <div className={cn(kind === "gif" && gif && "px-2 pt-1")}>
                <Quote preview={replyTo} friendName={friend.name} onJump={message ? () => props.onJump(replyTo.id) : undefined} />
              </div>
            )}
            {deleted ? (
              <span className="flex items-center gap-1.5">
                <Ban className="size-3.5" aria-hidden />
                Message supprimé
              </span>
            ) : kind === "gif" ? (
              gif ? (
                <img
                  src={gif.url}
                  alt={body ? `GIF : ${body}` : "GIF"}
                  title={body || undefined}
                  width={gif.width || undefined}
                  height={gif.height || undefined}
                  loading="lazy"
                  draggable={false}
                  onLoad={props.onMediaLoad}
                  style={{ width: Math.min(GIF_WIDTH_PX, gif.width || GIF_WIDTH_PX), aspectRatio: gif.width > 0 && gif.height > 0 ? `${gif.width} / ${gif.height}` : undefined }}
                  className="block h-auto max-w-full rounded-lg bg-sunken"
                />
              ) : (
                <span className="text-muted-foreground italic">GIF indisponible{body ? ` : ${body}` : ""}</span>
              )
            ) : (
              <p className="break-words whitespace-pre-wrap select-text [overflow-wrap:anywhere]">{body}</p>
            )}
          </div>
          {actions && <MessageMenu mine={mine} actions={actions} open={menu} onOpenChange={setMenu} />}
        </div>
        {showMeta && (
          <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1 text-[11px] text-muted-foreground", mine && "justify-end")}>
            {pending ? (
              failed ? (
                <>
                  <span className="flex items-center gap-1 font-semibold text-destructive">
                    <CircleAlert className="size-3" aria-hidden />
                    Non envoyé{pending.error ? ` : ${pending.error}` : ""}
                  </span>
                  <button type="button" onClick={props.onRetry} className="flex items-center gap-1 font-semibold text-foreground underline-offset-2 hover:underline">
                    <RotateCcw className="size-3" aria-hidden />
                    Réessayer
                  </button>
                  <button type="button" onClick={props.onDiscard} className="font-semibold underline-offset-2 hover:text-foreground hover:underline">
                    Retirer
                  </button>
                </>
              ) : (
                <span className="flex items-center gap-1">
                  <LoaderCircle className="size-3 animate-spin" aria-hidden />
                  Envoi…
                </span>
              )
            ) : (
              message && (
                <>
                  <time dateTime={new Date(message.at).toISOString()} title={fullDate.format(message.at)} className="tabular-nums">
                    {clock(message.at)}
                  </time>
                  <origin.Icon className="size-3" aria-label={origin.label} />
                  {message.editedAt && !deleted && <span title={fullDate.format(message.editedAt)}>· modifié</span>}
                  {seen && (
                    <span className="flex items-center gap-0.5 font-semibold text-primary">
                      <CheckCheck className="size-3.5" aria-hidden />
                      Vu
                    </span>
                  )}
                </>
              )
            )}
          </p>
        )}
      </div>
    </li>
  );
}

/** Conversation ouverte : en-tête avec l'ami, messages par jour, champ d'écriture. */
function ThreadPane(props: {
  conversation: Conversation;
  gifs: boolean;
  modes: Mode[];
  playBusy: boolean;
  onPlay: (mode: string) => void;
  onNotice: (message: string) => void;
  updateInbox: Props["updateInbox"];
  refreshInbox: Props["refreshInbox"];
  services: MessagesServices;
}) {
  const { conversation, services, updateInbox, onNotice } = props;
  const uuid = conversation.friend.uuid;
  const active = useWindowActive();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Dernière relève échouée : les messages restent, avec un mot d'explication. */
  const [stale, setStale] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [olderLoading, setOlderLoading] = useState(false);
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [announce, setAnnounce] = useState("");
  /** Messages arrivés pendant que le joueur lisait plus haut. */
  const [below, setBelow] = useState(0);
  /** Premier message non lu à l'ouverture : la ligne « Nouveaux messages » se pose avant lui. */
  const [unreadFrom, setUnreadFrom] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);

  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  /** La liste suit les nouveaux messages tant que le joueur est en bas. */
  const stick = useRef(true);
  /** Distance au bas à garder quand des messages plus anciens s'ajoutent au-dessus. */
  const anchor = useRef<number | null>(null);
  /** Défilement voulu après le premier chargement : le bas, ou le premier non lu. */
  const initialScroll = useRef<number | "bottom" | null>(null);
  const polling = useRef(false);
  const loadingOlder = useRef(false);
  const localId = useRef(0);

  const friend = loaded?.friend ?? conversation.friend;
  const name = friend.name;
  const canWrite = loaded?.canWrite ?? conversation.canWrite;
  const muted = loaded?.muted ?? conversation.muted;
  const archived = loaded?.archived ?? conversation.archived;

  const load = useCallback(() => {
    setError(null);
    services
      .messageThread(uuid)
      .then((thread) => {
        const first = firstUnreadId(thread.messages, thread.lastReadId);
        setUnreadFrom(first);
        initialScroll.current = first ?? "bottom";
        stick.current = first === null;
        setLoaded(fromThread(thread));
      })
      .catch((reason) => setError(String(reason)));
  }, [services, uuid]);

  useEffect(load, [load]);

  // Nouveaux messages et modifications depuis la dernière relève.
  const poll = useCallback(async () => {
    const current = loadedRef.current;
    if (!current || polling.current) return;
    polling.current = true;
    try {
      const lastId = current.messages[current.messages.length - 1]?.id;
      const thread = await services.messageThread(uuid, lastId === undefined ? { since: current.since } : { after: lastId, since: current.since });
      setStale(null);
      setLoaded((previous) =>
        previous && {
          ...previous,
          messages: mergeMessages(previous.messages, thread.messages, thread.updates),
          lastReadId: Math.max(previous.lastReadId, thread.lastReadId),
          seenUpTo: Math.max(previous.seenUpTo, thread.seenUpTo),
          canWrite: thread.canWrite,
          archived: thread.archived,
          muted: thread.muted,
          friend: thread.friend,
          since: thread.now || previous.since,
          offset: thread.now ? thread.now - Date.now() : previous.offset,
        },
      );
      const known = new Set(current.messages.map((message) => message.id));
      const arrived = thread.messages.filter((message) => !message.fromMe && !known.has(message.id));
      if (arrived.length > 0) {
        setAnnounce(arrived.length === 1 ? `Nouveau message de ${thread.friend.name} : ${previewText(toPreview(arrived[0]))}` : `${arrived.length} nouveaux messages de ${thread.friend.name}`);
        if (!stick.current) setBelow((count) => count + arrived.length);
        updateInbox((inbox) => ({ ...inbox, conversations: withLast(inbox.conversations, uuid, arrived[arrived.length - 1]) }));
      }
    } catch (reason) {
      setStale(String(reason));
    } finally {
      polling.current = false;
    }
  }, [services, uuid, updateInbox]);

  // Relève toutes les 3 s, seulement fenêtre visible et au premier plan ; tout de suite au retour.
  const ready = loaded !== null;
  useEffect(() => {
    if (!active || !ready) return;
    void poll();
    const timer = window.setInterval(() => void poll(), THREAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, ready, poll]);

  // Lue jusqu'au dernier message reçu, tant que la fenêtre est au premier plan.
  const lastIncoming = loaded ? lastIncomingId(loaded.messages) : null;
  const lastRead = loaded?.lastReadId ?? 0;
  useEffect(() => {
    if (!active || lastIncoming === null || lastIncoming <= lastRead) return;
    setLoaded((previous) => previous && { ...previous, lastReadId: Math.max(previous.lastReadId, lastIncoming) });
    updateInbox((inbox) => ({ ...inbox, conversations: inbox.conversations.map((entry) => (entry.friend.uuid === uuid ? { ...entry, unread: 0 } : entry)) }));
    // Un échec n'est pas réessayé en boucle : la relève de la liste remettra le compteur du site.
    services.markMessagesRead(uuid, lastIncoming).catch(() => {});
  }, [active, lastIncoming, lastRead, services, uuid, updateInbox]);

  // Défilement : garder sa place quand l'historique s'allonge au-dessus, suivre le bas sinon.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    if (anchor.current !== null) {
      box.scrollTop = box.scrollHeight - anchor.current;
      anchor.current = null;
      return;
    }
    const initial = initialScroll.current;
    if (initial !== null) {
      initialScroll.current = null;
      const divider = initial === "bottom" ? null : document.getElementById("messages-unread");
      if (divider) scrollWithin(box, divider, "start");
      else box.scrollTop = box.scrollHeight;
      // Conversation courte : tout est visible, elle suit donc les nouveaux messages.
      stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < STICK_PX;
      return;
    }
    if (stick.current) box.scrollTop = box.scrollHeight;
  }, [loaded?.messages, pending]);

  const scrollToBottom = () => {
    const box = scroller.current;
    stick.current = true;
    setBelow(0);
    box?.scrollTo({ top: box.scrollHeight, behavior: smooth() });
  };

  const loadOlder = async () => {
    const current = loadedRef.current;
    const first = current?.messages[0]?.id;
    if (!current?.hasMore || first === undefined || loadingOlder.current) return;
    loadingOlder.current = true;
    setOlderLoading(true);
    try {
      const page = await services.messageThread(uuid, { before: first });
      const box = scroller.current;
      if (box) anchor.current = box.scrollHeight - box.scrollTop;
      setLoaded((previous) => previous && { ...previous, messages: mergeMessages(previous.messages, page.messages), hasMore: page.hasMore });
    } catch (reason) {
      setStale(String(reason));
    } finally {
      loadingOlder.current = false;
      setOlderLoading(false);
    }
  };

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const box = event.currentTarget;
    stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < STICK_PX;
    if (stick.current) setBelow(0);
    if (box.scrollTop < OLDER_PX) void loadOlder();
  };

  // ── Écrire ──
  useLayoutEffect(() => {
    const box = textarea.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, COMPOSER_MAX_PX)}px`;
  }, [draft]);

  useEffect(() => {
    textarea.current?.focus();
  }, []);

  const deliver = async (item: Pending) => {
    setPending((list) => list.map((entry) => (entry.local === item.local ? { ...entry, state: "sending", error: undefined } : entry)));
    try {
      const sent = item.draft.kind === "text" ? await services.sendMessage(uuid, item.draft.body, item.replyTo?.id) : await services.sendGif(uuid, item.draft.gif.id, item.replyTo?.id);
      setPending((list) => list.filter((entry) => entry.local !== item.local));
      setLoaded((previous) => previous && { ...previous, messages: mergeMessages(previous.messages, [sent]) });
      updateInbox((inbox) => ({ ...inbox, conversations: withLast(inbox.conversations, uuid, sent) }));
    } catch (reason) {
      setPending((list) => list.map((entry) => (entry.local === item.local ? { ...entry, state: "failed", error: String(reason) } : entry)));
    }
  };

  /** Envoi optimiste : la bulle s'affiche tout de suite, en attente de la réponse du site. */
  const send = (draft: Draft) => {
    const item: Pending = { local: `local-${++localId.current}`, draft, replyTo: reply ? toPreview(reply) : null, at: Date.now() + (loaded?.offset ?? 0), state: "sending" };
    stick.current = true;
    setBelow(0);
    setPending((list) => [...list, item]);
    setReply(null);
    void deliver(item);
  };

  const startEdit = (message: ChatMessage) => {
    setReply(null);
    setEditing(message);
    setDraft(message.body);
    setComposeError(null);
    requestAnimationFrame(() => {
      const box = textarea.current;
      box?.focus();
      box?.setSelectionRange(box.value.length, box.value.length);
    });
  };

  const cancelEdit = () => {
    if (!editing) return;
    setEditing(null);
    setDraft("");
    setComposeError(null);
  };

  const startReply = (message: ChatMessage) => {
    cancelEdit();
    setReply(message);
    textarea.current?.focus();
  };

  const length = codePoints(draft.trim());
  const tooLong = length > BODY_MAX;
  const canSubmit = canWrite && length > 0 && !tooLong && !saving;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    const body = draft.trim();
    if (!editing) {
      setDraft("");
      send({ kind: "text", body });
      return;
    }
    if (body === editing.body) return cancelEdit();
    setSaving(true);
    setComposeError(null);
    try {
      const updated = await services.editMessage(uuid, editing.id, body);
      setLoaded((previous) => previous && { ...previous, messages: mergeMessages(previous.messages, [], [updated]) });
      updateInbox((inbox) => ({ ...inbox, conversations: withLast(inbox.conversations, uuid, updated) }));
      setEditing(null);
      setDraft("");
    } catch (reason) {
      setComposeError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  const now = Date.now() + (loaded?.offset ?? 0);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Entrée envoie, Maj+Entrée va à la ligne ; pas pendant une saisie composée (accents, IME).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape" && (reply || editing)) {
      event.preventDefault();
      setReply(null);
      cancelEdit();
    } else if (event.key === "ArrowUp" && !draft && !editing && loaded) {
      // Comme sur Discord : flèche haut, champ vide, modifie son dernier message.
      const last = [...loaded.messages].reverse().find((message) => message.fromMe && !message.deleted);
      if (last && canEdit(last, now)) {
        event.preventDefault();
        startEdit(last);
      }
    }
  };

  const insertEmoji = (emoji: string) => {
    const box = textarea.current;
    const start = box?.selectionStart ?? draft.length;
    const end = box?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + emoji + draft.slice(end));
    requestAnimationFrame(() => box?.setSelectionRange(start + emoji.length, start + emoji.length));
  };

  // ── Actions sur un message ou la conversation ──
  const excerpt = (message: ChatMessage) => (message.kind === "gif" ? (message.body ? `GIF : ${message.body}` : "GIF") : message.body);

  const remove = (message: ChatMessage, forAll: boolean) =>
    setConfirm({
      title: forAll ? "Supprimer pour tous ?" : "Supprimer pour toi ?",
      description: forAll
        ? `Le message disparaît aussi pour ${name}, dans le launcher et sur le site ; sa place reste marquée « Message supprimé ». S'il est déjà arrivé en jeu, il reste dans le chat.`
        : `Le message disparaît de ta conversation seulement : ${name} le garde.`,
      detail: message.deleted ? undefined : excerpt(message),
      confirm: "Supprimer",
      onConfirm: () =>
        void services
          .deleteMessage(uuid, message.id, forAll)
          .then(() => {
            setLoaded(
              (previous) =>
                previous && {
                  ...previous,
                  messages: forAll ? mergeMessages(previous.messages, [], [{ ...message, deleted: true, body: "", gif: null }]) : previous.messages.filter((other) => other.id !== message.id),
                },
            );
            if (reply?.id === message.id) setReply(null);
            if (editing?.id === message.id) cancelEdit();
            void props.refreshInbox();
          })
          .catch((reason) => onNotice(String(reason))),
    });

  const changeState = (change: { archived?: boolean; muted?: boolean }) =>
    services
      .setConversationState(uuid, change)
      .then(() => {
        setLoaded((previous) => previous && { ...previous, ...change });
        updateInbox((inbox) => ({ ...inbox, conversations: updateConversation(inbox.conversations, uuid, (entry) => ({ ...entry, ...change })) }));
        if (change.archived !== undefined) onNotice(change.archived ? `Conversation avec ${name} archivée.` : `Conversation avec ${name} remise dans la liste.`);
      })
      .catch((reason) => onNotice(String(reason)));

  const clearConversation = () =>
    setConfirm({
      title: "Vider la conversation ?",
      description: `Tous les messages disparaissent pour toi seulement : ${name} garde les siens. Les prochains messages arriveront comme d'habitude.`,
      confirm: "Vider",
      onConfirm: () =>
        void services
          .setConversationState(uuid, { clear: true })
          .then(() => {
            setLoaded((previous) => previous && { ...previous, messages: [], hasMore: false });
            setPending((list) => list.filter((entry) => entry.state === "sending"));
            setReply(null);
            cancelEdit();
            updateInbox((inbox) => ({ ...inbox, conversations: updateConversation(inbox.conversations, uuid, (entry) => ({ ...entry, last: null, unread: 0 })) }));
          })
          .catch((reason) => onNotice(String(reason))),
    });

  const jump = (id: number) => {
    const target = document.getElementById(`message-${id}`);
    if (!target || !scroller.current) return onNotice("Ce message est plus ancien : remonte la conversation pour le retrouver.");
    scrollWithin(scroller.current, target, "center", smooth());
    setHighlight(id);
    window.setTimeout(() => setHighlight((current) => (current === id ? null : current)), 1600);
  };

  const actionsFor = (message: ChatMessage): MessageActions => ({
    onReply: canWrite && !message.deleted ? () => startReply(message) : undefined,
    onEdit: canEdit(message, now) ? () => startEdit(message) : undefined,
    onCopy: message.deleted ? undefined : () => void navigator.clipboard.writeText(message.kind === "gif" ? (message.gif?.url ?? message.body) : message.body).then(() => setAnnounce("Message copié."), () => {}),
    onDeleteForMe: () => remove(message, false),
    onDeleteForAll: message.fromMe && !message.deleted ? () => remove(message, true) : undefined,
    onReport: !message.fromMe && !message.deleted ? () => setReporting(message) : undefined,
  });

  const join = joinableMode(friend, props.modes);
  const modeName = friend.server ? findMode(props.modes, friend.server)?.name : undefined;
  const seenId = loaded ? seenMessageId(loaded.messages, loaded.seenUpTo) : null;
  const entries = [...(loaded?.messages ?? []).map(entryOf), ...pending.map(pendingEntry)];
  const days = groupByDay(entries, now);
  const reportingId = reporting?.id;

  return (
    <section aria-label={`Conversation avec ${name}`} className="relative flex min-w-0 flex-1 flex-col">
      <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-border px-5">
        <FriendHead friend={friend} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="flex min-w-0 items-center gap-2">
            <span className="truncate font-display text-[22px] leading-none">{name}</span>
            {archived && <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Archivée</span>}
            {muted && <BellOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Notifications coupées" />}
          </h2>
          <p className={cn("truncate text-xs", friend.online ? "text-primary" : "text-muted-foreground")}>
            {presence(friend, modeName)}
            {friend.status && <span className="text-muted-foreground italic"> · {friend.status}</span>}
          </p>
        </div>
        {join && (
          <button
            type="button"
            disabled={props.playBusy}
            onClick={() => props.onPlay(join.id)}
            title={`Rejoindre ${name} sur ${join.name}`}
            className="flex shrink-0 items-center gap-1 rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary transition-colors enabled:hover:bg-primary/20 disabled:opacity-60"
          >
            <Play className="size-3 fill-current" aria-hidden />
            Rejoindre
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Options de la conversation"
              className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground data-[state=open]:bg-white/[0.06] data-[state=open]:text-foreground"
            >
              <Ellipsis className="size-5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label="Options de la conversation">
            <DropdownMenuItem onSelect={() => void changeState({ archived: !archived })}>
              {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              {archived ? "Désarchiver" : "Archiver"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void changeState({ muted: !muted })}>
              {muted ? <Bell aria-hidden /> : <BellOff aria-hidden />}
              {muted ? "Rétablir les notifications" : "Couper les notifications"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive disabled={!loaded || loaded.messages.length === 0} onSelect={clearConversation}>
              <Eraser aria-hidden />
              Vider la conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-4">
        {error ? (
          <div role="alert" className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-3 text-center">
            <CloudOff className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button type="button" onClick={load} className={secondaryButton}>
              <RotateCcw className="size-4" aria-hidden />
              Réessayer
            </button>
          </div>
        ) : !loaded ? (
          <div className="flex flex-col gap-3 pt-4">
            {["w-48", "ml-auto w-64", "w-56", "w-40", "ml-auto w-52"].map((width, index) => (
              <Skeleton key={index} className={cn("h-10", width)} />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="mx-auto mt-14 flex max-w-sm flex-col items-center gap-3 text-center">
            <FriendHead friend={friend} size={56} />
            <p className="font-display text-xl leading-none">{name}</p>
            <p className="text-sm text-muted-foreground">
              {canWrite ? `Aucun message avec ${name} pour l'instant. Ce que tu écris ici lui arrive aussi en jeu et sur le site.` : "Aucun message dans cette conversation."}
            </p>
            {canWrite && (
              <button type="button" onClick={() => send({ kind: "text", body: "👋" })} className={secondaryButton}>
                Dire bonjour 👋
              </button>
            )}
          </div>
        ) : (
          <>
            {loaded.hasMore && (
              <div className="flex justify-center py-2">
                <button type="button" onClick={() => void loadOlder()} disabled={olderLoading} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
                  {olderLoading && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
                  {olderLoading ? "Chargement…" : "Messages plus anciens"}
                </button>
              </div>
            )}
            <ol aria-label={`Messages avec ${name}`} className="mx-auto flex w-full max-w-[960px] flex-col">
              {days.map((day) => (
                <li key={day.key} className="flex flex-col">
                  <h3 className="my-4 self-center rounded-full bg-sunken px-3 py-1 text-[11px] font-semibold text-muted-foreground">{day.label}</h3>
                  <ol className="flex flex-col">
                    {day.items.map((entry, index) => {
                      const previous = day.items[index - 1];
                      const next = day.items[index + 1];
                      const message = entry.message;
                      const divider = message !== null && message.id === unreadFrom;
                      const nextDivider = unreadFrom !== null && next?.message?.id === unreadFrom;
                      return (
                        <DividedRow key={entry.key} divider={divider}>
                          <MessageRow
                            entry={entry}
                            friend={friend}
                            runStart={divider || !sameRun(previous, entry)}
                            runEnd={nextDivider || !sameRun(entry, next)}
                            seen={message !== null && message.id === seenId}
                            highlighted={message !== null && message.id === highlight}
                            actions={message ? actionsFor(message) : null}
                            onJump={jump}
                            onRetry={() => entry.pending && void deliver(entry.pending)}
                            onDiscard={() => setPending((list) => list.filter((other) => other.local !== entry.key))}
                            onMediaLoad={() => stick.current && scroller.current && (scroller.current.scrollTop = scroller.current.scrollHeight)}
                          />
                        </DividedRow>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
            {stale && (
              <p role="status" className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <CloudOff className="size-3.5" aria-hidden />
                Conversation non actualisée : {stale}
              </p>
            )}
          </>
        )}
      </div>

      {below > 0 && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-[92px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold shadow-[0_8px_20px_rgb(0_0_0/0.45)] transition-colors hover:bg-card-hover"
        >
          <ArrowDown className="size-3.5" aria-hidden />
          {below > 1 ? `${below} nouveaux messages` : "Nouveau message"}
        </button>
      )}

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {canWrite ? (
        <form onSubmit={(event) => void submit(event)} className="flex shrink-0 flex-col gap-1.5 border-t border-border px-4 pt-3 pb-3.5 *:mx-auto *:w-full *:max-w-[992px]">
          {(reply || editing) && (
            <div className="flex items-center gap-2 rounded-md bg-sunken px-3 py-1.5 text-xs">
              {editing ? <PenLine className="size-3.5 shrink-0 text-accent" aria-hidden /> : <Reply className="size-3.5 shrink-0 text-primary" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">
                <span className="font-bold">{editing ? "Modification du message" : `Réponse à ${reply?.fromMe ? "toi" : name}`}</span>
                {reply && <span className="text-muted-foreground"> · {previewText(toPreview(reply))}</span>}
              </span>
              <button
                type="button"
                onClick={() => {
                  setReply(null);
                  cancelEdit();
                  textarea.current?.focus();
                }}
                aria-label={editing ? "Annuler la modification" : "Annuler la réponse"}
                className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          )}
          <div className="flex items-end gap-1 rounded-lg border border-border bg-sunken p-1 transition-colors focus-within:border-primary/60">
            <EmojiPicker onPick={insertEmoji} />
            {props.gifs && !editing && <GifPicker search={services.searchGifs} onPick={(gif) => send({ kind: "gif", gif })} />}
            <textarea
              ref={textarea}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setComposeError(null);
              }}
              onKeyDown={onKeyDown}
              rows={1}
              aria-label={`Message à ${name}`}
              aria-describedby="messages-composer-help"
              aria-invalid={tooLong || undefined}
              placeholder={`Écris à ${name}…`}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] leading-snug text-foreground outline-none select-text placeholder:text-muted-foreground/70"
            />
            {length >= COUNTER_FROM && (
              <span className={cn("shrink-0 self-center px-1 font-pixel text-[11px]", tooLong ? "text-destructive" : "text-muted-foreground")}>
                {length}/{BODY_MAX}
              </span>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              aria-label={editing ? "Enregistrer la modification" : "Envoyer"}
              title={editing ? "Enregistrer" : "Envoyer"}
              className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition-[filter,opacity] enabled:hover:brightness-110 disabled:opacity-40"
            >
              {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}
            </button>
          </div>
          <p id="messages-composer-help" className={cn("px-1 text-[11px]", composeError || tooLong ? "text-destructive" : "text-muted-foreground")} role={composeError ? "alert" : undefined}>
            {composeError ?? (tooLong ? `Message trop long : ${BODY_MAX} caractères au plus.` : "Entrée pour envoyer, Maj+Entrée pour aller à la ligne.")}
          </p>
        </form>
      ) : (
        <p className="shrink-0 border-t border-border px-5 py-4 text-center text-[13px] text-muted-foreground">Vous n'êtes plus amis : la conversation reste lisible, mais tu ne peux plus écrire à {name}.</p>
      )}

      <ConfirmDialog ask={confirm} onClose={() => setConfirm(null)} />
      <ReportDialog
        target={reporting && { name, excerpt: excerpt(reporting) }}
        onSubmit={async (reason) => {
          if (reportingId === undefined) return;
          await services.reportMessage(uuid, reportingId, reason);
          onNotice("Signalement envoyé à l'équipe. Merci !");
        }}
        onClose={() => setReporting(null)}
      />
    </section>
  );
}

/** Ligne de message, précédée de « Nouveaux messages » pour le premier non lu à l'ouverture. */
function DividedRow({ divider, children }: { divider: boolean; children: ReactNode }) {
  if (!divider) return children;
  return (
    <>
      <li id="messages-unread" role="separator" aria-label="Nouveaux messages" className="mt-4 mb-1 flex items-center gap-3 text-[11px] font-bold text-accent">
        <span aria-hidden className="h-px flex-1 bg-accent/35" />
        Nouveaux messages
        <span aria-hidden className="h-px flex-1 bg-accent/35" />
      </li>
      {children}
    </>
  );
}

/**
 * Messages entre amis : à gauche les conversations (non-lus, dernier message, présence), à droite
 * la conversation ouverte. Les messages passent par le site : ils arrivent aussi en jeu et sur
 * clovergames.fr. La liste est relevée toutes les 15 s sur la page, la conversation ouverte toutes
 * les 3 s quand la fenêtre est au premier plan.
 */
export function MessagesScreen({ friend, onOpen, inbox, inboxError, refreshInbox, updateInbox, modes, playBusy, onPlay, onNotice, services = api }: Props) {
  useEffect(() => {
    void refreshInbox();
    const timer = window.setInterval(() => void refreshInbox(), LIST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshInbox]);

  // Rien à afficher : messages indisponibles, ou aucun ami.
  if (!inbox && inboxError) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center px-10">
        <EmptyState
          className="w-full max-w-lg"
          title="Impossible d'ouvrir tes messages"
          hint={
            <>
              {inboxError} Tu peux toujours écrire à tes amis en jeu avec <span className="font-mono text-foreground">/msg</span>.
            </>
          }
          action={
            <button type="button" onClick={() => void refreshInbox()} className={secondaryButton}>
              <RotateCcw className="size-4" aria-hidden />
              Réessayer
            </button>
          }
        />
      </main>
    );
  }
  if (inbox && inbox.conversations.length === 0) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center px-10">
        <EmptyState
          className="w-full max-w-lg"
          title="Pas encore d'amis à qui écrire"
          hint={
            <>
              Ajoute tes amis en jeu avec <span className="font-mono text-foreground">/amis add &lt;pseudo&gt;</span>. Dès qu'ils acceptent, vous pourrez vous écrire ici, sur le site et en jeu.
            </>
          }
        />
      </main>
    );
  }

  const conversation = friend && inbox ? (inbox.conversations.find((entry) => plain(entry.friend.uuid) === plain(friend)) ?? null) : null;
  return (
    <main className="flex min-h-0 min-w-0 flex-1">
      <ConversationList inbox={inbox} error={inboxError} selected={friend} modes={modes} onOpen={onOpen} />
      {conversation ? (
        <ThreadPane
          key={conversation.friend.uuid}
          conversation={conversation}
          gifs={inbox?.gifs ?? false}
          modes={modes}
          playBusy={playBusy}
          onPlay={onPlay}
          onNotice={onNotice}
          updateInbox={updateInbox}
          refreshInbox={refreshInbox}
          services={services}
        />
      ) : (
        <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
          {friend && !inbox ? (
            <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Chargement" />
          ) : (
            <>
              <MessageCircle className="size-10 text-muted-foreground/60" strokeWidth={1.75} aria-hidden />
              <p className="font-display text-xl leading-none">{friend ? "Conversation introuvable" : "Choisis un ami"}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {friend ? "Cet ami n'est plus dans ta liste." : "Tes messages arrivent aussi en jeu et sur clovergames.fr : écris d'où tu veux, la conversation suit."}
              </p>
            </>
          )}
        </section>
      )}
    </main>
  );
}
