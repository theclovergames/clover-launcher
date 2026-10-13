import cloverIcon from "@/assets/brand/clover-icon.webp";
import { KINDS } from "@/lib/instances";
import { cn } from "@/lib/utils";
import { versionImage } from "@/lib/version-art";
import type { Instance } from "@/types";

/** Logo officiel de Clover Games. */
export { cloverIcon };

type Props = {
  entry: Pick<Instance, "kind" | "minecraft">;
  /** Taille, arrondi et bordure de l'image. */
  className: string;
  /** Taille, place, arrondi et bordure de la pastille du type, posée en coin. */
  badge: string;
  /** Taille de l'icône du type. */
  icon?: string;
};

/**
 * Image d'une instance, à poser dans un parent `relative` : le logo officiel pour Clover Games ;
 * pour les autres, l'art de leur version de Minecraft avec la pastille de leur type en coin.
 */
export function InstanceArt({ entry, className, badge, icon = "size-3.5" }: Props) {
  if (entry.kind === "clover") {
    return <img src={cloverIcon} alt="" draggable={false} className={cn("bg-black object-cover", className)} />;
  }
  const { Icon } = KINDS[entry.kind];
  return (
    <>
      <img src={versionImage(entry.minecraft ?? "")} alt="" className={cn("object-cover", className)} />
      <span className={cn("grid place-items-center bg-secondary text-foreground", badge)}>
        <Icon className={icon} strokeWidth={2.5} aria-hidden />
      </span>
    </>
  );
}
