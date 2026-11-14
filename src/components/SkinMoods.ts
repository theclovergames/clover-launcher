import { type PlayerObject, PlayerAnimation } from "skinview3d";

/**
 * Humeurs du personnage, selon le temps passé sans toucher au launcher (souris, clavier) :
 * en attente, puis impatient, puis endormi. Le moindre geste le réveille. Par-dessus,
 * des gestes : un bonjour quand le joueur le voit, une réaction selon l'endroit où il le frappe
 * (étourdi au troisième coup d'affilée), il se débat
 * quand il est attrapé, écarte les bras en l'air, se tasse en retombant et rentre à pied. Tant
 * qu'on se sert du launcher, et dès que le curseur passe près de lui, il le suit des yeux.
 */
export type Mood = "idle" | "impatient" | "tired";

const IMPATIENT_AFTER_MS = 25_000;
const TIRED_AFTER_MS = 90_000;
/** Passage d'une humeur à l'autre, en secondes. */
const BLEND = 0.9;

/** Durée de la réception, en secondes. */
const LAND_S = 0.7;
/** Coups rapprochés (moins de tant de secondes entre deux) : au troisième, il est étourdi. */
const COMBO_S = 2.5;
/** Passage à la pose « attrapé » et retour, en secondes. */
const GRAB_IN = 0.25;
const GRAB_OUT = 0.4;
/** Entrée et sortie de la marche ou de la pose en l'air, en secondes. */
const STANCE_BLEND = 0.15;
/** Élytres repliées (repos de skinview3d) et ouvertes pour planer, en radians ; ouverture en secondes. */
const WING_FOLDED = 0.2617994;
const WING_OPEN_X = 0.35;
const WING_OPEN_Z = Math.PI * 0.42;
const WING_BLEND = 0.25;

/** Angles pour regarder le curseur (rad), le lacet depuis le corps au repos ; `near` : curseur tout près de la tête. */
export type Gaze = () => { yaw: number; pitch: number; near: boolean } | null;
/** Lacet du cou au-delà duquel le corps pivote aussi, comme en jeu. */
const NECK = 0.9;

let lastActivity = performance.now();
/** Curseur dans la fenêtre, `null` quand il en sort. */
let cursor: { x: number; y: number } | null = null;
/** Compteur des retours sur la fenêtre (réduite, cachée, puis de nouveau visible). */
let shown = 0;
let listening = false;

/** Un seul suivi pour tous les aperçus : l'humeur survit au changement d'écran ou de skin. */
function listen() {
  if (listening) return;
  listening = true;
  const touch = () => {
    lastActivity = performance.now();
  };
  for (const type of ["pointermove", "pointerdown", "keydown", "wheel"]) window.addEventListener(type, touch, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") shown += 1;
  });
  window.addEventListener("pointermove", (event) => (cursor = { x: event.clientX, y: event.clientY }), { passive: true });
  document.documentElement.addEventListener("mouseleave", () => (cursor = null));
}

export const cursorPosition = () => cursor;

export function currentMood(now = performance.now()): Mood {
  const quiet = now - lastActivity;
  return quiet >= TIRED_AFTER_MS ? "tired" : quiet >= IMPATIENT_AFTER_MS ? "impatient" : "idle";
}

/** Tout ce que les humeurs font bouger ; les rotations sont en radians, les décalages en pixels de skin. */
type Pose = {
  headX: number;
  headY: number;
  headLift: number;
  bodyX: number;
  /** Torse élargi par la respiration (0 à 1). */
  breath: number;
  shoulders: number;
  leftArmX: number;
  leftArmZ: number;
  rightArmX: number;
  rightArmZ: number;
  leftLegX: number;
  rightLegX: number;
  sway: number;
  capeX: number;
};

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** 0, puis 1 entre `start` et `start + length` (montée et descente de `ease` s), à chaque `period`. */
function pulse(t: number, period: number, start: number, length: number, ease: number) {
  const local = (t % period) - start;
  if (local < 0 || local > length) return 0;
  return smooth(Math.min(local, length - local) / ease);
}

