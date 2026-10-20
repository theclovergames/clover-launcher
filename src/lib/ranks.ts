const badges = import.meta.glob<string>("../assets/ranks/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

/**
 * Badge d'un grade en jeu (groupe LuckPerms, sans accent), tel qu'il apparaît dans le chat : texture
 * du module `content` du plugin, ramenée à 12 px de haut. `null` pour un grade sans badge, affiché
 * alors en texte.
 */
export function rankBadge(id: string): string | null {
  return badges[`../assets/ranks/${id}.png`] ?? null;
}
