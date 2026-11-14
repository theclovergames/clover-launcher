import { type ComponentProps, type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { SkinViewer as Viewer } from "skinview3d";
import { type Intersection, MathUtils, type Mesh, type MeshStandardMaterial, type Object3D, Plane, Quaternion, Raycaster, Vector2, Vector3 } from "three";

import { cursorPosition, type Gaze, type HitZone, MoodAnimation } from "@/components/SkinMoods";
import { reducedMotion } from "@/lib/appearance";
import { attachSkinClick } from "@/lib/skin-click";
import type { SkinLook } from "@/types";

/** Durée de la teinte rouge, celle du hurtTime de Minecraft (10 ticks). */
const HURT_MS = 500;
/** Saut de recul ; le rebond qui suit dure moitié moins, donc monte quatre fois moins haut. */
const JUMP_MS = 280;
const LAND_MS = JUMP_MS * 1.5;
/** Fin du retour à la place de départ, à pied : pas par pixel de skin parcouru (rad). */
const KNOCKBACK_MS = LAND_MS + 480;
const PUSH = 4;
const STRIDE_PER_UNIT = 1.6;
/** Pieds du modèle, dans le repère du joueur (origine à la taille, 16 au-dessus des pieds). */
const FEET = new Vector3(0, -16, 0);

/** Prise en main : marge de l'aperçu détaché autour de sa taille, pour que le balancement ne soit pas coupé. */
const FLOAT_MARGIN = 140;
/** Curseur à moins de cette distance de la tête (pixels d'écran) : il le regarde. */
const NEAR_PX = 260;
/** Vitre où se pose le curseur pour le regard : une tête (8 pixels de skin) devant le cou. */
const GLASS = 8;
/** Pesanteur de la chute, en pixels d'écran par seconde². */
const GRAVITY = 2600;
/** Avec des élytres, la descente plane : pesanteur réduite, vitesse plafonnée (pixels d'écran par seconde). */
const GLIDE_GRAVITY = 700;
const GLIDE_FALL_MAX = 300;
/** Retour à pied : vitesse selon la distance (pixels d'écran par seconde), pas par pixel parcouru (rad). */
const WALK_MIN = 170;
const WALK_MAX = 460;
const STRIDE_PER_PX = 0.05;
/** Demi-tour vers sa place, puis de nouveau face à l'écran, en secondes. */
const TURN_S = 0.22;
const UP = new Vector3(0, 1, 0);

/** Personnage occupé par un coup ou une prise : l'autre geste attend. */
type Busy = { busy: boolean };

const arc = (p: number) => 4 * p * (1 - p);
const smoothstep = (p: number) => p * p * (3 - 2 * p);

/** Recul à `t` ms du coup : distance poussée, hauteur, inclinaison (rad, amortie avec un contrecoup). */
function recoil(t: number) {
  const hop = t < JUMP_MS ? 3 * arc(t / JUMP_MS) : t < LAND_MS ? 0.75 * arc((t - JUMP_MS) / (LAND_MS - JUMP_MS)) : 0;
  const push =
    t < JUMP_MS ? 1 - (1 - t / JUMP_MS) ** 3 : t < LAND_MS ? 1 : (1 + Math.cos((Math.PI * (t - LAND_MS)) / (KNOCKBACK_MS - LAND_MS))) / 2;
  const lean = 0.17 * Math.exp(-t / 150) * Math.sin((2 * Math.PI * t) / 360);
  return { push: PUSH * push, hop, lean };
}

/**
 * Aperçu 3D du skin. On le fait seulement tourner sur lui-même en glissant de côté, sur lui comme à
 * côté, et il revient de face une fois relâché (sauf `recenter` à faux) : ni inclinaison, ni zoom, ni déplacement ; glisser vers le haut ou le bas l'attrape pour le
 * soulever. Il change d'humeur quand on ne touche plus
 * au launcher et suit le curseur des yeux tant qu'on s'en sert (`SkinMoods`), et un clic sur le personnage le frappe comme en jeu. Immobile si le système
 * demande moins d'animations : le coup n'est alors qu'une teinte rouge, sans recul.
 */
export function SkinViewer({
  look,
  width,
  height,
  animate = true,
  elytra = false,
  recenter = true,
  onEmptyClick,
  label = "Aperçu 3D de ton skin",
}: {
  look: SkinLook;
  width: number;
  height: number;
  animate?: boolean;
  /** Élytres à la place de la cape (même texture). */
  elytra?: boolean;
  /** Revient de face une fois relâché ; sinon il garde l'angle donné (page Skins, pour voir le dos). */
  recenter?: boolean;
  /** Clic dans une zone transparente : laisse l'écran interagir avec son décor. */
  onEmptyClick?: (event: MouseEvent) => void;
  label?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<Viewer | null>(null);
  /** Lu à la fin du chargement de la cape, qui peut arriver après une bascule. */
  const equipment = useRef<"cape" | "elytra">("cape");
  /**
   * Apparition de l'aperçu : le bonjour n'a lieu qu'à ce moment, pas à chaque skin essayé. Une
   * fenêtre d'une seconde plutôt qu'un drapeau, l'effet étant joué deux fois en mode strict.
   */
  const appeared = useRef<number | null>(null);
  /** Endormi : où naissent les « zzZ », en pixels de l'aperçu. */
  const [sleep, setSleep] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!canvas.current || !look.texture) return;
    const viewer = new Viewer({
      canvas: canvas.current,
      width,
      height,
      skin: look.texture,
      model: look.model === "slim" ? "slim" : "default",
      zoom: 0.82,
      fov: 40,
    });
    // Montrée seulement une fois chargée : skinview3d remettrait sinon la cape par-dessus des élytres choisies entre-temps.
    if (look.cape?.texture) void viewer.loadCape(look.cape.texture, { makeVisible: false }).then(() => (viewer.playerObject.backEquipment = equipment.current));
    instance.current = viewer;
    viewer.controls.enableZoom = false;
    viewer.controls.enablePan = false;
    viewer.controls.minPolarAngle = Math.PI / 2;
    viewer.controls.maxPolarAngle = Math.PI / 2;
    const reduced = reducedMotion();
    const motion = animate && !reduced;
    // Animé, il part de trois quarts puis suit le curseur ; figé, il reste presque de face, un peu tourné vers la gauche.
    viewer.playerObject.rotation.y = motion ? -0.45 : 0.3;
    appeared.current ??= performance.now();
    const moods = motion ? new MoodAnimation({ greet: performance.now() - appeared.current < 1000 }) : null;
    viewer.animation = moods;
    const state: Busy = { busy: false };
    // Figé, il ne réagit pas aux coups : ni recul ni teinte rouge.
    const detachHit = moods || onEmptyClick ? attachHit(viewer, canvas.current, state, moods, onEmptyClick) : () => {};
    const detachGrab = moods ? attachGrab(viewer, canvas.current, moods, state) : () => {};
    // Même figé, il revient de face en douceur ; d'un coup seulement si les animations sont réduites.
    const detachRecenter = recenter ? attachRecenter(viewer, canvas.current, !reduced) : () => {};
    moods?.follow(gazeAt(viewer, canvas.current, state));
    // Les « zzZ » partent du haut de la tête une fois qu'elle est tombée (la pose se fond en 0,9 s).
    let dozing = 0;
    moods?.onSleep((asleep) => {
      window.clearTimeout(dozing);
      if (!asleep) return setSleep(null);
      dozing = window.setTimeout(() => setSleep(headTop(viewer, width, height)), 1000);
    });
    return () => {
      window.clearTimeout(dozing);
      setSleep(null);
      instance.current = null;
      detachRecenter();
      detachGrab();
      detachHit();
      viewer.dispose();
    };
  }, [look.texture, look.model, look.cape?.texture, width, height, animate, recenter, onEmptyClick]);

  // Bascule sans recréer l'aperçu ; `backEquipment` reste nul tant que la cape n'est pas chargée.
  useEffect(() => {
    equipment.current = elytra ? "elytra" : "cape";
    const player = instance.current?.playerObject;
    if (player?.backEquipment) player.backEquipment = equipment.current;
  }, [elytra]);

  // La place reste réservée quand le personnage en sort (prise en main) ou que le skin est encore
  // inconnu. Le canvas est toujours rendu : React ne le retire jamais pendant qu'il est détaché.
  return (
    <div className="relative" style={{ width, height }}>
      <canvas ref={canvas} hidden={!look.texture} aria-label={label} className={onEmptyClick ? "pointer-events-auto block" : "block"} />
      {sleep && (
        <span aria-hidden className="pointer-events-none absolute font-pixel leading-none text-white/85 [text-shadow:0_2px_0_rgb(0_0_0/0.45)]" style={{ left: sleep.x, top: sleep.y, fontSize: Math.max(12, Math.round(height * 0.035)) }}>
          {["z", "z", "Z"].map((letter, index) => (
            <span key={index} className="sleep-z absolute bottom-0 left-0" style={{ animationDelay: `${index * 0.8}s`, fontSize: `${1 + index * 0.3}em` }}>
              {letter}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/** Part vide du rendu sous les pieds ; il y en a environ 8 % au-dessus de la tête. */
export const BELOW_FEET = 0.09;
/** Pseudo à l'échelle du personnage, comme en jeu, lisible au plus petit palier. */
export const nameSize = (height: number) => Math.max(16, Math.round(height * 0.042));
/** Hauteur prise par le pseudo au-dessus du rendu : sa taille, ses 10 px de marges, moins le vide au-dessus de la tête qu'il occupe. */
export const nameOverhang = (height: number) => nameSize(height) + 10 - Math.round(height * 0.08 - 6);

/**
 * Le personnage debout, le même partout (accueil, Profil, Skins) : pseudo posé dans le vide
 * au-dessus de la tête, à quelques pixels des cheveux, et ombre sous les pieds. `children` se pose
 * sur le vide sous les pieds ; `style` place l'ensemble.
 */
export function StandingSkin({ name, height, style, children, ...viewer }: Omit<ComponentProps<typeof SkinViewer>, "width"> & { name: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div className="relative flex shrink-0 flex-col items-center" style={style}>
      {name && (
        <p className="relative z-10 max-w-full truncate bg-black/40 px-2.5 pt-1.5 pb-1 font-pixel leading-none text-white" style={{ fontSize: nameSize(height), marginBottom: -Math.round(height * 0.08 - 6) }}>
          {name}
        </p>
      )}
      <div aria-hidden className="absolute left-1/2 h-4 w-24 -translate-x-1/2 rounded-[50%] bg-black/60 blur-[6px]" style={{ bottom: Math.round(height * BELOW_FEET) - 6 }} />
      <SkinViewer {...viewer} width={Math.round(height * 0.78)} height={height} />
      {children && <div className="absolute bottom-0 left-1/2 -translate-x-1/2">{children}</div>}
    </div>
  );
}

/** Coin haut de la tête, côté écran droit, en pixels de l'aperçu (`width` × `height`). */
function headTop(viewer: Viewer, width: number, height: number) {
  const point = viewer.playerObject.skin.head.localToWorld(new Vector3(4, 8, 0)).project(viewer.camera);
  return { x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height };
}

/**
 * Toujours de face : relâché après l'avoir fait tourner (sur lui ou à côté), le personnage revient
 * en douceur à son angle de départ ; d'un coup si les animations sont réduites. Rend le nettoyage.
 */
function attachRecenter(viewer: Viewer, canvas: HTMLCanvasElement, motion: boolean) {
  const { camera, controls } = viewer;
  const azimuth = () => Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  const origin = azimuth();
  const rotate = (angle: number) => {
    camera.position.sub(controls.target).applyAxisAngle(UP, angle).add(controls.target);
    controls.update();
  };
  let held = false;
  let frame = 0;
  let last = 0;
  const step = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, now - last) / 1000);
    last = now;
    // Par le plus court chemin, même après plusieurs tours.
    const off = Math.atan2(Math.sin(azimuth() - origin), Math.cos(azimuth() - origin));
    if (!motion || Math.abs(off) < 0.002) {
      rotate(-off);
      frame = 0;
      return;
    }
    rotate(-off * (1 - Math.exp(-7 * dt)));
    frame = requestAnimationFrame(step);
  };
  const hold = () => {
    held = true;
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const release = () => {
    if (!held) return;
    held = false;
    last = performance.now();
    frame = requestAnimationFrame(step);
  };
  canvas.addEventListener("pointerdown", hold, { capture: true });
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  return () => {
    cancelAnimationFrame(frame);
    canvas.removeEventListener("pointerdown", hold, { capture: true });
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
  };
}

/**
 * Regard : angles pour que la tête vise le curseur, posé sur une vitre face à la caméra à `GLASS`
 * devant le cou ; aux bords de la fenêtre, il regarde presque de profil. Le lacet se compte depuis le
 * corps au repos : `SkinMoods` le fait pivoter quand le cou ne suffit plus. Rien pendant un coup ou une
 * prise, ni si le curseur est hors de la fenêtre ou la caméra passée derrière lui.
 */
function gazeAt(viewer: Viewer, canvas: HTMLCanvasElement, state: Busy): Gaze {
  const { camera, playerWrapper } = viewer;
  const { skin } = viewer.playerObject;
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const neck = new Vector3();
  const projected = new Vector3();
  const toward = new Vector3();
  const target = new Vector3();
  const glass = new Plane();
  // Le cou est sur l'axe du pivot : la rotation du corps s'ajoute telle quelle.
  const yawOf = (local: Vector3) => Math.atan2(local.x, local.z) + playerWrapper.rotation.y;
  return () => {
    const cursor = cursorPosition();
    if (!cursor || state.busy || !canvas.isConnected) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    if (Math.abs(yawOf(skin.worldToLocal(target.copy(camera.position)))) > 1.7) return null;
    skin.head.getWorldPosition(neck);
    projected.copy(neck).project(camera);
    const near = Math.hypot(cursor.x - (rect.left + ((projected.x + 1) / 2) * rect.width), cursor.y - (rect.top + ((1 - projected.y) / 2) * rect.height)) < NEAR_PX;
    ndc.set(((cursor.x - rect.left) / rect.width) * 2 - 1, 1 - ((cursor.y - rect.top) / rect.height) * 2);
    raycaster.setFromCamera(ndc, camera);
    camera.getWorldDirection(toward).negate();
    glass.setFromNormalAndCoplanarPoint(toward, target.copy(neck).addScaledVector(toward, GLASS));
    if (!raycaster.ray.intersectPlane(glass, target)) return null;
    skin.worldToLocal(target);
    // Depuis les yeux, 4 pixels au-dessus du cou.
    return { yaw: yawOf(target), pitch: MathUtils.clamp(Math.atan2(skin.head.position.y + 4 - target.y, Math.hypot(target.x, target.z)), -1.1, 1.1), near };
  };
}

/**
 * Coup façon Minecraft : un clic (pas un glisser, qui fait tourner) sur le personnage le teinte en
 * rouge et le projette loin de la caméra, et de côté selon où le clic tombe ; `moods`
 * le fait réagir selon la partie touchée (tête, torse, bras, jambe) : saut, rebond à l'atterrissage, puis
 * retour à sa place à pied. Comme en jeu, un coup pendant le précédent ne compte pas. Rend le nettoyage.
 */
function attachHit(viewer: Viewer, canvas: HTMLCanvasElement, state: Busy, moods: MoodAnimation | null, onEmptyClick?: (event: MouseEvent) => void) {
  const player = viewer.playerObject;
  const materials = new Set<MeshStandardMaterial>();
  player.traverse((object) => {
    if ((object as Mesh).isMesh) materials.add((object as Mesh).material as MeshStandardMaterial);
  });
  const tint = (hurt: boolean) => {
    for (const material of materials) {
      material.color.set(hurt ? 0xff8f8f : 0xffffff);
      material.emissive.set(hurt ? 0x3a0000 : 0x000000);
    }
  };

  const dir = new Vector3();
  const side = new Vector3();
  const axis = new Vector3();
  const shift = new Vector3();
  const base = new Quaternion();
  const tilt = new Quaternion();
  let start = 0;
  let frame = 0;
  const pose = (t: number) => {
    const { push, hop, lean } = recoil(t);
    tilt.setFromAxisAngle(axis, lean);
    player.quaternion.multiplyQuaternions(tilt, base);
    // Penché depuis les pieds, pas depuis l'origine du modèle.
    shift.copy(FEET).applyQuaternion(tilt).sub(FEET);
    player.position.copy(dir).multiplyScalar(push).sub(shift).setY(hop - shift.y);
    if (t >= LAND_MS) moods?.walk((PUSH - push) * STRIDE_PER_UNIT);
  };
  const step = (now: number) => {
    const t = now - start;
    tint(t < HURT_MS);
    if (t >= KNOCKBACK_MS) {
      moods?.walk(null);
      player.position.set(0, 0, 0);
      player.quaternion.copy(base);
      frame = 0;
      state.busy = false;
      return;
    }
    pose(t);
    frame = requestAnimationFrame(step);
  };
  const strike = (point: Vector3, zone: HitZone) => {
    if (frame || state.busy || !moods) return;
    state.busy = true;
    dir.copy(viewer.camera.position).setY(0).normalize().negate();
    // Droite de l'écran au sol ; un coup sur le flanc droit pousse vers la gauche.
    side.set(-dir.z, 0, dir.x);
    const across = MathUtils.clamp(point.dot(side) / 6, -1, 1);
    dir.addScaledVector(side, -0.8 * across).normalize();
    moods.hit(across, zone);
    axis.set(dir.z, 0, -dir.x);
    base.copy(player.quaternion);
    start = performance.now();
    tint(true);
    frame = requestAnimationFrame(step);
  };

  const { head, body, leftArm, rightArm, leftLeg, rightLeg } = player.skin;
  const parts = new Map<Object3D, HitZone>([
    [head, "head"],
    [body, "body"],
    [leftArm, "leftArm"],
    [rightArm, "rightArm"],
    [leftLeg, "leftLeg"],
    [rightLeg, "rightLeg"],
  ]);
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const onClick = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, 1 - ((event.clientY - rect.top) / rect.height) * 2);
    raycaster.setFromCamera(pointer, viewer.camera);
    // Le corps seul : cape, élytres et oreilles existent même masquées.
    const [hit] = raycaster.intersectObject(player.skin);
    if (!hit) return onEmptyClick?.(event);
    // La pièce du modèle qui porte la face touchée (calque compris).
    let part: Object3D | null = hit.object;
    while (part && !parts.has(part)) part = part.parent;
    strike(hit.point, (part && parts.get(part)) ?? "body");
  };
  const detachClick = attachSkinClick(canvas, onClick);
  return () => {
    cancelAnimationFrame(frame);
    detachClick();
  };
}

/**
 * Prise en main : appuyer sur le personnage puis glisser vers le haut ou le bas l'attrape ; de côté,
 * il tourne, comme à côté de lui. L'aperçu sort alors de sa place
 * (déplacé dans `body`, au-dessus de tout le launcher, sans capter la souris) et suit la main dans
 * toute la fenêtre ; le personnage se balance selon la vitesse du geste et se débat (`moods`).
 * Lâché, il garde son élan (on peut le lancer) et retombe jusqu'à la hauteur de sa place, se tasse
 * s'il tombe vraiment, puis rentre à pied, tourné vers sa place ; lâché plus bas, il y remonte d'un
 * saut. Avec des élytres, il plane au lieu de tomber et remonte en volant au lieu de sauter. Arrivé,
 * il se retourne face à l'écran. Rend le nettoyage.
 */
function attachGrab(viewer: Viewer, canvas: HTMLCanvasElement, moods: MoodAnimation, state: Busy) {
  const player = viewer.playerObject;
  const parent = player.parent!;
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const forward = new Vector3();
  const right = new Vector3();
  const look = new Vector3();
  /** Point saisi et décalage depuis le centre du joueur, dans le repère du parent. */
  const grip = new Vector3();
  const offset = new Vector3();
  const rotated = new Vector3();
  const base = new Quaternion();
  const facing = new Quaternion();
  const heading = new Quaternion();
  const tilt = new Quaternion();
  /** `turning` : le glisser est parti de côté, il fait tourner l'aperçu jusqu'au relâchement. */
  let pressed: { id: number; x: number; y: number; hit: Intersection; turning: boolean } | null = null;
  /** Place de l'aperçu pendant qu'il en est sorti. */
  let home: { slot: HTMLElement; width: number; height: number } | null = null;
  /** Point saisi à l'écran : il reste dans la fenêtre. */
  let originX = 0;
  let originY = 0;
  // Décalage de l'aperçu depuis sa place, en pixels d'écran (y vers le bas), et sa vitesse.
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  let goalX = 0;
  let goalY = 0;
  /** Balancement autour du point saisi, dans le plan de l'écran (rad, rad/s). */
  let angle = 0;
  let spin = 0;
  /** Orientation : 0 face à l'écran, 1 tourné vers sa place. */
  let turn = 0;
  let stride = 0;
  let walkSpeed = 0;
  /** Décalage au départ de la marche : le trajet se calcule sur le temps, pas image par image. */
  let walkFrom = 0;
  /** Étape en cours, et son début (ms). */
  let phase: "held" | "fall" | "rest" | "walk" | "hop" | "fly" | "home" = "held";
  let phaseAt = 0;
  let restFor = 0;
  let hop = { x: 0, y: 0, duration: 0, height: 0 };
  let frame = 0;
  let last = 0;

  /** Élytres portées (bascule de la page Skins) : lu à chaque image, la bascule peut arriver en vol. */
  const winged = () => player.backEquipment === "elytra";

  /** Même vitesse que les contrôles de skinview3d (OrbitControls) : un tour pour un glisser de la hauteur de l'aperçu. */
  const rotateView = (dx: number) => {
    const { camera, controls } = viewer;
    camera.position.sub(controls.target).applyAxisAngle(UP, (-2 * Math.PI * dx * controls.rotateSpeed) / canvas.clientHeight).add(controls.target);
    controls.update();
  };

  const bodyAt = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, 1 - ((event.clientY - rect.top) / rect.height) * 2);
    raycaster.setFromCamera(pointer, viewer.camera);
    // Le corps seul, comme pour le coup.
    return raycaster.intersectObject(player.skin)[0];
  };

  // Plus grand et décalé d'autant, avec la même projection : le personnage ne bouge pas à l'écran.
  const detach = () => {
    const rect = canvas.getBoundingClientRect();
    home = { slot: canvas.parentElement!, width: rect.width, height: rect.height };
    document.body.append(canvas);
    Object.assign(canvas.style, { position: "fixed", left: `${rect.left - FLOAT_MARGIN}px`, top: `${rect.top - FLOAT_MARGIN}px`, zIndex: "70", pointerEvents: "none" });
    const size = (length: number) => length + 2 * FLOAT_MARGIN;
    viewer.setSize(size(rect.width), size(rect.height));
    viewer.camera.setViewOffset(rect.width, rect.height, -FLOAT_MARGIN, -FLOAT_MARGIN, size(rect.width), size(rect.height));
  };
  const reattach = () => {
    if (!home) return;
    const { slot, width, height } = home;
    home = null;
    Object.assign(canvas.style, { position: "", left: "", top: "", zIndex: "", pointerEvents: "", transform: "" });
    viewer.camera.clearViewOffset();
    // Place disparue (écran quitté pendant le retour) : l'aperçu part avec elle.
    if (!slot.isConnected) return canvas.remove();
    slot.append(canvas);
    viewer.setSize(width, height);
  };

  /** Tourné vers sa place, de trois quarts pour qu'on voie encore son visage. */
  const faceHome = () => {
    look.copy(right).multiplyScalar(x > 0 ? -1 : 1).addScaledVector(forward, -0.5).normalize();
    facing.setFromAxisAngle(UP, Math.atan2(look.x, look.z));
  };

  const go = (next: typeof phase, now: number) => {
    phase = next;
    phaseAt = now;
  };

  const startWalk = (now: number) => {
    if (Math.abs(x) < 2) return go("home", now);
    faceHome();
    walkSpeed = MathUtils.clamp(Math.abs(x) / 1.1, WALK_MIN, WALK_MAX);
    walkFrom = x;
    go("walk", now);
  };

  /** Arrivé à la hauteur de sa place ; `thud` : il se tasse avant de repartir. */
  const touchDown = (now: number, thud: boolean) => {
    y = vy = 0;
    moods.setAirborne(false);
    moods.glide(false);
    if (thud) moods.land();
    restFor = thud ? 450 : 120;
    go("rest", now);
  };

  const finish = () => {
    player.position.set(0, 0, 0);
    player.quaternion.copy(base);
    moods.walk(null);
    moods.setAirborne(false);
    moods.glide(false);
    reattach();
    frame = 0;
    state.busy = false;
  };

  const step = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05) || 0.016;
    last = now;
    const elapsed = (now - phaseAt) / 1000;
    let bob = 0;
    if (phase === "held") {
      vx += ((goalX - x) / dt - vx) * 0.3;
      vy += ((goalY - y) / dt - vy) * 0.3;
      x = goalX;
      y = goalY;
    } else if (phase === "fall") {
      // Plané : la montée d'un lancer reste vive, seule la descente ralentit.
      const gliding = winged();
      moods.glide(gliding);
      vy += (gliding && vy > 0 ? GLIDE_GRAVITY : GRAVITY) * dt;
      if (gliding) vy = Math.min(vy, GLIDE_FALL_MAX);
      vx -= vx * Math.min(1, (gliding ? 0.8 : 2.5) * dt);
      x = MathUtils.clamp(x + vx * dt, -originX, window.innerWidth - originX);
      y = Math.max(y + vy * dt, -originY);
      if (y === -originY) vy = Math.max(vy, 0);
      if (y >= 0) {
        // Une chute rapide rebondit un peu avant de se poser.
        if (vy > 700) {
          y = 0;
          vy *= -0.25;
        } else touchDown(now, !gliding && (vy > 250 || elapsed > 0.25));
      }
    } else if (phase === "rest") {
      if (now - phaseAt >= restFor) startWalk(now);
    } else if (phase === "walk") {
      turn = Math.min(1, turn + dt / TURN_S);
      // Démarrage en douceur le temps du demi-tour.
      const travelled = Math.min(Math.abs(walkFrom), walkSpeed * Math.max(0, elapsed - TURN_S / 2));
      x = walkFrom - Math.sign(walkFrom) * travelled;
      stride = travelled * STRIDE_PER_PX;
      bob = 2 * Math.abs(Math.sin(stride));
      moods.walk(stride);
      if (x === 0) {
        moods.walk(null);
        go("home", now);
      }
    } else if (phase === "hop") {
      const progress = Math.min(elapsed / hop.duration, 1);
      x = hop.x * (1 - progress);
      y = hop.y * (1 - progress) - 4 * hop.height * progress * (1 - progress);
      turn = Math.min(1, turn + dt / TURN_S);
      if (progress === 1) {
        x = 0;
        touchDown(now, true);
      }
    } else if (phase === "fly") {
      // Départ et arrivée en douceur ; il passe au-dessus de sa place et s'y pose en descendant.
      const progress = Math.min(elapsed / hop.duration, 1);
      const eased = smoothstep(progress);
      const next = hop.x * (1 - eased);
      vx = (next - x) / dt;
      x = next;
      y = hop.y * (1 - eased) - hop.height * arc(eased);
      turn = Math.min(1, turn + dt / TURN_S);
      if (progress === 1) {
        x = 0;
        touchDown(now, false);
      }
    } else {
      turn = Math.max(0, turn - dt / TURN_S);
    }

    // Pendule amorti : en avançant vers la droite, le bas du corps traîne à gauche. En vol, il se
    // penche dans le sens du déplacement.
    const flying = phase === "fly" || (phase === "fall" && winged());
    const lean = phase === "held" ? MathUtils.clamp(vx * 0.0016, -0.6, 0.6) : flying ? MathUtils.clamp(vx * 0.0011, -0.45, 0.45) : 0;
    spin += ((lean - angle) * 60 - spin * 6) * dt;
    angle += spin * dt;
    if (phase === "home" && turn === 0 && Math.abs(angle) < 0.003 && Math.abs(spin) < 0.02) return finish();

    heading.slerpQuaternions(base, facing, smoothstep(turn));
    tilt.setFromAxisAngle(forward, angle);
    player.quaternion.multiplyQuaternions(tilt, heading);
    player.position.copy(grip).sub(rotated.copy(offset).applyQuaternion(tilt));
    canvas.style.transform = `translate(${x}px, ${y - bob}px)`;
    frame = requestAnimationFrame(step);
  };

  const begin = (hit: Intersection) => {
    state.busy = true;
    x = y = vx = vy = goalX = goalY = angle = spin = turn = stride = 0;
    viewer.camera.getWorldDirection(forward).setY(0).normalize();
    right.crossVectors(forward, UP).normalize();
    parent.worldToLocal(grip.copy(hit.point));
    offset.copy(grip).sub(player.position);
    base.copy(player.quaternion);
    facing.copy(base);
    detach();
    document.documentElement.style.cursor = "grabbing";
    moods.hold(true);
    last = performance.now();
    go("held", last);
    frame = requestAnimationFrame(step);
  };

  // Suivi sur la fenêtre : l'aperçu détaché ne capte plus la souris.
  const onMove = (event: PointerEvent) => {
    if (!pressed || event.pointerId !== pressed.id) return;
    if (pressed.turning) {
      rotateView(event.clientX - pressed.x);
      pressed.x = event.clientX;
      return;
    }
    if (phase !== "held" || !home) {
      const dx = event.clientX - pressed.x;
      const dy = event.clientY - pressed.y;
      if (Math.hypot(dx, dy) <= 4) return;
      // Le personnage occupe presque tout l'aperçu : de côté, le glisser le fait tourner.
      if (Math.abs(dx) > Math.abs(dy)) {
        pressed.turning = true;
        canvas.style.cursor = "";
        rotateView(dx);
        pressed.x = event.clientX;
        return;
      }
      begin(pressed.hit);
    }
    goalX = MathUtils.clamp(event.clientX, 0, window.innerWidth) - originX;
    goalY = MathUtils.clamp(event.clientY, 0, window.innerHeight) - originY;
  };
  const stopFollowing = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  const onUp = (event: PointerEvent) => {
    if (!pressed || event.pointerId !== pressed.id) return;
    stopFollowing();
    pressed = null;
    viewer.controls.enabled = true;
    canvas.style.cursor = "";
    document.documentElement.style.cursor = "";
    if (!home || phase !== "held") return;
    moods.hold(false);
    const now = performance.now();
    if (y < 0) {
      // Lâché au-dessus de sa place : il garde l'élan du geste, borné pour ne pas traverser la fenêtre.
      vx = MathUtils.clamp(vx, -2000, 2000);
      vy = MathUtils.clamp(vy, -1600, 900);
      moods.setAirborne(true);
      go("fall", now);
    } else if (y > 16) {
      // Lâché plus bas : il remonte d'un saut, plus haut et plus long s'il est loin ; avec des
      // élytres, il y vole, plus lentement et en passant au-dessus.
      const distance = Math.hypot(x, y);
      faceHome();
      moods.setAirborne(true);
      if (winged()) {
        hop = { x, y, duration: MathUtils.clamp(0.8 + distance / 1500, 0.8, 1.4), height: 30 + 0.4 * y };
        moods.glide(true);
        go("fly", now);
      } else {
        hop = { x, y, duration: MathUtils.clamp(0.45 + distance / 1800, 0.45, 0.85), height: 40 + 0.25 * y };
        go("hop", now);
      }
    } else touchDown(now, false);
  };

  // Phase de capture : passe avant les contrôles de rotation, désactivés jusqu'au relâchement.
  const onPointerDown = (event: PointerEvent) => {
    if (state.busy || event.button !== 0) return;
    const hit = bodyAt(event);
    if (!hit) return;
    pressed = { id: event.pointerId, x: event.clientX, y: event.clientY, hit, turning: false };
    originX = event.clientX;
    originY = event.clientY;
    viewer.controls.enabled = false;
    canvas.style.cursor = "grabbing";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  // Main ouverte au survol du corps ; ailleurs, le curseur de rotation du canvas.
  const onHover = (event: PointerEvent) => {
    if (!pressed) canvas.style.cursor = !state.busy && bodyAt(event) ? "grab" : "";
  };
  canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
  canvas.addEventListener("pointermove", onHover);
  return () => {
    cancelAnimationFrame(frame);
    stopFollowing();
    canvas.removeEventListener("pointermove", onHover);
    canvas.style.cursor = "";
    if (pressed || home) document.documentElement.style.cursor = "";
    if (home) {
      player.position.set(0, 0, 0);
      reattach();
    }
    canvas.removeEventListener("pointerdown", onPointerDown, { capture: true });
  };
}
