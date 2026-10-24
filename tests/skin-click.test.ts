import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { JSDOM } from "jsdom";

import { attachSkinClick, clickBehindSkin } from "../src/lib/skin-click.ts";

function scene(t: TestContext) {
  const { window } = new JSDOM("<canvas></canvas><button>Éliminer le zombie</button><div></div>");
  Object.assign(globalThis, { window, document: window.document });
  const canvas = document.querySelector("canvas")!;
  const monster = document.querySelector("button")!;
  const cover = document.querySelector("div")!;
  let hits = 0;
  let layers: Element[] = [canvas, monster];
  Object.assign(document, { elementsFromPoint: () => layers });
  monster.addEventListener("click", () => hits++);
  const detach = attachSkinClick(canvas, clickBehindSkin);
  t.after(detach);
  t.after(() => window.close());
  return {
    get hits() { return hits; },
    set layers(value: Element[]) { layers = value; },
    canvas, monster, cover, detach,
    pointer(type: string, x = 100, y = 100, button = 0) {
      canvas.dispatchEvent(new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button }));
    },
  };
}

test("le vide du skin laisse cliquer le monstre situé juste derrière", (t) => {
  const view = scene(t);
  view.pointer("pointerdown");
  view.pointer("click");
  assert.equal(view.hits, 1);
  view.detach();
  view.pointer("pointerdown");
  view.pointer("click");
  assert.equal(view.hits, 1);
});

test("rotation, prise, clic droit et geste annulé ne frappent jamais un monstre", (t) => {
  const view = scene(t);
  view.pointer("pointerdown");
  view.pointer("pointermove", 120);
  view.pointer("pointermove", 100);
  view.pointer("click");
  view.pointer("pointerdown");
  view.pointer("click", 100, 120);
  view.pointer("pointerdown", 100, 100, 2);
  view.pointer("click", 100, 100, 2);
  view.pointer("pointerdown");
  view.pointer("pointercancel");
  view.pointer("click");
  assert.equal(view.hits, 0);
});

test("un élément interposé bloque le clic et on ne cherche pas un bouton plus loin", (t) => {
  const view = scene(t);
  view.layers = [view.canvas, view.cover, view.monster];
  view.pointer("pointerdown");
  view.pointer("click");
  view.layers = [view.monster];
  view.pointer("pointerdown");
  view.pointer("click");
  assert.equal(view.hits, 0);
});
