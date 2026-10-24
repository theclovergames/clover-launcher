import { type CSSProperties, useEffect, useRef, useState } from "react";
import { type PlayerObject, SkinViewer as Viewer } from "skinview3d";
import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry } from "three";

import { api } from "@/lib/api";
import {
  SCENES,
  type Scene,
  moonPhase,
  reducedMotion,
  skyAt,
} from "@/lib/appearance";
import {
  EndScene,
  Landscape,
  NetherScene,
  SCENE_LIFE,
} from "@/components/SkyScenes";
import {
  between,
  ambientFlight,
  type FlightPlan,
  type Glide,
  glideAcross,
  planFlight,
} from "@/lib/flight";
import { cells, fraction } from "@/lib/pixels";
import { cn } from "@/lib/utils";
import type { PlayerLook, Weather } from "@/types";

/** Nuages du jeu, en blocs : `X` le dessus blanc, `B` le dessous plus sombre. */
const CLOUDS = {
  small: ["...XXXX.....", ".XXXXXXXXXX.", "XXXXXXXXXXXX", "BBBBBBBBBBBB"],
  medium: [
    "....XXXXX.......",
    "..XXXXXXXXXX.XX.",
    "XXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXX",
    ".BBBBBBBBBBBBBB.",
  ],
  large: [
    "......XXXX..........",
    "..XXXXXXXXXX...XXX..",
    "XXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXX",
    "..BBBBBBBBBBBBBBBB..",
  ],
} as const;

/**
 * Plan lointain, petit et pâle, puis plan proche, plus gros et plus rapide. `x` : place du nuage
 * quand les animations sont réduites ; le délai négatif répartit les nuages dès l'ouverture.
 * `level` : nuages présents par beau temps (1), temps nuageux (2) ou ciel couvert (3), voir `SKIES`.
 */
const DRIFTS: {
  shape: keyof typeof CLOUDS;
  unit: number;
  top: string;
  seconds: number;
  delay: number;
  opacity: number;
  x: string;
  level: 1 | 2 | 3;
}[] = [
  {
    shape: "medium",
    unit: 4,
    top: "9%",
    seconds: 190,
    delay: -40,
    opacity: 0.45,
    x: "12%",
    level: 1,
  },
  {
    shape: "small",
    unit: 4,
    top: "21%",
    seconds: 230,
    delay: -150,
    opacity: 0.4,
    x: "64%",
    level: 1,
  },
  {
    shape: "large",
    unit: 4,
    top: "4%",
    seconds: 260,
    delay: -95,
    opacity: 0.35,
    x: "40%",
    level: 2,
  },
  {
    shape: "large",
    unit: 7,
    top: "15%",
    seconds: 120,
    delay: -30,
    opacity: 0.75,
    x: "6%",
    level: 2,
  },
  {
    shape: "medium",
    unit: 7,
    top: "31%",
    seconds: 140,
    delay: -95,
    opacity: 0.7,
    x: "72%",
    level: 1,
  },
  {
    shape: "small",
    unit: 7,
    top: "43%",
    seconds: 110,
    delay: -62,
    opacity: 0.65,
    x: "38%",
    level: 2,
  },
  // Ciel couvert : des nuages de plus, jusqu'au bas du ciel.
  {
    shape: "large",
    unit: 4,
    top: "13%",
    seconds: 210,
    delay: -10,
    opacity: 0.4,
    x: "28%",
    level: 3,
  },
  {
    shape: "large",
    unit: 7,
    top: "2%",
    seconds: 150,
    delay: -70,
    opacity: 0.8,
    x: "52%",
    level: 3,
  },
  {
    shape: "large",
    unit: 5,
    top: "24%",
    seconds: 170,
    delay: -120,
    opacity: 0.6,
    x: "84%",
    level: 3,
  },
  {
    shape: "medium",
    unit: 7,
    top: "52%",
    seconds: 130,
    delay: -20,
    opacity: 0.6,
    x: "18%",
    level: 3,
  },
];

function Cloud({
  shape,
  unit,
  opacity,
}: {
  shape: keyof typeof CLOUDS;
  unit: number;
  opacity: number;
}) {
  const rows = CLOUDS[shape];
  return (
    <svg
      width={rows[0].length * unit}
      height={rows.length * unit}
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      shapeRendering="crispEdges"
      style={{ opacity }}
    >
      <path d={cells(rows, "X")} fill="#f1f4ed" />
      <path d={cells(rows, "X")} fill="#d8e2de" transform="translate(0 1)" />
      <path d={cells(rows, "B")} fill="#afc1c0" />
    </svg>
  );
}

/** Élytres d'un joueur sans cape, peintes ici sur le patron des capes (64 × 32) : membrane grise et nervures. */
let plainElytra: HTMLCanvasElement | null = null;
function elytraTexture() {
  if (plainElytra) return plainElytra;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 32;
  const paint = canvas.getContext("2d");
  if (paint) {
    paint.fillStyle = "#8d8da6";
    paint.fillRect(22, 0, 24, 22);
    paint.fillStyle = "#6c6c86";
    for (let y = 5; y < 22; y += 4) paint.fillRect(24, y, 10, 1);
    paint.fillRect(24, 2, 1, 20);
    paint.fillStyle = "#b3b3cb";
    paint.fillRect(24, 2, 10, 1);
  }
  return (plainElytra = canvas);
}

/** Skin et cape de chaque joueur déjà vu, pour ne pas redemander Mojang à chaque passage. */
const looks = new Map<string, Promise<PlayerLook | null>>();
const lookOf = (name: string) => {
  // Sans réponse de Mojang (ou hors du launcher, sur la planche), le skin de minotar suffit.
  if (!looks.has(name))
    looks.set(
      name,
      Promise.resolve()
        .then(() => api.playerLook(name))
        .catch(() => null),
    );
  return looks.get(name)!;
};

/** Taille du rendu ; la distance se joue ensuite à l'échelle CSS. */
const GLIDER = { width: 220, height: 150 };

/** Geste d'un joueur pendant son passage : saluer, nous regarder, frapper devant lui, battre des jambes. */
type Gesture = "wave" | "look" | "punch" | "kick";
const GESTURES: (Gesture | null)[] = ["wave", "look", "punch", "kick", null];
/** Durée d'un geste, en secondes. */
const GESTURE = 1.8;

