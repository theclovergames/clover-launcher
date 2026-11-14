/**
 * Choix d'apparence : couleur principale (boutons, sélections, barres) et décor de l'accueil, dont
 * les ciels reprennent les teintes du bandeau du site (`siteweb/src/components/layout/PageHero.tsx`).
 */

export const ACCENTS = {
  emerald: { label: "Émeraude", color: "#52a96c" },
  diamond: { label: "Diamant", color: "#4cc3cf" },
  lapis: { label: "Lapis", color: "#6b8ff0" },
  amethyst: { label: "Améthyste", color: "#a68ae6" },
  cherry: { label: "Cerisier", color: "#e88fbd" },
  copper: { label: "Cuivre", color: "#e0894f" },
} as const;

export type Accent = keyof typeof ACCENTS;

/**
 * Décors de l'accueil. `bg` et `glow` : palette du ciel, reprise des teintes du bandeau du site.
 * `world` : `overworld` suit l'heure, la météo et la température ; le Nether et l'End ont leur propre
 * ciel, sans soleil ni météo, comme en jeu. Le paysage et ses mobs sont dessinés par `SkyScenes`.
 */
export const SCENES = {
  forest: { label: "Forêt", world: "overworld", bg: "from-[#1d5a35] via-[#2f7d4c] to-[#16452b]", glow: "bg-[#9be38f]/15" },
  village: { label: "Village", world: "overworld", bg: "from-[#113552] via-[#1d5a80] to-[#0d2a42]", glow: "bg-[#8fd3f5]/15" },
  desert: { label: "Désert", world: "overworld", bg: "from-[#5e3f0f] via-[#9a6a1c] to-[#4a310b]", glow: "bg-[#f5d27a]/20" },
  nether: { label: "Nether", world: "nether", bg: "from-[#551818] via-[#853025] to-[#3f1212]", glow: "bg-[#f59a7a]/15" },
  end: { label: "End", world: "end", bg: "from-[#1c1638] via-[#302760] to-[#130f28]", glow: "bg-[#9d8cf0]/15" },
} as const;

export type Scene = keyof typeof SCENES;

const unit = (value: number) => Math.min(1, Math.max(0, value));
const RAD = Math.PI / 180;
/** Latitude de Paris : celle du ciel de l'accueil, sans demander la position de l'ordinateur. */
const LATITUDE = 48.85;

/**
 * Lever et coucher du soleil du jour de `date`, en heures locales de l'ordinateur, à quelques
 * minutes près (déclinaison et équation du temps). Longitude de Paris pour la France et ses
 * voisins francophones, sinon le milieu du fuseau horaire de l'ordinateur.
 */
export function sunTimes(date: Date) {
  const day = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const declination = -23.44 * RAD * Math.cos((2 * Math.PI * (day + 10)) / 365);
  // Soleil à 0,83° sous l'horizon : réfraction et demi-disque.
  const cosHour = (Math.sin(-0.83 * RAD) - Math.sin(LATITUDE * RAD) * Math.sin(declination)) / (Math.cos(LATITUDE * RAD) * Math.cos(declination));
  const half = Math.acos(unit((cosHour + 1) / 2) * 2 - 1) / RAD / 15;
  const b = (2 * Math.PI * (day - 81)) / 364;
  const equation = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const standard = Math.max(new Date(date.getFullYear(), 0, 1).getTimezoneOffset(), new Date(date.getFullYear(), 6, 1).getTimezoneOffset());
  const longitude = /^Europe\/(Paris|Brussels|Luxembourg|Monaco|Zurich)$/.test(zone) ? 2.35 : -standard / 4;
  const noon = 12 - date.getTimezoneOffset() / 60 - longitude / 15 - equation / 60;
  return { sunrise: noon - half, sunset: noon + half };
}

/**
 * Ciel de l'accueil à l'heure de l'ordinateur. Le soleil le jour, la lune la nuit, chacun sur un
 * arc d'un bord à l'autre (`x`, `y` en % du ciel, bas de l'arc derrière les collines), du lever au
 * coucher du jour ; `night` (0 à 1) assombrit le ciel et allume les étoiles, au crépuscule d'abord ;
 * `dusk` (0 à 1) dore l'aube et le couchant, du côté où le soleil se lève ou se couche (`duskX`, en %).
 */
export function skyAt(date: Date) {
  const hours = date.getHours() + date.getMinutes() / 60;
  const { sunrise, sunset } = sunTimes(date);
  const day = hours >= sunrise && hours < sunset;
  const progress = ((((hours - (day ? sunrise : sunset)) % 24) + 24) % 24) / (day ? sunset - sunrise : 24 - sunset + sunrise);
  const light = unit((hours - sunrise + 0.75) / 1.25) * unit((sunset + 0.75 - hours) / 1.25);
  const glow = (at: number) => unit(1 - Math.abs(hours - at) / 1.25);
  return { body: day ? ("sun" as const) : ("moon" as const), x: 8 + 84 * progress, y: 72 - 64 * Math.sin(Math.PI * progress), night: 1 - light, dusk: Math.max(glow(sunrise), glow(sunset)), duskX: hours < (sunrise + sunset) / 2 ? 8 : 92 };
}

/** Lunaison moyenne, en jours, et une nouvelle lune connue (6 janvier 2000, 18 h 14 UTC). */
const SYNODIC = 29.530588853;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

/**
 * Phase de la lune à `date`, en huit étapes comme dans Minecraft : `lit` colonnes éclairées sur 8
 * (0 à la nouvelle lune, 8 à la pleine lune), du côté `side` (à droite quand elle croît, vue de
 * l'hémisphère nord).
 */
export function moonPhase(date: Date) {
  const age = ((((date.getTime() - NEW_MOON) / 86_400_000 / SYNODIC) % 1) + 1) % 1;
  const step = Math.round(age * 8) % 8;
  return { lit: 2 * (4 - Math.abs(4 - step)), side: step < 4 ? ("right" as const) : ("left" as const) };
}

/** Animations réduites, par le système ou par le réglage du launcher (classe posée par `App`). */
export const reducedMotion = () => document.documentElement.classList.contains("reduce-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Valeur enregistrée inconnue (réglage d'une version plus récente) : celle par défaut. */
/** Teintes du ciel des versions précédentes, chacune vers le décor le plus proche. */
const LEGACY_TONES: Record<string, Scene> = { ocean: "village", iron: "village", gold: "desert", amethyst: "end", obsidian: "end", cherry: "forest" };
const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);
export const sceneOf = (value = ""): Scene => (own(SCENES, value) ? (value as Scene) : own(LEGACY_TONES, value) ? LEGACY_TONES[value] : "forest");
export const accent = (value: string | undefined): Accent => (value && value in ACCENTS ? (value as Accent) : "emerald");
