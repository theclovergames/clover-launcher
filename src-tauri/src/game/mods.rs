//! Synchronisation des mods chargés avec la sélection du joueur.
//!
//! Le catalogue Clover (dont le mod client) est rangé dans un dossier interne du launcher, hors du
//! dossier de jeu, et chargé par `fabric.addMods` : il n'apparaît pas dans `mods/`. Ce dossier
//! et `mods/` appartiennent au launcher : tout `.jar` qui ne correspond pas à un mod sélectionné
//! est retiré, pour qu'un mod désactivé ou remplacé par une nouvelle version ne reste pas chargé.
//! Les mods du joueur (« Mes mods ») sont recopiés dans `mods/` à chaque lancement ; un jar déposé
//! à la main dans `mods/` est d'abord transféré dans « Mes mods » (`adopt_unknown`), jamais supprimé.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha512};

use super::download::{download_all, Checksum, Download};
use super::manifest::Manifest;
use super::personal;
use super::{GameError, Result};

/// Instances sans catalogue Clover : remplacer uniquement les jars dans le dossier géré.
pub async fn sync_personal(mods_dir: &Path, personal: &[PathBuf]) -> Result<()> {
    tokio::fs::create_dir_all(mods_dir).await?;
    let mut entries = tokio::fs::read_dir(mods_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        if entry.path().extension().is_some_and(|ext| ext.eq_ignore_ascii_case("jar")) { tokio::fs::remove_file(entry.path()).await?; }
    }
    for path in personal {
        if let Some(name) = path.file_name() { tokio::fs::copy(path, mods_dir.join(name)).await?; }
    }
    Ok(())
}

fn is_jar(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".jar")
}

/// Premier nom libre dans `dir` pour `name` : `mod.jar`, puis `mod-1.jar`, `mod-2.jar`…
fn free_name(dir: &Path, name: &str) -> PathBuf {
    let (stem, extension) = name.rsplit_once('.').unwrap_or((name, "jar"));
    (0..).map(|n| dir.join(if n == 0 { name.to_owned() } else { format!("{stem}-{n}.{extension}") })).find(|path| !path.exists()).unwrap()
}

/// Instance Clover : transfère dans « Mes mods » les jars de `mods/` que le launcher n'y a pas
/// posés (ajoutés à la main), avant que `sync` ne vide le dossier. Sont reconnus comme posés par
/// le launcher : un fichier du catalogue (nom ou empreinte d'un mod du manifeste, activé ou non)
/// et la copie conforme d'un fichier de « Mes mods ». Renvoie les noms transférés.
pub async fn adopt_unknown(mods_dir: &Path, personal_dir: &Path, manifest: &Manifest) -> Result<Vec<String>> {
    let Ok(mut entries) = tokio::fs::read_dir(mods_dir).await else { return Ok(Vec::new()) };
    let files: Vec<_> = manifest.mods.iter().filter_map(|m| m.file.as_ref()).collect();
    let mut adopted = Vec::new();
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        if !is_jar(&name) || !path.is_file() || files.iter().any(|file| file.filename == name) {
            continue;
        }
        let bytes = tokio::fs::read(&path).await?;
        if tokio::fs::read(personal_dir.join(&name)).await.is_ok_and(|copy| copy == bytes) {
            continue;
        }
        let sha512: String = Sha512::digest(&bytes).iter().map(|byte| format!("{byte:02x}")).collect();
        if files.iter().any(|file| file.sha512.eq_ignore_ascii_case(&sha512)) {
            continue;
        }
        tokio::fs::create_dir_all(personal_dir).await?;
        let target = free_name(personal_dir, &name);
        if tokio::fs::rename(&path, &target).await.is_err() {
            tokio::fs::copy(&path, &target).await?;
            tokio::fs::remove_file(&path).await?;
        }
        adopted.push(target.file_name().unwrap_or_default().to_string_lossy().into_owned());
    }
    Ok(adopted)
}

