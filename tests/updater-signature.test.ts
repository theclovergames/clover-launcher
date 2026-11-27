import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { verifierSignature } from "../scripts/updater-signature.mjs";

const b64 = (donnees: Buffer | string) => Buffer.from(donnees).toString("base64");

/** Une paire de clés et un signeur au format minisign, comme `tauri signer`. */
function paire(octetId = 1) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const brute = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const id = Buffer.alloc(8, octetId);
  const pubkey = b64(`untrusted comment: minisign public key\n${b64(Buffer.concat([Buffer.from("Ed"), id, brute]))}\n`);
  const signer = (contenu: Buffer, algorithme = "ED", commentaire = "timestamp:1") => {
    const message = algorithme === "ED" ? createHash("blake2b512").update(contenu).digest() : contenu;
    const signature = sign(null, message, privateKey);
    const globale = sign(null, Buffer.concat([signature, Buffer.from(commentaire)]), privateKey);
    const brut = Buffer.concat([Buffer.from(algorithme), id, signature]);
    return b64(`untrusted comment: signature\n${b64(brut)}\ntrusted comment: ${commentaire}\n${b64(globale)}\n`);
  };
  return { pubkey, signer };
}

test("une signature minisign valide est acceptée, avec ou sans pré-empreinte", () => {
  const { pubkey, signer } = paire();
  const contenu = Buffer.from("paquet de mise à jour");
  verifierSignature(contenu, signer(contenu, "ED"), pubkey);
  verifierSignature(contenu, signer(contenu, "Ed"), pubkey);
});

test("un fichier modifié est refusé", () => {
  const { pubkey, signer } = paire();
  const signature = signer(Buffer.from("paquet"));
  assert.throws(() => verifierSignature(Buffer.from("paquet piégé"), signature, pubkey), /ne correspond pas au fichier/);
});

test("une signature d'une autre clé est refusée", () => {
  const { pubkey } = paire(1);
  const autre = paire(2);
  const contenu = Buffer.from("paquet");
  assert.throws(() => verifierSignature(contenu, autre.signer(contenu), pubkey), /autre clé/);
});

test("une signature de la même identité mais d'une autre clé est refusée", () => {
  const { pubkey } = paire(1);
  const imposteur = paire(1);
  const contenu = Buffer.from("paquet");
  assert.throws(() => verifierSignature(contenu, imposteur.signer(contenu), pubkey), /ne correspond pas au fichier/);
});

test("un commentaire de confiance altéré est refusé", () => {
  const { pubkey, signer } = paire();
  const contenu = Buffer.from("paquet");
  const altérée = b64(Buffer.from(signer(contenu, "ED", "timestamp:1"), "base64").toString().replace("timestamp:1", "timestamp:2"));
  assert.throws(() => verifierSignature(contenu, altérée, pubkey), /signature globale/);
});

test("une signature vide ou mal formée est refusée", () => {
  const { pubkey } = paire();
  assert.throws(() => verifierSignature(Buffer.from("x"), "", pubkey), /Signature invalide/);
  assert.throws(() => verifierSignature(Buffer.from("x"), b64("n'importe quoi"), pubkey), /Signature invalide/);
});
