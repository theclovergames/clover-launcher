// Relais de l'API CurseForge pour le Clover Launcher, sur curseforge.clovergames.fr. La clé reste
// dans les secrets du Worker (CURSEFORGE_API_KEY) : le launcher n'en embarque aucune. Seules les
// routes qu'il appelle passent (src-tauri/src/game/curseforge.rs), avec l'identité du launcher, dans
// la limite de LIMITER par adresse IP et de Quota pour l'ensemble du relais. Aucune réponse
// n'est mise en cache : les conditions de l'API CurseForge (§ 3.1) l'interdisent.
//
// Aussi GET /weather, la météo du ciel de l'accueil (src-tauri/src/weather.rs) : voir `weather`.

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
// Plafond de tout le relais, pour qu'un abus réparti sur de nombreuses adresses n'épuise pas le
// quota de la clé (unique, impossible à régénérer).
const GLOBAL_LIMIT = 1200;
const WINDOW_MS = 60_000;

// Prévisions de MET Norway : libres, usage commercial compris, sous licence CC BY 4.0 (attribution
// dans le launcher). Leurs conditions demandent une identification et un cache : 30 min par zone.
const MET = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const WEATHER_TTL = 1800;

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

// Zone de la position que Cloudflare déduit de l'adresse IP, arrondie à 0,1° (une dizaine de km) :
// c'est tout ce que MET Norway reçoit, et le cache est partagé par les joueurs d'une même zone.
export function zone(cf) {
  const lat = Number(cf?.latitude);
  const lon = Number(cf?.longitude);
  if (!cf?.latitude || !cf?.longitude || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat: lat.toFixed(1), lon: lon.toFixed(1) };
}

// Symbole de MET Norway (« lightrainshowers_day », « heavysnow »…) ramené au ciel que l'accueil
// sait dessiner. Le grésil tombe comme de la pluie ; un symbole inconnu ne change rien au ciel.
export function sky(symbol) {
  const code = String(symbol ?? "").replace(/_(day|night|polartwilight)$/, "");
  const heavy = code.startsWith("heavy");
  if (code.includes("thunder")) return { sky: "storm", heavy };
  if (code.includes("snow")) return { sky: "snow", heavy };
  if (code.includes("rain") || code.includes("sleet")) return { sky: "rain", heavy };
  const plain = { clearsky: "clear", fair: "fair", partlycloudy: "cloudy", cloudy: "overcast", fog: "fog" }[code];
  return plain ? { sky: plain, heavy: false } : null;
}

// Temps qu'il fait chez le joueur, sans rien lui renvoyer de sa position :
// { schema: 1, sky, heavy, temperature } (°C arrondis, null si MET Norway ne la donne pas).
async function weather(request, ctx) {
  const area = zone(request.cf);
  if (!area) return new Response("Unknown location", { status: 404 });
  const cache = globalThis.caches?.default;
  const key = `https://weather.cache/${area.lat},${area.lon}`;
  const hit = await cache?.match(key);
  if (hit) return hit;

  const upstream = await fetch(`${MET}?lat=${area.lat}&lon=${area.lon}`, { headers: { "user-agent": "CloverLauncher-relay (+https://clovergames.fr)", accept: "application/json" } });
  if (!upstream.ok) return new Response("Weather unavailable", { status: 502 });
  const now = (await upstream.json().catch(() => null))?.properties?.timeseries?.[0]?.data;
  const found = sky((now?.next_1_hours ?? now?.next_6_hours)?.summary?.symbol_code);
  if (!found) return new Response("Weather unavailable", { status: 502 });
  const celsius = Number(now?.instant?.details?.air_temperature ?? Number.NaN);

  const response = new Response(JSON.stringify({ schema: 1, ...found, temperature: Number.isFinite(celsius) ? Math.round(celsius) : null }), {
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${WEATHER_TTL}` },
  });
  if (cache) ctx?.waitUntil(cache.put(key, response.clone()));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/weather") {
      if (!isLauncher(request)) return new Response("Forbidden", { status: 403 });
      const ip = await env.LIMITER.limit({ key: request.headers.get("cf-connecting-ip") ?? "" });
      if (!ip.success) return new Response("Too many requests", { status: 429 });
      return weather(request, ctx);
    }
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
    const quota = env.QUOTA.get(env.QUOTA.idFromName("global"));
    if (!(await quota.fetch("https://quota/")).ok) return new Response("Too many requests", { status: 429 });

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

// Compteur unique pour le monde entier : la limitation intégrée de Cloudflare (LIMITER) compte par
// point de présence, un abus réparti sur plusieurs régions passerait sous un plafond global.
// shortcut: compteur en mémoire, remis à zéro si l'objet est déchargé ; suffisant pour un plafond.
export class Quota {
  window = 0;
  count = 0;

  fetch() {
    const window = Math.floor(Date.now() / WINDOW_MS);
    if (window !== this.window) {
      this.window = window;
      this.count = 0;
    }
    this.count++;
    return new Response(null, { status: this.count <= GLOBAL_LIMIT ? 204 : 429 });
  }
}