/// Instance Clover : le catalogue va dans `clover_dir`, hors du dossier de jeu, et `mods/` ne garde
/// que les mods du joueur. Renvoie les jars du catalogue, à charger par `fabric.addMods`.
pub async fn sync(
    http: &reqwest::Client,
    mods_dir: &Path,
    clover_dir: &Path,
    manifest: &Manifest,
    enabled: &HashSet<String>,
    personal: &[PathBuf],
    on_progress: &(dyn Fn(usize, usize) + Sync),
) -> Result<Vec<PathBuf>> {
    tokio::fs::create_dir_all(mods_dir).await?;
    tokio::fs::create_dir_all(clover_dir).await?;
    let files: Vec<_> = manifest.mods_to_install(enabled).into_iter().filter_map(|m| m.file.as_ref()).collect();
    // Défense en profondeur : même signé, un nom de fichier ne doit pas sortir de son dossier.
    if files.iter().any(|file| file.filename.contains(['/', '\\']) || file.filename.starts_with('.')) {
        return Err(GameError::InvalidVersion("nom de fichier de mod invalide".into()));
    }
    let catalogue: HashSet<&str> = files.iter().map(|file| file.filename.as_str()).collect();

    let mut entries = tokio::fs::read_dir(clover_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_jar(&name) && !catalogue.contains(name.as_str()) {
            tokio::fs::remove_file(entry.path()).await?;
        }
    }
    // `mods/` ne garde aucun jar : ceux du catalogue posés là par les versions précédentes sont
    // déplacés (pas de nouveau téléchargement), les autres — copies de « Mes mods », les jars
    // inconnus ayant été transférés par `adopt_unknown` — retirés puis recopiés de « Mes mods ».
    let mut entries = tokio::fs::read_dir(mods_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_jar(&name) {
            continue;
        }
        let target = clover_dir.join(&name);
        if catalogue.contains(name.as_str()) && !target.exists() && tokio::fs::rename(entry.path(), &target).await.is_ok() {
            continue;
        }
        tokio::fs::remove_file(entry.path()).await?;
    }

    let jars: Vec<PathBuf> = files.iter().map(|file| clover_dir.join(&file.filename)).collect();
    let downloads = files
        .iter()
        .zip(&jars)
        .map(|(file, path)| Download {
            url: file.url.clone(),
            path: path.clone(),
            checksum: Some(Checksum::Sha512(file.sha512.clone())),
            size: Some(file.size),
            executable: false,
        })
        .collect();
    download_all(http, downloads, on_progress).await?;

    // Un mod du joueur déjà fourni par le catalogue ferait planter Fabric (« duplicate mod ») :
    // la version du catalogue l'emporte.
    let catalogue_ids: HashSet<String> = jars.iter().filter_map(|path| personal::fabric_id(path)).collect();
    for path in personal {
        let Some(name) = path.file_name() else { continue };
        let duplicate = catalogue.contains(name.to_string_lossy().as_ref())
            || personal::fabric_id(path).is_some_and(|id| catalogue_ids.contains(&id));
        if duplicate {
            eprintln!("[mods] {} ignoré : déjà fourni par le catalogue Clover", name.to_string_lossy());
            continue;
        }
        tokio::fs::copy(path, mods_dir.join(name)).await?;
    }
    Ok(jars)
}

