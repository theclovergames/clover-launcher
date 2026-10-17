/** Types de contenu de Découvrir : libellés, aide, catégories et tris, en français. */
import type { InstanceEntry, ModrinthKind, SearchSort } from "@/types";

/** Type de contenu de Découvrir : Modrinth, plus les mondes (CurseForge). */
export type ContentKind = ModrinthKind | "world";

/** Libellés, aide et exemples de recherche de chaque type de contenu. */
export const CONTENT_KINDS: Record<ContentKind, { label: string; hint: (minecraft: string) => string; placeholder: string; install: string; done: string }> = {
  mod: {
    label: "Mods",
    hint: (minecraft) => `Mods pour Minecraft ${minecraft}, non vérifiés par l'équipe Clover Games. Les mods de triche sont interdits sur le serveur.`,
    placeholder: "Minimap, zoom, HUD…",
    install: "Installer",
    done: "Installé",
  },
  shader: {
    label: "Shaders",
    hint: (minecraft) => `Lumières, ombres et reflets pour Minecraft ${minecraft} : le launcher installe ce qu'il faut pour les afficher. À choisir en jeu dans Options › Vidéo › Shaders.`,
    placeholder: "Complementary, BSL…",
    install: "Installer",
    done: "Installé",
  },
  resourcepack: {
    label: "Packs de ressources",
    hint: (minecraft) => `Textures, sons et polices pour Minecraft ${minecraft}. À activer en jeu dans Options › Packs de ressources.`,
    placeholder: "Faithful, animations, PvP…",
    install: "Installer",
    done: "Installé",
  },
  datapack: {
    label: "Datapacks",
    hint: (minecraft) => `Nouvelles règles, recettes ou structures pour un monde en Minecraft ${minecraft}. Ils se chargent à sa prochaine ouverture.`,
    placeholder: "Arbres, structures, recettes…",
    install: "Installer",
    done: "Installé",
  },
  world: {
    label: "Mondes",
    hint: (minecraft) => `Cartes et mondes prêts à jouer pour Minecraft ${minecraft}, ajoutés aux mondes de l'instance. Certains auteurs ne les laissent télécharger que sur CurseForge.`,
    placeholder: "Parkour, aventure, skyblock…",
    install: "Installer",
    done: "Installé",
  },
  modpack: {
    label: "Modpacks",
    hint: () => "Des mods déjà assemblés : chaque modpack devient une nouvelle instance, avec sa version de Minecraft, ses mods et ses réglages. Il peut aussi venir d'un fichier .mrpack, ou d'un .zip exporté par CurseForge.",
    placeholder: "Fabulously Optimized, aventure…",
    install: "Créer l'instance",
    done: "Instance créée",
  },
};

/** Une installation par instance, et par monde pour un datapack. */
export const installKey = (kind: ContentKind, project: string, instance: string, world?: string | null) =>
  `${instance}:${kind}:${project}${kind === "datapack" ? `:${world}` : ""}`;

export const KIND_ORDER: ContentKind[] = ["mod", "shader", "resourcepack", "datapack", "world", "modpack"];

/** Mods et shaders se chargent par un loader : pas sur une instance Vanilla. */
export const needsLoader = (kind: ContentKind) => kind === "mod" || kind === "shader";

/** Le type peut s'installer dans `instance` ; un modpack crée la sienne. */
export const kindAllowed = (kind: ContentKind, instance: InstanceEntry | undefined) => !needsLoader(kind) || (instance !== undefined && instance.kind !== "vanilla");

const SORTS: [SearchSort, string][] = [
  ["relevance", "Pertinence"],
  ["downloads", "Téléchargements"],
  ["follows", "Abonnés"],
  ["newest", "Nouveautés"],
  ["updated", "Mis à jour"],
];

/** Tris proposés : CurseForge (mondes) n'a ni pertinence ni abonnés, la popularité les remplace. */
/**
 * Chargeurs proposés à côté du tri, envoyés comme des catégories Modrinth : les modpacks, que le
 * launcher installe sur Fabric, Quilt, Forge ou NeoForge. Les mods suivent le chargeur de l'instance visée.
 */
export const LOADER_FILTERS: Partial<Record<ContentKind, [string, string][]>> = {
  modpack: [
    ["fabric", "Fabric"],
    ["quilt", "Quilt"],
    ["forge", "Forge"],
    ["neoforge", "NeoForge"],
  ],
};

export const sortsFor = (kind: ContentKind): [SearchSort, string][] =>
  kind === "world" ? [["relevance", "Popularité"], ...SORTS.filter(([id]) => id !== "relevance" && id !== "follows")] : SORTS;