/**
 * Allure propre à chaque joueur : bras le long du corps ou grands ouverts, son rythme, et un geste
 * à un moment tiré au hasard (ou aucun).
 */
type Style = {
  arms: number;
  tempo: number;
  phase: number;
  gesture: Gesture | null;
  gestureAt: number;
};
const pick = <T,>(items: readonly T[]) =>
  items[Math.floor(Math.random() * items.length)];
const randomStyle = (): Style => ({
  arms: pick([0.12, 0.45, 0.8, 1.2]),
  tempo: between(0.7, 1.5),
  phase: between(0, 2 * Math.PI),
  gesture: pick(GESTURES),
  gestureAt: between(1.5, 6),
});

/**
 * Pose du vol plané du jeu, à l'allure du joueur : allongé, la tête relevée qui regarde autour,
 * bras et jambes qui flottent, ailes repliées dans les piqués, la fusée tendue devant lui quand
 * elle pousse, et son geste. `elapsed` : secondes depuis le départ.
 */
function pose(
  player: PlayerObject,
  glide: Glide,
  time: number,
  style: Style,
  elapsed: number,
) {
  const t = time * style.tempo + style.phase;
  player.rotation.x = Math.PI / 2;
  // Penché dans le virage quand il vient vers nous ou s'éloigne, et le tour complet d'un tonneau.
  player.rotation.y = glide.dir * (glide.turn * 0.9 + glide.roll);
  const { head, leftArm, rightArm, leftLeg, rightLeg } = player.skin;
  head.rotation.x = -Math.PI / 4 + 0.1 * Math.sin(t * 0.5);
  head.rotation.y = 0.3 * Math.sin(t * 0.6);
  leftArm.rotation.set(0, 0, style.arms + 0.07 * Math.sin(t * 1.4));
  rightArm.rotation.set(0, 0, -style.arms - 0.07 * Math.sin(t * 1.4 + 1));
  leftLeg.rotation.x = 0.09 * Math.sin(t * 2.1);
  rightLeg.rotation.x = -leftLeg.rotation.x;

  // Le bras côté écran, celui qu'on voit faire. Bras pendant le long du corps : rotation.x = π/2 le
  // lève vers le ciel, -π le tend devant la tête.
  const near = glide.dir > 0 ? rightArm : leftArm;
  if (glide.boosting) near.rotation.set(-2.7, 0, 0);
  const progress = (elapsed - style.gestureAt) / GESTURE;
  const on = progress > 0 && progress < 1 ? Math.sin(Math.PI * progress) : 0;
  if (on > 0 && !glide.boosting) {
    if (style.gesture === "wave")
      near.rotation.set(
        on * (1.9 + 0.35 * Math.sin(time * 14)),
        0,
        near.rotation.z * (1 - on),
      );
    if (style.gesture === "punch")
      near.rotation.set(
        -on * (2.2 + 0.9 * Math.abs(Math.sin(time * 10))),
        0,
        near.rotation.z * (1 - on),
      );
  }
  if (style.gesture === "look")
    head.rotation.y += on * (-glide.dir * 1.1 - head.rotation.y);
  if (style.gesture === "kick") {
    leftLeg.rotation.x += on * 0.6 * Math.sin(time * 16);
    rightLeg.rotation.x = -leftLeg.rotation.x;
  }

  // Mêmes angles que le modèle du jeu, d'ailes repliées (0,26) à grandes ouvertes ; ouvertes, le
  // vent les fait frémir.
  const wing = player.elytra.leftWing.rotation;
  wing.x = 0.2618 + glide.spread * (0.3491 - 0.2618);
  wing.z =
    0.2618 +
    glide.spread * (Math.PI / 2 - 0.2618) +
    0.035 * glide.spread * Math.sin(time * 23 + style.phase);
  player.elytra.updateRightWing();
}

/**
 * Fusée d'artifice tenue en main pendant le boost, en pixels (8 × 16) : la mèche dans la main, le
 * tube rouge rayé de blanc, puis la pointe de papier.
 */
