import assert from "node:assert/strict";
import test from "node:test";
import { back, canGoBack, type Names, openFromCrumb, type Route, trail } from "../src/lib/routes.ts";

const names: Names = {
  tab: (tab) => ({ instances: "Instances", discover: "Découvrir", home: "Accueil", messages: "Messages", profile: "Profil", shop: "Boutique" })[tab as string] ?? tab,
  instance: (id) => (id === "x" ? "Survie 1.21" : id),
  section: (section) => (section === "shaderpacks" ? "Shaders" : section === "mods" ? "Mods" : section),
  kind: (kind) => (kind === "shader" ? "Shaders" : kind),
  mod: (mod) => mod.id,
  friend: (uuid) => (uuid === "f1" ? "Kanname" : "Ami"),
};

test("le retour ramène à l'onglet d'où l'on vient", () => {
  const shaders: Route = { tab: "instances", instance: "x", section: "shaderpacks" };
  const list: Route = { tab: "discover", kind: "shader", target: "x" };
  const project: Route = { ...list, project: { id: "bsl", title: "BSL Shaders", icon: null } };
  let stack: Route[] = [{ tab: "instances" }, shaders, list, project];
  stack = back(stack);
  assert.deepEqual(stack.at(-1), list);
  stack = back(back(stack));
  assert.deepEqual(stack.at(-1), { tab: "instances" });
  assert.equal(canGoBack(stack), false);
});

test("une page ouverte seule remonte à la page qui la contient", () => {
  const mod: Route = { tab: "instances", instance: "clover", section: "mods", mod: { list: "catalogue", id: "sodium" } };
  assert.deepEqual(back([mod]), [{ tab: "instances", instance: "clover", section: "mods" }]);
  assert.deepEqual(back([{ tab: "instances", instance: "x" }]), [{ tab: "instances" }]);
  assert.deepEqual(back([{ tab: "home" }]), [{ tab: "home" }]);
  assert.equal(canGoBack([{ tab: "discover", kind: "mod", project: { id: "p", title: "P", icon: null } }]), true);
});

test("le fil d'Ariane suit la page ouverte", () => {
  const crumbs = trail({ tab: "instances", instance: "x", section: "shaderpacks" }, names);
  assert.deepEqual(crumbs.map((crumb) => crumb.label), ["Instances", "Survie 1.21", "Shaders"]);
  assert.deepEqual(crumbs[1].to, { tab: "instances", instance: "x" });
  assert.equal(crumbs[2].to, undefined);
  const project = trail({ tab: "discover", kind: "shader", target: "x", project: { id: "bsl", title: "BSL Shaders", icon: null } }, names);
  assert.deepEqual(project.map((crumb) => crumb.label), ["Découvrir", "Shaders", "BSL Shaders"]);
  assert.deepEqual(project[1].to, { tab: "discover", kind: "shader", target: "x", world: undefined, minecraft: undefined });
});

test("la version voulue pour un modpack reste en revenant à la liste", () => {
  const pack: Route = { tab: "discover", kind: "modpack", minecraft: "1.20.1", project: { id: "p", title: "P", icon: null } };
  assert.deepEqual(back([pack]), [{ tab: "discover", kind: "modpack", target: undefined, world: undefined, minecraft: "1.20.1" }]);
});

test("un maillon du fil d'Ariane dépile la pile jusqu'à sa page", () => {
  const instances: Route = { tab: "instances" };
  const stack: Route[] = [{ tab: "home" }, instances, { tab: "instances", instance: "x" }, { tab: "instances", instance: "x", section: "mods" }];
  assert.deepEqual(openFromCrumb(stack, instances), [{ tab: "home" }, instances]);
  const other: Route = { tab: "discover", kind: "mod" };
  assert.deepEqual(openFromCrumb(stack, other), [...stack.slice(0, -1), other]);
});

test("une conversation ouverte depuis le Profil y ramène, la liste à côté d'elle", () => {
  const conversation: Route = { tab: "messages", friend: "f1" };
  const stack: Route[] = [{ tab: "profile" }, conversation];
  const crumbs = trail(conversation, names);
  assert.deepEqual(crumbs.map((crumb) => crumb.label), ["Messages", "Kanname"]);
  assert.deepEqual(crumbs[0].to, { tab: "messages" });
  assert.deepEqual(back(stack), [{ tab: "profile" }]);
  // Ouverte depuis le menu : pas de page parente, donc pas de « Retour ».
  assert.equal(canGoBack([conversation]), false);
  assert.deepEqual(openFromCrumb(stack, { tab: "messages" }), [{ tab: "profile" }, { tab: "messages" }]);
});

test("un profil ouvert depuis le Classement y ramène, sous le seul pseudo du joueur", () => {
  const player: Route = { tab: "player", name: "Kanname" };
  const stack: Route[] = [{ tab: "leaderboard" }, player];
  assert.deepEqual(trail(player, names).map((crumb) => crumb.label), ["Kanname"]);
  assert.deepEqual(back(stack), [{ tab: "leaderboard" }]);
  assert.equal(canGoBack([player]), false);
});

test("fiche d'un produit : Boutique › produit, « Retour » vers sa catégorie", () => {
  const product: Route = { tab: "shop", category: "grades", product: { id: "vip", name: "VIP" } };
  assert.deepEqual(trail(product, names).map((crumb) => crumb.label), ["Boutique", "VIP"]);
  assert.deepEqual(trail(product, names)[0].to, { tab: "shop", category: "grades" });
  assert.deepEqual(back([product]), [{ tab: "shop", category: "grades" }]);
});
