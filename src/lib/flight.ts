import { CatmullRomCurve3, Vector3 } from "three";

import { fraction } from "./pixels.ts";

/** Un nombre au hasard entre `min` et `max`. */
export const between = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const chance = (odds: number) => Math.random() < odds;
const smoothstep = (p: number) => p * p * (3 - 2 * p);

export type Point = { x: number; y: number };

/** Courbe lisse (Catmull-Rom) par les points de passage, échantillonnée avec sa longueur pour avancer à vitesse constante. */
export function flightPath(waypoints: Point[], interpolation: "uniform" | "centripetal" = "uniform") {
  const points: Point[] = [];
  const curve = interpolation === "centripetal" ? new CatmullRomCurve3(waypoints.map(({ x, y }) => new Vector3(x, y, 0)), false, "centripetal") : null;
  for (let index = 0; index < waypoints.length - 1; index++) {
    const [a, b, c, d] = [waypoints[Math.max(0, index - 1)], waypoints[index], waypoints[index + 1], waypoints[Math.min(waypoints.length - 1, index + 2)]];
    for (let step = 0; step < 60; step++) {
      const t = step / 60;
      const blend = (p0: number, p1: number, p2: number, p3: number) =>
        0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
      if (curve) {
        const point = curve.getPoint((index + t) / (waypoints.length - 1));
        points.push({ x: point.x, y: point.y });
      } else points.push({ x: blend(a.x, b.x, c.x, d.x), y: blend(a.y, b.y, c.y, d.y) });
    }
  }
  points.push(waypoints[waypoints.length - 1]);
  const lengths = points.reduce<number[]>((sum, point, index) => [...sum, index ? sum[index - 1] + Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) : 0], []);
  /** Position et direction (radians) à la distance `at` du départ ; avant le départ et après l'arrivée, la courbe se prolonge tout droit. */
  const at = (distance: number) => {
    const total = lengths[lengths.length - 1];
    const clamped = Math.max(0, Math.min(total, distance));
    let index = 1;
    while (index < lengths.length - 1 && lengths[index] < clamped) index++;
    const [from, to] = [points[index - 1], points[index]];
    const span = lengths[index] - lengths[index - 1] || 1;
    const t = (clamped - lengths[index - 1]) / span;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const beyond = distance - clamped;
    return { x: from.x + (to.x - from.x) * t + Math.cos(angle) * beyond, y: from.y + (to.y - from.y) * t + Math.sin(angle) * beyond, angle };
  };
  return { at, total: lengths[lengths.length - 1], points, lengths };
}

/** Petits vols libres : des détours tirés une fois, puis une sortie, sans boucle périodique. */
export function ambientFlight(width: number, height: number, fromLeft: boolean, phase: number, kind: "bat" | "allay") {
  const gentle = kind === "allay";
  const sample = (index: number) => fraction(Math.sin(phase * 12.9898 + index * 78.233) * 43758.5453);
  const x = (value: number) => fromLeft ? value : width - value;
  const radius = Math.min(width * 0.16, height * (gentle ? 0.11 : 0.14));
  const center = { x: width * (0.35 + sample(1) * 0.22), y: height * (0.28 + sample(0) * 0.04) };
  const vertical = sample(2) > 0.5 ? 1 : -1;
  const arc = Array.from({ length: 5 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 4;
    const spread = index === 0 || index === 4 ? 1 : 1 + (sample(index + 4) - 0.5) * 0.1;
    return { x: x(center.x + Math.cos(angle) * radius * spread), y: center.y + Math.sin(angle) * radius * vertical * spread };
  });
  const upper = center.y - radius * vertical;
  const lower = center.y + radius * vertical;
  // Les voisins proches du tournant gardent une tangente douce malgré l'entrée et la sortie lointaines.
  const path = flightPath([
    { x: x(-90), y: upper + (sample(3) - 0.5) * radius * 0.4 },
    { x: x(center.x - radius * 2), y: upper },
    ...arc,
    { x: x(center.x - radius * 2), y: lower },
    { x: x(-90), y: lower + (sample(4) - 0.5) * radius * 0.4 },
  ], "centripetal");
  let direction = fromLeft ? 1 : -1;
  const steps = Math.max(160, Math.ceil(path.total / 3));
  const poses = Array.from({ length: steps + 1 }, (_, index) => {
    const offset = index / steps;
    const spot = path.at(path.total * offset);
    const horizontal = Math.cos(spot.angle);
    // Près d'un virage vertical, garder le profil jusqu'à ce que le nouveau cap soit établi.
    if (Math.abs(horizontal) > 0.18) direction = Math.sign(horizontal);
    const tilt = Math.sin(spot.angle) * horizontal * (gentle ? 16 : 36);
    return { offset, x: spot.x, y: spot.y, tilt, direction };
  });
  return {
    motion: poses.map(({ offset, x, y, tilt }) => ({ offset, transform: `translate(${x}px, ${y}px) rotate(${tilt}deg)` })),
    facing: poses.map(({ offset, direction }) => ({ offset, transform: `scaleX(${direction})`, easing: "steps(1, end)" })),
  };
}

