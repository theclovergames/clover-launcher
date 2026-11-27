# Clé de l'updater et garde-fous de release

Les mises à jour s'installent en silence (`installMode: quiet`) : quiconque détient la clé de
signature, ou fait signer un paquet par la CI, atteint tous les joueurs. Ce document liste ce que
**Kaysuto** doit faire lui-même ; rien ici n'est appliqué par la CI ni par un agent.

## Ce que la CI contrôle désormais

- Actions tierces épinglées par SHA (`ci.yml`, `release.yml`). Mise à jour : `git ls-remote
  https://github.com/<action> 'refs/tags/<vN>*'`, puis remplacer le SHA et le commentaire de version.
- Pas de cache Rust dans la release (un cache empoisonné produirait un binaire signé).
- Job `autorisation` : le tag doit pointer un commit de `main` (`git merge-base --is-ancestor`) et
  l'environnement `production` doit être approuvé avant la construction signée.
- Job `publish` : même environnement, avant l'envoi sur R2.
- `release.mjs index` vérifie chaque `.sig` (minisign, y compris la signature globale) avec la clé
  publique de `src-tauri/tauri.conf.json` et le fichier réel. Une signature d'une autre clé ou d'un
  paquet modifié arrête la release avant R2.

## À faire par Kaysuto (réglages GitHub)

1. Dépôt → Settings → Environments → créer `production` : *Required reviewers* = Kaysuto, *Deployment
   branches and tags* = tags `v*`.
2. Déplacer `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID` et `R2_SECRET_ACCESS_KEY` des secrets du dépôt vers les secrets de
   l'environnement `production`. Sans cela, un workflow sur une autre branche lit encore les secrets
   et l'approbation ne protège rien.
3. Le job `build` utilise la clé de signature mais n'a pas `environment:` (trois approbations, une par
   système). Si les secrets passent dans l'environnement, ajouter `environment: production` à `build`
   et accepter les trois validations, ou isoler la signature dans un job unique.
4. Règle de protection des tags `v*` (Settings → Rules → Rulesets) : seuls les administrateurs créent
   ces tags.

## Mot de passe sur la clé de l'updater

Le workflow lit déjà `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ; un secret absent vaut chaîne vide, donc
la clé actuelle (sans mot de passe) continue de fonctionner.

### Option A — protéger la clé actuelle (recommandée, sans transition)

Ajouter un mot de passe à la clé existante conserve la même clé publique : les clients installés ne
voient aucune différence.

1. Sauvegarder `Sécurités/clover-launcher-updater.key`.
2. Le fichier est le texte d'une clé secrète minisign encodé en base64. Décoder en `clover.key`, puis
   `minisign -C -s clover.key` (ou `rsign` équivalent) pour choisir un mot de passe, et ré-encoder en
   base64 (une seule ligne) : c'est la nouvelle valeur de `TAURI_SIGNING_PRIVATE_KEY`.
3. Poser les deux secrets, puis publier une préversion `-beta.N` pour vérifier que la signature passe
   et que `release.mjs index` valide.
4. Détruire l'ancienne clé non protégée une fois la bêta validée (pas avant).

### Option B — nouvelle paire de clés (transition obligatoire)

Les clients embarquent l'ancienne clé publique : une mise à jour signée par la nouvelle clé serait
rejetée. Plan :

1. `npx tauri signer generate -w nouvelle.key` avec un mot de passe.
2. Release N, **signée avec l'ancienne clé**, qui embarque la **nouvelle** `pubkey` dans
   `tauri.conf.json`. `release.mjs` compare à la `pubkey` du dépôt : pour cette seule release, la
   vérification doit utiliser l'ancienne clé (passer temporairement par un second fichier de
   configuration ou publier N depuis une branche dédiée à cet usage, avec accord explicite).
3. Attendre que la grande majorité des joueurs soient en N (les clients restés en N-1 ne pourront plus
   se mettre à jour automatiquement).
4. Release N+1 signée avec la nouvelle clé ; remplacer les secrets ; détruire l'ancienne clé.

L'option B coûte une release de transition et des joueurs perdus ; ne la choisir qu'en cas de
compromission de la clé actuelle.
