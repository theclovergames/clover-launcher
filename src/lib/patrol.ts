/** Couloirs réservés : toute la largeur du sprite reste à distance du couloir suivant. */
export function patrolLanes(width: number, spriteWidths: readonly number[]) {
  const padding = 8;
  const gap = 10;
  const available = Math.max(0, width - padding * 2 - gap * (spriteWidths.length - 1));
  const total = spriteWidths.reduce((sum, value) => sum + value, 0);
  const scale = total > 0 ? Math.min(1, available / total) : 1;
  const travel = spriteWidths.length ? Math.max(0, (available - total * scale) / spriteWidths.length) : 0;
  let cursor = padding;
  const lanes = spriteWidths.map((value) => {
    const body = value * scale;
    const from = cursor + body / 2;
    const to = from + travel;
    cursor += body + travel + gap;
    return { from: (from / width) * 100, to: (to / width) * 100 };
  });
  return { scale, lanes };
}
