// Vérification des signatures de l'updater Tauri (format minisign), sans dépendance.
//
// La clé publique (`plugins.updater.pubkey` de tauri.conf.json) et chaque `.sig` sont le texte d'un
// fichier minisign encodé en base64. Tauri vérifie la même chose côté client : la CI refuse donc
// d'envoyer sur R2 une signature que les joueurs rejetteraient, ou signée par une autre clé.

import { createHash, createPublicKey, verify } from "node:crypto";

const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

function decoder(texte, nom) {
  const lignes = Buffer.from(texte.trim(), "base64").toString("utf8").split(/\r?\n/);
  return { lignes, erreur: (detail) => new Error(`${nom} invalide : ${detail}.`) };
}

function cleDe(pubkey) {
  const { lignes, erreur } = decoder(pubkey, "Clé publique de l'updater");
  const brut = Buffer.from(lignes[1] ?? "", "base64");
  if (brut.length !== 42 || brut.subarray(0, 2).toString() !== "Ed") throw erreur("format minisign attendu (42 octets, algorithme Ed)");
  return { id: brut.subarray(2, 10), cle: createPublicKey({ key: Buffer.concat([SPKI_ED25519, brut.subarray(10)]), format: "der", type: "spki" }) };
}

/** Lève une erreur si `signature` (contenu d'un `.sig`) ne valide pas `contenu` avec `pubkey`. */
export function verifierSignature(contenu, signature, pubkey) {
  const { id, cle } = cleDe(pubkey);
  const { lignes, erreur } = decoder(signature, "Signature");
  const brut = Buffer.from(lignes[1] ?? "", "base64");
  if (brut.length !== 74) throw erreur("format minisign attendu (74 octets)");
  const algorithme = brut.subarray(0, 2).toString();
  if (algorithme !== "Ed" && algorithme !== "ED") throw erreur(`algorithme ${algorithme} inconnu`);
  if (!brut.subarray(2, 10).equals(id)) throw erreur("signée par une autre clé que celle de tauri.conf.json");

  // « ED » signe l'empreinte BLAKE2b-512 du fichier, « Ed » le fichier lui-même.
  const message = algorithme === "ED" ? createHash("blake2b512").update(contenu).digest() : contenu;
  if (!verify(null, message, cle, brut.subarray(10))) throw erreur("ne correspond pas au fichier");

  // Signature globale : lie le commentaire de confiance à la signature du fichier.
  const commentaire = (lignes[2] ?? "").replace(/^trusted comment: /, "");
  const globale = Buffer.from(lignes[3] ?? "", "base64");
  if (!lignes[2]?.startsWith("trusted comment: ") || !verify(null, Buffer.concat([brut.subarray(10), Buffer.from(commentaire)]), cle, globale)) {
    throw erreur("signature globale du commentaire de confiance incorrecte");
  }
}
