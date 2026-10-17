//! Dossier du launcher (jeu, instances, réglages) : `~/.cloverlauncher` par défaut, déplaçable depuis
//! Paramètres › Stockage. L'emplacement choisi est noté dans le dossier de configuration de
//! l'application, hors du dossier déplacé ; il est lu une fois au démarrage.
//!
//! Le déplacement renomme le dossier s'il reste sur le même disque, sinon le copie puis supprime
//! l'original une fois la copie terminée. En cas d'échec, la copie partielle est supprimée et
//! l'original reste en place : rien n'est perdu. Le launcher redémarre ensuite sur le nouvel
//! emplacement.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{game, instances, AppState};

const FILE: &str = "location.json";
/// Nom du dossier créé dans un dossier choisi qui n'est pas vide.
const FOLDER: &str = "Clover Launcher";

/// Fichier posé dans la destination une fois la copie complète, avant la suppression de l'original.
const COPIED: &str = ".clover-copie-terminee";

#[derive(Serialize, Deserialize)]
struct Location {
    root: PathBuf,
    /// Ancien dossier, tant que le déplacement n'est pas validé : un déplacement interrompu en cours
    /// de copie repart de lui, qui est alors intact.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    from: Option<PathBuf>,
}

impl Location {
    /// Dossier à utiliser : la destination si elle existe et que la copie est complète ou que
    /// l'ancien dossier a disparu (renommage), sinon l'ancien dossier d'un déplacement interrompu.
    fn resolve(self) -> Option<PathBuf> {
        match self.from {
            Some(from) if from.is_dir() && !self.root.join(COPIED).is_file() => Some(from),
            _ => self.root.is_dir().then_some(self.root),
        }
    }
}

fn file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(FILE))
}

/// Écriture atomique : l'ancienne adresse reste lisible tant que la nouvelle n'est pas complète.
fn write_location(path: &Path, location: &Location) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, serde_json::to_vec(location).expect("emplacement sérialisable"))?;
    std::fs::rename(temporary, path)
}

/// Dossier choisi par le joueur, s'il existe encore ; sinon l'emplacement par défaut.
pub fn custom_root(app: &AppHandle) -> Option<PathBuf> {
    static ROOT: OnceLock<Option<PathBuf>> = OnceLock::new();
    ROOT.get_or_init(|| {
        let location: Location = serde_json::from_slice(&std::fs::read(file(app)?).ok()?).ok()?;
        location.resolve()
    })
    .clone()
}

/// Dossiers synchronisés : le jeu y écrit des milliers de petits fichiers, que l'outil de
/// synchronisation verrouille ou envoie en ligne à chaque partie.
fn synced(path: &Path) -> bool {
    let text = path.to_string_lossy().to_lowercase();
    let env_roots = ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"].iter().filter_map(std::env::var_os).map(|root| root.to_string_lossy().to_lowercase());
    let markers = ["onedrive", "dropbox", "google drive", "googledrive", "icloud", "mobile documents"];
    // Découpé sur les deux séparateurs : le même contrôle vaut pour un chemin Windows ou Unix.
    env_roots.into_iter().any(|root| !root.is_empty() && text.starts_with(&root))
        || text.split(['/', '\\']).any(|part| markers.iter().any(|marker| part.starts_with(marker)))
}

/// Destination réelle : le dossier choisi s'il est vide ou absent, sinon `Clover Launcher` dedans.
fn destination(chosen: &Path, current: &Path) -> Result<PathBuf, String> {
    if !chosen.is_absolute() {
        return Err("Choisis un dossier complet.".into());
    }
    if synced(chosen) {
        return Err("Ce dossier est synchronisé (OneDrive, Dropbox…) : choisis-en un autre, sur le disque de l'ordinateur.".into());
    }
    let empty = std::fs::read_dir(chosen).map_or(true, |mut entries| entries.next().is_none());
    let target = if empty { chosen.to_path_buf() } else { chosen.join(FOLDER) };
    let (current, parent) = (canonical(current), canonical(chosen));
    if parent.starts_with(&current) || current.starts_with(canonical(&target)) {
        return Err("Le nouveau dossier ne peut pas être dans l'actuel, ni le contenir.".into());
    }
    if target.exists() && std::fs::read_dir(&target).map_or(true, |mut entries| entries.next().is_some()) {
        return Err(format!("{} existe déjà et n'est pas vide.", target.display()));
    }
    // Droit d'écriture : un fichier d'essai, aussitôt supprimé.
    std::fs::create_dir_all(chosen).map_err(|e| format!("Dossier inaccessible : {e}"))?;
    let probe = chosen.join(".clover-write-test");
    std::fs::write(&probe, b"").map_err(|_| "Le launcher ne peut pas écrire dans ce dossier.".to_owned())?;
    let _ = std::fs::remove_file(probe);
    Ok(target)
}

