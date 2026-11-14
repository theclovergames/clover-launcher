/**
 * Classement du site dans le launcher : mise en forme des valeurs, colonnes, rangs selon le tri
 * choisi et ligne du compte actif.
 */
import type { LeaderboardBoard, LeaderboardRow, LeaderboardStat } from "../types";

const number = new Intl.NumberFormat("fr-FR");

/** Valeur d'une colonne, au format du site : « 1 204 », « 46 h 00 », « 12 min ». */
export function formatValue(value: number | null | undefined, format: LeaderboardStat["format"]): string {
  if (value === null || value === undefined) return "0";
  if (format === "duration") {
    const minutes = Math.floor(value / 60);
    const hours = Math.floor(minutes / 60);
    return hours === 0 ? `${minutes % 60} min` : `${number.format(hours)} h ${String(minutes % 60).padStart(2, "0")}`;
  }
  return number.format(value);
}

/** Colonnes affichées : celles du site, la colonne de tri en tête si l'administration ne l'a pas listée. */
export function columnsOf(board: LeaderboardBoard): LeaderboardStat[] {
  const listed = board.stats.some((stat) => stat.key === board.sortKey);
  return listed ? board.stats : [{ key: board.sortKey, label: "Score", format: "number" }, ...board.stats];
}

/** Colonne de tri du tableau et son sens. */
export type Sort = { key: string; ascending: boolean };

/** Lignes classées selon `sort`, avec leur rang dans cet ordre ; le tri du site garde son ordre d'origine. */
export function rankRows(board: LeaderboardBoard, sort: Sort | null): { row: LeaderboardRow; rank: number }[] {
  const rows = board.rows.map((row, index) => ({ row, index }));
  if (sort && !(sort.key === board.sortKey && sort.ascending === board.ascending)) {
    rows.sort((a, b) => {
      const left = a.row.values[sort.key] ?? 0;
      const right = b.row.values[sort.key] ?? 0;
      return (sort.ascending ? left - right : right - left) || a.index - b.index;
    });
  }
  return rows.map(({ row }, index) => ({ row, rank: index + 1 }));
}

/** Ligne du compte actif : par UUID, sinon par pseudo. */
export function isMe(row: LeaderboardRow, me: { uuid: string; name: string }) {
  const plain = (uuid: string) => uuid.replace(/-/g, "").toLowerCase();
  return row.uuid ? plain(row.uuid) === plain(me.uuid) : row.name.toLowerCase() === me.name.toLowerCase();
}