let rocketCanvas: HTMLCanvasElement | null = null;
function rocketTexture() {
  if (!rocketCanvas) {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 16;
    const paint = canvas.getContext("2d")!;
    const rows: [string, number, number][] = [
      ["#5b5b5b", 3, 2],
      ["#5b5b5b", 3, 2],
      ["#7a1c16", 1, 6],
      ["#c8382c", 1, 6],
      ["#f2f2f2", 1, 6],
      ["#c8382c", 1, 6],
      ["#c8382c", 1, 6],
      ["#f2f2f2", 1, 6],
      ["#c8382c", 1, 6],
      ["#c8382c", 1, 6],
      ["#f2f2f2", 1, 6],
      ["#7a1c16", 1, 6],
      ["#e8e1c9", 1, 6],
      ["#e8e1c9", 2, 4],
      ["#d8cfb2", 3, 2],
      ["#d8cfb2", 3, 2],
    ];
    rows.forEach(([color, x, width], y) => {
      paint.fillStyle = color;
      paint.fillRect(x, y, width, 1);
    });
    // Bords sombres du tube, pour le volume.
    paint.fillStyle = "rgb(0 0 0 / 0.28)";
    paint.fillRect(1, 2, 1, 10);
    paint.fillRect(6, 2, 1, 10);
    rocketCanvas = canvas;
  }
  const texture = new CanvasTexture(rocketCanvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  return texture;
}

/**
 * La fusée dans la main du bras (repère du bras de skinview3d : main en y = -10, `side` vers
 * l'extérieur) : elle prolonge le bras tendu, à plat face à la caméra qui voit le joueur de côté.
 */
function rocketMesh(side: number) {
  const mesh = new Mesh(
    new PlaneGeometry(3, 6),
    new MeshBasicMaterial({ map: rocketTexture(), transparent: true, side: DoubleSide }),
  );
  // Taille d'un objet tenu en main, comme en jeu : la mèche dans le poing, le tube qui dépasse.
  mesh.position.set(side, -11.5, 0);
  mesh.rotation.y = Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

/** Filet de vent qui file le long d'un joueur en vol, en sens inverse de sa course, puis s'efface. */
function gust(sky: HTMLElement, x: number, y: number, dir: number, scale: number) {
  const line = document.createElement("div");
  const length = between(26, 64) * scale;
  line.className = "pointer-events-none absolute top-0 left-0 h-px bg-white";
  line.style.width = `${length}px`;
  sky.append(line);
  const top = y + between(-34, 34) * scale;
  const start = x + dir * between(0, 70) * scale - length / 2;
  const end = start - dir * between(80, 150) * scale;
  line.animate(
    [
      { transform: `translate(${start}px, ${top}px)`, opacity: 0 },
      { opacity: between(0.22, 0.42), offset: 0.3 },
      { transform: `translate(${end}px, ${top}px)`, opacity: 0 },
    ],
    { duration: between(450, 800), easing: "linear" },
  ).onfinish = () => line.remove();
}

/** Étincelle de fusée d'artifice, laissée sur place dans le ciel : elle tombe un peu et s'éteint. */
function spark(sky: HTMLElement, x: number, y: number) {
  const dot = document.createElement("div");
  dot.className =
    "pointer-events-none absolute top-0 left-0 size-[3px] bg-[#fff3c4]";
  sky.append(dot);
  const from = `translate(${x + between(-4, 4)}px, ${y + between(-4, 4)}px)`;
  const to = `translate(${x + between(-8, 8)}px, ${y + between(10, 22)}px)`;
  dot.animate(
    [
      { transform: from, opacity: 1 },
      { transform: to, opacity: 0 },
    ],
    { duration: between(450, 800), easing: "ease-out" },
  ).onfinish = () => dot.remove();
}

/**
 * Un passage : un joueur seul ou un groupe qui vole ensemble, sur le même vol tiré au hasard.
 * `ready` : départ commun, une fois tous les skins chargés (ou abandonnés).
 */
type Flight = {
  id: number;
  area: { width: number; height: number };
  plan: FlightPlan;
  members: Member[];
  ready: (name: string) => Promise<number>;
};
/** Place dans le groupe : retard sur le premier (pixels), écart en hauteur, un peu plus loin, son propre flottement et son allure. */
type Member = {
  name: string;
  lag: number;
  rise: number;
  depth: number;
  phase: number;
  style: Style;
};

/**
 * Groupe de un à trois joueurs (un sur deux vole seul), en formation derrière le premier, assez
 * espacés pour ne jamais se toucher, même tout près, ailes ouvertes.
 */
function formation(names: string[]): Member[] {
  const size = Math.min(
    names.length,
    Math.random() < 0.5 ? 1 : Math.random() < 0.6 ? 2 : 3,
  );
  let lag = 0;
  return names.slice(0, size).map((name, index) => {
    if (index > 0) lag += between(150, 200);
    return {
      name,
      lag,
      rise: index === 0 ? 0 : (index % 2 ? -1 : 1) * between(40, 60),
      depth: 1 - 0.07 * index,
      phase: between(0, 2 * Math.PI),
      style: randomStyle(),
    };
  });
}

/** Départ commun : la promesse de chacun se tient quand tous les membres sont arrivés, à l'heure de ce départ. */
function startTogether(names: string[]) {
  const arrived = new Set<string>();
  let open: (at: number) => void = () => {};
  const start = new Promise<number>((resolve) => (open = resolve));
  return (name: string) => {
    // Une fois par joueur, même si l'aperçu est monté deux fois (mode strict).
    arrived.add(name);
    if (arrived.size === names.length) open(performance.now());
    return start;
  };
}

/**
 * Un vrai joueur en élytres, en 3D : son skin et sa cape (sur les élytres, comme en jeu) par
 * Mojang, sinon le skin de minotar et des élytres grises. Il traverse le ciel une fois à sa place
 * dans le groupe, puis `onDone`. Rien ne s'affiche si son skin ne se charge pas.
 */
function Glider({
  flight,
  member,
  onDone,
}: {
  flight: Flight;
  member: Member;
  onDone: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let frame = 0;
    let alive = true;
    const viewer = new Viewer({
      canvas: node,
      width: GLIDER.width,
      height: GLIDER.height,
      zoom: 0.62,
      renderPaused: true,
    });
    viewer.background = null;
    viewer.autoRotate = false;
    viewer.controls.enabled = false;
    viewer.globalLight.intensity = 2.6;
    viewer.cameraLight.intensity = 0.8;
    viewer.playerWrapper.rotation.order = "ZYX";

    // Une seule boucle pour la place, la distance et la pose : le rendu suit chaque image du vol.
    const fly = (start: number) => {
      const { area, plan } = flight;
      const advance = glideAcross(
        area.width,
        area.height,
        GLIDER.width,
        plan,
        member.lag,
      );
      let before = start;
      let nextGust = start;
      let rocket: Mesh | null = null;
      const step = () => {
        if (!alive) return;
        const now = performance.now();
        // Au retour d'un onglet caché, pas de bond : au plus 50 ms d'un coup.
        const glide = advance(Math.min(0.05, Math.max(0, now - before) / 1000));
        before = now;
        if (!glide) return done.current();
        const scale = glide.scale * member.depth;
        const float = 5 * Math.sin((now / 1000) * 1.2 + member.phase);
        node.style.transform = `translate(${glide.x - GLIDER.width / 2}px, ${glide.y + member.rise + float - GLIDER.height / 2}px) scale(${scale})`;
        node.style.opacity = String(Math.min(1, 0.55 + scale * 0.5));
        // La fusée crache derrière ses pieds.
        if (glide.boosting && node.parentElement) {
          const tail = 34 * scale;
          spark(
            node.parentElement,
            glide.x - glide.dir * Math.cos(glide.pitch) * tail,
            glide.y + member.rise + float - Math.sin(glide.pitch) * tail,
          );
        }
        // Un filet de vent toutes les 0,2 à 0,4 s, plus serrés pendant le boost.
        if (now >= nextGust && node.parentElement) {
          gust(node.parentElement, glide.x, glide.y + member.rise + float, glide.dir, scale);
          nextGust = now + between(200, 400) * (glide.boosting ? 0.5 : 1);
        }
        // La fusée dans la main tendue côté écran (celle que lève `pose`), le temps du boost.
        if (!rocket) {
          const { leftArm, rightArm } = viewer.playerObject.skin;
          rocket = rocketMesh(glide.dir > 0 ? -1 : 1);
          (glide.dir > 0 ? rightArm : leftArm).add(rocket);
        }
        rocket.visible = glide.boosting;
        // Nez dans le sens du vol (un looping fait un tour complet), tourné vers nous quand il s'approche.
        viewer.playerWrapper.rotation.z = -glide.dir * glide.pitch;
        viewer.playerWrapper.rotation.y =
          glide.dir * (Math.PI / 2 - glide.turn);
        pose(
          viewer.playerObject,
          glide,
          now / 1000,
          member.style,
          (now - start) / 1000,
        );
        viewer.render();
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    const dress = async () => {
      const look = await lookOf(member.name);
      await viewer.loadSkin(
        look?.texture ??
          `https://minotar.net/skin/${encodeURIComponent(member.name)}`,
        { model: look?.model === "slim" ? "slim" : "default" },
      );
      await viewer.loadCape(look?.cape ?? elytraTexture(), {
        backEquipment: "elytra",
      });
    };
    // Un skin qui ne vient pas en 8 secondes : pas de passage cette fois.
    const timeout = new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error("skin")), 8000),
    );
    Promise.race([dress(), timeout]).then(
      () => flight.ready(member.name).then((start) => alive && fly(start)),
      () => {
        void flight.ready(member.name);
        if (alive) done.current();
      },
    );
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      viewer.dispose();
    };
  }, [flight, member]);

  return (
    <canvas
      ref={canvas}
      className="pointer-events-none absolute top-0 left-0 opacity-0"
      style={{ width: GLIDER.width, height: GLIDER.height }}
    />
  );
}

