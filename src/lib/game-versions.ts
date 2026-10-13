import type { AvailableVersion, ModpackVersion } from "@/types";

/** Les numéros sont ceux de Mojang ; une famille réunit ses correctifs. */
export function versionFamily(id: string): string {
  return /^\d+\.\d+(?:\.\d+)?$/.test(id)
    ? id.split(".").slice(0, 2).join(".")
    : id;
}

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

export function groupVersions(
  versions: AvailableVersion[],
  existing: string[],
  snapshots: boolean,
): VersionFamily[] {
  const groups = new Map<string, VersionFamily>();
  const visible = versions.filter((entry) => snapshots || !entry.snapshot);
  for (const id of [...visible.map((entry) => entry.id), ...existing]) {
    const family = versionFamily(id);
    const group = groups.get(family) ?? {
      id: family,
      versions: [],
      snapshot: versions.find((entry) => entry.id === id)?.snapshot ?? false,
    };
    if (!group.versions.includes(id)) group.versions.push(id);
    groups.set(family, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      versions: group.versions.sort((a, b) =>
        b.localeCompare(a, "en", { numeric: true }),
      ),
    }))
    .sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
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