/** Respiration de 0 à 1 : inspiration sur 40 % de la période, expiration plus lente. */
function breathing(t: number, period: number) {
  const phase = (t % period) / period;
  return phase < 0.4 ? smooth(phase / 0.4) : 1 - smooth((phase - 0.4) / 0.6);
}

const ARM_REST = Math.PI * 0.02;
const CAPE_REST = Math.PI * 0.06;

/** Attente : bras et cape qui bougent à peine, respiration, un coup d'œil de chaque côté de temps en temps. */
function idle(t: number): Pose {
  const swing = Math.cos(t * 2) * 0.03;
  const breath = breathing(t, 3.9);
  return {
    headX: 0,
    headY: 0.35 * (pulse(t, 11, 4, 2.2, 0.5) - pulse(t, 11, 7.5, 1.8, 0.5)),
    headLift: 0.4 * breath,
    bodyX: 0,
    breath,
    shoulders: 0.3 * breath,
    leftArmX: 0,
    leftArmZ: ARM_REST + swing,
    rightArmX: 0,
    rightArmZ: -ARM_REST - swing,
    leftLegX: 0,
    rightLegX: 0,
    sway: 0,
    capeX: CAPE_REST + Math.sin(t * 2) * 0.01,
  };
}

/** Durée de chaque routine d'attente, en secondes. */
const WAIT_S = 8;

/**
 * Routines de l'impatience, l'une après l'autre : un geste par période de `WAIT_S`, posé sur une
 * attente qui respire vite. Chacun part de la pose de repos et y revient avant la fin de sa
 * période. `u` : temps dans la période ; `t` : temps total, pour les rythmes.
 */
const WAITS: ((u: number, t: number) => Partial<Pose>)[] = [
  // Consulte sa montre, puis soupire.
  (u) => {
    const watch = pulse(u, Infinity, 1.2, 2.6, 0.35);
    const sigh = pulse(u, Infinity, 4.2, 1.1, 0.4);
    return { headX: 0.42 * watch - 0.08 * sigh, headY: -0.35 * watch, rightArmX: -1.25 * watch, rightArmZ: -0.12 + 0.67 * watch, breath: sigh };
  },
  // Regarde autour de lui en tapant du pied ; tête de face aux deux bouts, pour enchaîner sans à-coup.
  (u, t) => ({ headY: 0.5 * Math.sin(u * 0.9) * pulse(u, Infinity, 0.3, 7.4, 0.6), rightLegX: -0.16 * pulse(u, Infinity, 0.8, 6, 0.2) * Math.max(0, Math.sin(t * Math.PI * 5.2)) }),
  // Croise les bras, tête un peu penchée, et tape du pied plus lentement.
  (u, t) => {
    const crossed = pulse(u, Infinity, 0.5, 6.6, 0.5);
    return {
      headX: 0.12 * crossed,
      headY: 0.15 * crossed,
      leftArmX: -1.0 * crossed,
      leftArmZ: 0.12 - 0.62 * crossed,
      rightArmX: -1.05 * crossed,
      rightArmZ: -0.12 + 0.6 * crossed,
      leftLegX: -0.12 * crossed * Math.max(0, Math.sin(t * Math.PI * 3)),
    };
  },
  // S'étire, les bras au-dessus de la tête, puis les laisse retomber.
  (u) => {
    const stretch = pulse(u, Infinity, 1.5, 3.2, 0.6);
    return { headX: -0.35 * stretch, bodyX: -0.06 * stretch, leftArmX: -2.9 * stretch, leftArmZ: 0.12 + 0.2 * stretch, rightArmX: -2.9 * stretch, rightArmZ: -0.12 - 0.2 * stretch, breath: stretch };
  },
  // Siffle en regardant le ciel, les mains dans le dos.
  (u, t) => {
    const sky = pulse(u, Infinity, 0.5, 6.8, 0.6);
    return { headX: -0.45 * sky + 0.05 * Math.sin(t * 6) * sky, headY: 0.3 * Math.sin(u * 0.7) * sky, leftArmX: 0.35 * sky, leftArmZ: 0.12 - 0.08 * sky, rightArmX: 0.35 * sky, rightArmZ: -0.12 + 0.08 * sky };
  },
  // Shoote dans un caillou, deux fois, en le suivant des yeux.
  (u) => {
    const look = pulse(u, Infinity, 0.6, 6.6, 0.5);
    const kick = pulse(u, Infinity, 1.6, 0.7, 0.2) + pulse(u, Infinity, 4.2, 0.7, 0.2);
    return { headX: 0.4 * look, headY: -0.15 * look, rightLegX: -0.55 * kick, leftArmX: 0.25 * kick, rightArmX: -0.2 * kick };
  },
];
/** Ordre des routines, sans la même deux fois de suite ; on y entre à un endroit tiré au hasard. */
const WAIT_ORDER = [0, 3, 1, 4, 2, 5, 0, 2, 4, 1, 5, 3];
const WAIT_START = Math.floor(Math.random() * WAIT_ORDER.length);

