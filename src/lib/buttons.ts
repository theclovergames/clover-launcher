/** Boutons « bloc » du launcher, repris du système du site (`mc-bevel`) ; `mira:` : style Moderne (shadcn/ui). */
export const primaryButton =
  "mc-bevel flex h-9 items-center justify-center gap-2 whitespace-nowrap bg-primary px-4 text-[13px] font-bold text-primary-foreground disabled:opacity-60 mira:font-semibold";

/** Entrée de navigation (colonne principale, onglets des Paramètres) : l'entrée ouverte est teintée de la couleur principale. */
export const navItem = (active: boolean) =>
  active ? "bg-primary/12 text-foreground ring-1 ring-primary/25 ring-inset [&>svg]:text-primary" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground";

/** Pastille en relief d'un compteur (notifications, messages non lus, demandes d'amis, onglets) : rouge sauf autre couleur. */
export const countBadge =
  "mc-bevel grid h-[18px] min-w-[18px] place-items-center bg-destructive px-1 font-pixel text-[10px] leading-none text-white [--mc-radius:4px] [text-shadow:1px_1px_0_rgb(0_0_0/0.45)] mira:font-sans mira:font-semibold mira:[--mc-radius:999px] mira:[text-shadow:none]";

/** Bloc d'icône en relief de la barre de titre (notifications, paramètres), comme les boutons de fenêtre. */
export const iconButton = "mc-bevel relative grid size-9 place-items-center bg-secondary text-muted-foreground hover:text-foreground";

/** Barre de choix exclusifs (onglets, filtres, réglages) : case d'inventaire en style Minecraft, cadre fin en Moderne. */
export const segmentBar = "mc-slot relative flex gap-1 p-1";

const segmentText = "flex items-center gap-2 px-3.5 py-1 text-[13px] font-semibold transition-colors";
const segmentIdle = "border-2 border-transparent text-muted-foreground hover:text-foreground mira:border";

/** Choix d'une `segmentBar` à plusieurs choix retenus : chacun en bloc en relief (fond plein en Moderne). */
export const segment = (active: boolean) => `${segmentText} ${active ? "mc-bevel bg-secondary text-foreground" : segmentIdle}`;

/** Choix d'une `SegmentBar` : le bloc qui glisse sous le choix retenu en fait le fond. */
export const slidingSegment = (active: boolean) => `relative ${segmentText} ${segmentIdle} ${active ? "text-foreground hover:text-foreground" : ""}`;

export const secondaryButton =
  "mc-bevel flex h-9 items-center justify-center gap-2 whitespace-nowrap bg-secondary px-3.5 text-[13px] font-semibold text-foreground disabled:opacity-60 mira:font-medium";
