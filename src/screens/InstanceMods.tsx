import { FileUp, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { ModIcon } from "@/components/ModIcon";
import { Switch } from "@/components/ui/switch";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import type { OpenMod } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type Confirmation, ConfirmDialog } from "@/screens/Dialogs";
import { ModPage } from "@/screens/ModPage";
import type { ModCategory, ModInfo, ModrinthProject, PersonalMod } from "@/types";

const CATEGORIES: { id: ModCategory; title: string; hint: string }[] = [
  { id: "performance", title: "Performance", hint: "Plus d'images par seconde, moins de mémoire. Activés par défaut." },
  { id: "visual", title: "Visuel", hint: "Shaders et rendu. Plus exigeants pour ta carte graphique." },
  { id: "comfort", title: "Confort", hint: "Petites aides d'interface, sans avantage en combat." },
];

/** Ce que font les interrupteurs et les boutons, dans la liste comme sur la page d'un mod. */
type Actions = {
  minecraftVersion: string;
  onToggle: (id: string, enabled: boolean) => void;
  onTogglePersonal: (id: string, enabled: boolean) => void;
  onUpdatePersonal: (id: string) => void;
  onRemovePersonal: (id: string) => void;
};

type Props = Actions & {
  /** Catalogue vérifié par Clover Games : seulement pour l'instance Clover Games. */
  catalogue?: ModInfo[];
  /** Mods ajoutés par le joueur ; `null` pendant leur lecture. */
  personal: PersonalMod[] | null;
  onAddFiles: (files: File[]) => void;
  /** Met à jour d'un coup les mods qui ont une version à installer. */
  onUpdateAll: () => Promise<void>;
  /** Ouvre Découvrir › Mods pour cette instance. */
  onAdd: () => void;
  onOpen: (mod: OpenMod) => void;
};

/** Un mod du joueur ne peut être activé que s'il est fait pour le loader et la version de l'instance. */
const usable = (mod: PersonalMod) => mod.status.kind === "ok";

/** Une version à installer existe : celle pour la version de l'instance, ou une plus récente. */
const hasUpdate = (mod: PersonalMod) => mod.status.kind === "update" || mod.newer !== null;

function statusText(mod: PersonalMod, minecraftVersion: string) {
  switch (mod.status.kind) {
    case "ok":
      return mod.newer && `Version ${mod.newer} disponible.`;
    case "update":
      return `Prévu pour Minecraft ${mod.status.builtFor}. Une version pour ${minecraftVersion} existe : ${mod.status.version}.`;
    case "outdated":
      return `Prévu pour Minecraft ${mod.status.builtFor} : il ne se chargera pas en ${minecraftVersion}.`;
    case "loader":
      return `Fait pour ${mod.status.loader} : il ne se chargera pas sur cette instance.`;
  }
}

const removal = (mod: PersonalMod, onRemove: (id: string) => void): Confirmation => ({
  title: `Supprimer ${mod.name} ?`,
  description: "Le fichier du mod ira dans la corbeille. Tu pourras l'en sortir, ou le réinstaller depuis Découvrir.",
  detail: mod.filename,
  confirm: "Supprimer",
  onConfirm: () => onRemove(mod.id),
});

/**
 * Onglet Mods de la page d'une instance : le catalogue Clover (instance Clover Games), puis les mods
 * ajoutés par le joueur. Tout s'applique au prochain lancement.
 */
export function InstanceMods(props: Props) {
  const { catalogue, personal } = props;
  const [asking, setAsking] = useState<Confirmation | null>(null);
  return (
    <div className="flex flex-col gap-8">
      <p className="text-[13px] text-muted-foreground">Les changements s'appliquent au prochain lancement.</p>
      {catalogue && <Catalogue {...props} catalogue={catalogue} />}
      <Personal {...props} personal={personal} onAsk={setAsking} titled={Boolean(catalogue)} />
      <ConfirmDialog ask={asking} onClose={() => setAsking(null)} />
    </div>
  );
}

/** Fond d'une carte de mod : bouton qui ouvre sa page, ou simple fond s'il n'en a pas. */
function CardBack({ name, onOpen, className }: { name: string; onOpen?: () => void; className?: string }) {
  const base = cn("absolute inset-0 rounded-lg border border-border bg-card", className);
  return onOpen ? (
    <button type="button" onClick={onOpen} aria-label={`Ouvrir la page de ${name}`} className={cn(base, "transition-colors hover:bg-card-hover")} />
  ) : (
    <span aria-hidden className={base} />
  );
}

