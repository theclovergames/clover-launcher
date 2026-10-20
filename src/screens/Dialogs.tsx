import { ArrowRight, Check, Circle, Clock, Coins, Copy, Download, Flag, FolderOpen, LoaderCircle, PenLine, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ModpackVersionSelect } from "@/components/ModpackVersionSelect";
import { PlayerHead } from "@/components/PlayerHead";
import { ShareLogButton } from "@/components/ShareLogButton";
import { CapeFront } from "@/components/SkinFront";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { NameAvailability, NameChange } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { ownedCapeText } from "@/lib/capes";
import { preferredModpackVersion } from "@/lib/game-versions";
import { cn } from "@/lib/utils";
import type { Cape, ModpackVersion, SkinModel } from "@/types";

const content = "mc-frame gap-5 border-[var(--mc-outline)] bg-card p-6 ring-0 sm:max-w-[560px]";
const footer = "-mx-6 -mb-6 rounded-b-[6px] border-border bg-[#17150f] px-6 py-4";

export function CrashDialog(props: {
  open: boolean;
  exitCode: number | null;
  logTail: string;
  /** Sortie complète de la partie, publiée par « Partager ». */
  log: string;
  onCopyLog: () => void;
  onOpenLogs: () => void;
  onRelaunch: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className={content}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Minecraft s'est arrêté</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Le jeu s'est fermé avec le code {props.exitCode ?? "inconnu"}. Si ça recommence, partage le journal et envoie le lien au support sur le Discord.
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-44 overflow-auto rounded-md border border-border bg-[#0c0b09] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[#cfc8b8] select-text">
          {props.logTail}
        </pre>
        <DialogFooter className={footer}>
          <button type="button" onClick={props.onCopyLog} className={secondaryButton}>
            <Copy className="size-4" aria-hidden />
            Copier
          </button>
          <ShareLogButton log={() => props.log} disabled={!props.log} />
          <button type="button" onClick={props.onOpenLogs} className={secondaryButton}>
            <FolderOpen className="size-4" aria-hidden />
            Ouvrir les journaux
          </button>
          <button type="button" onClick={props.onRelaunch} className={primaryButton}>
            <RotateCcw className="size-4" aria-hidden />
            Relancer
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmation avant de changer de cape : elle s'applique au compte Minecraft. `cape` à `null` : l'enlever. */
export function CapeDialog(props: { request: { cape: Cape | null } | null; onConfirm: (cape: Cape | null) => void; onCancel: () => void }) {
  // Garde la dernière demande affichée pendant l'animation de fermeture.
  const last = useRef(props.request);
  if (props.request) last.current = props.request;
  const cape = last.current?.cape ?? null;
  const text = cape && ownedCapeText(cape.name);
  return (
    <Dialog open={props.request !== null} onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent className={content}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">{text ? `Porter la cape « ${text.name} » ?` : "Enlever ta cape ?"}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {text
              ? "Elle remplace ta cape actuelle sur ton compte Minecraft, sur Clover Games comme sur tous les serveurs."
              : "Ton personnage n'aura plus de cape sur ton compte Minecraft, sur Clover Games comme sur tous les serveurs."}
          </DialogDescription>
        </DialogHeader>
        {cape && text && (
          <div className="flex items-center gap-4">
            <span className="mc-slot grid size-24 shrink-0 place-items-center">
              <CapeFront texture={cape.texture} scale={4.5} />
            </span>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{text.how}</p>
          </div>
        )}
        <DialogFooter className={footer}>
          <button type="button" onClick={props.onCancel} className={secondaryButton}>
            Annuler
          </button>
          <button type="button" onClick={() => props.onConfirm(cape)} className={primaryButton}>
            <Check className="size-4" aria-hidden />
            {cape ? "Porter cette cape" : "Enlever la cape"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmation avant de changer les bras du skin porté : ils s'appliquent au compte Minecraft. */
export function ModelDialog(props: { request: SkinModel | null; onConfirm: (model: SkinModel) => void; onCancel: () => void }) {
  // Garde la dernière demande affichée pendant l'animation de fermeture.
  const last = useRef(props.request);
  if (props.request) last.current = props.request;
  const model = last.current ?? "classic";
  const slim = model === "slim";
  return (
    <Dialog open={props.request !== null} onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent className={content}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">{slim ? "Passer aux bras fins ?" : "Passer aux bras classiques ?"}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Tes bras feront {slim ? "3" : "4"} pixels de large sur ton compte Minecraft, sur Clover Games comme sur tous les serveurs. Un skin dessiné pour des bras{" "}
            {slim ? "classiques" : "fins"} peut alors paraître décalé.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className={footer}>
          <button type="button" onClick={props.onCancel} className={secondaryButton}>
            Annuler
          </button>
          <button type="button" onClick={() => props.onConfirm(model)} className={primaryButton}>
            <Check className="size-4" aria-hidden />
            {slim ? "Passer aux bras fins" : "Passer aux bras classiques"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Règle de Mojang, reprise par `player_name::validate`. */
const NAME = /^[A-Za-z0-9_]{3,16}$/;
const NAME_CHARS = /^[A-Za-z0-9_]*$/;
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

type RuleState = "pending" | "checking" | "ok" | "error";
const RULE_ICON = { pending: Circle, checking: LoaderCircle, ok: Check, error: X };
const RULE_TONE = { pending: "text-muted-foreground", checking: "text-muted-foreground", ok: "text-primary", error: "text-destructive" };

/** Changement de pseudo Java du compte actif, depuis le menu du compte. */
export function NameDialog(props: {
  open: boolean;
  /** Pseudo actuel du compte actif. */
  current: string;
  /** Texture du skin porté, pour les têtes de l'aperçu. */
  skin: string | null;
  info: () => Promise<NameChange>;
  check: (name: string) => Promise<NameAvailability>;
  /** Rejette avec le message de Mojang, prêt à afficher. */
  onSubmit: (name: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const { open, current, info, check } = props;
  const [name, setName] = useState("");
  const [change, setChange] = useState<NameChange | null>(null);
  const [availability, setAvailability] = useState<NameAvailability | "checking" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setName("");
    setChange(null);
    setError(null);
    info()
      .then((result) => !cancelled && setChange(result))
      .catch((reason) => !cancelled && setError(String(reason)));
    return () => {
      cancelled = true;
    };
  }, [open, info]);

  const valid = NAME.test(name);
  // Seule la casse change : Mojang le permet, et le pseudo « pris » est le sien.
  const sameName = name.toLowerCase() === current.toLowerCase();

  useEffect(() => {
    setAvailability(null);
    if (!open || !valid || sameName) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setAvailability("checking");
      // Vérification indicative : en cas d'échec, Mojang tranche à l'envoi.
      check(name)
        .then((result) => !cancelled && setAvailability(result))
        .catch(() => !cancelled && setAvailability(null));
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, name, valid, sameName, check]);

  const blocked = change?.allowed === false;
  const next = blocked && change.changedAt ? new Date(Date.parse(change.changedAt) + COOLDOWN_MS) : null;
  const canSubmit = valid && name !== current && !blocked && availability !== "taken" && availability !== "not_allowed" && !saving;

  const free: [RuleState, string] = !valid
    ? ["pending", "Libre chez Mojang"]
    : name === current
      ? ["error", "C'est déjà ton pseudo"]
      : sameName
        ? ["ok", "Ton pseudo, autre casse"]
        : availability === "checking"
          ? ["checking", "Vérification auprès de Mojang…"]
          : availability === "available"
            ? ["ok", "Libre chez Mojang"]
            : availability === "taken"
              ? ["error", "Déjà pris par un autre joueur"]
              : availability === "not_allowed"
                ? ["error", "Refusé par Mojang"]
                : ["pending", "Libre chez Mojang"];
  const rules: [RuleState, string][] = [
    [name.length >= 3 ? "ok" : "pending", "3 à 16 caractères"],
    [name === "" ? "pending" : NAME_CHARS.test(name) ? "ok" : "error", "Lettres sans accent, chiffres et _"],
    free,
  ];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await props.onSubmit(name);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !saving && props.onOpenChange(value)}>
      <DialogContent className={content}>
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-normal">Changer de pseudo</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              Ton pseudo change partout, sur Clover Games comme sur tous les serveurs. Mojang n'en permet qu'un changement tous les 30 jours.
            </DialogDescription>
          </DialogHeader>

          {/* Aperçu façon liste des joueurs du jeu : avant, après. */}
          <div aria-hidden className="mc-slot flex min-w-0 items-center gap-3 px-4 py-3 font-pixel text-[13px] mc-text-shadow [--mc-radius:6px]">
            <PlayerHead skin={props.skin} size={20} />
            <span className="truncate text-muted-foreground">{current}</span>
            <ArrowRight className="size-4 shrink-0 text-accent" />
            <PlayerHead skin={props.skin} size={20} />
            <span className={cn("truncate", name ? "text-white" : "text-muted-foreground/50")}>{name || "?"}</span>
          </div>

          {blocked && (
            <p className="flex items-start gap-2 rounded-md border border-border bg-sunken px-3 py-2.5 text-[13px] leading-relaxed">
              <Clock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              {next
                ? `Ton pseudo a changé il y a moins de 30 jours. Prochain changement possible le ${next.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`
                : "Mojang n'autorise pas encore de nouveau changement pour ce compte."}
            </p>
          )}

          <div className="grid gap-2.5">
            <label className="grid gap-2">
              <span className="text-sm font-bold">Nouveau pseudo</span>
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value.trim());
                  setError(null);
                }}
                disabled={blocked || saving}
                autoFocus
                maxLength={16}
                spellCheck={false}
                autoComplete="off"
                aria-describedby="name-rules"
                className="h-10 w-full rounded-md border border-border bg-sunken px-3 font-pixel text-sm text-foreground outline-none select-text focus:border-accent disabled:opacity-60"
              />
            </label>
            <ul id="name-rules" aria-live="polite" className="grid gap-1.5 text-[12px]">
              {rules.map(([state, text], index) => {
                const Icon = RULE_ICON[state];
                return (
                  <li key={index} className={cn("flex items-center gap-2", RULE_TONE[state])}>
                    <Icon className={cn("size-3.5 shrink-0", state === "checking" && "animate-spin")} aria-hidden />
                    {text}
                  </li>
                );
              })}
            </ul>
            {error && (
              <p role="alert" className="text-[12px] text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className={footer}>
            <button type="button" onClick={() => props.onOpenChange(false)} disabled={saving} className={secondaryButton}>
              Annuler
            </button>
            <button type="submit" disabled={!canSubmit} className={primaryButton}>
              {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <PenLine className="size-4" aria-hidden />}
              Changer de pseudo
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Ce que l'on demande de confirmer : titre, explication, et l'élément concerné (chemin, nom).
 * `install` : rien n'est supprimé, le bouton est celui d'une installation.
 */
/** `install` ou `pay` : action voulue (installer, payer en pièces), bouton de la couleur principale. */
export type Confirmation = { title: string; description: string; detail?: string; confirm: string; onConfirm: () => void; install?: boolean; pay?: boolean };

/**
 * Confirmation d'une action qui ne se défait pas d'un clic (supprimer, retirer, installer un
 * doublon). Le texte reste affiché pendant l'animation de fermeture.
 */
export function ConfirmDialog({ ask, onClose }: { ask: Confirmation | null; onClose: () => void }) {
  const last = useRef(ask);
  if (ask) last.current = ask;
  const shown = last.current;
  return (
    <Dialog open={ask !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={content}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">{shown?.title}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">{shown?.description}</DialogDescription>
        </DialogHeader>
        {shown?.detail && <p className="truncate rounded-md border border-border bg-sunken px-3 py-2 font-mono text-xs select-text">{shown.detail}</p>}
        <DialogFooter className={footer}>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              shown?.onConfirm();
              onClose();
            }}
            className={cn(primaryButton, !shown?.install && !shown?.pay && "bg-destructive text-white")}
          >
            {shown?.pay ? <Coins className="size-4" aria-hidden /> : shown?.install ? <Download className="size-4" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
            {shown?.confirm}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Modpack à installer depuis la liste de Découvrir : `minecraft`, version de la nouvelle instance
 * voulue ; `existing`, instance déjà créée depuis ce pack.
 */
export type ModpackRequest = { project: string; title: string; minecraft?: string; existing?: string; onInstall: (version: string) => void };

/**
 * Choix de la version d'un modpack avant d'en créer l'instance, la dernière stable pour la version
 * de Minecraft voulue d'office. Le texte reste affiché pendant l'animation de fermeture.
 */
export function ModpackDialog({ request, versions: load, onClose }: { request: ModpackRequest | null; versions: (project: string) => Promise<ModpackVersion[]>; onClose: () => void }) {
  const last = useRef(request);
  if (request) last.current = request;
  const shown = last.current;
  const project = request?.project;
  const [list, setList] = useState<{ project: string; versions: ModpackVersion[]; error?: string } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    if (!project) return;
    let alive = true;
    setChosen(null);
    load(project)
      .then((versions) => alive && setList({ project, versions }))
      .catch((reason) => alive && setList({ project, versions: [], error: String(reason) }));
    return () => {
      alive = false;
    };
  }, [project, load]);
  const loaded = list && list.project === shown?.project ? list : null;
  const versions = loaded?.versions ?? null;
  const minecraft = shown?.minecraft;
  const fits = !minecraft || !versions?.length || versions.some((version) => version.gameVersions.includes(minecraft));
  const value = chosen ?? (versions ? preferredModpackVersion(versions, minecraft)?.id : undefined);
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={content}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">{shown?.title}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">Choisis la version du modpack : elle devient une nouvelle instance, dans son propre dossier.</DialogDescription>
        </DialogHeader>
        <ModpackVersionSelect versions={versions} value={value} onChange={setChosen} className="h-10 w-full" />
        {loaded?.error ? (
          <p className="text-[13px] text-error">{loaded.error}</p>
        ) : (
          versions?.length === 0 && <p className="text-[13px] text-muted-foreground">Aucune version pour Fabric, Quilt, Forge ou NeoForge : ce modpack ne s'installe pas dans le launcher.</p>
        )}
        {!fits && <p className="text-[13px] text-muted-foreground">Aucune version pour Minecraft {minecraft} : la plus récente est proposée.</p>}
        {shown?.existing && (
          <p className="rounded-md border border-border bg-sunken px-3 py-2 text-[13px] leading-relaxed">
            Tu as déjà l'instance « {shown.existing} » de ce modpack : une seconde se crée à côté, sans toucher à la première.
          </p>
        )}
        <DialogFooter className={footer}>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Annuler
          </button>
          <button
            type="button"
            disabled={!value}
            onClick={() => {
              if (value) shown?.onInstall(value);
              onClose();
            }}
            className={primaryButton}
          >
            <Download className="size-4" aria-hidden />
            Créer l'instance
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Motifs proposés pour signaler un message ; « Autre » demande une précision. */
const REPORT_REASONS = ["Insultes ou harcèlement", "Spam ou publicité", "Contenu choquant", "Arnaque ou triche", "Autre"];
/** Longueur du motif accepté par le site, précision comprise. */
const REPORT_MAX = 200;

/**
 * Signalement d'un message d'un ami à l'équipe : un motif, une précision facultative (obligatoire
 * pour « Autre »). Le site garde les messages autour pour la modération.
 */
export function ReportDialog(props: {
  /** Pseudo de l'auteur et extrait du message signalé ; `null` : fermé. */
  target: { name: string; excerpt: string } | null;
  /** Rejette avec le message du site, prêt à afficher. */
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const last = useRef(props.target);
  if (props.target) last.current = props.target;
  const shown = last.current;
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const open = props.target !== null;

  useEffect(() => {
    if (!open) return;
    setReason(REPORT_REASONS[0]);
    setDetails("");
    setError(null);
  }, [open]);

  const precision = details.trim();
  const full = [...(precision ? `${reason} : ${precision}` : reason)].slice(0, REPORT_MAX).join("");
  const canSubmit = !saving && (reason !== "Autre" || precision.length > 0);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await props.onSubmit(full);
      props.onClose();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !saving && props.onClose()}>
      <DialogContent className={content}>
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-normal">Signaler ce message</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              L'équipe de Clover Games verra ce message de {shown?.name}, avec ceux qui l'entourent. {shown?.name} ne saura pas qui l'a signalé.
            </DialogDescription>
          </DialogHeader>
          {shown?.excerpt && <p className="line-clamp-3 rounded-md border border-border bg-sunken px-3 py-2 text-[13px] break-words whitespace-pre-wrap text-muted-foreground">{shown.excerpt}</p>}
          <fieldset className="grid gap-1.5">
            <legend className="mb-2 text-sm font-bold">Motif</legend>
            {REPORT_REASONS.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-white/[0.03]">
                <input type="radio" name="report-reason" value={option} checked={reason === option} onChange={() => setReason(option)} className="size-4 accent-[var(--primary)]" />
                {option}
              </label>
            ))}
          </fieldset>
          <label className="grid gap-2">
            <span className="text-sm font-bold">Précisions {reason === "Autre" ? "" : <span className="font-normal text-muted-foreground">(facultatif)</span>}</span>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={150}
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-sunken px-3 py-2 text-[13px] text-foreground outline-none select-text focus:border-primary/60"
            />
          </label>
          {error && (
            <p role="alert" className="text-[12px] text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className={footer}>
            <button type="button" onClick={props.onClose} disabled={saving} className={secondaryButton}>
              Annuler
            </button>
            <button type="submit" disabled={!canSubmit} className={cn(primaryButton, "bg-destructive text-white")}>
              {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Flag className="size-4" aria-hidden />}
              Signaler
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
