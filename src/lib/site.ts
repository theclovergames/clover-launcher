import type { Catalogue, SiteFeed } from "./api";

export const SITE_URL = "https://clovergames.fr";
export const DISCORD_URL = "https://discord.gg/theclovergames";

/**
 * Total des modes du manifeste ; une donnée manquante ne vaut jamais zéro. Un mode en développement n'a
 * pas encore de serveur : il ne compte pas.
 */
export function networkPlayers(feed: SiteFeed, modes: Catalogue["modes"]): number | null {
  const open = modes.filter((mode) => !mode.soon);
  if (!feed.modes || open.length === 0) return null;
  let total = 0;
  for (const { id } of open) {
    const status = feed.modes.find((mode) => mode.id === id);
    if (!status || status.online === null) return null;
    if (!status.online) continue;
    if (status.players === null) return null;
    total += status.players;
  }
  return total;
}