/** Groupe de catégories Modrinth : nom de facette et libellé affiché. */
export type CategoryGroup = { title: string; items: [string, string][] };

const MOD_CATEGORIES: [string, string][] = [
  ["adventure", "Aventure"],
  ["decoration", "Décoration"],
  ["economy", "Économie"],
  ["equipment", "Équipement"],
  ["food", "Nourriture"],
  ["game-mechanics", "Mécaniques de jeu"],
  ["worldgen", "Génération du monde"],
  ["library", "Bibliothèque"],
  ["magic", "Magie"],
  ["management", "Gestion"],
  ["minigame", "Mini-jeux"],
  ["mobs", "Créatures"],
  ["optimization", "Optimisation"],
  ["social", "Social"],
  ["storage", "Stockage"],
  ["technology", "Technologie"],
  ["transportation", "Transport"],
  ["utility", "Utilitaire"],
  ["cursed", "Insolite"],
];

/** Catégories proposées par type, dans l'ordre affiché. Les datapacks ont celles des mods. */
export const CATEGORIES: Record<ContentKind, CategoryGroup[]> = {
  mod: [{ title: "Catégories", items: MOD_CATEGORIES }],
  datapack: [{ title: "Catégories", items: MOD_CATEGORIES.filter(([id]) => id !== "library" && id !== "optimization") }],
  shader: [
    {
      title: "Style",
      items: [
        ["vanilla-like", "Proche du jeu de base"],
        ["semi-realistic", "Semi-réaliste"],
        ["realistic", "Réaliste"],
        ["fantasy", "Fantaisie"],
        ["cartoon", "Cartoon"],
        ["cursed", "Insolite"],
      ],
    },
    {
      title: "Performances",
      items: [
        ["potato", "Très léger"],
        ["low", "Léger"],
        ["medium", "Moyen"],
        ["high", "Exigeant"],
        ["screenshot", "Pour les captures"],
      ],
    },
    {
      title: "Effets",
      items: [
        ["shadows", "Ombres"],
        ["reflections", "Reflets"],
        ["colored-lighting", "Lumières colorées"],
        ["atmosphere", "Atmosphère"],
        ["foliage", "Feuillage"],
        ["bloom", "Halo lumineux"],
        ["pbr", "Matériaux PBR"],
        ["path-tracing", "Path tracing"],
      ],
    },
  ],
  resourcepack: [
    {
      title: "Style",
      items: [
        ["vanilla-like", "Proche du jeu de base"],
        ["simplistic", "Épuré"],
        ["realistic", "Réaliste"],
        ["themed", "Thématique"],
        ["combat", "PvP"],
        ["decoration", "Décoration"],
        ["tweaks", "Retouches"],
        ["utility", "Utilitaire"],
        ["modded", "Pour mods"],
        ["cursed", "Insolite"],
      ],
    },
    {
      title: "Résolution",
      items: [
        ["8x-", "8x et moins"],
        ["16x", "16x"],
        ["32x", "32x"],
        ["48x", "48x"],
        ["64x", "64x"],
        ["128x", "128x"],
        ["256x", "256x"],
        ["512x+", "512x et plus"],
      ],
    },
    {
      title: "Contenu",
      items: [
        ["blocks", "Blocs"],
        ["items", "Objets"],
        ["entities", "Créatures"],
        ["equipment", "Équipement"],
        ["environment", "Environnement"],
        ["gui", "Interface"],
        ["fonts", "Polices"],
        ["audio", "Sons"],
        ["models", "Modèles"],
        ["core-shaders", "Shaders intégrés"],
        ["locale", "Langues"],
      ],
    },
  ],
  // Catégories CurseForge, par identifiant.
  world: [
    {
      title: "Catégories",
      items: [
        ["248", "Aventure"],
        ["253", "Survie"],
        ["249", "Création"],
        ["250", "Carte de jeu"],
        ["251", "Parkour"],
        ["252", "Énigmes"],
        ["4464", "Monde moddé"],
      ],
    },
  ],
  modpack: [
    {
      title: "Catégories",
      items: [
        ["optimization", "Optimisation"],
        ["lightweight", "Léger"],
        ["adventure", "Aventure"],
        ["quests", "Quêtes"],
        ["magic", "Magie"],
        ["technology", "Technologie"],
        ["combat", "Combat"],
        ["challenging", "Difficile"],
        ["multiplayer", "Multijoueur"],
        ["kitchen-sink", "Tout-en-un"],
      ],
    },
  ],
};