/**
 * Étoiles fixes, carrés de 2 ou 3 pixels dans le haut du ciel ; une sur quatre scintille. Placées
 * par la suite R2 (nombre plastique) : réparties sans paires ni alignements, les mêmes à chaque ouverture.
 */
const STARS = Array.from({ length: 36 }, (_, index) => ({
  x: fraction(0.5 + index * 0.7548776662) * 100,
  y: fraction(0.5 + index * 0.569840291) * 58,
  size: index % 4 ? 2 : 3,
  twinkle: index % 4 === 0 ? `${(index * 0.37) % 4}s` : null,
}));

/** Étoile filante : une traînée qui file en biais dans le haut du ciel, la tête devant, et s'éteint. */
function shootingStar(sky: HTMLElement) {
  const streak = document.createElement("div");
  streak.className =
    "pointer-events-none absolute top-0 left-0 h-px w-16 origin-right bg-linear-to-r from-transparent to-[#e5eee9]";
  sky.append(streak);
  // Vers la droite ou la gauche, en descendant de 15 à 35°.
  const tilt = (between(15, 35) * Math.PI) / 180;
  const angle = Math.random() < 0.5 ? tilt : Math.PI - tilt;
  const [x, y, length] = [
    between(0.1, 0.8) * sky.clientWidth,
    between(0.03, 0.35) * sky.clientHeight,
    between(120, 240),
  ];
  const at = (shift: number) =>
    `translate(${x + Math.cos(angle) * shift}px, ${y + Math.sin(angle) * shift}px) rotate(${angle}rad)`;
  streak.animate(
    [
      { transform: at(0), opacity: 0 },
      { transform: at(length * 0.15), opacity: 0.7, offset: 0.15 },
      { transform: at(length), opacity: 0 },
    ],
    { duration: between(800, 1300), easing: "ease-in" },
  ).onfinish = () => streak.remove();
}

/** Oiseau en pixels, en deux images : ailes levées, ailes baissées. */
const BIRD = {
  up: ["X.....X", ".X...X.", "..XXX.."],
  down: ["..XXX..", ".X...X.", "X.....X"],
};

/**
 * Volées du jour, en V derrière la première, chacune à sa hauteur et à son allure, dans un sens
 * ou dans l'autre. `x` : place quand les animations sont réduites.
 */
const FLOCKS = [
  {
    top: "17%",
    seconds: 46,
    delay: -12,
    reverse: false,
    birds: 3,
    unit: 3,
    x: "22%",
  },
  {
    top: "26%",
    seconds: 68,
    delay: -40,
    reverse: true,
    birds: 5,
    unit: 3,
    x: "58%",
  },
  {
    top: "10%",
    seconds: 58,
    delay: -50,
    reverse: false,
    birds: 2,
    unit: 2,
    x: "76%",
  },
];

/** Une volée : les ailes battent chacune à son temps, la volée ondule un peu. */
function Flock({
  birds,
  unit,
  reverse,
}: {
  birds: number;
  unit: number;
  reverse: boolean;
}) {
  const [width, height] = [BIRD.up[0].length, BIRD.up.length];
  return (
    <div className="sky-bob">
      <div
        className="relative"
        style={reverse ? { transform: "scaleX(-1)" } : undefined}
      >
        {Array.from({ length: birds }, (_, index) => {
          // Rang dans le V : les suivants en retrait, une fois au-dessus, une fois en dessous.
          const rank = Math.ceil(index / 2);
          const beat = `${-index * 0.17}s`;
          return (
            <svg
              key={index}
              width={width * unit}
              height={height * unit}
              viewBox={`0 0 ${width} ${height}`}
              shapeRendering="crispEdges"
              className="absolute text-[#16201a]/85"
              style={{
                left: -rank * width * unit * 1.7,
                top: (index % 2 ? -1 : 1) * rank * height * unit * 1.5,
              }}
            >
              <path
                className="sky-flap"
                style={{ animationDelay: beat }}
                d={cells(BIRD.up, "X")}
                fill="currentColor"
              />
              <path
                className="sky-flap sky-flap-alt"
                style={{ animationDelay: `calc(${beat} - 0.3s)` }}
                d={cells(BIRD.down, "X")}
                fill="currentColor"
              />
            </svg>
          );
        })}
      </div>
    </div>
  );
}

/** Météo relevée au plus toutes les 30 minutes, commune aux ciels de tous les écrans ; un échec aussi. */
const WEATHER_MS = 30 * 60_000;
let forecast: { at: number; weather: Promise<Weather | null> } | null = null;
function currentWeather() {
  if (!forecast || Date.now() - forecast.at >= WEATHER_MS)
    forecast = {
      at: Date.now(),
      weather: Promise.resolve()
        .then(() => api.weather())
        .catch(() => null),
    };
  return forecast.weather;
}

/**
 * Ce que chaque temps change au ciel : `cover` voile le soleil, la lune et les étoiles et grise le
 * ciel, `grey` assombrit les nuages, `clouds` en fixe le nombre (`level` de `DRIFTS`, 0 : aucun), `wind`
 * accélère leur dérive, `fall` fait tomber la pluie ou la neige.
 */
