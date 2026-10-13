import { loaderLabel } from "@/components/LoaderBadges";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { minecraftRange } from "@/lib/game-versions";
import type { ModpackVersion } from "@/types";

/** Version d'un modpack à installer : numéro, chargeurs, versions de Minecraft ; `versions` à `null` pendant la lecture. */
export function ModpackVersionSelect({ versions, value, onChange, className }: { versions: ModpackVersion[] | null; value: string | undefined; onChange: (id: string) => void; className?: string }) {
  return (
    <Select value={value ?? ""} onValueChange={(next) => next && onChange(next)} disabled={!versions?.length}>
      <SelectTrigger aria-label="Version du modpack" className={className}>
        <SelectValue placeholder={versions ? "Aucune version installable" : "Lecture des versions…"} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {versions?.map((version) => (
          <SelectItem key={version.id} value={version.id}>
            {version.number} · {version.loaders.map(loaderLabel).join(", ")} · {minecraftRange(version.gameVersions) ?? version.gameVersions.join(", ")}
            {!version.release && " · bêta"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