/** Impatient : respire plus vite, et enchaîne ses routines d'attente (`WAITS`). */
function impatient(t: number): Pose {
  const breath = breathing(t, 2.6);
  const cycle = Math.floor(t / WAIT_S);
  const base: Pose = {
    headX: 0,
    headY: 0,
    headLift: 0.4 * breath,
    bodyX: 0,
    breath,
    shoulders: 0.3 * breath,
    leftArmX: 0,
    leftArmZ: 0.12,
    rightArmX: 0,
    rightArmZ: -0.12,
    leftLegX: 0,
    rightLegX: 0,
    sway: 0,
    capeX: CAPE_REST + Math.sin(t * 3) * 0.015,
  };
  const gesture = WAITS[WAIT_ORDER[(WAIT_START + cycle) % WAIT_ORDER.length]](t - cycle * WAIT_S, t);
  // La respiration du geste (soupir, étirement) s'ajoute à celle de l'attente.
  return { ...mix(base, gesture, 1), breath: Math.max(breath, gesture.breath ?? 0) };
}

/**
 * Fatigué, il s'endort debout : tête tombée sur la poitrine, épaules basses, bras ballants,
 * respiration lente et profonde ; de temps en temps la tête pique un peu plus puis se rattrape.
 * Rien ne bouge les pieds (pas de `sway`, qui pivote au cou et les ferait glisser). Les « zzZ »
 * sont dessinés par l'aperçu (`onSleep`).
 */
function tired(t: number): Pose {
  const breath = breathing(t, 4.8);
  const local = t % 11;
  const nod = local >= 6 && local < 8.5 ? 0.15 * smooth((local - 6) / 2.5) : local >= 8.5 && local < 8.8 ? 0.15 * (1 - smooth((local - 8.5) / 0.3)) : 0;
  return {
    headX: 0.55 + nod + 0.04 * breath,
    headY: 0.08,
    headLift: 0.6 * breath - 0.4,
    bodyX: 0.08,
    breath: Math.min(1, breath * 1.3),
    shoulders: 0.5 * breath - 0.45,
    leftArmX: 0.04,
    leftArmZ: 0.03,
    rightArmX: 0.04,
    rightArmZ: -0.03,
    leftLegX: 0,
    rightLegX: 0,
    sway: 0,
    capeX: CAPE_REST,
  };
}

const POSES: Record<Mood, (t: number) => Pose> = { idle, impatient, tired };

function mix(from: Pose, to: Partial<Pose>, weight: number): Pose {
  const pose = { ...from };
  for (const key of Object.keys(to) as (keyof Pose)[]) pose[key] = from[key] + (to[key]! - from[key]) * weight;
  return pose;
}

/** Gestes d'accueil : à l'apparition, au retour du joueur, au réveil. */
type Greeting = "wave" | "nod" | "startle" | "stretch" | "rub";

