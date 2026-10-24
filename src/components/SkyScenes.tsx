import { type CSSProperties, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

import { reducedMotion, type Scene } from "@/lib/appearance";
import { between, flightPath, type Point } from "@/lib/flight";
import { MOB_GEOMETRY } from "@/lib/mob-art";
import { patrolLanes } from "@/lib/patrol";
import { cells, fraction, pixelImage } from "@/lib/pixels";
import { cn } from "@/lib/utils";
import { NIGHT_MOB_DAWN_MS, NIGHT_MOB_HIT_MS, useNightMob, type NightMobPhase } from "@/lib/use-night-mob";
import { SkyMob, type MobKind } from "./SkyMobs";

/**
 * Décors du ciel de l'accueil (`HomeSky`) : paysage en blocs et mobs dessinés pixel par pixel
 * d'après ceux du jeu, vus de profil (de face pour le ghast, l'enderman et la chauve-souris). Le
 * monde normal (forêt, village, désert) se pose sous le ciel de `HomeSky`, qui garde l'heure et la
 * météo ; le Nether et l'End ont leur propre ciel. Animations réduites : tout reste en place.
 */

type Palette = Record<string, string>;
type Frames = readonly (readonly string[])[];
type Raster = { frames: Frames; palette: Palette; mob?: never };
type Articulated = { mob: MobKind; frames?: never; palette?: never };

/**
 * Sprite en pixels : une couleur par lettre de `palette`. Avec deux images, elles alternent toutes
 * les `period` secondes (pattes, ailes, tentacules) ; animations réduites, la première reste.
 */
export function Sprite({ frames, palette, mob, unit, period = 0.6, flip, still, className, style }: (Raster | Articulated) & { unit: number; period?: number; flip?: boolean; still?: boolean; className?: string; style?: CSSProperties }) {
  if (mob) return <SkyMob kind={mob} unit={unit} period={period} flip={flip} still={still} className={className} style={style} />;
  const images = still ? [frames[0]] : frames;
  const width = Math.max(...images.flatMap((frame) => frame.map((row) => row.length)));
  const height = Math.max(...images.map((frame) => frame.length));
  const paint = (frame: readonly string[]) =>
    Object.entries(palette).map(([mark, color]) => {
      const path = cells(frame, mark);
      return path && <path key={mark} d={path} fill={color} />;
    });
  return (
    <svg
      width={width * unit}
      height={height * unit}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      className={cn("block", className)}
      style={flip ? { transform: "scaleX(-1)", ...style } : style}
    >
      {images.length === 1 ? (
        paint(images[0])
      ) : (
        <>
          <g className="sky-flap" style={{ animationDuration: `${period}s` }}>
            {paint(images[0])}
          </g>
          <g className="sky-flap sky-flap-alt" style={{ animationDuration: `${period}s`, animationDelay: `${-period / 2}s` }}>
            {paint(images[1])}
          </g>
        </>
      )}
    </svg>
  );
}

/** Ce que chaque décor permet au ciel : oiseaux le jour, lucioles les nuits douces, pluie et neige (jamais au désert, comme en jeu). */
export const SCENE_LIFE: Record<Scene, { birds: boolean; fireflies: boolean; dry: boolean }> = {
  forest: { birds: true, fireflies: true, dry: false },
  village: { birds: true, fireflies: true, dry: false },
  desert: { birds: false, fireflies: false, dry: true },
  nether: { birds: false, fireflies: false, dry: true },
  end: { birds: false, fireflies: false, dry: true },
};

// ── Mobs ────────────────────────────────────────────────────────────────────

/** Les deux dernières lignes de `rows` remplacées : pattes en marche. */
const stride = (rows: readonly string[], legs: readonly string[]) => [...rows.slice(0, rows.length - legs.length), ...legs];

/** Villageois de profil, tourné vers la droite : grand nez, sourcil unique, bras croisés dans les manches. */
function villager(hat: boolean) {
  const rows = [
    hat ? "....hhhhhh..." : ".............",
    hat ? "..hhhhhhhhhhh" : ".............",
    "...ssssssss..",
    "...ssssssss..",
    "...sssssddd..",
    "...ssssssegnn",
    "...ssssssssnn",
    "...ssssssssnn",
    "...ssssssssnn",
    "...ssssssss..",
    "...ssssssss..",
    "...ssssssss..",
    "....rrrrrr...",
    "....rrrrrr...",
    "....rrrraaaaa",
    "....rrrraassa",
    "....rrrraaaaa",
    "....rrrrrr...",
    "....RRRRRR...",
    "....rrrrrr...",
    "....rrrrrr...",
    "....rrrrrr...",
    "....rrrrrr...",
    "....RRRRRR...",
    ".....llll....",
    ".....llll....",
    ".....llll....",
    ".....llll....",
    ".....LLLL....",
  ];
  return [rows, stride(rows, ["....ll..ll...", "....ll..ll...", "...ll....ll..", "...LL....LL.."])];
}
const VILLAGER_SKIN = { s: "#b98163", d: "#4a2c1d", e: "#eeeeee", g: "#2e8b46", n: "#a06a4f", l: "#3f2c1f", L: "#2b1e15" };
/** Fermier (chapeau de paille, blouse brune) et simplet (blouse verte). */
const FARMER = { frames: villager(true), palette: { ...VILLAGER_SKIN, h: "#d9b45a", r: "#7b5235", R: "#5c3c26", a: "#6a4430" } };
const NITWIT = { frames: villager(false), palette: { ...VILLAGER_SKIN, r: "#4f7a35", R: "#3b5c27", a: "#44692e" } };

const CHICKEN_BODY = ["..wwwwwwwww..", ".wwwwWWWwww..", ".wwwWWWWwww..", ".wwwwWWWwww..", "..wwwwwwww...", "...wwwwww....", ".....o..o....", ".....o..o....", "....oo.oo...."];
/** Poule : crête rouge sous le bec jaune ; elle picore. */
const CHICKEN = {
  frames: [
    ["........www..", "........www..", "........wkwyy", "........wwwyy", "........wwrr.", "........wwrr.", ...CHICKEN_BODY],
    [".............", ".............", "........www..", "........www..", "........wkwyy", "........wwwyy", "..wwwwwwwwrr.", ".wwwwWWWwwrr.", ...CHICKEN_BODY.slice(2)],
  ],
  palette: { w: "#f3f3f3", W: "#d5d5d5", k: "#1d1d1d", y: "#e7b42d", r: "#d33a2c", o: "#e39b2e" },
};

/** Abeille : rayures jaunes et brunes, dard gris, ailes qui battent vite. */
const BEE_BODY = [".YYbbYYbbYY.", ".yybbyybbyk.", ".yybbyybbyk.", "gyybbyybbyb.", ".yybbyybbyy.", ".YYbbYYbbYY."];
const BEE = {
  frames: [
    ["....WW.WW..k", "....WW.WW.k.", ...BEE_BODY],
    ["...........k", "...WWWWWW.k.", ...BEE_BODY],
  ],
  palette: { y: "#e8bc45", Y: "#f4d779", b: "#6d4829", k: "#263f40", g: "#8a6a43", W: "#dcecf1d9" },
};

/** Dromadaire du jeu : une bosse, long cou dressé, hautes pattes aux sabots sombres. */
const CAMEL_BODY = [
  "..............C......",
  "..............ccccc..",
  "..............ccccccc",
  "..............cceccdd",
  ".............cccccdd.",
  ".............cccc....",
  "....hhhh.....cccc....",
  "...hcccch....cccc....",
  "..cccccccccc.ccc.....",
  ".ccccccccccccccc.....",
  "Cccccccccccccccc.....",
  "Cccccccccccccccc.....",
  ".cccccccccccccc......",
  ".CCCCCCCCCCCCCC......",
];
const CAMEL = {
  frames: [
    [...CAMEL_BODY, ...Array.from({ length: 8 }, () => "..cc.cc....cc.cc....."), "..dd.dd....dd.dd....."],
    [...CAMEL_BODY, ...Array.from({ length: 4 }, () => "..cc.cc....cc.cc....."), ...Array.from({ length: 4 }, () => ".cc...cc..cc...cc...."), ".dd...dd..dd...dd...."],
  ],
  palette: { c: "#c9984f", C: "#a67638", h: "#d8ab62", e: "#2b1c0e", d: "#6e4a24" },
};

/** Lapin du désert, couleur sable, queue blanche. */
const RABBIT = {
  frames: [[".....rr.", ".....rp.", ".....rr.", "....rrrr", "....rrer", "wrrrrrrr", ".rrrrrr.", ".RR..RR."]],
  palette: { r: "#c8a46c", R: "#9d7a48", p: "#d9a3a3", e: "#2a1c10", w: "#f1e9dc" },
  speed: 0.3,
};

/** Mobs articulés : mêmes vitesses et parcours que les autres créatures du décor. */
const ZOMBIE = { mob: "zombie", speed: 0.23 } satisfies MobSprite;
const HUSK = { mob: "husk", speed: 0.23 } satisfies MobSprite;
const SKELETON = { mob: "skeleton", speed: 0.25 } satisfies MobSprite;
const CREEPER = { mob: "creeper", speed: 0.25 } satisfies MobSprite;
const SPIDER = { mob: "spider", speed: 0.3 } satisfies MobSprite;
/** Cochon de profil : rose, groin plus clair et ses narines, quatre pattes. */
const PIG_BODY = [
  "..........Ppppppp",
  "..........Ppppppp",
  "pppppppppppppwkpp",
  "ppppppppppppppsss",
  "ppppppppppppppnsn",
  "ppppppppppppppsss",
  "PPPPPPPPPPPPPPPP.",
];
const PIG = {
  frames: [
    [...PIG_BODY, ".pp..pp...pp..pp.", ".pp..pp...pp..pp.", ".hh..hh...hh..hh."],
    [...PIG_BODY, "..pp.pp....pp.pp.", "..pp.pp....pp.pp.", "..hh.hh....hh.hh."],
  ],
  palette: { p: "#e7a2a0", P: "#ce8588", s: "#efbcb3", n: "#ac7372", w: "#f6e9dd", k: "#3f2d2d", h: "#9a6665" },
  speed: 0.25,
};

/** Vache de profil : robe brune tachée de blanc, cornes claires, mufle, pis rose. */
const COW_BODY = [
  "...............h..h.",
  "..............cccwcc",
  "ccwwwcccccccccccwkcc",
  "cwwwwccccwwwccccccnn",
  "ccwwcccccwwwccccccnn",
  "cccccccccwwccccccc..",
  "ccccccccccccccccc...",
  "CCCCCCCCCuuCCCCC....",
];
const COW = {
  frames: [
    [...COW_BODY, ".cc..cc.....cc..cc..", ".cc..cc.....cc..cc..", ".kk..kk.....kk..kk.."],
    [...COW_BODY, "..cc.cc......cc.cc..", "..cc.cc......cc.cc..", "..kk.kk......kk.kk.."],
  ],
  palette: { c: "#5b4637", C: "#403126", w: "#e9e4d7", h: "#c4c0b2", n: "#a69689", k: "#2c2724", u: "#d69b9e" },
  speed: 0.2,
};

/** Mouton de profil : laine blanche, tête et pattes couleur peau. */
const SHEEP_BODY = [
  "...........wwwww..",
  "..wwwwwwwwwwwffff.",
  ".wwwwwwwwwwwwfwkf.",
  "wwwwwwwwwwwwwffmm.",
  "wwwwwwwwwwwwwwfmm.",
  "wwWWWWWWWWWWWWww..",
  "WWWWWWWWWWWWWWW...",
];
const SHEEP = {
  frames: [
    [...SHEEP_BODY, ".ff..ff...ff..ff..", ".ff..ff...ff..ff..", ".hh..hh...hh..hh.."],
    [...SHEEP_BODY, "..ff.ff....ff.ff..", "..ff.ff....ff.ff..", "..hh.hh....hh.hh.."],
  ],
  palette: { w: "#eae7dc", W: "#d1cdbf", f: "#a28d7c", m: "#c7b3a1", k: "#34302b", h: "#75685b" },
  speed: 0.23,
};

/**
 * Ghast de face, comme en jeu : corps blanc moucheté de gris, yeux clos et traînées de larmes, petite
 * bouche ; neuf tentacules en deux rangs qui ondulent. En colère (`GHAST_ANGRY`), il ouvre ses yeux
 * rouges et sa grande bouche pour cracher.
 */
const GHAST_FACE = [
  "gggggggggggggggg",
  "ggslgggggggsgggg",
  "gggggggslggggggg",
  "gsggggggggggglgg",
  "gggggggggggggggg",
  "ggkkkkggggkkkkgg",
  "ggmtmmggggmmtmgg",
  "gggtggggggggtggg",
  "gggtgsggggggtggg",
  "ggggggggsggggggg",
  "gggggkkkkkkggggg",
  "ggggggkkkkgggggg",
  "gsgggggggggggsgg",
  "gggggggslggggggg",
  "GggggggggggggggG",
  "GGGGGGGGGGGGGGGG",
];
const GHAST_ANGRY_FACE = [
  ...GHAST_FACE.slice(0, 5),
  "ggkkkkggggkkkkgg",
  "ggkrrkggggkrrkgg",
  "ggkkkkggggkkkkgg",
  "gggtgsggggggtggg",
  "ggggkkkkkkkkgggg",
  "ggggkrrrrrrkgggg",
  "ggggkkkkkkkkgggg",
  ...GHAST_FACE.slice(12),
];
/** Tentacules : trois devant (blancs), deux derrière (gris) ; `sway` décale le bout de la moitié d'entre eux. */
function tentacles(lengths: number[], sway: boolean) {
  const columns: [number, string][] = [
    [1, "g"],
    [4, "G"],
    [7, "g"],
    [10, "G"],
    [13, "g"],
  ];
  return Array.from({ length: Math.max(...lengths) }, (_, y) => {
    const row = [..."................"];
    columns.forEach(([x, mark], index) => {
      if (y >= lengths[index]) return;
      const at = sway && index % 2 === 0 && y > lengths[index] / 2 ? x + 1 : x;
      row[at] = row[at + 1] = y === lengths[index] - 1 ? "G" : mark;
    });
    return row.join("");
  });
}
const GHAST_PALETTE = { g: "#f4f4f4", s: "#e3e3e3", l: "#d6d6d6", G: "#cdcdcd", k: "#3c3c3c", m: "#9a9a9a", t: "#b1b1b1", r: "#d83a2a" };
const GHAST = { frames: [[...GHAST_FACE, ...tentacles([9, 7, 12, 9, 10], false)], [...GHAST_FACE, ...tentacles([10, 8, 11, 7, 11], true)]], palette: GHAST_PALETTE };
const GHAST_ANGRY = { frames: [[...GHAST_ANGRY_FACE, ...tentacles([9, 7, 12, 9, 10], false)], [...GHAST_ANGRY_FACE, ...tentacles([10, 8, 11, 7, 11], true)]], palette: GHAST_PALETTE };

/**
 * Arpenteur, comme en jeu sur la lave : gros corps rouge carré moucheté de clair, œil sombre et
 * bouche à l'avant, filaments violet sombre dressés sur le dessus qui ondulent, et deux
 * pattes courtes qui balancent depuis la hanche, l'une après l'autre (celle de derrière plus sombre).
 */
function strider(step: 1 | -1) {
  const c = canvas(24, 32);
  const leg = (direction: number, mark: string) => {
    for (let width = 0; width < 4; width++) c.line(9 + width, 20, 9 + width + direction * 3, 31, mark);
  };
  leg(-step, "D");
  c.rect(3, 6, 16, 14, "b");
  c.rect(3, 18, 16, 2, "B");
  c.rect(3, 6, 1, 12, "B");
  for (const [x, y] of [[5, 8], [9, 7], [7, 12], [12, 10], [15, 15], [10, 16], [5, 15], [14, 7]]) c.set(x, y, "l");
  c.rect(16, 9, 2, 2, "k");
  c.rect(13, 14, 6, 1, "m");
  for (let index = 0; index < 6; index++) {
    const x = Math.round(4 + index * 2.6);
    const lean = (index % 2 ? 1 : -1) * step;
    c.line(x, 5, x + lean, 1, "f");
    c.set(x + lean, 0, "F");
  }
  leg(step, "L");
  return c.rows();
}
const STRIDER = {
  frames: [strider(1), strider(-1)],
  palette: { b: "#b5432f", B: "#8c2e22", l: "#cf6a4d", k: "#1b0f0f", m: "#5c1a12", f: "#3a1a24", F: "#6b2f45", L: "#a8402e", D: "#7e2f22" },
  speed: 0.175,
};

/** Enderman de face : yeux violets, bras et jambes interminables. */
const ENDERMAN = {
  frames: [
    [
      ...Array.from({ length: 4 }, () => "..kkkkkkkK.."),
      "..kpPpkpPpK.",
      ...Array.from({ length: 3 }, () => "..kkkkkkkK.."),
      ...Array.from({ length: 12 }, () => "kKkkkkkkkKkK"),
      ...Array.from({ length: 18 }, () => "kK.kK..kK.kK"),
      ...Array.from({ length: 12 }, () => "...kK..kK..."),
    ],
  ],
  palette: { k: "#151515", K: "#0a0a0a", p: "#e27bf7", P: "#c22df0" },
};

/** Grille à dessiner par rectangles et par traits, rendue en lignes pour `Sprite`. */
function canvas(width: number, height: number) {
  const grid = Array.from({ length: height }, () => Array<string>(width).fill("."));
  const set = (x: number, y: number, mark: string) => {
    if (y >= 0 && y < height && x >= 0 && x < width) grid[y][x] = mark;
  };
  return {
    set,
    rect(x: number, y: number, w: number, h: number, mark: string) {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, mark);
    },
    line(x0: number, y0: number, x1: number, y1: number, mark: string) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let step = 0; step <= steps; step++) set(Math.round(x0 + ((x1 - x0) * step) / steps), Math.round(y0 + ((y1 - y0) * step) / steps), mark);
    },
    get: (x: number, y: number) => grid[y]?.[x],
    rows: () => grid.map((row) => row.join("")),
  };
}

