import { Anvil, Box, Clover, Grid2x2, Hammer, Layers } from "lucide-react";

import type { InstanceEntry, InstanceKind } from "@/types";

export const KINDS: Record<InstanceKind, { label: string; hint: string; Icon: typeof Box }> = {
  clover: { label: "Clover", hint: "Version et mods du serveur, toujours à jour", Icon: Clover },
  vanilla: { label: "Vanilla", hint: "Minecraft sans mods", Icon: Box },
  fabric: { label: "Fabric", hint: "Mods légers et vite à jour : Sodium, Iris…", Icon: Layers },
  quilt: { label: "Quilt", hint: "Mods Quilt, et la plupart des mods Fabric", Icon: Grid2x2 },
  forge: { label: "Forge", hint: "Mods Forge, des plus anciens aux plus récents", Icon: Anvil },
  neoforge: { label: "NeoForge", hint: "Mods NeoForge, la suite de Forge depuis 1.20", Icon: Hammer },
};

/** Instance personnelle avec son loader (Fabric, Quilt, Forge ou NeoForge) : ses mods sont ceux du joueur. */
export const ownLoader = (kind: InstanceKind | undefined): kind is "fabric" | "quilt" | "forge" | "neoforge" => kind === "fabric" || kind === "quilt" || kind === "forge" || kind === "neoforge";

/** Loader qui charge les mods d'une instance : Fabric pour Clover, aucun pour Vanilla. */
export const modLoader = (kind: InstanceKind): string | null => (ownLoader(kind) ? KINDS[kind].label : kind === "clover" ? "Fabric" : null);

/** Loader et sa version : « Fabric 0.19.5 », Clover compris ; sinon le type, « Vanilla ». */
export const loaderSummary = (entry: InstanceEntry): string =>
  entry.loader ? `${modLoader(entry.kind) ?? KINDS[entry.kind].label} ${entry.loader}` : KINDS[entry.kind].label;

/** Ligne de détail : « 1.21.11 · Fabric 0.19.5 ». */
export function instanceSummary(entry: InstanceEntry): string {
  return `${entry.minecraft ?? "…"} · ${loaderSummary(entry)}`;
}

/** Instance faite pour Clover Games (version et mods du serveur) ; les cartes des modes la lancent toujours. */
export const forClover = (entry: InstanceEntry) => entry.kind === "clover";