/// Chemin canonique, même s'il n'existe pas encore : son plus proche parent existant est résolu.
fn canonical(path: &Path) -> PathBuf {
    let mut existing = path;
    let mut rest = Vec::new();
    while !existing.exists() {
        let (Some(parent), Some(name)) = (existing.parent(), existing.file_name()) else { return path.to_path_buf() };
        rest.push(name);
        existing = parent;
    }
    let mut resolved = std::fs::canonicalize(existing).unwrap_or_else(|_| existing.to_path_buf());
    resolved.extend(rest.into_iter().rev());
    resolved
}

/// Lien symbolique ou jonction : la copie ne le suivrait pas, l'original supprimé l'emporterait.
fn is_link(entry: &std::fs::DirEntry) -> std::io::Result<bool> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const REPARSE_POINT: u32 = 0x400;
        Ok(entry.metadata()?.file_attributes() & REPARSE_POINT != 0)
    }
    #[cfg(not(windows))]
    {
        Ok(entry.file_type()?.is_symlink())
    }
}

/// Liste les fichiers de `dir` ; un lien symbolique (un `saves` ou un `mods` lié ailleurs) fait
/// refuser le déplacement entre disques plutôt que de le perdre.
fn files(dir: &Path, out: &mut Vec<(PathBuf, u64)>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        if is_link(&entry)? {
            return Err(std::io::Error::other(format!(
                "{} est un lien vers un autre dossier, impossible à copier sur un autre disque. Remplace-le par un vrai dossier, puis recommence.",
                entry.path().display()
            )));
        }
        let kind = entry.file_type()?;
        if kind.is_dir() {
            files(&entry.path(), out)?;
        } else if kind.is_file() {
            out.push((entry.path(), entry.metadata()?.len()));
        }
    }
    Ok(())
}

/// Déplace `from` vers `to` (absent ou vide). Renommage sur le même disque ; sinon copie fichier par
/// fichier (`progress` de 0 à 1), puis suppression de l'original. Échec : copie retirée, original
/// intact.
fn relocate(from: &Path, to: &Path, progress: &dyn Fn(f64)) -> std::io::Result<()> {
    if to.exists() {
        std::fs::remove_dir(to)?;
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if std::fs::rename(from, to).is_ok() {
        progress(1.0);
        return Ok(());
    }
    let mut list = Vec::new();
    files(from, &mut list)?;
    let total = list.iter().map(|(_, bytes)| bytes).sum::<u64>().max(1);
    let copy = || -> std::io::Result<()> {
        let mut done = 0;
        for (path, bytes) in &list {
            let target = to.join(path.strip_prefix(from).map_err(std::io::Error::other)?);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(path, &target)?;
            done += bytes;
            progress(done as f64 / total as f64);
        }
        Ok(())
    };
    if let Err(error) = copy() {
        let _ = std::fs::remove_dir_all(to);
        return Err(error);
    }
    // Copie complète : l'original peut partir. Un fichier qui résiste ne remet pas la copie en cause.
    if let Err(error) = std::fs::write(to.join(COPIED), b"") {
        let _ = std::fs::remove_dir_all(to);
        return Err(error);
    }
    if let Err(error) = std::fs::remove_dir_all(from) {
        eprintln!("[dossier] ancien dossier pas entièrement supprimé : {error}");
    }
    Ok(())
}

/// Ouvre le sélecteur de dossier du système.
#[tauri::command]
pub async fn pick_game_dir(app: AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || app.dialog().file().set_title("Nouveau dossier du Clover Launcher").blocking_pick_folder())
        .await
        .ok()
        .flatten()
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().into_owned())
}