const SKIES: Record<
  Weather["sky"],
  {
    cover: number;
    grey: number;
    clouds: 0 | 1 | 2 | 3;
    wind?: number;
    fall?: "rain" | "snow";
  }
> = {
  clear: { cover: 0, grey: 0, clouds: 0 },
  fair: { cover: 0, grey: 0, clouds: 1 },
  cloudy: { cover: 0.15, grey: 0.1, clouds: 2 },
  overcast: { cover: 0.55, grey: 0.35, clouds: 3 },
  fog: { cover: 0.5, grey: 0.2, clouds: 3 },
  rain: { cover: 0.65, grey: 0.45, clouds: 3, fall: "rain" },
  storm: { cover: 0.8, grey: 0.65, clouds: 3, wind: 1.8, fall: "rain" },
  snow: { cover: 0.45, grey: 0.15, clouds: 3, fall: "snow" },
};

/** Tuile de 32 pixels du jeu, répétée sur tout le ciel : `count` gouttes ou flocons placés par la suite R2, comme les étoiles. */
function fallTile(count: number, width: number, height: number, color: string) {
  const rects = Array.from({ length: count }, (_, index) => {
    const x = Math.floor(fraction(0.5 + index * 0.7548776662) * 32);
    const y = Math.floor(fraction(0.5 + index * 0.569840291) * (32 - height));
    return `<rect x='${x}' y='${y}' width='${width}' height='${height}'/>`;
  });
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' fill='${color}' shape-rendering='crispEdges'>${rects.join("")}</svg>`)}")`;
}

/** En dessous (°C), trop froid pour voler : ni oiseaux ni joueurs en élytres, ni chauves-souris. */
const COLD = 0;

/** Chauve-souris de profil : pelage et membranes crantées, articulées à l'épaule. */
const BAT_WING = [
  "w.......",
  "rww.....",
  "wrrww...",
  ".wrrrww.",
  ".wrrrrrw",
  "..wwrrrw",
  "....w.ww",
];
const BAT_BODY = [
  "...........bb.......",
  "...........bBb......",
  "..........Bbbbb.....",
  "..........Bbbeb.....",
  ".........Bbbbbbn....",
  ".........Bbbbbb.....",
  "........Bbbbbb......",
  "........Bbbbb.......",
  ".........Bbbb.......",
  "..........b.b.......",
  "..........c.c.......",
];

/** La trajectoire et le profil tournent séparément pour ne jamais écraser le sprite au demi-tour. */
function flyCritter(sky: HTMLElement, node: HTMLDivElement, kind: "bat" | "allay", fromLeft: boolean) {
  const { motion, facing } = ambientFlight(sky.clientWidth, sky.clientHeight, fromLeft, between(0, Math.PI * 2), kind);
  const duration = kind === "bat" ? between(7000, 11000) : between(18000, 25000);
  const turning = node.querySelector("svg")!.animate(facing, { duration, fill: "both" });
  node.animate(motion, { duration, easing: "linear" }).onfinish = () => {
    turning.cancel();
    node.remove();
  };
}

/** Ailes et trajectoire s'interpolent séparément, sans changer d'image à chaque battement. */
function bat(sky: HTMLElement) {
  if (document.hidden || reducedMotion()) return;
  const fromLeft = Math.random() < 0.5;
  const node = document.createElement("div");
  node.className = "pointer-events-none absolute top-0 left-0 sky-bat";
  const wing = Object.entries({ w: "#251b18", r: "#49332a" })
    .map(([mark, fill]) => `<path d="${cells(BAT_WING, mark)}" fill="${fill}"/>`).join("");
  const body = Object.entries({ b: "#3b2c24", B: "#4c382b", e: "#d5bc82", n: "#271b18", c: "#89735d" })
    .map(([mark, fill]) => `<path d="${cells(BAT_BODY, mark)}" fill="${fill}"/>`).join("");
  node.innerHTML = `<svg width="15" height="9" viewBox="0 0 20 11" shape-rendering="crispEdges" aria-hidden="true" style="transform:scaleX(${fromLeft ? 1 : -1})"><g transform="translate(3 0)" opacity="0.6"><g class="sky-bat-wing sky-bat-wing-back" style="transform-origin:7px 5px">${wing}</g></g>${body}<g transform="translate(1 2)"><g class="sky-bat-wing" style="transform-origin:7px 5px">${wing}</g></g></svg>`;
  sky.append(node);
  flyCritter(sky, node, "bat", fromLeft);
}

/** Allay de profil, son unique œil et ses bras tournés vers son vol. */
const ALLAY_BODY = [
  "............tttttttttf..",
  "............tLLLLLLLff..",
  "............tLlllLLLff..",
  "............cllllllfff..",
  "............clllllfEEf..",
  "............clLlllfEEf..",
  "............clllllfEEf..",
  "............cllLllffff..",
  "............ccclllllff..",
  "............ccccccccff..",
  "...............bBBb.....",
  "..............abBBba....",
  "..............abBBbaa...",
  "...............bBBb.aa..",
  "...............bBBb..a..",
  "...............bBBb.....",
  "...............bbBb.....",
  "...............bBb......",
  "...............bb.......",
];
const ALLAY_WING = [
  "pp............",
  "pLpp..........",
  ".pLLpp........",
  ".pLLLLpp......",
  "..pLLpLLpp....",
  "..pp.pLLLLpp..",
  ".....pLLpLLLp.",
  "......pp.pLLLp",
  ".........ppLLp",
  "...........ppp",
];

function allay(sky: HTMLElement) {
  if (document.hidden || reducedMotion()) return;
  const unit = Math.random() < 0.55 ? 1 : 1.5;
  const fromLeft = Math.random() < 0.5;
  const node = document.createElement("div");
  node.className = "pointer-events-none absolute top-0 left-0 sky-allay";
  const body = Object.entries({ t: "#6ce4e8", c: "#26b7d8", L: "#47d9e8", l: "#2ec7df", f: "#218bb4", E: "#e1ffff", b: "#168eb8", B: "#32c4df", a: "#32b4d3" })
    .map(([mark, fill]) => `<path d="${cells(ALLAY_BODY, mark)}" fill="${fill}"/>`).join("");
  const wing = Object.entries({ p: "#5cdef1", L: "#b2eff4" })
    .map(([mark, fill]) => `<path d="${cells(ALLAY_WING, mark)}" fill="${fill}"/>`).join("");
  node.innerHTML = `<svg width="${24 * unit}" height="${19 * unit}" viewBox="0 0 24 19" shape-rendering="crispEdges" aria-hidden="true" style="transform:scaleX(${fromLeft ? 1 : -1})"><g transform="translate(2 2)" opacity="0.4"><g class="sky-allay-wing sky-allay-wing-back">${wing}</g></g><g transform="translate(0 3)" opacity="0.7"><g class="sky-allay-wing">${wing}</g></g>${body}</svg>`;
  sky.append(node);
  flyCritter(sky, node, "allay", fromLeft);
}