/**
 * Ender Dragon de profil, tourné vers la droite : grandes ailes de chauve-souris (membrane sombre,
 * os noirs, bord festonné) levées puis baissées, piques sur le dos, la queue et la tête, yeux violets.
 * Le corps occupe les mêmes lignes dans les deux images : seules les ailes bougent.
 */
/**
 * Enderman de profil, vers la droite, en marche : un pas (jambe et bras de devant écartés, ceux de
 * derrière, plus sombres, à l'opposé), puis les jambes qui se croisent ; l'œil violet sur le côté.
 */
function endermanWalk() {
  const draw = (stride: 1 | 0) => {
    const c = canvas(14, 50);
    const limb = (x0: number, y0: number, x1: number, y1: number, mark: string) => {
      c.line(x0, y0, x1, y1, mark);
      c.line(x0 + 1, y0, x1 + 1, y1, mark);
    };
    limb(5, 20, 5 - 4 * stride, 49, "K");
    limb(4, 9, 4 + 3 * stride, 37, "K");
    c.rect(3, 0, 8, 8, "k");
    c.set(9, 4, "p");
    c.set(10, 4, "P");
    c.rect(5, 8, 4, 12, "k");
    limb(6, 20, 6 + 4 * stride, 49, "k");
    limb(8, 9, 8 - 3 * stride, 37, "k");
    return c.rows();
  };
  return [draw(1), draw(0)];
}
const ENDERMAN_WALK = { frames: endermanWalk(), palette: { k: "#1a1a1a", K: "#050505", p: "#e27bf7", P: "#c22df0" } };

const WING = 18;

/** Aile de l'Ender Dragon : sommet au-dessus de l'épaule, doigts jusqu'au bord festonné, vers l'arrière ; `flip` : baissée. */
function drawWing(c: ReturnType<typeof canvas>, top: number, flip: boolean) {
  const row = (y: number) => (flip ? top + WING - 1 - y : top + y);
  const apex = 33;
  const tips = [2, 11, 20, 29];
  for (let y = 0; y < WING; y++) for (let x = Math.round(apex - (apex - tips[0]) * Math.min(1, y / (WING - 2))); x <= 34; x++) c.set(x, row(y), "w");
  for (let index = 0; index < tips.length - 1; index++) {
    const [a, b] = [tips[index], tips[index + 1]];
    for (let x = a + 1; x < b; x++) {
      const depth = Math.round(3 * Math.sin((Math.PI * (x - a)) / (b - a)));
      for (let d = 0; d < depth; d++) c.set(x, row(WING - 1 - d), ".");
    }
  }
  for (const tip of tips) c.line(apex, row(0), tip, row(tip === tips[0] ? WING - 2 : WING - 1), "W");
  c.line(34, row(0), 34, row(WING - 1), "W");
}

function dragon() {
  const draw = (up: boolean) => {
    const c = canvas(60, WING * 2 + 9);
    const body = WING - 3;
    const wing = (top: number, flip: boolean) => drawWing(c, top, flip);
    if (up) wing(0, false);
    // Queue qui s'affine, corps, cou et tête.
    c.rect(0, body + 5, 10, 2, "k");
    c.rect(10, body + 4, 10, 4, "k");
    c.rect(20, body + 3, 16, 6, "k");
    c.rect(21, body + 8, 14, 1, "K");
    c.rect(36, body + 3, 8, 3, "k");
    c.rect(44, body + 1, 10, 5, "k");
    c.rect(54, body + 2, 4, 3, "k");
    c.rect(46, body + 6, 10, 1, "K");
    c.set(56, body + 2, "K");
    c.set(49, body + 2, "p");
    c.set(50, body + 2, "p");
    // Piques du dos, de la queue et de la nuque.
    for (let x = 2; x < 44; x += 3) c.set(x, (x < 10 ? body + 5 : x < 20 ? body + 4 : x < 36 ? body + 3 : body + 3) - 1, "g");
    c.set(45, body, "g");
    c.set(47, body, "g");
    // Pattes repliées.
    c.rect(23, body + 9, 2, 3, "K");
    c.rect(32, body + 9, 2, 3, "K");
    if (!up) wing(body + 6, true);
    return c.rows();
  };
  return [draw(true), draw(false)];
}
const DRAGON = { frames: dragon(), palette: { k: "#1b1b1b", K: "#0d0d0d", g: "#3d3d3d", W: "#0a0a0a", w: "#3a3646", p: "#d23cff" } };

