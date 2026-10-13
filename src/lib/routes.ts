/**
 * Navigation du launcher : une pile de pages. Le menu repart d'une pile neuve ; une sous-page ou un
 * lien d'un écran à l'autre s'empile, et « Retour » ramène exactement d'où l'on vient (la page d'une
 * instance et son onglet compris).
 */
import type { ContentKind } from "@/lib/content-kinds";
import type { ContentFolder, Tab } from "@/types";

/** Onglet de la page d'une instance. */
export type InstanceSection = "overview" | "mods" | ContentFolder | "settings";

/** Mod dont la page est ouverte, dans le catalogue Clover ou parmi les mods du joueur. */
export type OpenMod = { list: "catalogue" | "personal"; id: string };

/** Projet ouvert depuis Découvrir : son titre et son logo s'affichent avant que sa page arrive. */
export type OpenProject = { id: string; title: string; icon: string | null };

export type Route =
  | { tab: Exclude<Tab, "instances" | "discover"> }
  | { tab: "instances"; instance?: string; section?: InstanceSection; mod?: OpenMod }
  | { tab: "discover"; kind: ContentKind; target?: string; world?: string; project?: OpenProject };

export const route = (tab: Tab): Route => (tab === "discover" ? { tab, kind: "mod" } : { tab } as Route);

/** Page qui contient celle-ci (la liste au-dessus d'une fiche, l'instance au-dessus de son mod). */
export function parent(current: Route): Route | null {
  if (current.tab === "instances") {
    if (current.mod) return { tab: "instances", instance: current.instance, section: current.section };
    if (current.instance) return { tab: "instances" };
  }
  if (current.tab === "discover" && current.project) return { tab: "discover", kind: current.kind, target: current.target, world: current.world };
  return null;
}

/** Pile après « Retour » : la page d'avant, sinon celle qui contient la page ouverte. */
export function back(stack: Route[]): Route[] {
  if (stack.length > 1) return stack.slice(0, -1);
  const up = parent(stack[0]);
  return up ? [up] : stack;
}

export const canGoBack = (stack: Route[]) => stack.length > 1 || parent(stack[0]) !== null;

/** Noms affichés dans le fil d'Ariane. */
export type Names = {
  tab: (tab: Tab) => string;
  instance: (id: string) => string;
  section: (section: InstanceSection) => string;
  kind: (kind: ContentKind) => string;
  mod: (mod: OpenMod) => string;
};

/** Maillon du fil d'Ariane : son nom, et la page qu'il ouvre (absente pour la page ouverte). */
export type Crumb = { label: string; to?: Route };

/** Chemin de la page dans le launcher : Instances › Survie 1.21 › Shaders, Découvrir › Mods › Sodium. */
export function trail(current: Route, names: Names): Crumb[] {
  const crumbs: Crumb[] = [];
  if (current.tab === "instances") {
    crumbs.push({ label: names.tab("instances"), to: { tab: "instances" } });
    if (current.instance) {
      crumbs.push({ label: names.instance(current.instance), to: { tab: "instances", instance: current.instance } });
      if (current.section && current.section !== "overview") crumbs.push({ label: names.section(current.section), to: { tab: "instances", instance: current.instance, section: current.section } });
      if (current.mod) crumbs.push({ label: names.mod(current.mod) });
    }
  } else if (current.tab === "discover") {
    const list: Route = { tab: "discover", kind: current.kind, target: current.target, world: current.world };
    crumbs.push({ label: names.tab("discover"), to: list }, { label: names.kind(current.kind), to: list });
    if (current.project) crumbs.push({ label: current.project.title });
  } else {
    crumbs.push({ label: names.tab(current.tab) });
  }
  // Le dernier maillon est la page ouverte : il n'ouvre rien.
  const last = crumbs[crumbs.length - 1];
  crumbs[crumbs.length - 1] = { label: last.label };
  return crumbs;
}