/** Où en est un joueur en élytres, en pixels du ciel (`y` vers le bas). */
export type Glide = {
  /** 1 de gauche à droite, -1 de droite à gauche. */
  dir: 1 | -1;
  x: number;
  y: number;
  /** Assiette : 0 à l'horizontale, positive nez vers le bas ; un looping fait un tour complet. */
  pitch: number;
  /** Distance : 1 tout près, 0,35 au loin. */
  scale: number;
  /** Positif quand il vient vers nous, négatif quand il s'éloigne : il se tourne et se penche d'autant. */
  turn: number;
  /** Tonneau en cours : rotation sur lui-même, autour de l'axe du vol (rad). */
  roll: number;
  /** Ailes ouvertes (1) ou repliées (0), comme en jeu quand il pique à la verticale. */
  spread: number;
  /** Fusée d'artifice allumée : il accélère et laisse une traînée d'étincelles. */
  boosting: boolean;
};

/** Durées d'un looping, d'un tonneau et de la poussée d'une fusée, en secondes. */
const LOOP = 2.2;
const ROLL = 1.1;
const BOOST = 1;

/** Endroit d'une figure, en part de la largeur du ciel : avant ou après le personnage, qui cacherait le milieu. */
const aside = (before: [number, number], after: [number, number]) => (chance(0.5) ? between(...before) : between(...after));

/**
 * Tirage d'un passage : sens, houles, vitesse, distance, entrée et figures. Chaque passage a son
 * caractère : calme ou agité, entrée en piqué, looping, tonneau, fusée d'artifice. Partagé par un
 * groupe, chacun refait le même vol, décalé.
 */
export function planFlight(height: number) {
  const swoop = chance(0.3);
  return {
    dir: chance(0.5) ? (1 as const) : (-1 as const),
    // Quatre houles lentes, chacune à son rythme : deux pour l'assiette, deux pour la distance.
    waves: Array.from({ length: 4 }, (_, index) => ({ rate: between(0.35, 0.7) * (index % 2 ? 2 : 1), phase: between(0, 2 * Math.PI) })),
    swing: between(0.35, 0.85),
    cruise: between(185, 265),
    // Au loin, tout petit, ou de passage tout près.
    depth: between(0.45, 0.82),
    // Figures (2 = aucune), là où on les voit.
    loop: chance(0.4) ? aside([0.07, 0.11], [0.84, 0.87]) : 2,
    roll: chance(0.4) ? aside([0.08, 0.24], [0.74, 0.88]) : 2,
    boost: chance(0.4) ? between(0.02, 0.6) : 2,
    // Entrée en piqué, de haut, ou à mi-hauteur.
    y: height * (swoop ? between(0.02, 0.08) : between(0.12, 0.38)),
    pitch: swoop ? between(0.5, 0.8) : between(-0.1, 0.25),
  };
}
export type FlightPlan = ReturnType<typeof planFlight>;

/**
 * Un passage d'un bord à l'autre du ciel, au vol plané du jeu : il ondule, pique en prenant de la
 * vitesse, remonte en la perdant, s'approche puis s'éloigne, avec les figures de son tirage. Rendu
 * à chaque image avec le temps écoulé (en secondes), `null` une fois sorti par l'autre bord, à
 * `margin` pixels. Dans un groupe, `lag` : retard sur le premier, en pixels ; chacun refait alors
 * ses figures en même temps que lui, et le groupe garde sa formation sans que personne se touche.
 */
