export { cn } from "cn"

const sizeFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

/** Taille de fichier lisible : « 1,4 Go ». */
export function formatSize(bytes: number): string {
  const units = ["o", "Ko", "Mo", "Go"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${sizeFormat.format(value)} ${units[unit]}`
}

/** Minuscules sans accents, pour comparer des textes : « Mémoire » et « memoire » se valent. */
export const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