/** Pièces de l'Ender Dragon articulé (`Dragon`), de profil vers la droite, en pixels du jeu. */
const DRAGON_PARTS = {
  head: ["....gg......", "..kkkkkkk...", "kkkkkkkpkkk.", "kkkkkkkkkkkk", "kkkkkkkkkkKK"],
  jaw: ["KKKKKKKKKK", "..KKKKKK.."],
  neck: ["g...", "kkkk", "kkkk", "KKKK"],
  body: ["..g...g...g...g.", "kkkkkkkkkkkkkkkk", "kkkkkkkkkkkkkkkk", "kkkkkkkkkkkkkkkk", "kkkkkkkkkkkkkkkk", ".KKKKKKKKKKKKKK.", "..KK.......KK...", "..KK.......KK..."],
  tail: ["g...", "kkkk", "KKKK"],
  wing: (() => {
    const c = canvas(35, WING);
    drawWing(c, 0, false);
    return c.rows();
  })(),
};
/** Distances le long du corps, depuis la nuque (en pixels du jeu) : anneaux du cou, centre du corps, anneaux de la queue qui s'affinent. */
const NECK_AT = [2, 5.5, 9];
const BODY_AT = 19;
const TAIL_RINGS = Array.from({ length: 12 }, (_, index) => 1 - index * 0.045).reduce<{ at: number; scale: number }[]>(
  (rings, scale) => [...rings, { at: rings.length ? rings[rings.length - 1].at + 3.4 * scale : 28.5, scale }],
  [],
);

// ── Paysage ─────────────────────────────────────────────────────────────────

/** Collines en marches de blocs, sur toute la largeur. */
export function Hills({ heights, className }: { heights: number[]; className: string }) {
  const top = Math.max(...heights);
  return (
    <svg viewBox={`0 0 ${heights.length} ${top}`} preserveAspectRatio="none" shapeRendering="crispEdges" className={cn("absolute inset-x-0 bottom-0 w-full", className)}>
      <path d={heights.map((height, x) => `M${x} ${top - height}h1V${top}h-1z`).join("")} fill="currentColor" />
    </svg>
  );
}

// Reliefs fixes, calculés une fois : les mêmes à chaque ouverture.
export const FAR = Array.from({ length: 48 }, (_, x) => 6 + Math.round(2.5 * Math.sin(x / 4) + 1.5 * Math.sin(x / 1.7)));
export const NEAR = Array.from({ length: 40 }, (_, x) => 3 + Math.round(1.6 * Math.sin(x / 3 + 1) + Math.sin(x / 1.3)));

/** Sol vu de côté : bord en haut, texture facultative répétée sur toute la strate en dessous. */
function Ground({ rows, texture, palette, fill, unit, height, className, style }: { rows: readonly string[]; texture?: readonly string[]; palette: Palette; fill: string; unit: number; height: string; className?: string; style?: CSSProperties }) {
  const layers = texture ? [rows, texture] : [rows];
  return (
    <div
      className={cn("absolute bottom-0", className ?? "inset-x-0")}
      style={{
        height,
        backgroundColor: fill,
        backgroundImage: layers.map((layer) => pixelImage(layer, palette)).join(", "),
        backgroundRepeat: texture ? "repeat-x, repeat" : "repeat-x",
        backgroundSize: layers.map((layer) => `${layer[0].length * unit}px ${layer.length * unit}px`).join(", "),
        ...style,
      }}
    />
  );
}

/** Objet du décor posé à `x` (% de la largeur), pieds sur `bottom`. */
function Placed({ x, bottom, children, className, style, onClick, nodeRef }: { x: string; bottom: string; children: ReactNode; className?: string; style?: CSSProperties; onClick?: () => void; nodeRef?: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={nodeRef} className={cn("absolute -translate-x-1/2", className)} style={{ left: x, bottom, ...style }} onClick={onClick}>
      {children}
    </div>
  );
}

const OAK = { frames: [[".HHH.", ".HLL.", "HLLLl", "LLLll", "LLlll", "..t..", "..t..", "..T..", "..t.."]], palette: { H: "#638d46", L: "#497536", l: "#355b2b", t: "#795a36", T: "#60452b" } };
/** Bouleau à deux pixels par bloc : tronc blanc continu, marques noires fines comme sur l'écorce du jeu. */
const BIRCH = {
  frames: [
    [
      ..."..HHHLLL..|..HLLlLL..|HLLLLLLLll|llLLLLllll".split("|").flatMap((row) => [row, row]),
      ..."ww|wb|ww|ww|bw|ww|ww|wW|ww|bw|ww|ww".split("|").map((trunk) => `....${trunk}....`),
    ],
  ],
  palette: { H: "#91ad61", L: "#78954c", l: "#5a763b", w: "#e8e4d8", W: "#c9c4b6", b: "#353830" },
};
const POPPY = { frames: [[".h.", "rRr", ".g.", "lg."]], palette: { h: "#ed7860", r: "#c64a36", R: "#96352c", g: "#48743a", l: "#668f45" } };
const DANDELION = { frames: [[".h.", "yYy", ".g.", ".gl"]], palette: { h: "#f4dd7d", y: "#e0bd4b", Y: "#af8d31", g: "#48743a", l: "#668f45" } };
const FOREST_FLOWERS = [21, 24, 77, 80].map((x, index) => ({
  x: x + (fraction(0.31 + index * 0.7548776662) - 0.5) * 2.4,
  unit: 3 + Math.floor(fraction(0.22 + index * 0.569840291) * 3),
  sprite: fraction(0.2 + index * 0.7548776662) > 0.55 ? DANDELION : POPPY,
  flip: index % 3 === 0,
}));
const GRASS = {
  rows: ["GGhGGgGGGGhGGgGG", "gGGgGGgGgGGgGGGg", "dGdddGddddGddGdd"],
  texture: ["ddDdddddddddddHd", "dHddddddddDddddd", "ddddddpddddddDdd", "ddHddddddddddddd", "Dddddddddpdddddd", "ddddHdddDddddddd"],
  palette: { G: "#629143", g: "#4b7935", h: "#7ba454", d: "#7a5230", D: "#744e2d", H: "#805632", p: "#7e5633" },
};
const STONE = { rows: ["ssSssssHssssSsss", "SssssSssssSssssH"], palette: { s: "#6e6b61", S: "#5c5a52", H: "#848174" } };

/**
 * Le rythme des pas suit l'attribut de déplacement du jeu : araignée 0,3, squelette et cochon 0,25,
 * zombie et mouton 0,23, vache 0,2… La distance parcourue reste indépendante de la taille du ciel.
 */
const pace = (speed: number) => 0.184 / speed;

type MobSprite = (Raster | Articulated) & { speed: number };

/** Seuls les monstres nocturnes sont des cibles ; les autres sprites gardent leur rôle décoratif. */
function NightTarget({ phase, kind, onDefeat, children }: { phase?: NightMobPhase; kind?: MobKind; onDefeat?: () => void; children: ReactNode }) {
  if (!kind || !onDefeat) return children;
  const names: Record<MobKind, string> = { zombie: "le zombie", husk: "le zombie momifié", skeleton: "le squelette", creeper: "le creeper", spider: "l’araignée" };
  const burning = phase === "dawn" && (kind === "zombie" || kind === "skeleton");
  return <button type="button" className={cn("sky-night-mob", phase && `sky-night-${phase}`)} aria-label={`Éliminer ${names[kind]}`} disabled={phase !== "alive"} onClick={onDefeat} data-mob={kind} data-phase={phase} data-burning={burning} style={{ "--night-exit": `${phase === "hit" ? NIGHT_MOB_HIT_MS : NIGHT_MOB_DAWN_MS}ms` } as CSSProperties}>
    <span className="sky-night-body">{children}</span>
    {burning && <svg className="sky-night-fire" viewBox="0 0 24 32" preserveAspectRatio="none" aria-hidden shapeRendering="crispEdges">
      <g className="sky-night-flames">
        <path d="M2 32V23H4V17H6V22H8V12H10V6H12V15H14V10H16V18H18V14H20V23H22V32Z" fill="#d96024" />
        <path d="M4 32V25H6V20H8V25H10V16H12V12H14V23H16V19H18V26H20V32Z" fill="#f2a83b" />
        <path d="M8 32V26H10V24H12V19H14V28H16V25H18V32Z" fill="#f7da75" />
      </g>
    </svg>}
    {phase === "hit" && <svg className="sky-night-puffs" viewBox="0 0 32 32" aria-hidden shapeRendering="crispEdges"><path d="M2 13h3v3H2zM9 4h3v3H9zM23 7h4v4h-4zM26 22h3v3h-3zM14 24h4v4h-4zM4 24h2v2H4z" fill="#ddd9ce" /></svg>}
  </button>;
}

