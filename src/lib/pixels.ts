/** Pixel art en lignes de caractères (`.` : vide), pour le ciel de l'accueil et ses décors. */

/** Un carré par case marquée de `mark`, en un seul tracé. */
export const cells = (rows: readonly string[], mark: string) =>
  rows.flatMap((row, y) => [...row].map((cell, x) => (cell === mark ? `M${x} ${y}h1v1h-1z` : ""))).join("");

/** Partie décimale ; avec la suite R2 (nombre plastique), des places réparties sans paires ni alignements. */
export const fraction = (value: number) => value - Math.floor(value);

/** Motif en image CSS, à répéter : une couleur par lettre de `palette`. */
export function pixelImage(rows: readonly string[], palette: Record<string, string>) {
  const width = Math.max(...rows.map((row) => row.length));
  const paths = Object.entries(palette)
    .map(([mark, color]) => `<path fill='${color}' d='${cells(rows, mark)}'/>`)
    .join("");
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${rows.length}' shape-rendering='crispEdges'>${paths}</svg>`)}")`;
}
