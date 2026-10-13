import { cn } from "@/lib/utils";

/** Chargeurs que Modrinth indique (mods, modpacks, shaders), avec leur couleur habituelle. */
const LOADERS: Record<string, { label: string; dot: string }> = {
  fabric: { label: "Fabric", dot: "bg-[#dbd0b4]" },
  quilt: { label: "Quilt", dot: "bg-[#c796f9]" },
  forge: { label: "Forge", dot: "bg-[#dfa86a]" },
  neoforge: { label: "NeoForge", dot: "bg-[#f99e6b]" },
  iris: { label: "Iris", dot: "bg-[#8a7cf5]" },
  optifine: { label: "OptiFine", dot: "bg-[#e05a52]" },
};

export const loaderLabel = (id: string) => LOADERS[id]?.label ?? id;

/** « Fabric », « Forge »… en petites étiquettes ; rien sans chargeur connu. */
export function LoaderBadges({ loaders, className }: { loaders: string[] | undefined; className?: string }) {
  if (!loaders?.length) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)} aria-label={`Chargeurs : ${loaders.map(loaderLabel).join(", ")}`}>
      {loaders.map((id) => (
        <span key={id} aria-hidden className="flex items-center gap-1 rounded border border-border bg-sunken px-1.5 py-0.5 text-[10px] leading-none font-semibold text-foreground/85">
          <span className={cn("size-1.5 rounded-full", LOADERS[id]?.dot ?? "bg-muted-foreground")} />
          {loaderLabel(id)}
        </span>
      ))}
    </span>
  );
}
