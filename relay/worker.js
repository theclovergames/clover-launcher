// Relais de l'API CurseForge pour le Clover Launcher, sur curseforge.clovergames.fr. La clé reste
// dans les secrets du Worker (CURSEFORGE_API_KEY) : le launcher n'en embarque aucune. Seules les
// routes qu'il appelle passent (src-tauri/src/game/curseforge.rs), avec l'identité du launcher, dans
// la limite de LIMITER par adresse IP et de GLOBAL_LIMITER pour l'ensemble du relais. Aucune réponse
// n'est mise en cache : les conditions de l'API CurseForge (§ 3.1) l'interdisent.

const API = "https://api.curseforge.com";
const ROUTES = [
  ["GET", /^\/v1\/mods\/search$/],
  ["GET", /^\/v1\/mods\/\d+(\/description|\/files)?$/],
  ["POST", /^\/v1\/mods(\/files)?$/],
];
// Le launcher envoie « CloverLauncher/<version> (+https://clovergames.fr) » (download.rs).
const LAUNCHER_AGENT = /^CloverLauncher\/\d+\.\d+\.\d+/;
const MAX_BODY = 64 * 1024;
// Un modpack de plusieurs centaines de mods passe en un seul lot ; au-delà, c'est un abus.
const MAX_IDS = 1000;

export function isAllowedRoute(method, pathname) {
  return ROUTES.some(([m, path]) => method === m && path.test(pathname));
}

export function isLauncher(request) {
  return LAUNCHER_AGENT.test(request.headers.get("user-agent") ?? "");
}

// Renvoie le corps à relayer (texte) ou null s'il est refusé : trop gros, illisible, ou liste d'identifiants hors limites.
export function checkBody(pathname, text) {
  if (text.length > MAX_BODY) return null;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const key = pathname.endsWith("/files") ? "fileIds" : "modIds";
  const ids = body?.[key];
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS) return null;
  if (!ids.every((id) => Number.isSafeInteger(id) && id > 0)) return null;
  return JSON.stringify({ [key]: ids });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!isAllowedRoute(request.method, url.pathname)) return new Response("Not found", { status: 404 });
    if (!isLauncher(request)) return new Response("Forbidden", { status: 403 });

    const get = request.method === "GET";
    let body;
    if (!get) {
      if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return new Response("Payload too large", { status: 413 });
      body = checkBody(url.pathname, await request.text());
      if (body === null) return new Response("Bad request", { status: 400 });
    }

    // Une adresse déjà bloquée ne doit pas entamer le plafond global, sinon elle seule le vide pour tous.
    const ip = await env.LIMITER.limit({ key: request.headers.get("cf-connecting-ip") ?? "" });
    if (!ip.success) return new Response("Too many requests", { status: 429 });
    const global = await env.GLOBAL_LIMITER.limit({ key: "global" });
    if (!global.success) return new Response("Too many requests", { status: 429 });

    const upstream = await fetch(API + url.pathname + url.search, {
      method: request.method,
      headers: {
        "x-api-key": env.CURSEFORGE_API_KEY,
        "user-agent": "CloverLauncher-relay (+https://clovergames.fr)",
        accept: "application/json",
        "content-type": "application/json",
      },
      body,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  },
};
