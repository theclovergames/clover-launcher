import type { AvailableVersion, ModpackVersion } from "@/types";

/**
 * Famille d'une version, dans les numéros de Mojang : « 1.21 » pour 1.21.4 comme pour ses
 * préversions (1.21.5-pre1, 26.1-snapshot-2) ; « Bêta » et « Alpha » avant la 1.0 (Classic,
 * Indev et Infdev comptent dans l'Alpha, comme chez Mojang). Un snapshot hebdomadaire (25w14a)
 * reste seul ici : `groupVersions` le range avec la version qu'il annonce.
 */
export function versionFamily(id: string): string {
  const release = /^(\d+\.\d+)(?:\.\d+)?(?:[-_].*)?$/.exec(id);
  if (release) return release[1];
  if (/^b\d/.test(id)) return "Bêta";
  if (/^(?:a\d|c\d|inf-|in-|rd-)/.test(id)) return "Alpha";
  return id;
}

/** Ordre des familles : les numérotées de la plus récente à la plus ancienne, puis Bêta, Alpha, le reste. */
const familyRank = (id: string) => (/^\d/.test(id) ? 0 : id === "Bêta" ? 1 : id === "Alpha" ? 2 : 3);

/** Minecraft ouvre un monde dès son lancement (Quick Play) depuis la 1.20 (snapshot 23w14a). */
export function opensWorldsDirectly(id: string): boolean {
  const release = /^1\.(\d+)/.exec(id);
  if (release) return Number(release[1]) >= 20;
  const snapshot = /^(\d{2})w(\d{2})/.exec(id);
  if (snapshot) return Number(snapshot[1]) * 100 + Number(snapshot[2]) >= 2314;
  return true;
}

/** Versions de Minecraft d'un projet, sans les snapshots : « 1.21.1 », « 1.20.1 à 1.21.4 » ; `null` sans aucune. */
export function minecraftRange(versions: string[]): string | null {
  const parts = (id: string) => id.split(".").map(Number);
  const compare = (a: string, b: string) => {
    const [x, y] = [parts(a), parts(b)];
    for (let index = 0; index < Math.max(x.length, y.length); index++) {
      if ((x[index] ?? 0) !== (y[index] ?? 0)) return (x[index] ?? 0) - (y[index] ?? 0);
    }
    return 0;
  };
  const releases = versions.filter((id) => /^\d+\.\d+(?:\.\d+)?$/.test(id)).sort(compare);
  if (releases.length === 0) return null;
  const [first, last] = [releases[0], releases[releases.length - 1]];
  return first === last ? first : `${first} à ${last}`;
}

export type VersionFamily = {
  id: string;
  versions: string[];
  snapshot: boolean;
};

/**
 * Versions par famille (`versionFamily`), de la plus récente à la plus ancienne, et dans chaque
 * famille de la dernière sortie à la première. `existing` : versions des instances, gardées même
 * masquées. Sans `snapshots`, ni snapshots ni préversions.
 */
export function groupVersions(versions: AvailableVersion[], existing: string[], snapshots: boolean): VersionFamily[] {
  const released = new Map(versions.map((entry) => [entry.id, entry.released]));
  const snapshot = new Map(versions.map((entry) => [entry.id, entry.snapshot]));
  // Sorties par date, pour ranger un snapshot hebdomadaire avec la première version parue après lui.
  const releases = versions.filter((entry) => !entry.snapshot && /^\d/.test(entry.id) && entry.released).sort((a, b) => a.released.localeCompare(b.released));
  const familyOf = (id: string) => {
    const family = versionFamily(id);
    const at = released.get(id);
    if (family !== id || !at) return family;
    const next = releases.find((entry) => entry.released >= at);
    return next ? versionFamily(next.id) : family;
  };
  const groups = new Map<string, VersionFamily>();
  const visible = versions.filter((entry) => snapshots || !entry.snapshot);
  for (const id of [...visible.map((entry) => entry.id), ...existing]) {
    const family = familyOf(id);
    const group = groups.get(family) ?? { id: family, versions: [], snapshot: true };
    if (!group.versions.includes(id)) group.versions.push(id);
    group.snapshot &&= snapshot.get(id) ?? false;
    groups.set(family, group);
  }
  // Par date ; sans date, la version sortie avant ses préversions.
  const newest = (a: string, b: string) =>
    (released.get(b) ?? "").localeCompare(released.get(a) ?? "") || Number(snapshot.get(a) ?? false) - Number(snapshot.get(b) ?? false) || b.localeCompare(a, "en", { numeric: true });
  return [...groups.values()]
    .map((group) => ({ ...group, versions: group.versions.sort(newest) }))
    .sort((a, b) => familyRank(a.id) - familyRank(b.id) || b.id.localeCompare(a.id, "en", { numeric: true }));
}

/**
 * Version d'un modpack proposée d'office (`versions` de la plus récente à la plus ancienne) : la
 * dernière stable pour `minecraft`, sinon la dernière pour lui même en bêta ; sans `minecraft`, ou
 * s'il n'en a aucune, la dernière stable du pack.
 */
export function preferredModpackVersion(versions: ModpackVersion[], minecraft?: string | null): ModpackVersion | undefined {
  const fitting = minecraft ? versions.filter((version) => version.gameVersions.includes(minecraft)) : [];
  const pool = fitting.length > 0 ? fitting : versions;
  return pool.find((version) => version.release) ?? pool[0];
}