#[cfg(test)]
mod instance_tests {
    use super::*;
    #[tokio::test]
    async fn switching_shared_instances_replaces_only_active_jars() {
        let root = std::env::temp_dir().join(format!("clover-mod-switch-{}", rand::random::<u64>()));
        let active = root.join("game/mods");
        let source = root.join("personal-mods");
        std::fs::create_dir_all(&active).unwrap();
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(active.join("clover.jar"), b"catalogue").unwrap();
        std::fs::write(active.join("note.txt"), b"keep").unwrap();
        std::fs::write(source.join("fabric.jar"), b"personal").unwrap();
        sync_personal(&active, &[source.join("fabric.jar")]).await.unwrap();
        assert!(!active.join("clover.jar").exists());
        assert!(active.join("fabric.jar").exists());
        sync_personal(&active, &[]).await.unwrap();
        assert!(!active.join("fabric.jar").exists());
        assert!(source.join("fabric.jar").exists());
        assert!(active.join("note.txt").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn catalogue_leaves_the_game_folder() {
        let root = std::env::temp_dir().join(format!("clover-mod-hidden-{}", rand::random::<u64>()));
        let (active, clover, source) = (root.join("game/mods"), root.join("clover-mods"), root.join("personal-mods"));
        for dir in [&active, &clover, &source] {
            std::fs::create_dir_all(dir).unwrap();
        }
        // Posés par le launcher : mod client d'une version précédente, mod désactivé du catalogue
        // renommé (reconnu à son empreinte), copie conforme d'un mod du joueur.
        std::fs::write(active.join("cloverclient.jar"), b"c").unwrap();
        std::fs::write(active.join("lithium-renomme.jar"), b"l").unwrap();
        std::fs::write(active.join("extra.jar"), b"x").unwrap();
        // Déposés à la main : un mod inconnu, un mod homonyme d'un mod du joueur mais différent.
        std::fs::write(active.join("mon-mod.jar"), b"m").unwrap();
        std::fs::write(active.join("fabric.jar"), b"modifie").unwrap();
        std::fs::write(active.join("note.txt"), b"keep").unwrap();
        std::fs::write(clover.join("sodium.jar"), b"s").unwrap();
        std::fs::write(clover.join("iris.jar"), b"i").unwrap();
        std::fs::write(source.join("fabric.jar"), b"personal").unwrap();
        std::fs::write(source.join("sodium.jar"), b"doublon").unwrap();
        std::fs::write(source.join("extra.jar"), b"x").unwrap();
        let lithium: String = Sha512::digest(b"l").iter().map(|byte| format!("{byte:02x}")).collect();
        let manifest: Manifest = serde_json::from_str(&r#"{
            "schema": 1, "serial": 1, "minLauncherVersion": "0.1.0",
            "minecraft": {"version": "26.2"}, "fabric": {"loader": "0.19.5"},
            "server": {"host": "play.clovergames.fr"}, "modes": [],
            "mods": [
                {"id": "sodium", "name": "Sodium", "description": null, "category": null, "default": true,
                 "hidden": false, "available": true, "requires": [],
                 "file": {"filename": "sodium.jar", "url": "https://x/sodium.jar", "sha512": "00", "size": 1}},
                {"id": "cloverclient", "name": "Clover", "description": null, "category": null, "default": false,
                 "hidden": true, "always": true, "available": true, "requires": [],
                 "file": {"filename": "cloverclient.jar", "url": "https://x/cloverclient.jar", "sha512": "00", "size": 1}},
                {"id": "lithium", "name": "Lithium", "description": null, "category": null, "default": false,
                 "hidden": false, "available": true, "requires": [],
                 "file": {"filename": "lithium.jar", "url": "https://x/lithium.jar", "sha512": "LITHIUM", "size": 1}}
            ]
        }"#.replace("LITHIUM", &lithium)).unwrap();
        let mut adopted = adopt_unknown(&active, &source, &manifest).await.unwrap();
        adopted.sort();
        assert_eq!(adopted, ["fabric-1.jar", "mon-mod.jar"]);
        assert_eq!(std::fs::read(source.join("mon-mod.jar")).unwrap(), b"m");
        assert_eq!(std::fs::read(source.join("fabric-1.jar")).unwrap(), b"modifie");
        assert_eq!(std::fs::read(source.join("fabric.jar")).unwrap(), b"personal");
        let personal = ["fabric.jar", "fabric-1.jar", "mon-mod.jar", "sodium.jar"].map(|name| source.join(name));
        let http = super::super::download::client();
        let mut jars = sync(&http, &active, &clover, &manifest, &manifest.default_mods(), &personal, &|_, _| {}).await.unwrap();
        jars.sort();
        assert_eq!(jars, [clover.join("cloverclient.jar"), clover.join("sodium.jar")]);
        assert_eq!(std::fs::read(clover.join("cloverclient.jar")).unwrap(), b"c");
        assert!(!clover.join("iris.jar").exists());
        let mut left: Vec<_> = std::fs::read_dir(&active).unwrap().map(|entry| entry.unwrap().file_name()).collect();
        left.sort();
        assert_eq!(left, ["fabric-1.jar", "fabric.jar", "mon-mod.jar", "note.txt"]);
        std::fs::remove_dir_all(root).unwrap();
    }
}