/** Durée et pose de chaque geste d'accueil (`t` : secondes depuis son début). */
const GREETINGS: Record<Greeting, { duration: number; pose: (base: Pose, t: number) => Pose }> = {
  /** Bonjour : il lève le bras droit, salue trois fois de la main en penchant la tête, puis le baisse. */
  wave: {
    duration: 2.3,
    pose: (base, t) => {
      const raised = pulse(t, Infinity, 0, 2.3, 0.4);
      const hand = Math.sin(Math.max(0, t - 0.35) * 9) * smooth((t - 0.35) / 0.2) * (1 - smooth((t - 1.75) / 0.2));
      return mix(base, { rightArmX: -0.25, rightArmZ: -2.55 + 0.32 * hand, headX: -0.06, headY: 0.18, headLift: base.headLift + 0.3, leftArmZ: ARM_REST + 0.05 }, raised);
    },
  },
  /** « Ah, te revoilà » : deux petits hochements de tête, les épaules qui se lèvent. */
  nod: {
    duration: 1.2,
    pose: (base, t) => mix(base, { headX: 0.25 * Math.max(0, Math.sin(t * Math.PI * 2.5)), shoulders: base.shoulders + 0.3 }, pulse(t, Infinity, 0, 1.2, 0.2)),
  },
  /** Réveil en sursaut : bras jetés, tête rejetée, puis un coup d'œil de chaque côté. */
  startle: {
    duration: 1.9,
    pose: (base, t) => {
      const jolt = t < 0.1 ? smooth(t / 0.1) : 1 - smooth((t - 0.1) / 0.6);
      const jumped = mix(base, { headX: -0.45, headLift: base.headLift + 0.8, shoulders: 0.8, leftArmX: -0.4, leftArmZ: 1.2, rightArmX: -0.4, rightArmZ: -1.2 }, jolt);
      return mix(jumped, { headY: 0.5 * Math.sin((t - 0.5) * Math.PI * 1.4) }, pulse(t, Infinity, 0.5, 1.4, 0.2));
    },
  },
  /** Réveil qui s'étire : bras au-dessus de la tête, tête en arrière comme pour bâiller. */
  stretch: {
    duration: 2.6,
    pose: (base, t) =>
      mix(base, { headX: -0.4, bodyX: -0.06, breath: 1, shoulders: 0.5, leftArmX: -2.9, leftArmZ: 0.35, rightArmX: -2.9, rightArmZ: -0.35 }, pulse(t, Infinity, 0.1, 2.4, 0.6)),
  },
  /** Réveil difficile : il se frotte les yeux des deux mains, tête un peu baissée. */
  rub: {
    duration: 2.2,
    pose: (base, t) => {
      const rubbing = 0.1 * Math.sin(t * 14);
      return mix(base, { headX: 0.2, leftArmX: -2.0 + rubbing, leftArmZ: -0.35, rightArmX: -2.0 - rubbing, rightArmZ: 0.35 }, pulse(t, Infinity, 0.1, 2.0, 0.35));
    },
  },
};

/** Partie du modèle touchée par le coup ; bras et jambes du point de vue du personnage. */
export type HitZone = "head" | "body" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
type Reaction = "head" | "body" | "arm" | "leg" | "dizzy";

/**
 * Tressaillement au coup, commun à toutes les réactions : tête rejetée en arrière et détournée du
 * côté frappé, bras écartés. `side` : -1 à 1, du flanc gauche au flanc droit de l'écran.
 */
function flinch(base: Pose, t: number, side: number): Pose {
  const weight = t < 0.08 ? smooth(t / 0.08) : 1 - smooth((t - 0.08) / 0.45);
  return mix(base, { headX: -0.42, headY: 0.35 * side, bodyX: -0.12, shoulders: 0.45, leftArmX: -0.5, leftArmZ: 0.75, rightArmX: -0.5, rightArmZ: -0.75 }, weight);
}

/**
 * Réactions au coup, après le tressaillement ; `right` : le membre touché est son bras ou sa jambe
 * droite. Leurs jambes laissent la place aux pas du retour (`SkinViewer`), d'où les gestes de jambes
 * après 0,9 s. Durées en secondes.
 */
