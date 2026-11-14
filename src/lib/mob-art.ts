/** Textures des mobs du décor : surfaces en pixels, articulées dans `SkyMobs`. */
export const MOB_GEOMETRY = {
  zombie: { width: 27, height: 32, scale: 1 },
  husk: { width: 27, height: 32, scale: 1 },
  skeleton: { width: 38, height: 32, scale: 1 },
  creeper: { width: 21, height: 26, scale: 1 },
  spider: { width: 36, height: 18, scale: 0.62 },
} as const;
export type MobKind = keyof typeof MOB_GEOMETRY;

export const MOB_ART = {
  zombie: {
    palette: { g: "#688e46", G: "#4e7437", l: "#7e9f52", h: "#3d5a2b", k: "#202a1b", m: "#394a29", s: "#249d9c", S: "#177477", z: "#38b3ac", t: "#527d60", p: "#494276", P: "#353450", q: "#615584", b: "#454647", B: "#303334" },
    parts: {
      head: ["hhhhhhhh", "hhhggggg", "hggggggg", "Ggggggkk", "Ggggggkk", "Gggggggg", "Gggggmmm", "GgggggmG"],
      torso: ["Ssss", "Ssss", "Ssss", "Ssss", "Ssss", "Ssss", "Ssss", "Ssss", "Ssss", "Sssg", "Ssss", "SSSS"],
      arm: ["SsssssgggggG", "SssssggggggG", "SSsssggggggG", "SSSSsGGGGGGG"],
      leg: ["Ppp", "Ppp", "Ppp", "Ppp", "Ppp", "Ppp", "Ppp", "Ppp", "Ppp", "Ppp", "Bbb", "BBb"],
    },
  },
  skeleton: {
    palette: { b: "#d4d0c2", l: "#ede8d8", B: "#aaa798", d: "#797b70", k: "#383c35", W: "#b38a4b", w: "#79562e", D: "#4d371f", t: "#e5ded0", f: "#d6d2c7" },
    parts: {
      head: ["Bbbbbbbb", "Bbbbbbbb", "Bbbbbbbb", "Bbbbbbkk", "Bbbbbbkk", "Bbbbbbdb", "Bbbbbkbk", "BbbbbbBB"],
      torso: ["...Bb...", ".bbbbBB.", "...Bd...", ".bbbbBB.", "...Bb...", ".bbbbBB.", "...Bd...", ".BbbbBB.", "...Bb...", "...Bd...", "..BBBB..", "..BbbB.."],
      leg: ["Bb", "Bb", "Bb", "Bb", "Bd", "Bb", "Bb", "Bb", "Bb", "Bb", "Bb", "dd"],
      arm: ["bbbbbbb", "BBBBBBB"],
      bow: ["W.......", "wW......", ".wW.....", "..wW....", "..wW....", "...wW...", "...wW...", "....wW..", "....wW..", "....Dw..", "....Dw..", "....Dw..", "....Dw..", "....wW..", "....wW..", "...wW...", "...wW...", "..wW....", "..wW....", ".wW.....", "wW......", "W......."],
    },
  },
  creeper: {
    palette: { g: "#619447", G: "#507c3c", l: "#79a357", L: "#a5c77a", h: "#28512c", k: "#18261b" },
    parts: {
      head: ["Gggggggg", "Gggggggg", "Ggggglgg", "Gggggggg", "Gggggggg", "Ggglgggg", "Gggggggg", "GGGGGGGG"],
      torso: ["Gggg", "Gggg", "Gggg", "Gggg", "Gggg", "Gggg", "Gglg", "Gggg", "Gggg", "Gggg", "Gggg", "GGGG"],
      leg: ["Gggg", "Gggg", "Gggg", "Gggg", "Gggg", "GGGG"],
    },
  },
  spider: {
    palette: { a: "#352f2b", A: "#403832", l: "#655045", h: "#252421", H: "#302b26", k: "#171a18", e: "#ad5549", r: "#76352d", E: "#c27a60" },
    parts: {
      abdomen: ["..AAAAAAAA...", ".Aaaaaaaaaaa.", "Aaaaaaaaaaaaa", "Aaaaaaaaaaaaa", "aaaaaaaaaaaaa", "aaaaaaaaaaaaa", "aaaaaaaaaaaaa", ".aaaaaaaaaaa.", "..aaaaaaaa..."],
      head: [".HHHHHHH.", "hhhhhhErE", "hhhhhhErE", "hhhhhherE", ".hhhhrrr.", "..kk.kk.."],
    },
  },
} as const;

export const HUSK_PALETTE = { ...MOB_ART.zombie.palette, g: "#a5926f", G: "#837453", l: "#b7a47b", h: "#665d44", k: "#2e2b22", m: "#544a33", s: "#776044", S: "#554b36", z: "#8f7854", t: "#9c8e67", p: "#61533d", P: "#433e31", q: "#766449", b: "#454034", B: "#302d26" };

/** Hanche, genou et pied, les quatre pattes lointaines puis les quatre proches. */
export const SPIDER_LEGS = [
  [15, 10, 11, 6, 7, 17], [17, 10, 15, 6, 13, 17], [19, 10, 22, 6, 24, 17], [21, 10, 25, 6, 29, 17],
  [15, 10, 12, 7, 8, 17], [17, 10, 16, 6, 14, 17], [19, 10, 23, 6, 26, 17], [21, 10, 26, 7, 30, 17],
] as const;
