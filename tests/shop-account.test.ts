import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";

import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import { useShopAccount } from "../src/lib/use-shop-account.ts";
import type { ShopAccount } from "../src/types.ts";

const { window } = new JSDOM("", { pretendToBeVisual: true });
Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true });

const account = (balance: number): ShopAccount => ({ balance, blocked: {} });

function deferred() {
  let resolve!: (value: ShopAccount) => void;
  let reject!: (reason: string) => void;
  const promise = new Promise<ShopAccount>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function mount(t: TestContext, uuid: string | null, load: () => Promise<ShopAccount>) {
  let current!: ReturnType<typeof useShopAccount>;
  function Probe({ uuid }: { uuid: string | null }) {
    current = useShopAccount(uuid, load);
    return null;
  }
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  t.after(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  const render = async (uuid: string | null) => { await act(async () => root.render(createElement(Probe, { uuid }))); };
  await render(uuid);
  return { get current() { return current; }, render };
}

test("aucune lecture sans compte, le solde zéro est conservé", async (t) => {
  let calls = 0;
  const view = await mount(t, null, async () => { calls++; return account(0); });
  assert.equal(calls, 0);
  assert.equal(view.current.account, null);
  await view.render("A");
  assert.equal(calls, 1);
  assert.equal(view.current.account?.balance, 0);
});

test("changer de compte masque le solde précédent et ignore sa réponse tardive", async (t) => {
  const requests: ReturnType<typeof deferred>[] = [];
  const view = await mount(t, "A", () => {
    const request = deferred();
    requests.push(request);
    return request.promise;
  });
  await act(async () => requests[0].resolve(account(100)));
  assert.equal(view.current.account?.balance, 100);
  await act(async () => view.current.refresh());
  await view.render("B");
  assert.equal(view.current.account, null);
  await act(async () => requests[1].resolve(account(999)));
  assert.equal(view.current.account, null);
  await act(async () => requests[2].resolve(account(42)));
  assert.equal(view.current.account?.balance, 42);
});

test("une erreur retire le solde précédent et reste disponible pour l'interface", async (t) => {
  const request = deferred();
  let calls = 0;
  const view = await mount(t, "A", () => ++calls === 1 ? Promise.resolve(account(100)) : request.promise);
  await act(async () => view.current.refresh());
  await act(async () => request.reject("Site indisponible"));
  assert.equal(view.current.account, null);
  assert.equal(view.current.error, "Site indisponible");
});

test("le rafraîchissement après achat remplace une lecture encore en attente", async (t) => {
  const requests: ReturnType<typeof deferred>[] = [];
  const view = await mount(t, "A", () => {
    const request = deferred();
    requests.push(request);
    return request.promise;
  });
  await act(async () => view.current.refresh());
  assert.equal(requests.length, 2);
  await act(async () => requests[1].resolve(account(25)));
  await act(async () => requests[0].resolve(account(100)));
  assert.equal(view.current.account?.balance, 25);
});

test("focus, visibilité et minute partagent une seule lecture, suspendue quand la fenêtre est cachée", async (t) => {
  let tick!: () => Promise<void>;
  let cleared = false;
  t.mock.method(window, "setInterval", (callback: () => Promise<void>, delay: number) => {
    assert.equal(delay, 60_000);
    tick = callback;
    return 1;
  });
  t.mock.method(window, "clearInterval", () => { cleared = true; });
  let hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  t.after(() => { delete (document as unknown as { hidden?: boolean }).hidden; });
  const requests: ReturnType<typeof deferred>[] = [];
  const view = await mount(t, "A", () => {
    const request = deferred();
    requests.push(request);
    return request.promise;
  });
  window.dispatchEvent(new window.Event("focus"));
  document.dispatchEvent(new window.Event("visibilitychange"));
  void tick();
  assert.equal(requests.length, 1);
  await act(async () => requests[0].resolve(account(100)));
  hidden = true;
  window.dispatchEvent(new window.Event("focus"));
  document.dispatchEvent(new window.Event("visibilitychange"));
  await tick();
  assert.equal(requests.length, 1);
  hidden = false;
  document.dispatchEvent(new window.Event("visibilitychange"));
  assert.equal(requests.length, 2);
  await act(async () => requests[1].resolve(account(90)));
  window.dispatchEvent(new window.Event("focus"));
  assert.equal(requests.length, 3);
  await act(async () => requests[2].resolve(account(80)));
  void tick();
  assert.equal(requests.length, 4);
  await act(async () => requests[3].resolve(account(70)));
  await view.render(null);
  assert.equal(cleared, true);
  window.dispatchEvent(new window.Event("focus"));
  document.dispatchEvent(new window.Event("visibilitychange"));
  assert.equal(requests.length, 4);
  assert.equal(view.current.account, null);
});