function Catalogue({ catalogue, minecraftVersion, onToggle, onOpen }: Props & { catalogue: ModInfo[] }) {
  const on = catalogue.filter((mod) => mod.enabled && mod.available).length;
  return (
    <section aria-labelledby="mods-catalogue" className="flex flex-col gap-1">
      <h2 id="mods-catalogue" className="flex items-baseline gap-3 font-display text-xl">
        Catalogue Clover
        <span className="font-sans text-xs text-muted-foreground">
          {on} activé{on > 1 ? "s" : ""} · vérifiés par l'équipe Clover Games, mis à jour avec le serveur
        </span>
      </h2>
      {CATEGORIES.map((category) => {
        const items = catalogue.filter((mod) => mod.category === category.id);
        if (items.length === 0) return null;
        return (
          <section key={category.id} aria-labelledby={`mods-${category.id}`} className="mt-4 flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <h3 id={`mods-${category.id}`} className="text-sm font-semibold">
                {category.title}
              </h3>
              <p className="text-xs text-muted-foreground">{category.hint}</p>
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-2.5">
              {items.map((mod) => (
                <li key={mod.id} className={cn("relative flex gap-4 px-4 py-3.5", !mod.available && "opacity-55")}>
                  <CardBack name={mod.name} onOpen={() => onOpen({ list: "catalogue", id: mod.id })} />
                  <div className="pointer-events-none relative flex min-w-0 flex-1 gap-4">
                    <ModIcon src={mod.icon} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label htmlFor={`mod-${mod.id}`} className="text-sm font-semibold">
                        {mod.name}
                      </label>
                      <p className="text-xs leading-snug text-muted-foreground">{mod.available ? mod.description : `Pas encore disponible pour Minecraft ${minecraftVersion}.`}</p>
                      {mod.available && mod.version && <p className="truncate font-pixel text-[10px] text-muted-foreground/70">{mod.version}</p>}
                    </div>
                  </div>
                  <Switch id={`mod-${mod.id}`} className="relative mt-0.5" checked={mod.available && mod.enabled} disabled={!mod.available} onCheckedChange={(checked) => onToggle(mod.id, checked)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

function Personal({ personal, minecraftVersion, onTogglePersonal, onUpdatePersonal, onRemovePersonal, onAddFiles, onUpdateAll, onAdd, onOpen, onAsk, titled }: Props & { onAsk: (ask: Confirmation) => void; titled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [updating, setUpdating] = useState(false);
  const list = personal ?? [];
  const blocked = list.filter((mod) => !usable(mod)).length;
  const updates = list.filter(hasUpdate).length;

  return (
    <section
      aria-labelledby="mods-personal"
      className="flex flex-col"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const files = [...event.dataTransfer.files].filter((file) => file.name.endsWith(".jar"));
        if (files.length > 0) onAddFiles(files);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="mods-personal" className="flex items-baseline gap-3 font-display text-xl">
          {titled ? "Tes mods" : "Mods"}
          <span className="font-sans text-xs text-muted-foreground">
            {list.length} mod{list.length > 1 ? "s" : ""}
            {blocked > 0 && ` · ${blocked} ne peu${blocked > 1 ? "vent" : "t"} pas être chargé${blocked > 1 ? "s" : ""} en ${minecraftVersion}`}
          </span>
        </h2>
        <div className="ml-auto flex gap-2">
          {updates > 0 && (
            <button
              type="button"
              disabled={updating}
              onClick={() => {
                setUpdating(true);
                void onUpdateAll().finally(() => setUpdating(false));
              }}
              className={secondaryButton}
            >
              <RefreshCw className={cn("size-4", updating && "motion-safe:animate-spin")} aria-hidden />
              {updating ? "Mise à jour…" : `Tout mettre à jour (${updates})`}
            </button>
          )}
          <button type="button" onClick={() => input.current?.click()} className={secondaryButton}>
            <FileUp className="size-4" aria-hidden />
            Ajouter un fichier .jar
          </button>
          <button type="button" onClick={onAdd} className={primaryButton}>
            <Plus className="size-4" aria-hidden />
            Ajouter des mods
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".jar"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            if (files.length > 0) onAddFiles(files);
            event.target.value = "";
          }}
        />
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/8 px-4 py-3 text-[13px] leading-relaxed">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <p>Ces mods viennent de toi : ils ne sont pas vérifiés par l'équipe Clover Games. Les mods de triche sont interdits sur le serveur et repérés par l'anticheat.</p>
      </div>

      {personal && list.length === 0 ? (
        <EmptyState
          className={cn("mt-4", dragging && "border-accent bg-accent/5")}
          title="Aucun mod ajouté"
          hint="Ajoute-en depuis Découvrir, ou glisse des fichiers .jar ici."
        />
      ) : (
        <ul className={cn("mt-4 flex flex-col gap-2 rounded-lg", dragging && "outline-2 outline-offset-4 outline-accent outline-dashed")}>
          {list.map((mod) => {
            const text = statusText(mod, minecraftVersion);
            return (
              <li key={mod.id} className="relative flex items-center gap-4 px-4 py-3">
                <CardBack name={mod.name} onOpen={mod.projectId ? () => onOpen({ list: "personal", id: mod.id }) : undefined} className={cn(!usable(mod) && "bg-[#17150f]")} />
                <Switch className="relative" id={`personal-${mod.id}`} checked={mod.enabled && usable(mod)} disabled={!usable(mod)} onCheckedChange={(checked) => onTogglePersonal(mod.id, checked)} />
                <ModIcon src={mod.icon} className={cn("pointer-events-none relative", !usable(mod) && "opacity-60")} />
                <div className={cn("relative flex min-w-0 flex-1 flex-col gap-0.5", mod.projectId && "pointer-events-none")}>
                  <label htmlFor={`personal-${mod.id}`} className={cn("flex items-baseline gap-2 text-sm font-semibold", !usable(mod) && "text-muted-foreground")}>
                    {mod.name}
                    {mod.version && <span className="truncate font-pixel text-[10px] font-normal text-muted-foreground/70">{mod.version}</span>}
                  </label>
                  {text && <p className={cn("text-xs leading-snug", hasUpdate(mod) ? "text-accent" : "text-error")}>{text}</p>}
                  <p className="truncate text-[11px] text-muted-foreground">{mod.source ?? mod.filename}</p>
                </div>
                {hasUpdate(mod) && (
                  <button type="button" disabled={updating} onClick={() => onUpdatePersonal(mod.id)} className={cn(secondaryButton, "relative")}>
                    <RefreshCw className="size-4" aria-hidden />
                    Mettre à jour
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onAsk(removal(mod, onRemovePersonal))}
                  aria-label={`Supprimer ${mod.name}`}
                  title="Supprimer"
                  className="relative grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Page d'un mod de l'instance : sa page Modrinth, avec son interrupteur et ses boutons. */
export function ModDetail({
  open,
  catalogue,
  personal,
  minecraftVersion,
  onToggle,
  onTogglePersonal,
  onUpdatePersonal,
  onRemovePersonal,
  onRemoved,
  load,
  onOpenLink,
}: Actions & {
  open: OpenMod;
  catalogue?: ModInfo[];
  personal: PersonalMod[] | null;
  /** Le mod supprimé n'a plus de page : on revient à la liste. */
  onRemoved: () => void;
  load: (project: string) => Promise<ModrinthProject>;
  onOpenLink: (url: string) => void;
}) {
  const [asking, setAsking] = useState<Confirmation | null>(null);
  if (open.list === "catalogue") {
    const mod = catalogue?.find((other) => other.id === open.id);
    if (!mod) return null;
    return (
      <ModPage
        project={mod.id}
        name={mod.name}
        icon={mod.icon}
        version={mod.available ? mod.version : null}
        summary={mod.description}
        notice={!mod.available && <Notice tone="error">Pas encore disponible pour Minecraft {minecraftVersion}.</Notice>}
        actions={<PageSwitch id={mod.id} on={mod.available && mod.enabled} disabled={!mod.available} onChange={(checked) => onToggle(mod.id, checked)} />}
        load={load}
        onOpenLink={onOpenLink}
      />
    );
  }

  const mod = personal?.find((other) => other.id === open.id);
  if (!mod?.projectId) return null;
  const text = statusText(mod, minecraftVersion);
  return (
    <>
      <ModPage
        project={mod.projectId}
        name={mod.name}
        icon={mod.icon}
        version={mod.version}
        notice={text && <Notice tone={hasUpdate(mod) ? "accent" : "error"}>{text}</Notice>}
        actions={
          <>
            {hasUpdate(mod) && (
              <button type="button" onClick={() => onUpdatePersonal(mod.id)} className={secondaryButton}>
                <RefreshCw className="size-4" aria-hidden />
                Mettre à jour
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setAsking(
                  removal(mod, (id) => {
                    onRemovePersonal(id);
                    onRemoved();
                  }),
                )
              }
              className={cn(secondaryButton, "hover:text-destructive")}
            >
              <Trash2 className="size-4" aria-hidden />
              Supprimer
            </button>
            <PageSwitch id={mod.id} on={mod.enabled && usable(mod)} disabled={!usable(mod)} onChange={(checked) => onTogglePersonal(mod.id, checked)} />
          </>
        }
        load={load}
        onOpenLink={onOpenLink}
      />
      <ConfirmDialog ask={asking} onClose={() => setAsking(null)} />
    </>
  );
}

function PageSwitch({ id, on, disabled, onChange }: { id: string; on: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label htmlFor={`page-${id}`} className="ml-2 flex items-center gap-2.5 text-[13px] font-semibold">
      {on ? "Activé" : "Désactivé"}
      <Switch id={`page-${id}`} checked={on} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}

function Notice({ tone, children }: { tone: "accent" | "error"; children: ReactNode }) {
  return <p className={cn("mt-5 rounded-lg border px-4 py-3 text-[13px] leading-relaxed", tone === "accent" ? "border-accent/30 bg-accent/8 text-accent" : "border-error/30 bg-error/8 text-error")}>{children}</p>;
}