const REACTIONS: Record<Reaction, { duration: number; pose: (base: Pose, t: number, side: number, right: boolean) => Pose }> = {
  /** À la tête : il se la frotte en la baissant. */
  head: {
    duration: 1.9,
    pose: (base, t, side) =>
      mix(flinch(base, t, side), { headX: 0.22, headY: -0.12, rightArmX: -2.55, rightArmZ: 0.42 + 0.12 * Math.sin(t * 18), leftArmZ: ARM_REST + 0.08 }, pulse(t, Infinity, 0.45, 1.45, 0.3)),
  },
  /** Au ventre : il se plie en le tenant à deux mains, souffle, puis s'époussette le torse. */
  body: {
    duration: 1.9,
    pose: (base, t, side) => {
      const folded = mix(
        flinch(base, t, side),
        { headX: 0.5, headLift: base.headLift - 0.4, bodyX: 0.14, breath: 1, shoulders: -0.35, leftArmX: -0.7, leftArmZ: -0.32, rightArmX: -0.7, rightArmZ: 0.32 },
        pulse(t, Infinity, 0.3, 0.95, 0.25),
      );
      return mix(folded, { headX: 0.32, headY: -0.15, rightArmX: -0.95 + 0.22 * Math.sin(t * 16), rightArmZ: 0.55, leftArmZ: ARM_REST + 0.05 }, pulse(t, Infinity, 1.1, 0.8, 0.2));
    },
  },
  /**
   * Au bras : il le ramène devant lui et le frotte de l'autre main en le regardant, puis le secoue
   * le long du corps pour chasser la douleur.
   */
  arm: {
    duration: 1.9,
    pose: (base, t, side, right) => {
      const rub = 0.12 * Math.sin(t * 16);
      // Le bras touché plié devant lui, l'autre main qui passe devant le torse pour le frotter.
      const held: Partial<Pose> = right
        ? { rightArmX: -0.55, rightArmZ: 0.12, leftArmX: -0.85 + rub, leftArmZ: -0.55 }
        : { leftArmX: -0.55, leftArmZ: -0.12, rightArmX: -0.85 + rub, rightArmZ: 0.55 };
      const holding = mix(flinch(base, t, side), { ...held, headX: 0.35, headY: right ? -0.35 : 0.35 }, pulse(t, Infinity, 0.35, 1.0, 0.25));
      const shake = 0.18 * Math.sin(t * 22);
      return mix(holding, right ? { rightArmX: shake, rightArmZ: -0.15 } : { leftArmX: shake, leftArmZ: 0.15 }, pulse(t, Infinity, 1.3, 0.6, 0.12));
    },
  },
  /**
   * À la jambe : de retour à sa place, il la lève et la secoue, la main sur le genou, en équilibre
   * sur l'autre. Pas de `sway` : il pivote au cou, le pied d'appui glisserait.
   */
  leg: {
    duration: 2,
    pose: (base, t, side, right) => {
      const shake = Math.sin(t * 13);
      const balance = 0.55 + 0.1 * Math.sin(t * 7);
      // La main du même côté sur le genou, l'autre bras écarté pour l'équilibre.
      const lifted: Partial<Pose> = right
        ? { rightLegX: -0.8 + 0.12 * shake, leftLegX: 0.04, rightArmX: -0.6 - 0.1 * shake, rightArmZ: -0.05, leftArmX: 0, leftArmZ: balance }
        : { leftLegX: -0.8 + 0.12 * shake, rightLegX: 0.04, leftArmX: -0.6 - 0.1 * shake, leftArmZ: 0.05, rightArmX: 0, rightArmZ: -balance };
      return mix(flinch(base, t, side), { ...lifted, headX: 0.45, headY: right ? -0.3 : 0.3 }, pulse(t, Infinity, 0.9, 1.1, 0.2));
    },
  },
  /** Troisième coup d'affilée : étourdi, la tête qui tourne en rond, épaules tombantes, bras ballants. */
  dizzy: {
    duration: 3,
    pose: (base, t, side) => {
      const spin = t * 5.5;
      return mix(
        flinch(base, t, side),
        {
          headX: 0.2 + 0.18 * Math.sin(spin),
          headY: 0.32 * Math.cos(spin),
          headLift: base.headLift - 0.3,
          bodyX: 0.08,
          shoulders: -0.4,
          leftArmX: 0.2 * Math.sin(spin),
          leftArmZ: 0.3,
          rightArmX: -0.2 * Math.sin(spin),
          rightArmZ: -0.3,
        },
        pulse(t, Infinity, 0.3, 2.7, 0.4),
      );
    },
  },
};