/** Le déplacement natif se suspend à sa position réelle, puis reprend sans saut. */
function Wanderer({ sprite, from, to, floor, unit = 2, hop, paused = false, period = pace(sprite.speed), back, stationary, phase, onDefeat }: { sprite: MobSprite; from: number; to: number; floor: string; unit?: number; hop?: boolean; paused?: boolean; period?: number; back?: boolean; stationary?: boolean; phase?: NightMobPhase; onDefeat?: () => void }) {
  const position = useRef<HTMLDivElement>(null);
  const movement = useRef<Animation | null>(null);
  const stopped = useRef(paused);
  stopped.current = paused;
  const [motionReduced, setMotionReduced] = useState(reducedMotion);
  const [state, setState] = useState({ x: (from + to) / 2, walking: false, facing: back ? -1 : 1 });
  useLayoutEffect(() => {
    const node = position.current;
    if (!node) return;
    let x = (from + to) / 2;
    let timer = 0;
    node.style.left = `${x}%`;
    setState({ x, walking: false, facing: back ? -1 : 1 });
    const rest = () => { timer = window.setTimeout(go, between(2000, 7000)); };
    const go = () => {
      if (stationary || stopped.current || document.hidden || reducedMotion()) return rest();
      const target = between(from, to);
      const width = node.offsetParent?.clientWidth ?? 0;
      const distance = Math.abs(target - x) / 100 * width;
      if (distance < 3) return rest();
      const seconds = distance / (sprite.speed * 65 * unit / 2);
      setState((now) => ({ ...now, walking: true, facing: Math.sign(target - x) }));
      const animation = node.animate([{ left: `${x}%` }, { left: `${target}%` }], { duration: seconds * 1000, easing: "linear", fill: "both" });
      movement.current = animation;
      animation.onfinish = () => {
        x = target;
        node.style.left = `${x}%`;
        animation.cancel();
        movement.current = null;
        setState((now) => ({ ...now, x, walking: false }));
        rest();
      };
    };
    const sync = () => {
      const reduced = reducedMotion();
      setMotionReduced(reduced);
      if (stopped.current || reduced) movement.current?.pause();
      else movement.current?.play();
    };
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    media.addEventListener("change", sync);
    sync();
    if (!stationary) rest();
    return () => {
      window.clearTimeout(timer);
      if (movement.current) { movement.current.onfinish = null; movement.current.cancel(); movement.current = null; }
      observer.disconnect();
      media.removeEventListener("change", sync);
    };
  }, [sprite, from, to, unit, back, stationary]);
  useEffect(() => {
    if (paused || motionReduced) movement.current?.pause();
    else movement.current?.play();
  }, [paused, motionReduced]);
  const walking = state.walking && !paused && !motionReduced;
  return <Placed nodeRef={position} x={`${state.x}%`} bottom={floor}>
    <NightTarget phase={phase} kind={sprite.mob} onDefeat={onDefeat}>
      <div className={hop && walking ? "sky-hop" : undefined} style={hop ? { animationDuration: "0.65s" } : undefined}>
        <Sprite {...sprite} unit={unit} period={period} flip={state.facing < 0} still={!stationary && !walking} />
      </div>
    </NightTarget>
  </Placed>;
}

/**
 * Mobs terrestres : des couloirs séparés réservent leur largeur, le jour comme la nuit.
 * Les animaux attendent la fin de la disparition nocturne avant d'occuper leurs couloirs.
 */
type Roamer = { sprite: MobSprite; unit?: number; period?: number; back?: boolean; hop?: boolean; stationary?: boolean };
type Patrol = { mob: Roamer; floor: string; from: number; to: number; unit: number; index: number; phase?: NightMobPhase; onDefeat?: () => void };
function PatrolMob({ mob, floor, from, to, unit, index, phase, onDefeat }: Patrol) {
  const paused = phase !== undefined && phase !== "alive";
  return <Wanderer {...mob} floor={floor} from={from} to={to} unit={unit} period={(mob.period ?? pace(mob.sprite.speed)) * (0.86 + index % 5 * 0.07)} paused={paused} phase={phase} onDefeat={onDefeat} />;
}

function NightRoamer({ dark, ...props }: Patrol & { dark: boolean }) {
  const { phase, defeat } = useNightMob(dark);
  if (phase === "absent") return null;
  return <PatrolMob {...props} phase={phase} onDefeat={defeat} />;
}

