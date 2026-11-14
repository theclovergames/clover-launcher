import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

// `safeHtml` s'appuie sur le DOM du navigateur : celui de jsdom en tient lieu.
const { window } = new JSDOM();
Object.assign(globalThis, { DOMParser: window.DOMParser, Element: window.Element, Node: window.Node, document: window.document });
const { safeHtml } = await import("../src/lib/safe-html.ts");

test("garde le texte, les liens et images en https", () => {
  assert.equal(safeHtml('<p>Salut <strong>toi</strong></p>'), "<p>Salut <strong>toi</strong></p>");
  assert.equal(safeHtml('<a href="https://clovergames.fr" title="x">site</a>'), '<a href="https://clovergames.fr">site</a>');
  assert.equal(safeHtml('<img src="https://cdn.clovergames.fr/a.png" alt="a" width="9">'), '<img src="https://cdn.clovergames.fr/a.png" alt="a">');
});

test("retire tout ce qui peut exécuter du code", () => {
  for (const html of [
    '<a href="javascript:alert(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<a href="http://clovergames.fr">x</a>',
  ]) {
    assert.equal(safeHtml(html), "<a>x</a>", html);
  }
  assert.equal(safeHtml('<img src="x" onerror="alert(1)">'), "");
  assert.equal(safeHtml('<p onclick="alert(1)" style="color:red">x</p>'), "<p>x</p>");
  assert.equal(safeHtml("<script>alert(1)</script>ok"), "ok");
  assert.equal(safeHtml('<svg><script>alert(1)</script><a href="javascript:x">y</a></svg>ok'), "ok");
  assert.equal(safeHtml("<noscript><img src=x onerror=alert(1)></noscript>ok"), "ok");
  assert.equal(safeHtml('<iframe src="https://exemple.fr"></iframe><style>*{}</style>ok'), "ok");
});

test("une balise inconnue laisse son texte, pas ses attributs", () => {
  assert.equal(safeHtml('<div onmouseover="alert(1)"><span>texte</span></div>'), "texte");
  assert.equal(safeHtml('<a href="https://a.fr"><a href="javascript:x">b</a></a>'), '<a href="https://a.fr"></a><a>b</a>');
});