/** Attrapé : bras et jambes qui gigotent, tête tournée vers le sol, souffle court, cape qui flotte. */
function held(t: number): Pose {
  const flail = Math.sin(t * 8.5);
  const kick = Math.sin(t * 10);
  return {
    headX: 0.38,
    headY: 0.3 * Math.sin(t * 2.7),
    headLift: 0.2,
    bodyX: 0,
    breath: breathing(t, 1.1),
    shoulders: 0.45,
    leftArmX: -0.5 + 0.55 * flail,
    leftArmZ: 0.55 + 0.2 * Math.sin(t * 6),
    rightArmX: -0.5 - 0.55 * flail,
    rightArmZ: -0.55 - 0.2 * Math.sin(t * 6 + 1),
    leftLegX: 0.5 * kick,
    rightLegX: -0.5 * kick,
    sway: 0,
    capeX: CAPE_REST + 0.35 + 0.08 * Math.sin(t * 5),
  };
}

/** En l'air (chute, saut) : bras écartés vers le haut, jambes décalées, cape soulevée. */
const AIR: Partial<Pose> = { headX: -0.1, leftArmX: -0.35, leftArmZ: 0.9, rightArmX: -0.35, rightArmZ: -0.9, leftLegX: -0.3, rightLegX: 0.25, capeX: CAPE_REST + 0.6 };

/** En vol (élytres) : bras le long du corps, un peu écartés, jambes serrées, regard devant lui. */
const GLIDE: Partial<Pose> = { headX: -0.15, leftArmX: 0.1, leftArmZ: 0.45, rightArmX: 0.1, rightArmZ: -0.45, leftLegX: 0.06, rightLegX: -0.06, sway: 0 };

/** Marche : `phase` en radians, donnée par l'aperçu pour que le pas suive le déplacement. */
function walking(phase: number): Partial<Pose> {
  const swing = Math.sin(phase);
  return {
    headX: 0.06,
    headY: 0,
    headLift: 0.3 * Math.abs(Math.cos(phase)),
    leftArmX: -0.6 * swing,
    leftArmZ: ARM_REST,
    rightArmX: 0.6 * swing,
    rightArmZ: -ARM_REST,
    leftLegX: 0.7 * swing,
    rightLegX: -0.7 * swing,
    sway: 0.03 * swing,
    capeX: CAPE_REST + 0.3,
  };
}

/** Réception : il se tasse, tête baissée et bras écartés, puis se redresse. */
function land(base: Pose, t: number): Pose {
  const weight = t < 0.08 ? smooth(t / 0.08) : 1 - smooth((t - 0.08) / (LAND_S - 0.08));
  return mix(
    base,
    { headX: 0.3, headLift: base.headLift - 0.9, bodyX: 0.12, shoulders: -0.5, leftArmX: -0.45, leftArmZ: 0.7, rightArmX: -0.45, rightArmZ: -0.7, leftLegX: -0.18, rightLegX: 0.18 },
    weight,
  );
}

export class MoodAnimation extends PlayerAnimation {
  private mood = currentMood();
  private previous: Mood = this.mood;
  private changedAt = -BLEND;
  private shown = shown;
  /** Geste d'accueil en cours et son début, `null` sans geste ; le dernier, pour varier. */
  private greeting: { kind: Greeting; at: number } | null;
  private lastGreeting: Greeting | null = null;
  private hitAt: number | null = null;
  private hitSide = 0;
  private reaction: Reaction = "head";
  private hitRight = false;
  /** Coups rapprochés à la suite, et le dernier. */
  private streak = 0;
  private lastHit = -Infinity;
  private heldAt: number | null = null;
  private releasedAt = -Infinity;
  private landedAt: number | null = null;
  private airborne = false;
  private air = 0;
  private gliding = false;
  private wings = 0;
  private walkPhase: number | null = null;
  private lastPhase = 0;
  private stride = 0;
  private gaze: Gaze | null = null;
  private gazeWeight = 0;
  private gazeYaw = 0;
  private gazePitch = 0;
  /** Pivot du corps quand le regard dépasse le cou. */
  private turn = 0;
  private sleepListener: ((asleep: boolean) => void) | null = null;

  /** `greet` : salue dès l'apparition (première ouverture de l'aperçu). */
  constructor({ greet }: { greet: boolean }) {
    super();
    listen();
    this.greeting = greet ? { kind: "wave", at: 0.25 } : null;
  }