function Roamers({ day = [], night = [], permanent = [], dark, floor }: { day?: Roamer[]; night?: Roamer[]; permanent?: Roamer[]; dark: boolean; floor: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const { phase } = useNightMob(dark);
  const nocturnal = phase !== "absent";
  const entries = [...permanent.map((mob, index) => ({ mob, key: `permanent-${index}`, night: false })), ...(nocturnal ? night : day).map((mob, index) => ({ mob, key: `${nocturnal ? "night" : "day"}-${index}`, night: nocturnal }))];
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  const widths = entries.map(({ mob }) => {
    if (mob.sprite.mob) {
      const { width, scale } = MOB_GEOMETRY[mob.sprite.mob];
      return width * scale * (mob.unit ?? 2);
    }
    return Math.max(...mob.sprite.frames.flatMap((frame) => frame.map((row) => row.length))) * (mob.unit ?? 2);
  });
  const layout = patrolLanes(width || 1, widths);
  return <div ref={root} className="pointer-events-none absolute inset-0">
    {width > 0 && entries.map(({ mob, key, night }, index) => {
      const lane = layout.lanes[index];
      const props = { mob, floor, ...lane, unit: (mob.unit ?? 2) * layout.scale, index };
      return night ? <NightRoamer key={key} {...props} dark={dark} /> : <PatrolMob key={key} {...props} />;
    })}
  </div>;
}

const FOREST_DAY: Roamer[] = [
  { sprite: SHEEP },
  { sprite: PIG },
  { sprite: COW, back: true },
];
const FOREST_NIGHT: Roamer[] = [
  { sprite: ZOMBIE },
  { sprite: SKELETON, back: true },
  { sprite: SPIDER },
  { sprite: CREEPER },
];
const VILLAGE_ANIMALS: Roamer[] = [{ sprite: PIG, back: true }];
const VILLAGE_DAY: Roamer[] = [...VILLAGE_ANIMALS, { sprite: { ...FARMER, speed: 0.25 } }, { sprite: { ...NITWIT, speed: 0.25 }, back: true }];
const VILLAGE_CHICKENS: Roamer[] = [
  { sprite: { ...CHICKEN, speed: 0.25 }, stationary: true, period: 1.6 },
  { sprite: { ...CHICKEN, speed: 0.25 }, stationary: true, period: 2, back: true },
  { sprite: { ...CHICKEN, speed: 0.25 }, stationary: true, period: 2.4 },
];
const VILLAGE_NIGHT: Roamer[] = [
  { sprite: ZOMBIE },
  { sprite: ZOMBIE, back: true },
  { sprite: SKELETON },
  { sprite: CREEPER },
];
const DESERT_RABBITS: Roamer[] = [{ sprite: RABBIT, unit: 3, hop: true }, { sprite: RABBIT, unit: 3, hop: true, back: true }];
const DESERT_DAY: Roamer[] = [{ sprite: { ...CAMEL, speed: 0.16 }, unit: 3, period: pace(0.16) * 1.3 }];
const DESERT_NIGHT: Roamer[] = [
  { sprite: HUSK },
  { sprite: HUSK, back: true },
  { sprite: SKELETON, back: true },
  { sprite: SPIDER },
  { sprite: CREEPER },
];

/** Lisière de forêt : chênes et bouleaux, fleurs dans l'herbe ; le jour abeilles et animaux, la nuit les monstres. */
function Forest({ out, dark }: { out: boolean; dark: boolean }) {
  return (
    <>
      <Hills heights={FAR} className="h-[30%] text-[#123a22]/55" />
      {[3, 9, 15, 22, 58, 66, 73, 80, 88, 95].map((x, index) => (
        <Placed key={x} x={`${x}%`} bottom="11%" style={{ filter: "brightness(0.7) saturate(0.8)" }}>
          {index % 3 === 1 ? <Sprite {...BIRCH} unit={2} /> : <Sprite {...OAK} unit={4 + (index % 2)} />}
        </Placed>
      ))}
      <Ground {...GRASS} fill="#7a5230" unit={5} height="12%" />
      <Ground {...STONE} fill="#5c5a52" unit={3} height="min(6px, 3%)" />
      <Placed x="5%" bottom="calc(12% - 2px)">
        <Sprite {...OAK} unit={11} />
      </Placed>
      <Placed x="16%" bottom="calc(12% - 2px)">
        <Sprite {...BIRCH} unit={5} />
      </Placed>
      <Placed x="86%" bottom="calc(12% - 2px)">
        <Sprite {...BIRCH} unit={5} />
      </Placed>
      <Placed x="97%" bottom="calc(12% - 2px)">
        <Sprite {...OAK} unit={12} />
      </Placed>
      {FOREST_FLOWERS.map((flower) => (
        <Placed key={flower.x} x={`${flower.x}%`} bottom="calc(12% - 2px)">
          <Sprite {...flower.sprite} unit={flower.unit} flip={flower.flip} />
        </Placed>
      ))}
      {out &&
        [
          { x: "22%", bottom: "17%" },
          { x: "78%", bottom: "19%" },
        ].map((bee, index) => (
          <Placed key={bee.x} x={bee.x} bottom={bee.bottom} className="sky-bob" style={{ animationDelay: `${-index * 1.3}s` }}>
            <Sprite {...BEE} unit={2} period={0.16} flip={index === 1} />
          </Placed>
        ))}
      <Roamers day={FOREST_DAY} night={FOREST_NIGHT} dark={dark} floor="calc(12% - 2px)" />
    </>
  );
}

/** Maison des plaines : murs de planches, poutres de chêne, toit en escalier, cheminée de pierre. */
const HOUSE = {
  frames: [
    [
      "..........cc..",
      "......rr..cc..",
      ".....rrrr.cc..",
      "....rrrrrrcc..",
      "...rrrrrrrrr..",
      "..rrrrrrrrrrr.",
      ".rrrrrrrrrrrrr",
      "RRRRRRRRRRRRRR",
      ".LppppppppppL.",
      ".LpggppppggpL.",
      ".LpggppppggpL.",
      ".LppppddppppL.",
      ".LppppddppppL.",
      ".LppppddppppL.",
      ".cccccccccccc.",
    ],
  ],
  palette: { r: "#6a4526", R: "#4e321b", p: "#b38a52", L: "#6b4a2a", g: "#9fc8e0", d: "#7a5530", c: "#7d7d7d" },
};
/** Maisons du village : `x` en %, `unit`, et la cheminée qui fume. */
const HOUSES = [
  { x: "7%", unit: 6, smoke: true },
  { x: "19%", unit: 4, smoke: false },
  { x: "91%", unit: 6, smoke: true },
];
const WHEAT = { rows: ["y..y..y.", "Yy.Yy.Yy", "yY.yY.yY", "g..g..g.", "gg.gg.gg", "ffffffff", "FfffFfff"], palette: { y: "#e0c25a", Y: "#b8952f", g: "#7a8f2f", f: "#4a3220", F: "#3a2618" } };
const VILLAGE_FLOOR = "calc(12% - 2px)";
/** Villageois qui flânent : un peu moins vite que leur vitesse de fuite en jeu. */

/** Fumée de cheminée : carrés gris qui montent et s'effacent. */
function Smoke({ x, bottom }: { x: string; bottom: string }) {
  return (
    <Placed x={x} bottom={bottom}>
      {[0, 1, 2].map((index) => (
        <div key={index} className="sky-rise absolute size-2 bg-[#cfcfcf]/60" style={{ left: index * 3 - 4, animationDuration: "4s", animationDelay: `${-index * 1.35}s` }} />
      ))}
    </Placed>
  );
}

/** Village des plaines : maisons, champ de blé, poules ; le jour villageois et cochon, la nuit zombies, squelette et creeper. */
function Village({ out, dark }: { out: boolean; dark: boolean }) {
  return (
    <>
      <Hills heights={FAR} className="h-[28%] text-[#1d3f2a]/55" />
      <Ground {...GRASS} fill="#7a5230" unit={5} height="12%" />
      <Ground {...STONE} fill="#5c5a52" unit={3} height="min(6px, 3%)" />
      <Ground {...WHEAT} fill="#3a2618" unit={4} height="7%" className="left-[74%] w-[10%]" style={{ bottom: "5%" }} />
      {HOUSES.map((house) => (
        <Placed key={house.x} x={house.x} bottom={VILLAGE_FLOOR}>
          <Sprite {...HOUSE} unit={house.unit} />
          {house.smoke && <Smoke x="75%" bottom="100%" />}
        </Placed>
      ))}
      <Roamers permanent={VILLAGE_CHICKENS} day={out ? VILLAGE_DAY : VILLAGE_ANIMALS} night={VILLAGE_NIGHT} dark={dark} floor={VILLAGE_FLOOR} />
    </>
  );
}

/** Fenêtres des maisons allumées le soir, posées sur celles du décor, hors de son assombrissement. */
function VillageLights() {
  return (
    <>
      {HOUSES.map((house) => (
        <Placed key={house.x} x={house.x} bottom={VILLAGE_FLOOR} style={{ filter: "drop-shadow(0 0 6px rgb(255 200 90 / 0.8))" }}>
          <Sprite frames={HOUSE.frames} palette={{ g: "#ffd36b" }} unit={house.unit} />
        </Placed>
      ))}
    </>
  );
}

const SAND = { rows: ["....hs....hsss..", "..shssshsssshsss", "ssssSsssshssSsss", "sSssssssSsssssss", "tttStttttttStttt", "TtttttTtttttTttt"], palette: { h: "#e6d9ad", s: "#d8c99a", S: "#c3b183", t: "#c2b07a", T: "#ad9a64" } };
const CACTUS = {
  frames: [["ChcC", "khcC", "ChcC", "Chcc", "CcCk", "ChcC", "khcC", "ChcC", "CcCC", "Chcc", "ChcC", "CcCk"]],
  palette: { h: "#80a45b", c: "#638941", C: "#476b32", k: "#32452a" },
};
const DEAD_BUSH = { frames: [["b...b.", ".b.b.b", "..bb..", ".b.b..", "..b..."]], palette: { b: "#7a5a32" } };
const TEMPLE = {
  frames: [
    [
      "..T...............T..",
      ".TTT.............TTT.",
      ".TOT......S......TOT.",
      ".TTT.....SSS.....TTT.",
      ".TTT....SSSSS....TTT.",
      ".TOT...SSOOOSS...TOT.",
      ".TTT..SSSSSSSSS..TTT.",
      ".TTT.SSSSSSSSSSS.TTT.",
      "SSSSSSSSOOOOOSSSSSSSS",
      "SSSSSSSSSSdSSSSSSSSSS",
      "SSSSSSSSSdddSSSSSSSSS",
    ],
  ],
  palette: { S: "#d9c793", T: "#cbb57b", O: "#c06a2f", d: "#6b5a3a" },
};

/** Désert : dunes, temple au loin, cactus et arbustes morts ; lapins et dromadaire le jour, la nuit husks, squelette, araignée et creeper. */
function Desert({ out, dark }: { out: boolean; dark: boolean }) {
  return (
    <>
      <Hills heights={FAR} className="h-[28%] text-[#c9a768]/45" />
      <Placed x="84%" bottom="11%" style={{ filter: "brightness(0.85) saturate(0.85)" }}>
        <Sprite {...TEMPLE} unit={4} />
      </Placed>
      <Ground {...SAND} fill="#ad9a64" unit={5} height="13%" />
      {[
        { x: "5%", unit: 6 },
        { x: "16%", unit: 4 },
        { x: "95%", unit: 6 },
      ].map((cactus) => (
        <Placed key={cactus.x} x={cactus.x} bottom="calc(13% - 4px)">
          <Sprite {...CACTUS} unit={cactus.unit} />
        </Placed>
      ))}
      {["10%", "22%", "76%"].map((x) => (
        <Placed key={x} x={x} bottom="calc(13% - 4px)">
          <Sprite {...DEAD_BUSH} unit={3} />
        </Placed>
      ))}
      <Roamers permanent={DESERT_RABBITS} day={out ? DESERT_DAY : undefined} night={DESERT_NIGHT} dark={dark} floor="calc(13% - 4px)" />
    </>
  );
}

/**
 * Paysage du monde normal, sous le ciel de `HomeSky` : assombri la nuit et sous un ciel couvert,
 * sauf les fenêtres éclairées du village (`lit`). `out` : villageois, abeilles et dromadaire dehors (le
 * jour, sans pluie) ; la nuit (`night` d'au moins 0,5), les monstres prennent la place des animaux.
 */
export function Landscape({ scene, night, cover, lit, out }: { scene: Scene; night: number; cover: number; lit: boolean; out: boolean }) {
  const shade = (1 - 0.55 * night) * (1 - 0.25 * cover);
  return (
    <>
      <div className="absolute inset-0" style={shade < 1 ? { filter: `brightness(${shade})` } : undefined}>
        {scene === "village" ? <Village out={out} dark={night >= 0.5} /> : scene === "desert" ? <Desert out={out} dark={night >= 0.5} /> : <Forest out={out} dark={night >= 0.5} />}
      </div>
      {scene === "village" && lit && <VillageLights />}
    </>
  );
}

// ── Nether ──────────────────────────────────────────────────────────────────

const NETHERRACK = { rows: ["rrDrrrrrDrrrrrrD", "rrrrrRrrrrrrRrrr", "RrrrDrrrrRrrrDrr", "rrrrrrRrrrrrrrrR", "rrRrrrrrDrrRrrrr", "RrrrrRrrrrrrrrRr"], palette: { r: "#6f2926", R: "#5a1b1b", D: "#8a3a31" } };
const LAVA = { rows: ["llllLlllllllLlll", "lLllllllllLlllll", "llllllyllllllll", "llLllllllLllllll"], palette: { l: "#d9621a", L: "#f28a2a", y: "#ffc04a" } };
const LAVA_FALL = { rows: ["lL", "Ll", "ly", "lL", "Ll", "ll"], palette: { l: "#e0701f", L: "#f59a35", y: "#ffd06a" } };
const FORTRESS = {
  frames: [
    [
      "b...........................b",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "bb..bb....bb....bb....bb..bbb",
      "bb..bb....bb....bb....bb...bb",
      "bb..bb....bb....bb....bb...bb",
      "bb..bb....bb....bb....bb...bb",
      "bb..bb....bb....bb....bb...bb",
    ],
  ],
  palette: { b: "#2a1012" },
};
/** Plafond de netherrack, en dents de scie. */
const CEILING = Array.from({ length: 40 }, (_, x) => 3 + Math.round(1.8 * Math.sin(x / 2.3) + Math.sin(x / 1.1 + 2)));
/** Grappes de pierre lumineuse accrochées au plafond : `x` en %, taille en pixels. */
const GLOWSTONE = [
  { x: "14%", size: 14 },
  { x: "47%", size: 10 },
  { x: "78%", size: 16 },
];
/**
 * Ghast du Nether : il dérive lentement d'un bord à l'autre en se balançant ; toutes les 9 à 18
 * secondes, il ouvre les yeux et la bouche et crache une boule de feu vers le sol, comme en jeu.
 */
function Ghast({ top, unit, seconds, delay, x, opacity }: { top: string; unit: number; seconds: number; delay: number; x: string; opacity: number }) {
  const body = useRef<HTMLDivElement>(null);
  const [angry, setAngry] = useState(false);
  useEffect(() => {
    if (reducedMotion()) return;
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        const node = body.current;
        const scene = node?.closest<HTMLElement>("[data-nether]");
        if (!node || !scene || document.hidden) return next();
        setAngry(true);
        timer = window.setTimeout(() => {
          const box = node.getBoundingClientRect();
          const frame = scene.getBoundingClientRect();
          // Zoom du ciel : les mesures sont en pixels de l'écran, le décor en pixels du calque.
          const scale = frame.width / scene.offsetWidth || 1;
          const mouth = { x: (box.left - frame.left + box.width / 2) / scale, y: (box.top - frame.top + box.width * 0.62) / scale };
          const ground = scene.offsetHeight * 0.9;
          const target = { x: mouth.x + between(-140, 140), y: ground };
          fireball(scene, mouth, Math.atan2(target.y - mouth.y, target.x - mouth.x), ground, "ghast");
          timer = window.setTimeout(() => {
            setAngry(false);
            next();
          }, 600);
        }, 900);
      }, between(9000, 18000));
    };
    next();
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="sky-drift absolute inset-x-0" style={{ top, opacity, "--x": x, animationDuration: `${seconds}s`, animationDelay: `${delay}s` } as CSSProperties}>
      <div ref={body} className="sky-bob w-fit">
        <Sprite {...(angry ? GHAST_ANGRY : GHAST)} unit={unit} period={1.4} />
      </div>
    </div>
  );
}

/** Braises qui montent de la lave, placées par la suite R2. */
const EMBERS = Array.from({ length: 14 }, (_, index) => ({ x: fraction(0.4 + index * 0.7548776662) * 100, seconds: 4 + (index % 4), delay: -((index * 0.9) % 6) }));

/** Nether : plafond de netherrack, pierre lumineuse, forteresse au loin, cascades et lac de lave ; ghasts et arpenteur. */
export function NetherScene() {
  return (
    <div data-nether className="absolute inset-0 bg-linear-to-b from-[#1c0505] via-[#4a100d] to-[#7a2410]">
      <div className="absolute inset-x-0 top-0 h-[16%] rotate-180">
        <Hills heights={CEILING} className="h-full text-[#4a1515]" />
      </div>
      {GLOWSTONE.map((stone) => (
        <div
          key={stone.x}
          className="absolute top-[5%] bg-[#f6d36b]"
          style={{ left: stone.x, width: stone.size, height: stone.size, boxShadow: `inset -${stone.size / 3}px -${stone.size / 3}px 0 #d9a23a, 0 0 24px 8px rgb(246 211 107 / 0.35)` }}
        />
      ))}
      <Placed x="50%" bottom="38%" style={{ opacity: 0.7 }}>
        <Sprite {...FORTRESS} unit={6} />
      </Placed>
      {[
        { top: "20%", unit: 3, seconds: 150, delay: -40, x: "18%", opacity: 0.9 },
        { top: "34%", unit: 2, seconds: 210, delay: -150, x: "66%", opacity: 0.75 },
      ].map((one) => (
        <Ghast key={one.top} {...one} />
      ))}
      <Hills heights={FAR} className="h-[30%] text-[#3a0d0d]" />
      {["15%", "85%"].map((x) => (
        <div
          key={x}
          className="sky-fall absolute top-[12%] bottom-[8%] w-3"
          style={{ left: x, backgroundImage: pixelImage(LAVA_FALL.rows, LAVA_FALL.palette), backgroundSize: "12px 36px", animationDuration: "1.2s", "--fall": "36px" } as CSSProperties}
        />
      ))}
      <Ground
        {...LAVA}
        fill="#d9621a"
        unit={4}
        height="10%"
        className="inset-x-0 sky-fall shadow-[0_-10px_30px_rgb(255_120_40/0.45)]"
        style={{ animationDuration: "6s", "--drift": "64px", "--fall": "0px" } as CSSProperties}
      />
      <Ground {...NETHERRACK} fill="#5a1b1b" unit={5} height="13%" className="left-0 w-[11%]" />
      <Ground {...NETHERRACK} fill="#5a1b1b" unit={5} height="11%" className="right-0 w-[11%]" />
      {/* L'arpenteur ne quitte pas la lave : il y flâne, les pieds dedans. */}
      <Wanderer sprite={STRIDER} from={14} to={86} floor="calc(10% - 12px)" />
      {EMBERS.map((ember, index) => (
        <div
          key={index}
          className="sky-rise absolute bottom-[9%] size-[3px] bg-[#ffb347]"
          style={{ left: `${ember.x}%`, animationDuration: `${ember.seconds}s`, animationDelay: `${ember.delay}s`, "--rise": "-140px" } as CSSProperties}
        />
      ))}
      <div className="absolute inset-0 bg-linear-to-t from-[#ff6a1a]/15 via-transparent to-[#2a0505]/30" />
    </div>
  );
}