/// Déplace le dossier du launcher dans `chosen`, puis redémarre le launcher. Refusé pendant une
/// partie ou une installation. Avancement : évènement `move-progress` (0 à 1).
#[tauri::command]
pub async fn move_game_dir(chosen: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    const BUSY: &str = "Ferme Minecraft et attends la fin des téléchargements avant de déplacer le dossier.";
    let gate = app.state::<crate::LaunchGate>();
    let _guard = gate.0.try_lock().map_err(|_| BUSY)?;
    if app.state::<game::games::Games>().any_running() || instances::managed_game_running(&state.root) {
        return Err(BUSY.into());
    }
    let current = state.root.clone();
    let target = destination(Path::new(&chosen), &current)?;
    let location = file(&app).ok_or("Dossier de configuration introuvable.")?;
    let handle = app.clone();
    let moved = target.clone();
    // Nouvelle adresse notée avant le déplacement, avec l'ancien dossier : un arrêt en plein milieu
    // ne laisse pas le launcher repartir sur un dossier vide.
    let previous = std::fs::read(&location).ok();
    write_location(&location, &Location { root: target.clone(), from: Some(current.clone()) }).map_err(|e| format!("Adresse non enregistrée, rien n'a changé : {e}"))?;
    let restore = || match &previous {
        Some(bytes) => {
            let _ = std::fs::write(&location, bytes);
        }
        None => {
            let _ = std::fs::remove_file(&location);
        }
    };
    let result = tauri::async_runtime::spawn_blocking(move || {
        relocate(&current, &moved, &|ratio| {
            let _ = handle.emit("move-progress", ratio);
        })
    })
    .await
    .map_err(|e| e.to_string());
    if let Err(error) = result.and_then(|moved| moved.map_err(|e| format!("Déplacement annulé, rien n'a changé : {e}"))) {
        restore();
        return Err(error);
    }
    // Validation : l'adresse définitive est relue avant de redémarrer dessus.
    let confirmed = write_location(&location, &Location { root: target.clone(), from: None })
        .ok()
        .and_then(|()| serde_json::from_slice::<Location>(&std::fs::read(&location).ok()?).ok())
        .is_some_and(|saved| saved.root == target && saved.from.is_none());
    if !confirmed {
        return Err(format!("Le dossier a été déplacé dans {}, mais son adresse n'a pas pu être enregistrée. Relance le launcher.", target.display()));
    }
    let _ = std::fs::remove_file(target.join(COPIED));
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("clover-location-{name}-{}", rand::random::<u64>()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn refuses_synced_nested_and_busy_destinations() {
        let current = temp("current");
        let elsewhere = temp("elsewhere");
        assert!(synced(Path::new(r"C:\Users\joueur\OneDrive\Jeux")));
        assert!(synced(Path::new("/Users/joueur/Library/Mobile Documents/com~apple~CloudDocs")));
        assert!(!synced(Path::new(r"D:\Jeux")));
        assert!(destination(&current.join("sous-dossier"), &current).is_err());
        assert!(destination(Path::new("relatif"), &current).is_err());
        // Dossier vide : utilisé tel quel ; non vide : « Clover Launcher » dedans.
        assert_eq!(destination(&elsewhere, &current).unwrap(), elsewhere);
        std::fs::write(elsewhere.join("autre.txt"), "x").unwrap();
        assert_eq!(destination(&elsewhere, &current).unwrap(), elsewhere.join(FOLDER));
        std::fs::create_dir_all(elsewhere.join(FOLDER)).unwrap();
        std::fs::write(elsewhere.join(FOLDER).join("occupé.txt"), "x").unwrap();
        assert!(destination(&elsewhere, &current).is_err());
        for dir in [current, elsewhere] {
            std::fs::remove_dir_all(dir).unwrap();
        }
    }

    #[test]
    fn an_interrupted_move_falls_back_to_the_original_folder() {
        let (from, to) = (temp("from"), temp("to"));
        let location = || Location { root: to.clone(), from: Some(from.clone()) };
        assert_eq!(location().resolve(), Some(from.clone()));
        std::fs::write(to.join(COPIED), "").unwrap();
        assert_eq!(location().resolve(), Some(to.clone()));
        std::fs::remove_dir_all(&from).unwrap();
        std::fs::remove_file(to.join(COPIED)).unwrap();
        assert_eq!(location().resolve(), Some(to.clone()));
        assert_eq!(Location { root: to.clone(), from: None }.resolve(), Some(to.clone()));
        std::fs::remove_dir_all(to).unwrap();
    }

    #[test]
    fn a_linked_folder_refuses_the_cross_disk_copy() {
        let from = temp("linked");
        let outside = temp("outside");
        std::fs::write(outside.join("level.dat"), "monde").unwrap();
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_dir(&outside, from.join("saves")).is_ok();
        #[cfg(unix)]
        let linked = std::os::unix::fs::symlink(&outside, from.join("saves")).is_ok();
        if linked {
            let error = files(&from, &mut Vec::new()).unwrap_err();
            assert!(error.to_string().contains("lien"), "{error}");
        }
        for dir in [from, outside] {
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    #[test]
    fn moves_everything_and_reports_progress() {
        let from = temp("from");
        std::fs::create_dir_all(from.join("game/saves/Monde")).unwrap();
        std::fs::write(from.join("game/saves/Monde/level.dat"), "monde").unwrap();
        std::fs::write(from.join("launcher.json"), "{}").unwrap();
        let to = temp("to").join("Clover Launcher");
        let ratios = std::sync::Mutex::new(Vec::new());
        relocate(&from, &to, &|ratio| ratios.lock().unwrap().push(ratio)).unwrap();
        assert_eq!(std::fs::read_to_string(to.join("game/saves/Monde/level.dat")).unwrap(), "monde");
        assert!(to.join("launcher.json").is_file() && !from.exists());
        assert_eq!(ratios.lock().unwrap().last().copied(), Some(1.0));
        std::fs::remove_dir_all(to.parent().unwrap()).unwrap();
    }
}