  /** Un geste parmi `kinds`, autre que le précédent quand c'est possible. */
  private welcome(kinds: Greeting[], at: number) {
    const fresh = kinds.filter((kind) => kind !== this.lastGreeting);
    const pool = fresh.length > 0 ? fresh : kinds;
    const kind = pool[Math.floor(Math.random() * pool.length)];
    this.lastGreeting = kind;
    this.greeting = { kind, at };
  }

  /** Réaction au coup, selon l'endroit frappé ; interrompt le bonjour. */
  hit(side: number, zone: HitZone) {
    const now = this.progress;
    this.streak = now - this.lastHit < COMBO_S ? this.streak + 1 : 1;
    this.lastHit = now;
    this.reaction = this.streak >= 3 ? "dizzy" : zone === "head" || zone === "body" ? zone : zone.endsWith("Arm") ? "arm" : "leg";
    this.hitRight = zone.startsWith("right");
    if (this.reaction === "dizzy") this.streak = 0;
    this.hitAt = now;
    this.hitSide = Math.max(-1, Math.min(1, side));
    this.greeting = null;
  }

  /** Attrapé (`true`) ou lâché ; le geste en cours s'efface. */
  hold(held: boolean) {
    if (held) {
      this.heldAt = this.progress;
      this.greeting = null;
      this.hitAt = null;
    } else if (this.heldAt !== null) {
      this.heldAt = null;
      this.releasedAt = this.progress;
    }
  }

  land() {
    this.landedAt = this.progress;
  }

  /** En l'air (chute ou saut) ou de nouveau au sol. */
  setAirborne(airborne: boolean) {
    this.airborne = airborne;
  }

  /** Élytres ouvertes (vol) ou repliées. */
  glide(gliding: boolean) {
    this.gliding = gliding;
  }

  /** Prévient l'aperçu quand le personnage s'endort ou se réveille (les « zzZ » au-dessus de sa tête). */
  onSleep(listener: (asleep: boolean) => void) {
    this.sleepListener = listener;
    if (this.mood === "tired") listener(true);
  }

  /** Source du regard, donnée par l'aperçu qui sait où est la tête à l'écran. */
  follow(gaze: Gaze) {
    this.gaze = gaze;
  }

  /** Pas de la marche (`null` : à l'arrêt). */
  walk(phase: number | null) {
    this.walkPhase = phase;
    if (phase !== null) this.lastPhase = phase;
  }

  /**
   * Suit le curseur des yeux partout dans la fenêtre tant qu'on se sert du launcher ; impatient ou
   * fatigué, il retourne à ses gestes et ne le suit plus que s'il passe tout près.
   */
  private look(pose: Pose, delta: number): Pose {
    const target = this.gaze?.() ?? null;
    // Endormi, il ne suit plus rien, même tout près ; au réveil, il finit son geste avant.
    const waking = this.greeting !== null && this.greeting.kind !== "wave" && this.greeting.kind !== "nod";
    const watching = target !== null && !waking && (this.mood === "idle" || (target.near && this.mood !== "tired"));
    this.gazeWeight += ((watching ? 1 : 0) - this.gazeWeight) * Math.min(1, delta * 4);
    if (target) {
      // Fatigué, il suit plus mollement.
      const follow = Math.min(1, delta * (this.mood === "tired" ? 3 : 8));
      this.gazeYaw += (target.yaw - this.gazeYaw) * follow;
      this.gazePitch += (target.pitch - this.gazePitch) * follow;
    }
    const weight = this.gazeWeight > 0.001 ? smooth(this.gazeWeight) : 0;
    const neck = Math.max(-NECK, Math.min(NECK, this.gazeYaw));
    this.turn = (this.gazeYaw - neck) * weight;
    return weight ? mix(pose, { headX: this.gazePitch, headY: neck }, weight) : pose;
  }

