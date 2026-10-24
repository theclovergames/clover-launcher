import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import { NIGHT_MOB_DAWN_MS, NIGHT_MOB_HIT_MS, useNightMob } from "../src/lib/use-night-mob.ts";

const { window } = new JSDOM("", { pretendToBeVisual: true });
Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(window, { matchMedia: () => ({ matches: false }) });

async function mount(t: TestContext, dark = true) {
  const pending = new Map<number, { callback: () => void; delay: number }>();
  let nextId = 0;
  t.mock.method(window, "setTimeout", (callback: () => void, delay: number) => {
    pending.set(++nextId, { callback, delay });
    return nextId;
  });
  t.mock.method(window, "clearTimeout", (id: number) => { pending.delete(id); });
  let state: ReturnType<typeof useNightMob>;
  function Probe({ dark }: { dark: boolean }) { state = useNightMob(dark); return null; }
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  let mounted = true;
  const unmount = async () => {
    if (!mounted) return;
    mounted = false;
    await act(async () => root.unmount());
    container.remove();
  };
  t.after(unmount);
  t.after(() => document.documentElement.classList.remove("reduce-motion"));
  await act(async () => root.render(createElement(Probe, { dark })));
  return {
    get phase() { return state!.phase; }, pending, unmount,
    async defeat() { await act(async () => state!.defeat()); },
    async setDark(dark: boolean) { await act(async () => root.render(createElement(Probe, { dark }))); },
    async advance() {
      assert.equal(pending.size, 1);
      const [id, timer] = pending.entries().next().value!;
      pending.delete(id);
      await act(async () => timer.callback());
    },
  };
}

test("un clic élimine une seule fois le monstre, puis il revient après 20 à 40 secondes", async (t) => {
  const view = await mount(t);
  assert.equal(view.phase, "alive");
  await view.defeat();
  await view.defeat();
  assert.equal(view.phase, "hit");
  assert.equal(view.pending.size, 1);
  assert.equal(view.pending.values().next().value!.delay, NIGHT_MOB_HIT_MS);
  await view.advance();
  assert.equal(view.phase, "absent");
  const delay = view.pending.values().next().value!.delay;
  assert.ok(delay >= 20000 && delay <= 40000);
  await view.advance();
  assert.equal(view.phase, "alive");
  await view.defeat();
  await view.unmount();
  assert.equal(view.pending.size, 0);
});

test("l'aube laisse sortir les monstres et annule toute réapparition avant la nuit suivante", async (t) => {
  const view = await mount(t);
  await view.setDark(false);
  assert.equal(view.phase, "dawn");
  assert.equal(view.pending.values().next().value!.delay, NIGHT_MOB_DAWN_MS);
  await view.advance();
  assert.equal(view.phase, "absent");
  assert.equal(view.pending.size, 0);
  await view.setDark(true);
  await view.defeat();
  await view.advance();
  await view.setDark(false);
  assert.equal(view.phase, "absent");
  assert.equal(view.pending.size, 0);
  await view.setDark(true);
  assert.equal(view.phase, "alive");
});

test("les animations réduites suppriment les effets mais gardent l'attente de réapparition", async (t) => {
  document.documentElement.classList.add("reduce-motion");
  const view = await mount(t, false);
  assert.equal(view.phase, "absent");
  await view.setDark(true);
  await view.defeat();
  assert.equal(view.phase, "absent");
  assert.ok(view.pending.values().next().value!.delay >= 20000);
  await view.advance();
  assert.equal(view.phase, "alive");
  await view.setDark(false);
  assert.equal(view.phase, "absent");
  assert.equal(view.pending.size, 0);
});