export function glideAcross(width: number, height: number, margin: number, plan = planFlight(height), lag = 0) {
  const { dir, cruise, depth, swing } = plan;
  const [a, b, c, d] = plan.waves;
  const wave = ({ rate, phase }: typeof a, time: number) => Math.sin(rate * time + phase);
  const slope = ({ rate, phase }: typeof a, time: number) => rate * Math.cos(rate * time + phase);
  let { loop: loopAt, roll: rollAt, boost: boostAt } = plan;
  let looped = -1;
  let rolled = -1;
  let boosted = -1;
  let speed = cruise;
  let time = 0;
  const glide: Glide = { dir, x: dir > 0 ? -margin - lag : width + margin + lag, y: plan.y, pitch: plan.pitch, scale: depth, turn: 0, roll: 0, spread: 1, boosting: false };

  return (dt: number): Glide | null => {
    time += dt;
    const ahead = dir > 0 ? glide.x : width - glide.x;
    if (ahead >= width + margin || time > 60 || glide.y < -margin || glide.y > height + margin) return null;
    // Figures au signal du premier du groupe.
    const across = (ahead + lag) / width;

    // Looping dans sa zone, dès qu'il n'est ni trop haut (il sortirait du ciel) ni en plein piqué ; sinon, rien.
    if (looped < 0 && across >= loopAt) {
      if (across > loopAt + 0.05) loopAt = 2;
      else if (glide.y > height * 0.32 && Math.abs(glide.pitch) < 0.35) {
        looped = 0;
        loopAt = 2;
        // Vitesse fixe le temps du tour : un cercle net, assez petit pour rester à l'écart du personnage.
        speed = cruise;
      }
    }
    if (looped >= 0) {
      const turn = ((2 * Math.PI) / LOOP) * dt;
      glide.pitch -= turn;
      looped += turn;
      if (looped >= 2 * Math.PI) {
        glide.pitch += 2 * Math.PI;
        looped = -1;
      }
    } else {
      // Ondulations, rappel vers le milieu du ciel quand il descend ou monte trop, et franc retour près des
      // collines comme près du haut du ciel.
      const target =
        swing * wave(a, time) +
        0.22 * wave(b, time) -
        0.7 * clamp((glide.y - height * 0.32) / (height * 0.26), -1, 1) -
        0.9 * clamp((glide.y - height * 0.55) / (height * 0.12), 0, 1) +
        0.9 * clamp((height * 0.12 - glide.y) / (height * 0.12), 0, 1);
      glide.pitch += (target - glide.pitch) * (1 - Math.exp(-1.6 * dt));
    }

    // Tonneau : un tour complet sur lui-même, qui démarre et finit en douceur.
    if (rolled < 0 && looped < 0 && across >= rollAt) {
      rolled = across > rollAt + 0.06 ? -1 : 0;
      rollAt = 2;
    }
    if (rolled >= 0) {
      rolled += dt / ROLL;
      glide.roll = rolled >= 1 ? 0 : 2 * Math.PI * smoothstep(rolled);
      if (rolled >= 1) rolled = -1;
    }

    // Fusée d'artifice : une poussée d'une seconde, puis l'élan retombe. Pas en haut du ciel ni en
    // pleine montée, où elle le ferait sortir.
    if (boosted < 0 && across >= boostAt && glide.y > height * 0.3 && glide.pitch > -0.3) {
      boosted = 0;
      boostAt = 2;
    }
    glide.boosting = boosted >= 0 && boosted < BOOST;
    if (glide.boosting) boosted += dt;

    // Comme en jeu : le piqué accélère, la remontée freine, puis l'élan revient à sa vitesse de croisière.
    const thrust = glide.boosting ? 420 : 0;
    if (looped < 0) speed = clamp(speed + (thrust + 180 * Math.sin(glide.pitch) - 0.7 * (speed - cruise)) * dt, 95, 520);
    glide.scale = clamp(depth + 0.2 * wave(c, time) + 0.07 * wave(d, time), 0.35, 1);
    const towards = clamp(4 * (0.2 * slope(c, time) + 0.07 * slope(d, time)), -0.6, 0.6);
    glide.turn += (towards - glide.turn) * (1 - Math.exp(-3 * dt));
    // Plus il est loin, plus il traverse l'écran lentement.
    glide.x += dir * speed * Math.cos(glide.pitch) * glide.scale * dt;
    glide.y += speed * Math.sin(glide.pitch) * glide.scale * dt;
    const spread = 1 - Math.max(0, Math.sin(glide.pitch)) ** 1.5;
    glide.spread += (spread - glide.spread) * (1 - Math.exp(-5 * dt));
    return glide;
  };
}
