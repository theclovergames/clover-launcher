// Relais de l'API CurseForge pour le Clover Launcher, sur curseforge.clovergames.fr. La clé reste
// dans les secrets du Worker (CURSEFORGE_API_KEY) : le launcher n'en embarque aucune. Seules les
// routes qu'il appelle passent (src-tauri/src/game/curseforge.rs), dans la limite de LIMITER par
// adresse IP. Aucune réponse n'est mise en cache : les conditions de l'API CurseForge (§ 3.1)
// l'interdisent.

const API = "https://api.curseforge.com";
const ROUTES = [
  ["GET", /^\/v1\/mods\/search$/],
  ["GET", /^\/v1\/mods\/\d+(\/description|\/files)?$/],
  ["POST", /^\/v1\/mods(\/files)?$/],
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!ROUTES.some(([method, path]) => request.method === method && path.test(url.pathname))) {
      return new Response("Not found", { status: 404 });
    }
    const { success } = await env.LIMITER.limit({ key: request.headers.get("cf-connecting-ip") ?? "" });
    if (!success) return new Response("Too many requests", { status: 429 });

    const get = request.method === "GET";
    const upstream = await fetch(API + url.pathname + url.search, {
      method: request.method,
      headers: {
        "x-api-key": env.CURSEFORGE_API_KEY,
        "user-agent": "CloverLauncher-relay (+https://clovergames.fr)",
        accept: "application/json",
        "content-type": "application/json",
      },
      body: get ? undefined : request.body,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  },
};