/** Lucioles au-dessus des collines, placées par la suite R2 ; chacune s'allume à son rythme. */
const FIREFLIES = Array.from({ length: 16 }, (_, index) => ({
  x: fraction(0.3 + index * 0.7548776662) * 100,
  y: 56 + fraction(0.3 + index * 0.569840291) * 23,
  seconds: 3 + (index % 3),
  delay: `${-((index * 0.77) % 4)}s`,
  driftX: (fraction(0.2 + index * 0.7548776662) - 0.5) * 36,
  driftY: (fraction(0.6 + index * 0.569840291) - 0.5) * 26,
  driftSeconds: 9 + (index % 7),
}));

/** Deux plans : loin, petit, pâle et lent ; près, gros et rapide. `drift` : la neige tombe de biais, chaque plan de son côté. */
const FALLS = {
  rain: [
    {
      image: fallTile(6, 1, 5, "#c6d6ee"),
      scale: 3,
      seconds: 0.55,
      opacity: 0.35,
      drift: 0,
    },
    {
      image: fallTile(5, 1, 6, "#dbe6f5"),
      scale: 5,
      seconds: 0.4,
      opacity: 0.5,
      drift: 0,
    },
  ],
  snow: [
    {
      image: fallTile(7, 1, 1, "#ffffff"),
      scale: 3,
      seconds: 9,
      opacity: 0.6,
      drift: 0.5,
    },
    {
      image: fallTile(5, 1, 1, "#ffffff"),
      scale: 5,
      seconds: 6,
      opacity: 0.85,
      drift: -0.5,
    },
  ],
};

/**
 * Ciel de l'accueil derrière le personnage, dans la teinte choisie (Paramètres › Apparence) et à
 * l'heure de l'ordinateur (`skyAt`) : soleil carré du jeu qui traverse le ciel et oiseaux le
 * jour, lune, étoiles et étoiles filantes la nuit, lueur dorée à l'aube et au couchant, nuages en blocs sur deux plans, de temps
 * en temps de vrais joueurs de `players` en élytres, seuls ou en groupe, et des collines de blocs
 * en bas. Par-dessus, le temps qu'il fait chez le joueur : ciel gris, pluie, neige, orage ou
 * brouillard, sauf si le joueur l'a désactivée (`skyWeather`). Animations réduites : tout reste en
 * place, sans passage ni éclair.
 */
