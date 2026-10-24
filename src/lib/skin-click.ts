/** Un clic simple reste distinct d'une rotation ou d'une prise du personnage. */
export function attachSkinClick(canvas: HTMLCanvasElement, onClick: (event: MouseEvent) => void) {
  let down: { x: number; y: number; moved: boolean } | null = null;
  const onDown = (event: PointerEvent) => {
    down = event.button === 0 ? { x: event.clientX, y: event.clientY, moved: false } : null;
  };
  const onMove = (event: PointerEvent) => {
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) down.moved = true;
  };
  const onCancel = () => { down = null; };
  const onSimpleClick = (event: MouseEvent) => {
    const pressed = down;
    down = null;
    if (event.button !== 0 || !pressed || pressed.moved || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4) return;
    onClick(event);
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("click", onSimpleClick);
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointercancel", onCancel);
    canvas.removeEventListener("click", onSimpleClick);
  };
}

/** Le vide du canvas ne doit pas masquer un bouton visible de la scène. */
export function clickBehindSkin(event: MouseEvent) {
  const layers = document.elementsFromPoint(event.clientX, event.clientY);
  const index = layers.indexOf(event.currentTarget as Element);
  if (index < 0) return;
  layers[index + 1]?.closest<HTMLButtonElement>("button")?.click();
}
