import { versionFamily } from "./game-versions";

const art = import.meta.glob<string>("../assets/versions/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
/** Visuel de la famille de `id` (fichier sans accent : « beta », « alpha »), sinon celui de la plus récente. */
export function versionImage(id: string): string {
  const file = versionFamily(id).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return art[`../assets/versions/${file}.webp`] ?? art["../assets/versions/26.3.webp"];
}