export function HomeSky({
  scene,
  players,
  skyWeather = true,
}: {
  scene: Scene;
  players: string[];
  skyWeather?: boolean;
}) {
  const sky = useRef<HTMLDivElement>(null);
  const starry = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [retry, setRetry] = useState(0);
  const pool = useRef(players);
  pool.current = players;
  const last = useRef<string | null>(null);
  const count = useRef(0);
  const landed = useRef(0);
  const crowd = players.join(",");
  const [now, setNow] = useState(() => new Date());
  const time = skyAt(now);
  const world = SCENES[scene].world;
  const overworld = world === "overworld";
  const life = SCENE_LIFE[scene];
  const [weather, setWeather] = useState<Weather | null>(null);
  const look = SKIES[weather?.sky ?? "clear"];
  // Au désert, il ne pleut ni ne neige jamais, comme en jeu : le ciel se couvre seulement.
  const fall = life.dry ? undefined : look.fall;
  // Sans météo (désactivée ou inconnue), le ciel garde ses nuages habituels.
  const cloudLevel = weather ? look.clouds : 2;
  const wind = look.wind ?? 1;
  const flash = useRef<HTMLDivElement>(null);
  const stormy = weather?.sky === "storm";
  // Personne ne vole la nuit, dans l'orage, la neige, une forte pluie ou le grand froid ; les
  // oiseaux s'abritent aussi d'une petite pluie, et rentrent au crépuscule.
  const grounded =
    stormy ||
    weather?.sky === "snow" ||
    (fall !== undefined && weather?.heavy === true) ||
    (weather?.temperature ?? COLD + 1) <= COLD;
  // Dans l'End, les joueurs en élytres volent toujours ; jamais sous le plafond du Nether.
  const flying = overworld ? !grounded && time.night < 0.5 : world === "end";
  const birds =
    !life.birds || grounded || fall ? 0 : Math.max(0, 1 - 2 * time.night);
  // Sans relevé météo, le décor reste vivant ; le grand froid garde tout le monde à l'abri.
  const calmNight = overworld && !grounded && !fall && time.night >= 0.5;
  const fireflies = life.fireflies && calmNight;
  const allays = (scene === "forest" || scene === "village") && !grounded && !fall;
  // Mobs du décor dehors le jour, au sec ; fenêtres du village allumées du soir à minuit.
  const out = !grounded && !fall && time.night < 0.5;
  const lit = time.night > 0.25 && now.getHours() >= 12;
  const moon = moonPhase(now);
  const critters = useRef<HTMLDivElement>(null);
  // Plus la fenêtre est grande, plus le pixel art grossit (de ×1 à ×2, par quarts), les places en %
  // restant les mêmes : le décor garde ses proportions en plein écran.
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const node = sky.current;
    if (!node) return;
    const measure = () =>
      setZoom(
        Math.max(1, Math.min(2, Math.round((node.clientHeight / 620) * 4) / 4)),
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  /** Calque mis à l'échelle : `zoom` grossit les pixels (sprites, soleil, nuages), les places en % ne bougent pas. */
  const scaled: CSSProperties = { zoom };

  // L'heure avance d'elle-même : le soleil glisse, le soir tombe sans rouvrir l'accueil.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Chaque minute, avec l'heure : la météo, relevée de nouveau au bout de 30 minutes. Désactivée,
  // aucune requête ne part.
  useEffect(() => {
    if (!skyWeather || !overworld) return setWeather(null);
    let live = true;
    void currentWeather().then((found) => live && setWeather(found));
    return () => {
      live = false;
    };
  }, [now, skyWeather, overworld]);

  // L'orage : un éclair toutes les 6 à 18 secondes, le ciel blanchit deux fois de suite.
  useEffect(() => {
    if (!stormy) return;
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(
        () => {
          if (flash.current && !document.hidden && !reducedMotion())
            flash.current.animate(
              [
                { opacity: 0 },
                { opacity: 0.55, offset: 0.1 },
                { opacity: 0.05, offset: 0.3 },
                { opacity: 0.35, offset: 0.45 },
                { opacity: 0 },
              ],
              { duration: 900 },
            );
          next();
        },
        between(6000, 18000),
      );
    };
    next();
    return () => window.clearTimeout(timer);
  }, [stormy]);

  // Quelques rencontres espacées ; cacher le ciel ou réduire les animations arrête aussi les passages en cours.
  useEffect(() => {
    const node = critters.current;
    if (!node || (!calmNight && !allays)) return;
    const timers = new Set<number>();
    const clear = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      node.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      node.replaceChildren();
    };
    const schedule = (spawn: (sky: HTMLElement) => void, first: [number, number], repeat: [number, number]) => {
      const next = (range: [number, number]) => {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          if (document.hidden || reducedMotion()) return;
          spawn(node);
          next(repeat);
        }, between(...range));
        timers.add(timer);
      };
      next(first);
    };
    const resume = () => {
      clear();
      if (document.hidden || reducedMotion()) return;
      if (calmNight) schedule(bat, [25000, 45000], [70000, 140000]);
      if (allays) schedule(allay, [18000, 35000], [75000, 140000]);
    };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new MutationObserver(resume);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", resume);
    motion.addEventListener("change", resume);
    resume();
    return () => {
      clear();
      observer.disconnect();
      document.removeEventListener("visibilitychange", resume);
      motion.removeEventListener("change", resume);
    };
  }, [calmNight, allays]);

  // La nuit, une fine étoile filante de temps en temps, dans la couche des étoiles (absente le jour).
  useEffect(() => {
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(
        () => {
          if (starry.current && !document.hidden && !reducedMotion())
            shootingStar(starry.current);
          next();
        },
        between(18000, 45000),
      );
    };
    next();
    return () => window.clearTimeout(timer);
  }, []);

  // Un passage à la fois (seul ou en groupe) : le premier peu après l'ouverture, puis toutes les 15 à
  // 40 secondes, quand le temps s'y prête ; un passage commencé va jusqu'au bout.
  useEffect(() => {
    if (flight || !crowd || !flying) return;
    const timer = window.setTimeout(
      () => {
        const node = sky.current;
        if (!node || document.hidden || reducedMotion())
          return setRetry((value) => value + 1);
        // Pas le même joueur en tête deux fois de suite.
        const others = pool.current.filter((name) => name !== last.current);
        const members = formation(
          [...(others.length > 0 ? others : pool.current)].sort(
            () => Math.random() - 0.5,
          ),
        );
        last.current = members[0].name;
        landed.current = 0;
        count.current += 1;
        const area = { width: node.clientWidth, height: node.clientHeight };
        const plan = planFlight(area.height);
        // En groupe, pas de looping : celui du premier se ferait sous le nez des suivants, ou derrière le personnage.
        if (members.length > 1) plan.loop = 2;
        setFlight({
          id: count.current,
          area,
          plan,
          members,
          ready: startTogether(members.map((member) => member.name)),
        });
      },
      count.current === 0 ? between(2500, 6000) : between(15000, 40000),
    );
    return () => window.clearTimeout(timer);
  }, [flight, crowd, retry, flying]);

  const gliders = flight?.members.map((member) => (
    <Glider
      key={`${flight.id}-${member.name}`}
      flight={flight}
      member={member}
      onDone={() => {
        landed.current += 1;
        if (landed.current === flight.members.length) setFlight(null);
      }}
    />
  ));

  if (!overworld) {
    return (
      <div
        ref={sky}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden bg-linear-to-b",
          SCENES[scene].bg,
        )}
      >
        <div className="absolute inset-0" style={scaled}>
          {world === "nether" ? <NetherScene /> : <EndScene />}
        </div>
        {gliders}
      </div>
    );
  }

  return (
    <div
      ref={sky}
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden bg-linear-to-b",
        SCENES[scene].bg,
      )}
    >
      <div className="absolute inset-0" style={scaled}>
        <div
          className={cn(
            "absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full blur-[120px]",
            SCENES[scene].glow,
          )}
          style={{ opacity: (1 - 0.7 * time.night) * (1 - look.cover) }}
        />
        {/* Ciel couvert : un voile gris, que la nuit assombrit ensuite comme le reste. */}
        {look.cover > 0 && (
          <div
            className="absolute inset-0 bg-[#3d434d]"
            style={{ opacity: 0.6 * look.cover }}
          />
        )}
        <div
          className="absolute inset-0 bg-[#091321]"
          style={{ opacity: 0.72 * time.night }}
        />

        {time.night > 0 && (
          <div
            ref={starry}
            className="absolute inset-0"
            style={{ opacity: time.night * (1 - look.cover) }}
          >
            {STARS.map((star, index) => (
              <div
                key={index}
                className={cn(
                  "absolute bg-[#e4e9df]/80",
                  star.twinkle && "sky-twinkle",
                )}
                style={{
                  left: `${star.x}%`,
                  top: `${star.y}%`,
                  width: star.size,
                  height: star.size,
                  opacity: 0.5 + (index % 4) * 0.12,
                  animationDelay: star.twinkle ?? undefined,
                }}
              />
            ))}
          </div>
        )}

        <div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${time.x}%`,
            top: `${time.y}%`,
            opacity: 1 - look.cover,
          }}
        >
          {time.body === "sun" ? (
            <div className="sky-sun grid size-16 place-items-center bg-[#fff6cf]/8">
              <svg width="36" height="36" viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true" className="shadow-[0_0_30px_6px_rgb(255_242_184/0.18)]">
                <path d="M0 0h16v16H0z" fill="#e9c67b" />
                <path d="M1 1h14v14H1z" fill="#f9e5a4" />
                <path d="M3 2h9v1H3zM2 3h11v9H2zM3 12h9v1H3z" fill="#fff3c7" />
                <path d="M5 4h6v7H5zM4 5h1v4H4z" fill="#fff9e5" />
                <path d="M12 11h2v3h-3v-1h1zM1 10h1v3H1z" fill="#efd68f" />
              </svg>
            </div>
          ) : (
            <div className="sky-sun grid size-14 place-items-center bg-[#dfe8ff]/5">
              <div
                className="relative size-8 bg-[#e3e9f4]"
                style={{
                  boxShadow: `0 0 28px 4px rgb(220 230 255 / ${(0.14 * moon.lit) / 8})`,
                }}
              >
                <svg className="absolute inset-0 size-full" viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
                  <path d="M0 0h16v1H0zM0 1h1v14H0z" fill="#f2f2e8" />
                  <path d="M2 2h4v4H2zM10 8h4v5h-5V9h1zM3 10h3v2H3z" fill="#bac7d2" />
                  <path d="M3 3h2v2H3zM10 10h3v2h-3zM7 5h2v1H7z" fill="#a7b7c6" />
                  <path d="M2 6h4v1H2zM9 13h5v1H9zM7 2h5v1H7z" fill="#f2f2e8" />
                  <path d="M15 0h1v16h-1zM1 15h14v1H1z" fill="#cbd6dd" />
                </svg>
                {/* Part dans l'ombre, en colonnes entières comme les phases du jeu. */}
                {moon.lit < 8 && (
                  <div
                    className="absolute inset-y-0 bg-[#232a3a]"
                    style={{
                      [moon.side === "right" ? "left" : "right"]: 0,
                      width: `${((8 - moon.lit) / 8) * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* La nuit assombrit aussi les oiseaux, les nuages et les joueurs. */}
        <div
          className="absolute inset-0"
          style={
            time.night > 0
              ? { filter: `brightness(${1 - 0.45 * time.night})` }
              : undefined
          }
        >
          {birds > 0 &&
            FLOCKS.map((flock, index) => (
              <div
                key={index}
                className="sky-drift absolute inset-x-0"
                style={
                  {
                    top: flock.top,
                    opacity: birds,
                    "--x": flock.x,
                    animationDuration: `${flock.seconds}s`,
                    animationDelay: `${flock.delay}s`,
                    animationDirection: flock.reverse ? "reverse" : undefined,
                  } as CSSProperties
                }
              >
                <Flock
                  birds={flock.birds}
                  unit={flock.unit}
                  reverse={flock.reverse}
                />
              </div>
            ))}
          {DRIFTS.map(
            (cloud, index) =>
              cloud.level <= cloudLevel && (
                <div
                  key={index}
                  className="sky-drift absolute inset-x-0"
                  style={
                    {
                      top: cloud.top,
                      "--x": cloud.x,
                      animationDuration: `${cloud.seconds / wind}s`,
                      animationDelay: `${cloud.delay / wind}s`,
                      filter:
                        look.grey > 0
                          ? `brightness(${1 - 0.45 * look.grey})`
                          : undefined,
                    } as CSSProperties
                  }
                >
                  <Cloud
                    shape={cloud.shape}
                    unit={cloud.unit}
                    opacity={Math.min(1, cloud.opacity + 0.4 * look.cover)}
                  />
                </div>
              ),
          )}

          <div ref={critters} className="absolute inset-0" />

          {fall &&
            FALLS[fall].map((layer, index) => {
              const tile = 32 * layer.scale;
              const heavy = weather?.heavy ? 1.5 : 1;
              return (
                <div
                  key={index}
                  className="sky-fall absolute inset-0"
                  style={
                    {
                      backgroundImage: layer.image,
                      backgroundSize: `${tile}px`,
                      opacity: Math.min(0.9, layer.opacity * heavy),
                      animationDuration: `${layer.seconds / heavy}s`,
                      "--fall": `${tile}px`,
                      "--drift": `${layer.drift * tile}px`,
                    } as CSSProperties
                  }
                />
              );
            })}
        </div>

        {/* Aube et couchant : lueur orangée qui monte de l'horizon, côté soleil, sur le soleil bas et les nuages. */}
        {time.dusk > 0 && (
          <div
            className="absolute inset-0 mix-blend-screen"
            style={{
              opacity: time.dusk * (1 - look.cover),
              background: `radial-gradient(ellipse 85% 70% at ${time.duskX}% 88%, rgb(255 132 60 / 0.72), rgb(255 90 130 / 0.26) 45%, transparent 75%)`,
            }}
          />
        )}

        <Landscape
          scene={scene}
          night={time.night}
          cover={look.cover}
          lit={lit}
          out={out}
        />

        {fireflies &&
          FIREFLIES.map((fly, index) => (
            <div
              key={index}
              className="sky-firefly absolute"
              style={{
                left: `${fly.x}%`,
                top: `${fly.y}%`,
                "--firefly-x": `${fly.driftX}px`,
                "--firefly-y": `${fly.driftY}px`,
                animationDuration: `${fly.driftSeconds}s`,
                animationDelay: `${-index * 1.13}s`,
              } as CSSProperties}
            >
              <div
                className="sky-glow size-[3px] bg-[#e4ff8a] shadow-[0_0_6px_2px_rgb(214_255_110/0.55)]"
                style={{ animationDuration: `${fly.seconds}s`, animationDelay: fly.delay }}
              />
            </div>
          ))}

        {/* Brouillard : il monte du sol et noie les collines ; la nuit, il s'éteint avec le ciel. */}
        {weather?.sky === "fog" && (
          <div
            className="absolute inset-0 bg-linear-to-t from-[#c9d1dc]/70 via-[#c9d1dc]/30 to-transparent"
            style={
              time.night > 0
                ? { filter: `brightness(${1 - 0.65 * time.night})` }
                : undefined
            }
          />
        )}
        {stormy && (
          <div
            ref={flash}
            className="absolute inset-0 bg-[#eef3ff] opacity-0"
          />
        )}
      </div>
      {/* Joueurs en élytres : hors du calque mis à l'échelle, ils calculent leur taille eux-mêmes. */}
      <div
        className="absolute inset-0"
        style={
          time.night > 0
            ? { filter: `brightness(${1 - 0.45 * time.night})` }
            : undefined
        }
      >
        {gliders}
      </div>
    </div>
  );
}