  protected animate(player: PlayerObject, delta: number) {
    const t = this.progress;
    const mood = currentMood();
    if (mood !== this.mood) {
      // Le joueur revient : réveillé, il sursaute, s'étire ou se frotte les yeux (et parfois
      // salue) ; après une simple attente, il salue ou hoche la tête.
      if (mood === "idle" && this.hitAt === null) this.welcome(this.mood === "tired" ? ["startle", "stretch", "rub", "startle", "stretch", "rub", "wave"] : ["wave", "nod"], t);
      this.previous = this.mood;
      this.mood = mood;
      this.changedAt = t;
      if (mood === "tired" || this.previous === "tired") this.sleepListener?.(mood === "tired");
    }
    if (this.shown !== shown) {
      this.shown = shown;
      if (this.hitAt === null) this.welcome(["wave", "nod"], t);
    }
    const weight = smooth((t - this.changedAt) / BLEND);
    let pose = weight >= 1 ? POSES[this.mood](t) : mix(POSES[this.previous](t), POSES[this.mood](t), weight);
    if (this.greeting !== null) {
      const { duration, pose: gesture } = GREETINGS[this.greeting.kind];
      if (t - this.greeting.at >= duration) this.greeting = null;
      else if (t >= this.greeting.at) pose = gesture(pose, t - this.greeting.at);
    }
    pose = this.look(pose, delta);
    if (this.hitAt !== null) {
      const { duration, pose: react } = REACTIONS[this.reaction];
      if (t - this.hitAt >= duration) this.hitAt = null;
      else pose = react(pose, t - this.hitAt, this.hitSide, this.hitRight);
    }
    const grip = this.heldAt !== null ? smooth((t - this.heldAt) / GRAB_IN) : 1 - smooth((t - this.releasedAt) / GRAB_OUT);
    if (grip > 0) pose = mix(pose, held(t), grip);
    const ease = Math.min(1, delta / STANCE_BLEND);
    this.air += ((this.airborne ? 1 : 0) - this.air) * ease;
    this.stride += ((this.walkPhase !== null ? 1 : 0) - this.stride) * ease;
    if (this.air > 0.001) pose = mix(pose, AIR, smooth(this.air));
    this.wings += ((this.gliding ? 1 : 0) - this.wings) * Math.min(1, delta / WING_BLEND);
    if (this.wings > 0.001) pose = mix(pose, GLIDE, smooth(this.wings));
    if (this.stride > 0.001) {
      // Retour après un coup : les pas seulement, bras et tête restent à la réaction.
      const steps = walking(this.lastPhase);
      pose = mix(pose, this.hitAt === null ? steps : { leftLegX: steps.leftLegX, rightLegX: steps.rightLegX }, smooth(this.stride));
    }
    if (this.landedAt !== null) {
      if (t - this.landedAt >= LAND_S) this.landedAt = null;
      else pose = land(pose, t - this.landedAt);
    }

    const { skin, cape } = player;
    // Tout le personnage, cape comprise : son parent (`playerWrapper` de skinview3d), que rien d'autre ne tourne.
    if (player.parent) player.parent.rotation.y = this.turn;
    // Tourner puis incliner, comme un cou : l'inclinaison reste verticale quand la tête est tournée.
    skin.head.rotation.set(pose.headX, pose.headY, 0, "YXZ");
    skin.head.position.y = pose.headLift;
    skin.body.rotation.x = pose.bodyX;
    skin.body.scale.set(1 + 0.012 * pose.breath, 1, 1 + 0.06 * pose.breath);
    skin.leftArm.rotation.set(pose.leftArmX, 0, pose.leftArmZ);
    skin.rightArm.rotation.set(pose.rightArmX, 0, pose.rightArmZ);
    skin.leftArm.position.y = skin.rightArm.position.y = -2 + pose.shoulders;
    skin.leftLeg.rotation.x = pose.leftLegX;
    skin.rightLeg.rotation.x = pose.rightLegX;
    skin.rotation.z = pose.sway;
    cape.rotation.x = pose.capeX;
    // Élytres : repliées au repos, ouvertes en vol avec un léger frémissement.
    const open = smooth(this.wings);
    player.elytra.leftWing.rotation.x = WING_FOLDED + (WING_OPEN_X - WING_FOLDED) * open;
    player.elytra.leftWing.rotation.z = WING_FOLDED + (WING_OPEN_Z - WING_FOLDED + 0.05 * Math.sin(t * 14)) * open;
    player.elytra.updateRightWing();
  }
}