// ── End ─────────────────────────────────────────────────────────────────────

const END_STONE = { rows: ["eeheeeeeeeheeeee", "eeeEeeEeeeeEeeEe", "EeeeeeeeehEeeEee", "eeEeeeeeEeeeeeee", "eeeeEeeeeeeEeeee", "EeeeeeeEeeeeeEee"], palette: { h: "#e8e6b7", e: "#d9d9a1", E: "#c8c98c" } };
/** Ciel de l'End : bruit gris violacé, immobile, comme sa texture en jeu. */
const END_SKY = pixelImage(
  Array.from({ length: 24 }, (_, y) => Array.from({ length: 24 }, (_, x) => (fraction(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) > 0.86 ? "n" : ".")).join("")),
  { n: "#3b3050" },
);
/** Îles flottantes au loin : `x` et `top` en %, largeur en blocs. */
const ISLANDS = [
  { x: "14%", top: "30%", width: 7 },
  { x: "62%", top: "22%", width: 5 },
  { x: "84%", top: "40%", width: 6 },
];
/**
 * Piliers d'obsidienne comme ceux du jeu : larges de 3 à 5 blocs, de hauteurs différentes, un bloc de
 * bedrock au sommet et son cristal ; les plus petits sont en cage de barreaux de fer. `far` : au
 * loin, plus sombres, derrière le dragon quand il passe devant.
 */
const PILLARS = [
  { x: "31%", blocks: 3, height: "30%", caged: false, far: true },
  { x: "68%", blocks: 3, height: "34%", caged: false, far: true },
  { x: "6%", blocks: 4, height: "44%", caged: false, far: false },
  { x: "17%", blocks: 3, height: "28%", caged: true, far: false },
  { x: "84%", blocks: 5, height: "52%", caged: false, far: false },
  { x: "95%", blocks: 3, height: "31%", caged: true, far: false },
];
/** Un bloc d'obsidienne ou de bedrock : 6 × 6 pixels de 2 px. */
const BLOCK_PX = 12;
const OBSIDIAN = pixelImage(["oooooo", "oPoooO", "ooooOo", "oOoooo", "oooPoo", "Oooooo"], { o: "#130d1f", O: "#22183b", P: "#3b2a63" });
const BEDROCK = pixelImage(["bBbkbB", "kbbBbb", "bBkbbk", "bbbBkb", "BkbbbB", "bbBkbb"], { b: "#575757", B: "#363636", k: "#7a7a7a" });
/**
 * Endermen : places possibles (en %) et places de départ. Au premier plan, hors des boutons du bas ;
 * au loin, plus petits et plus sombres, derrière les piliers de devant.
 */
const ENDERMEN = {
  near: { spots: [3, 9, 14, 20, 24, 76, 81, 87, 92, 97], start: [9, 21, 81, 92], unit: 2, bottom: "calc(11% - 2px)", height: 100 },
  far: { spots: [1, 23, 26, 74, 77, 99], start: [23, 77], unit: 1, bottom: "calc(11% + 4px)", height: 50 },
};
const CHORUS = {
  frames: [["F.......F", "s...F...s", "sss.s.sss", "..s.s.s..", "..sssss..", "....s....", "....s...F", "....sssss", "....s....", "F...s....", "sssss....", "....s....", "....s....", "....s....", "....s...."]],
  palette: { s: "#7e5a7e", F: "#d9b6d9" },
};

/** Île flottante : dessus en pierre de l'End, dessous qui s'effile. */
function Island({ width }: { width: number }) {
  const rows = Array.from({ length: Math.ceil(width / 2) + 1 }, (_, y) => {
    const span = Math.max(1, width - y * 2);
    const pad = (width - span) / 2;
    return ".".repeat(Math.floor(pad)) + (y === 0 ? "e" : "E").repeat(span) + ".".repeat(Math.ceil(pad));
  });
  return <Sprite frames={[rows]} palette={{ e: "#dfe0a6", E: "#a9aa72" }} unit={6} />;
}

/** Cristal de l'End : cube rose dans des cadres de verre qui tournent, avec sa lueur. */
function Crystal() {
  return (
    <div className="relative grid size-6 place-items-center">
      <div className="sky-spin absolute inset-0 border-2 border-[#f0d6f6]/70" />
      <div className="sky-spin absolute inset-1 border-2 border-[#f0d6f6]/50" style={{ animationDirection: "reverse" }} />
      <div className="size-2.5 bg-[#e070e0] shadow-[0_0_14px_6px_rgb(224_112_224/0.5)]" />
    </div>
  );
}

/** Pilier d'obsidienne, avec son bloc de bedrock, son cristal et, s'il est petit, sa cage. */
function Pillar({ x, blocks, height, caged, far }: (typeof PILLARS)[number]) {
  return (
    <div className="absolute bottom-[10%] -translate-x-1/2" style={{ left: x, width: blocks * BLOCK_PX, height, filter: far ? "brightness(0.7) saturate(0.85)" : undefined }}>
      <div className="absolute inset-0 outline outline-1 outline-[#050309] shadow-[inset_2px_0_0_#56428c,inset_4px_0_0_rgb(86_66_140/0.35),inset_-5px_0_0_rgb(0_0_0/0.5),inset_0_2px_0_#6a54a6]" style={{ backgroundImage: OBSIDIAN, backgroundSize: `${BLOCK_PX}px` }} />
      <div className="absolute bottom-full left-1/2 flex -translate-x-1/2 flex-col items-center">
        <div className="relative mb-1">
          <Crystal />
          {caged && (
            <div
              className="absolute -inset-2 border-t-2 border-[#8d8d8d]"
              style={{ backgroundImage: "repeating-linear-gradient(90deg, #8d8d8d 0 2px, transparent 2px 7px)" }}
            />
          )}
        </div>
        <div style={{ width: BLOCK_PX, height: BLOCK_PX, backgroundImage: BEDROCK, backgroundSize: `${BLOCK_PX}px` }} />
      </div>
    </div>
  );
}

/** Gerbe de particules violettes d'une téléportation, au départ comme à l'arrivée. */
function TeleportBurst({ x, bottom, height }: { x: number; bottom: string; height: number }) {
  return (
    <div className="absolute w-6 -translate-x-1/2" style={{ left: `${x}%`, bottom, height }}>
      {Array.from({ length: 12 }, (_, index) => (
        <div
          key={index}
          className="sky-burst absolute size-[3px] bg-[#cf7cf5]"
          style={
            {
              left: "50%",
              bottom: `${(index * 37) % 100}%`,
              "--dx": `${Math.round(Math.cos(index * 2.4) * 22)}px`,
              "--dy": `${Math.round(Math.sin(index * 2.4) * 18)}px`,
              animationDelay: `${(index % 4) * 40}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * Nuages de souffle de l'Ender Dragon, annoncés aux endermen du premier plan : centre et rayon en %
 * de la largeur du décor, et la durée du nuage (ms).
 */
type Breath = { center: number; radius: number; lasts: number };
const breathListeners = new Set<(breath: Breath) => void>();
/** Durée d'un nuage de souffle au sol, en ms. */
const BREATH_MS = 3600;

/** Côtés du décor où les endermen peuvent marcher (en %), hors des boutons du bas. */
const ENDER_SIDES = [
  [1, 25],
  [75, 99],
];

/**
 * Endermen d'un plan (`near` ou au loin). Toutes les 6 à 14 secondes, chacun fait quelques pas
 * de profil, à pas lents, ou se téléporte comme en jeu vers une place libre de son plan, dans une
 * gerbe de particules violettes au départ et à l'arrivée. Cliqué, il se téléporte aussitôt, comme
 * frappé en jeu ; au premier plan, pris dans le souffle du dragon, il se téléporte hors du nuage,
 * où aucun ne revient tant qu'il dure. Animations réduites : ils ne bougent que si on les clique.
 */
function Endermen({ depth }: { depth: keyof typeof ENDERMEN }) {
  const row = ENDERMEN[depth];
  const spots = useRef(row.start);
  const [shown, setShown] = useState(row.start.map((x) => ({ x, heading: 0, seconds: 0 })));
  const [bursts, setBursts] = useState<{ id: number; x: number }[]>([]);
  const count = useRef(0);
  const timers = useRef<number[]>([]);
  /** Relance l'attente d'un enderman (marche ou téléportation), sauf animations réduites. */
  const later = useRef<(index: number, wait?: number) => void>(() => {});
  /** Nuage de souffle en cours (premier plan) : personne n'y va. */
  const breath = useRef<{ low: number; high: number; until: number } | null>(null);
  const inBreath = (x: number) => {
    const zone = breath.current;
    return zone !== null && Date.now() < zone.until && x >= zone.low && x <= zone.high;
  };

  const move = (index: number, x: number, heading: number, seconds: number) => {
    spots.current = spots.current.map((spot, other) => (other === index ? x : spot));
    setShown((list) => list.map((one, other) => (other === index ? { x, heading, seconds } : one)));
  };
  const teleport = (index: number) => {
    const from = spots.current[index];
    const free = row.spots.filter((spot) => !inBreath(spot) && !spots.current.some((other) => Math.abs(other - spot) < 3));
    const target = free[Math.floor(Math.random() * free.length)] ?? from;
    move(index, target, 0, 0);
    const ids = [++count.current, ++count.current];
    setBursts((list) => [...list, { id: ids[0], x: from }, { id: ids[1], x: target }]);
    window.setTimeout(() => setBursts((list) => list.filter((burst) => !ids.includes(burst.id))), 900);
  };

  useEffect(() => {
    if (reducedMotion()) return;
    const all = timers.current;
    later.current = (index, wait = between(6000, 14000)) => {
      window.clearTimeout(all[index]);
      all[index] = window.setTimeout(() => {
        if (document.hidden) return later.current(index);
        const from = spots.current[index];
        const [low, high] = ENDER_SIDES.find(([left, right]) => from >= left && from <= right) ?? ENDER_SIDES[0];
        const heading = Math.random() < 0.5 ? -1 : 1;
        const to = Math.max(low, Math.min(high, from + heading * between(3, 7)));
        const crowded = inBreath(to) || spots.current.some((spot, other) => other !== index && Math.abs(spot - to) < 3);
        if (Math.random() < 0.45 && Math.abs(to - from) >= 2 && !crowded) {
          // Quelques pas de profil, puis il se remet face à nous.
          const seconds = Math.abs(to - from) * 0.75;
          move(index, to, Math.sign(to - from), seconds);
          window.setTimeout(() => setShown((list) => list.map((one, other) => (other === index && one.x === to ? { ...one, heading: 0 } : one))), seconds * 1000);
          return later.current(index, seconds * 1000 + between(4000, 10000));
        }
        teleport(index);
        later.current(index);
      }, wait);
    };
    row.start.forEach((_, index) => later.current(index));
    // Pris dans le souffle du dragon, il s'en échappe d'un bond, chacun à son temps de réaction.
    const flee = ({ center, radius, lasts }: Breath) => {
      breath.current = { low: center - radius, high: center + radius, until: Date.now() + lasts };
      spots.current.forEach((x, index) => {
        if (!inBreath(x)) return;
        window.clearTimeout(all[index]);
        all[index] = window.setTimeout(() => {
          teleport(index);
          later.current(index);
        }, between(120, 450));
      });
    };
    if (depth === "near") breathListeners.add(flee);
    return () => {
      breathListeners.delete(flee);
      later.current = () => {};
      all.forEach((timer) => window.clearTimeout(timer));
    };
    // `move` et `teleport` ne lisent que des références : pas besoin de relancer les attentes.
  }, [row]);

  return (
    <div className="absolute inset-0" style={depth === "far" ? { filter: "brightness(0.75)" } : undefined}>
      {shown.map((one, index) => (
        <Placed
          key={index}
          x={`${one.x}%`}
          bottom={row.bottom}
          className="pointer-events-auto cursor-pointer"
          style={one.heading ? { transition: `left ${one.seconds}s linear` } : undefined}
          onClick={() => {
            teleport(index);
            later.current(index);
          }}
        >
          <EnderParticles />
          {one.heading ? <Sprite {...ENDERMAN_WALK} unit={row.unit} period={0.8} flip={one.heading < 0} /> : <Sprite {...ENDERMAN} unit={row.unit} />}
        </Placed>
      ))}
      {bursts.map((burst) => (
        <TeleportBurst key={burst.id} x={burst.x} bottom={row.bottom} height={row.height} />
      ))}
    </div>
  );
}

/** Particules violettes des endermen, qui montent et s'éteignent autour d'eux. */
function EnderParticles() {
  return (
    <>
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="sky-rise absolute size-[3px] bg-[#c76cf0]"
          style={{ left: `${index * 30 - 10}%`, bottom: `${20 + index * 15}%`, animationDuration: `${2.4 + index * 0.5}s`, animationDelay: `${-index * 0.7}s`, "--rise": "-30px" } as CSSProperties}
        />
      ))}
    </>
  );
}

/**
 * Passage de l'Ender Dragon : `near`, devant les piliers et en grand, sinon au loin, derrière, en
 * petit. `behavior` : il plane, fait un looping, fait demi-tour par un demi-looping, pique en
 * crachant une boule de feu, ou passe se soigner au rayon d'un cristal. Il part d'un côté ou de
 * l'autre, au hasard.
 */
type DragonPass = { id: number; near: boolean; behavior: "glide" | "loop" | "turn" | "dive" | "heal" };
/**
 * Boule de feu, tout droit jusqu'au sol : celle de l'Ender Dragon, violette, laisse un nuage de
 * souffle qui reste ; celle d'un ghast, orange, explose dans un nuage de fumée.
 */
function fireball(host: HTMLElement, from: Point, angle: number, ground: number, kind: "dragon" | "ghast" = "dragon") {
  const ghastly = kind === "ghast";
  const ball = document.createElement("div");
  ball.className = ghastly
    ? "pointer-events-none absolute top-0 left-0 size-3 bg-[#ffb02e] shadow-[0_0_14px_6px_rgb(255_120_30/0.75)]"
    : "pointer-events-none absolute top-0 left-0 size-3 bg-[#c040ff] shadow-[0_0_12px_5px_rgb(200_80_255/0.7)]";
  ball.style.outline = ghastly ? "3px solid rgb(255 220 120 / 0.55)" : "3px solid rgb(255 160 255 / 0.5)";
  host.append(ball);
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  const distance = dy > 0.15 ? (ground - from.y) / dy : 260;
  const to = { x: from.x + dx * distance, y: from.y + dy * distance };
  ball.animate([{ transform: `translate(${from.x}px, ${from.y}px)` }, { transform: `translate(${to.x}px, ${to.y}px)` }], { duration: (distance / 320) * 1000, easing: "linear" }).onfinish = () => {
    ball.remove();
    if (dy <= 0.15) return;
    const cloud = document.createElement("div");
    cloud.className = "pointer-events-none absolute top-0 left-0";
    cloud.style.transform = `translate(${to.x}px, ${to.y}px)`;
    for (let index = 0; index < 16; index++) {
      const puff = document.createElement("div");
      puff.className = ghastly ? "sky-rise absolute size-2" : "sky-rise absolute size-1";
      const colors = ghastly ? ["#6b6b6b", "#a8a8a8", "#ff9a2e"] : ["#ec9cff", "#b23cff", "#b23cff"];
      const [lasting, spread] = ghastly ? [0.9, 22] : [2.4, 34];
      puff.style.cssText += `left:${Math.round(Math.cos(index * 2.4) * spread)}px;top:${-Math.round(((index * 7) % 5) * 5)}px;background:${colors[index % 3]};animation-duration:${lasting + (index % 4) * 0.25}s;animation-delay:${ghastly ? 0 : -(index % 5) * 0.3}s;--rise:-36px`;
      cloud.append(puff);
    }
    host.append(cloud);
    window.setTimeout(() => cloud.remove(), ghastly ? 1500 : BREATH_MS);
    if (ghastly) return;
    // Les endermen pris dedans s'en échappent ; un peu plus large que les bouffées, comme en jeu.
    const width = host.clientWidth || 1;
    breathListeners.forEach((listener) => listener({ center: (to.x / width) * 100, radius: (46 / width) * 100, lasts: BREATH_MS }));
  };
}

/**
 * L'Ender Dragon articulé : tête à mâchoire, cou en trois anneaux, corps aux deux ailes qui battent
 * depuis l'épaule, queue en douze anneaux qui s'affinent. Chaque pièce suit exactement le chemin de
 * la tête (sa position un peu plus tôt sur la courbe) : le corps ondule et tourne dans la direction
 * du vol, comme en jeu. En passant près d'un cristal, son rayon le soigne ; il rugit parfois, bouche
 * ouverte. Appelle `onDone` quand le bout de la queue a quitté le ciel.
 */
function Dragon({ pass, onDone }: { pass: DragonPass; onDone: () => void }) {
  const unit = pass.near ? 4 : 2;
  const root = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const jaw = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const wings = useRef<(HTMLDivElement | null)[]>([]);
  const necks = useRef<(HTMLDivElement | null)[]>([]);
  const tail = useRef<(HTMLDivElement | null)[]>([]);
  const beam = useRef<SVGLineElement>(null);
  const finish = useRef(onDone);
  finish.current = onDone;

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const [width, height] = [host.clientWidth, host.clientHeight];
    const band = (low: number, high: number) => height * between(low, high);
    const crystals = PILLARS.filter((pillar) => !pillar.far).map((pillar) => ({ x: (parseFloat(pillar.x) / 100) * width, y: height * 0.9 - (parseFloat(pillar.height) / 100) * height - 28 }));
    let fire: Point | null = null;
    // Sens du passage : 1 vers la droite, -1 vers la gauche ; `across(t)` : abscisse à la fraction `t` du trajet.
    const heading = Math.random() < 0.5 ? 1 : -1;
    const across = (t: number) => width * (heading > 0 ? t : 1 - t);
    const offscreen = (direction: number) => (direction > 0 ? width + 300 : -300);
    const sky = (low: number, high: number) => (pass.near ? band(low, high) : band(low * 0.5, high * 0.6));
    const start = { x: offscreen(-heading), y: sky(0.12, 0.26) };
    const center = { x: across(between(0.35, 0.65)), y: sky(0.2, 0.3) };
    const radius = pass.near ? between(60, 90) : between(26, 38);
    // Montée par l'avant, passage sur le dos au sommet, descente par l'arrière.
    const loop = [
      { x: center.x - heading * radius * 2.2, y: center.y + radius },
      { x: center.x, y: center.y + radius },
      { x: center.x + heading * radius, y: center.y },
      { x: center.x, y: center.y - radius },
    ];
    let waypoints: Point[];
    if (pass.behavior === "loop") {
      waypoints = [start, ...loop, { x: center.x - heading * radius, y: center.y }, { x: center.x, y: center.y + radius }, { x: center.x + heading * radius * 2.2, y: center.y + radius * 0.9 }, { x: offscreen(heading), y: sky(0.12, 0.26) }];
    } else if (pass.behavior === "turn") {
      // Demi-looping : au sommet, il repart d'où il venait.
      waypoints = [start, ...loop, { x: center.x - heading * radius * 2.4, y: center.y - radius * 0.8 }, { x: offscreen(-heading), y: sky(0.08, 0.2) }];
    } else if (pass.behavior === "dive" && pass.near) {
      const side = heading > 0 ? (Math.random() < 0.5 ? 0.18 : 0.82) : Math.random() < 0.5 ? 0.82 : 0.18;
      fire = { x: width * side, y: height * 0.6 };
      waypoints = [start, { x: fire.x - heading * width * 0.13, y: band(0.28, 0.36) }, fire, { x: fire.x + heading * width * 0.14, y: band(0.3, 0.4) }, { x: offscreen(heading), y: band(0.12, 0.22) }];
    } else if (pass.behavior === "heal" && pass.near) {
      const crystal = crystals[Math.floor(Math.random() * crystals.length)];
      waypoints = [start, { x: crystal.x - heading * width * 0.16, y: crystal.y - 90 }, { x: crystal.x, y: crystal.y - 55 }, { x: crystal.x + heading * width * 0.16, y: crystal.y - 95 }, { x: offscreen(heading), y: band(0.12, 0.24) }];
    } else {
      waypoints = [start, ...[0.25, 0.55, 0.85].map((t) => ({ x: across(t), y: sky(0.1, 0.3) })), { x: offscreen(heading), y: sky(0.12, 0.28) }];
    }
    const path = flightPath(waypoints);
    const speed = pass.near ? 145 : 90;
    const length = (TAIL_RINGS[TAIL_RINGS.length - 1].at + 4) * unit;
    let fireAt = Number.POSITIVE_INFINITY;
    if (fire) {
      const target = fire;
      const nearest = path.points.reduce((best, point, index) => (Math.hypot(point.x - target.x, point.y - target.y) < Math.hypot(path.points[best].x - target.x, path.points[best].y - target.y) ? index : best), 0);
      fireAt = path.lengths[nearest] - 6 * unit;
    }
    const roarAt = pass.behavior === "dive" ? Number.POSITIVE_INFINITY : path.total * between(0.3, 0.6);
    const ground = height * 0.89;
    const began = performance.now();
    let fired = false;
    let frame = 0;

    /**
     * Pièce posée sur la courbe à `behind` (pixels du jeu) derrière la nuque, tournée dans la direction
     * du vol, et remise à l'endroit dès qu'elle va vers la gauche : après un demi-tour, il vole droit.
     */
    const place = (element: HTMLElement | null | undefined, travelled: number, behind: number, pivot: Point, scale = 1, wobble = 0) => {
      if (!element) return null;
      const spot = path.at(travelled - behind * unit);
      const upright = Math.cos(spot.angle) >= 0 ? 1 : -1;
      element.style.transform = `translate(${spot.x - pivot.x * unit}px, ${spot.y - pivot.y * unit}px) rotate(${spot.angle + wobble}rad) scale(${scale}, ${scale * upright})`;
      return spot;
    };

    const fly = (now: number) => {
      const seconds = (now - began) / 1000;
      const travelled = seconds * speed;
      const roar = travelled > roarAt ? Math.max(0, Math.sin(Math.min(1, (travelled - roarAt) / (speed * 1.4)) * Math.PI)) : 0;
      tail.current.forEach((ring, index) => place(ring, travelled, TAIL_RINGS[index].at, { x: 2, y: 1.5 }, TAIL_RINGS[index].scale));
      const center = place(body.current, travelled, BODY_AT, { x: 8, y: 3.5 });
      necks.current.forEach((ring, index) => place(ring, travelled, NECK_AT[index], { x: 2, y: 2 }));
      const nape = place(head.current, travelled, 0, { x: 0, y: 2.5 }, 1, Math.sin(seconds * 2.2) * 0.08 + Math.sin(seconds * 26) * 0.06 * roar);
      if (jaw.current) jaw.current.style.transform = `rotate(${0.08 + 0.42 * roar}rad)`;
      const flap = Math.cos(seconds * Math.PI * 2 * (pass.near ? 0.85 : 1.1));
      wings.current.forEach((wing, index) => wing && (wing.style.transform = `scaleY(${index ? flap : Math.cos(seconds * Math.PI * 2 * (pass.near ? 0.85 : 1.1) - 0.35)})`));
      // Rayon du cristal le plus proche, s'il passe tout près (devant seulement).
      const line = beam.current;
      if (line && center) {
        const closest = pass.near ? crystals.reduce((best, crystal) => (Math.hypot(crystal.x - center.x, crystal.y - center.y) < Math.hypot(best.x - center.x, best.y - center.y) ? crystal : best)) : null;
        const reach = closest ? Math.hypot(closest.x - center.x, closest.y - center.y) : Number.POSITIVE_INFINITY;
        line.style.opacity = reach < 190 ? String((1 - reach / 190) * (0.75 + 0.25 * Math.sin(seconds * 30))) : "0";
        if (closest) {
          line.setAttribute("x1", String(closest.x));
          line.setAttribute("y1", String(closest.y));
          line.setAttribute("x2", String(center.x));
          line.setAttribute("y2", String(center.y));
        }
      }
      if (!fired && travelled >= fireAt && nape) {
        fired = true;
        fireball(host, { x: nape.x + Math.cos(nape.angle) * 12 * unit, y: nape.y + Math.sin(nape.angle) * 12 * unit }, nape.angle, ground);
      }
      if (travelled < path.total + length) frame = requestAnimationFrame(fly);
      else finish.current();
    };
    frame = requestAnimationFrame(fly);
    return () => cancelAnimationFrame(frame);
  }, [pass, unit]);

  const palette = DRAGON.palette;
  /** Aile accrochée à l'épaule (`shoulder`, en pixels du corps) ; celle de derrière (0) est plus sombre. */
  const wing = (index: number, shoulder: number) => (
    <div
      ref={(element) => {
        wings.current[index] = element;
      }}
      className="absolute"
      style={{ left: (shoulder - 35) * unit, top: (1 - WING) * unit, transformOrigin: `${35 * unit}px ${WING * unit}px`, filter: index ? undefined : "brightness(0.55)" }}
    >
      <Sprite frames={[DRAGON_PARTS.wing]} palette={palette} unit={unit} />
    </div>
  );
  const part = (rows: readonly string[], pivot: Point, ref: (element: HTMLDivElement | null) => void, children?: ReactNode) => (
    <div ref={ref} className="absolute top-0 left-0" style={{ transform: "translateX(-9999px)", transformOrigin: `${pivot.x * unit}px ${pivot.y * unit}px` }}>
      <Sprite frames={[rows]} palette={palette} unit={unit} className="relative" />
      {children}
    </div>
  );
  return (
    <div ref={root} className="pointer-events-none absolute inset-0" style={{ opacity: pass.near ? 1 : 0.7 }}>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <line ref={beam} stroke="#f4c8ff" strokeWidth={2} opacity={0} style={{ filter: "drop-shadow(0 0 3px #d77cff)" }} />
      </svg>
      {TAIL_RINGS.map((_, index) => (
        <div key={index}>{part(DRAGON_PARTS.tail, { x: 2, y: 1.5 }, (element) => (tail.current[index] = element))}</div>
      ))}
      <div
        ref={body}
        className="absolute top-0 left-0"
        style={{ transform: "translateX(-9999px)", transformOrigin: `${8 * unit}px ${3.5 * unit}px` }}
      >
        {wing(0, 9)}
        <Sprite frames={[DRAGON_PARTS.body]} palette={palette} unit={unit} className="relative" />
        {wing(1, 11)}
      </div>
      {NECK_AT.map((_, index) => (
        <div key={index}>{part(DRAGON_PARTS.neck, { x: 2, y: 2 }, (element) => (necks.current[index] = element))}</div>
      ))}
      {part(
        DRAGON_PARTS.head,
        { x: 0, y: 2.5 },
        (element) => {
          head.current = element;
        },
        <div ref={jaw} className="absolute" style={{ left: unit, top: 4 * unit, transformOrigin: "0 0" }}>
          <Sprite frames={[DRAGON_PARTS.jaw]} palette={palette} unit={unit} />
        </div>,
      )}
    </div>
  );
}

/**
 * End : ciel immobile, îles flottantes, piliers d'obsidienne et leurs cristaux, endermen qui se
 * téléportent ; l'Ender Dragon tourne autour des piliers, devant puis au loin, d'un côté ou de
 * l'autre, fait des loopings et des demi-tours, pique, crache ou se soigne comme en jeu. Animations
 * réduites : il reste posé dans le ciel.
 */
export function EndScene() {
  const [pass, setPass] = useState<DragonPass | null>(null);
  const [retry, setRetry] = useState(0);
  const near = useRef(false);
  const still = reducedMotion();

  // Un passage après l'autre, le premier aussitôt l'End ouvert.
  useEffect(() => {
    if (pass || still) return;
    const timer = window.setTimeout(
      () => {
        if (document.hidden) return setRetry((value) => value + 1);
        near.current = !near.current;
        const roll = Math.random();
        const behavior = near.current
          ? roll < 0.25 ? "dive" : roll < 0.45 ? "heal" : roll < 0.7 ? "loop" : roll < 0.85 ? "turn" : "glide"
          : roll < 0.4 ? "glide" : roll < 0.7 ? "loop" : "turn";
        setPass({ id: Date.now(), near: near.current, behavior });
      },
      retry === 0 && !near.current ? 800 : between(1500, 4000),
    );
    return () => window.clearTimeout(timer);
  }, [pass, retry, still]);

  const done = () => setPass(null);

  return (
    <div className="absolute inset-0 bg-linear-to-b from-[#09060f] via-[#140e20] to-[#1d1530]">
      <div className="absolute inset-0 opacity-60" style={{ backgroundImage: END_SKY, backgroundSize: "96px" }} />
      {ISLANDS.map((island) => (
        <Placed key={island.x} x={island.x} bottom={`calc(100% - ${island.top})`} className="sky-bob" style={{ opacity: 0.8 }}>
          <Island width={island.width} />
        </Placed>
      ))}
      {PILLARS.filter((pillar) => pillar.far).map((pillar) => (
        <Pillar key={pillar.x} {...pillar} />
      ))}
      {still && (
        <div className="absolute top-[12%] left-[38%]">
          <Sprite {...DRAGON} unit={3} />
        </div>
      )}
      {pass && !pass.near && <Dragon key={pass.id} pass={pass} onDone={done} />}
      <Endermen depth="far" />
      {PILLARS.filter((pillar) => !pillar.far).map((pillar) => (
        <Pillar key={pillar.x} {...pillar} />
      ))}
      {pass?.near && <Dragon key={pass.id} pass={pass} onDone={done} />}
      <Ground {...END_STONE} fill="#c8c98c" unit={5} height="11%" />
      {["13%", "86%"].map((x) => (
        <Placed key={x} x={x} bottom="calc(11% - 2px)">
          <Sprite {...CHORUS} unit={4} />
        </Placed>
      ))}
      <Endermen depth="near" />
    </div>
  );
}

/** Tous les sprites, pour les relire en grand sur la planche (`?screen=sprites`). */
export const SKY_SPRITES = {
  Fermier: FARMER,
  Simplet: NITWIT,
  Poule: CHICKEN,
  Abeille: BEE,
  Dromadaire: CAMEL,
  Lapin: RABBIT,
  Zombie: ZOMBIE,
  Husk: HUSK,
  Squelette: SKELETON,
  Creeper: CREEPER,
  Araignée: SPIDER,
  Cochon: PIG,
  Vache: COW,
  Mouton: SHEEP,
  Ghast: GHAST,
  "Ghast en colère": GHAST_ANGRY,
  Arpenteur: STRIDER,
  Enderman: ENDERMAN,
  "Enderman (marche)": ENDERMAN_WALK,
  "Ender Dragon": DRAGON,
  Chêne: OAK,
  Bouleau: BIRCH,
  Maison: HOUSE,
  Cactus: CACTUS,
  Temple: TEMPLE,
  Chorus: CHORUS,
  Forteresse: FORTRESS,
};

// ── Aperçus (Paramètres › Apparence) ────────────────────────────────────────

/** Vignette de chaque décor dans les réglages : l'élément qui le résume. */
export function ScenePreview({ scene }: { scene: Scene }) {
  if (scene === "village") return <Sprite {...HOUSE} unit={2} />;
  if (scene === "desert") return <Sprite {...CAMEL} frames={[CAMEL.frames[0]]} unit={1.5} />;
  if (scene === "nether") return <Sprite {...GHAST} frames={[GHAST.frames[0]]} unit={1.4} />;
  if (scene === "end") return <Sprite {...ENDERMAN} unit={0.8} />;
  return <Sprite {...OAK} unit={5} />;
}
