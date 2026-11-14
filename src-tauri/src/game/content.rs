//! Contenus Modrinth autres que les mods : packs de ressources, shaders et datapacks (une archive
//! posée dans le bon dossier) et modpacks (`.mrpack` : liste de fichiers à télécharger, plus des
//! fichiers inclus, voir https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack).

use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};

use super::download::{download_all, Checksum, Download};
use super::modrinth::{self, Kind};
use super::personal::ModLoader;
use super::{GameError, Result};

/// Hôtes d'où un modpack peut faire télécharger ses fichiers (liste du format `.mrpack`).
const ALLOWED_HOSTS: [&str; 4] = ["cdn.modrinth.com", "github.com", "raw.githubusercontent.com", "gitlab.com"];
/// Un fichier inclus plus gros serait anormal : refusé plutôt que d'emplir le disque.
const MAX_OVERRIDE: u64 = 512 * 1024 * 1024;

/// Nom d'archive acceptable dans un dossier de jeu : `.zip`, sans chemin ni fichier caché.
fn safe_archive(name: &str) -> Option<&str> {
    let ok = name.to_ascii_lowercase().ends_with(".zip") && !name.starts_with('.') && !name.contains(['/', '\\', ':']) && name.len() <= 200;
    ok.then_some(name)
}

/// Fichier principal d'une version, vérifié par son empreinte une fois téléchargé.
fn primary_download(version: &modrinth::Version, path: PathBuf) -> Result<Download> {
    let file = version.primary_file().ok_or(GameError::NoUpdate)?;
    let sha512 = file.hashes.get("sha512").ok_or(GameError::NoUpdate)?;
    Ok(Download { url: file.url.clone(), path, checksum: Some(Checksum::Sha512(sha512.clone())), size: Some(file.size), executable: false })
}

/// Télécharge la dernière version de `project` (pack de ressources, shader ou datapack) pour
/// `minecraft` dans `dir` ; renvoie le nom du fichier.
pub async fn install_archive(http: &reqwest::Client, dir: &Path, kind: Kind, project: &str, minecraft: &str) -> Result<String> {
    let version = modrinth::compatible_version(http, project, &[kind.loader()], Some(minecraft)).await?.ok_or(GameError::NoUpdate)?;
    let file = version.primary_file().ok_or(GameError::NoUpdate)?;
    let filename = safe_archive(&file.filename).ok_or_else(|| GameError::InvalidVersion(format!("fichier inattendu « {} »", file.filename)))?.to_owned();
    std::fs::create_dir_all(dir)?;
    download_all(http, vec![primary_download(&version, dir.join(&filename))?], &|_, _| {}).await?;
    Ok(filename)
}

// ── Nom et logo des packs, shaders et datapacks (comme « Mes mods ») ──────────────

/// Au-delà, le logo du pack n'est pas repris : il voyagerait en entier vers l'interface.
const MAX_ICON: u64 = 256 * 1024;

/// Logo `pack.png` à la racine d'un pack (`.zip` ou dossier), en adresse `data:`.
pub fn pack_icon(path: &Path) -> Option<String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = if path.is_dir() {
        let file = path.join("pack.png");
        if std::fs::metadata(&file).ok()?.len() > MAX_ICON {
            return None;
        }
        std::fs::read(file).ok()?
    } else {
        let mut archive = zip::ZipArchive::new(std::fs::File::open(path).ok()?).ok()?;
        let mut entry = archive.by_name("pack.png").ok()?;
        if entry.size() > MAX_ICON {
            return None;
        }
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).ok()?;
        bytes
    };
    bytes.starts_with(b"\x89PNG").then(|| format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

/// Taille et date de modification d'un fichier.
type Stamp = (u64, Option<SystemTime>);

/// Empreintes déjà calculées, par fichier : un pack de plusieurs centaines de Mo n'est relu que
/// s'il change.
static HASHES: LazyLock<Mutex<HashMap<PathBuf, (Stamp, String)>>> = LazyLock::new(Default::default);

/// Empreinte SHA-512 d'une archive, pour la reconnaître sur Modrinth ; `None` pour un dossier.
pub fn archive_hash(path: &Path) -> Option<String> {
    let metadata = std::fs::metadata(path).ok().filter(std::fs::Metadata::is_file)?;
    let stamp = (metadata.len(), metadata.modified().ok());
    if let Some((known, hash)) = HASHES.lock().expect("empreintes").get(path) {
        if *known == stamp {
            return Some(hash.clone());
        }
    }
    let hash = super::personal::sha512(path).ok()?;
    HASHES.lock().expect("empreintes").insert(path.to_path_buf(), (stamp, hash.clone()));
    Some(hash)
}

/// Projets Modrinth (nom, logo) des archives reconnues par leur empreinte. Sans réseau : vide.
pub async fn identify_archives(http: &reqwest::Client, hashes: Vec<String>) -> HashMap<String, modrinth::Summary> {
    if hashes.is_empty() {
        return HashMap::new();
    }
    let versions = match modrinth::identify(http, hashes).await {
        Ok(versions) => versions,
        Err(e) => {
            eprintln!("[contenu] Modrinth injoignable pour identifier les packs : {e}");
            return HashMap::new();
        }
    };
    let ids: Vec<String> = versions.values().map(|version| version.project_id.clone()).collect::<HashSet<_>>().into_iter().collect();
    let projects = modrinth::projects(http, &ids).await.unwrap_or_else(|e| {
        eprintln!("[contenu] Modrinth injoignable pour les noms des packs : {e}");
        HashMap::new()
    });
    versions.into_iter().filter_map(|(hash, version)| Some((hash, projects.get(&version.project_id)?.clone()))).collect()
}

/// Monde existant de `saves`, désigné par le nom de son dossier.
pub fn world_dir(saves: &Path, world: &str) -> Result<PathBuf> {
    let dir = saves.join(world);
    let plain = !world.is_empty() && !world.starts_with('.') && !world.contains(['/', '\\', ':']);
    if !plain || !dir.join("level.dat").is_file() {
        return Err(GameError::InvalidVersion(format!("monde « {world} » introuvable")));
    }
    Ok(dir)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Index {
    pub name: String,
    files: Vec<PackFile>,
    dependencies: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackFile {
    path: String,
    hashes: HashMap<String, String>,
    #[serde(default)]
    env: Option<Env>,
    downloads: Vec<String>,
    file_size: u64,
}

#[derive(Debug, Deserialize)]
struct Env {
    client: String,
}

impl Index {
    /// Version de Minecraft, loader (Fabric, Quilt, Forge ou NeoForge) et version du loader demandés.
    pub fn versions(&self) -> Result<(String, ModLoader, String)> {
        let minecraft = self.dependencies.get("minecraft").ok_or_else(|| GameError::InvalidVersion("modpack sans version de Minecraft".into()))?;
        let mut loaders = self.dependencies.iter().filter(|(key, _)| key.as_str() != "minecraft").map(|(key, version)| {
            let loader = match key.as_str() {
                "fabric-loader" => ModLoader::Fabric,
                "quilt-loader" => ModLoader::Quilt,
                "forge" => ModLoader::Forge,
                "neoforge" => ModLoader::NeoForge,
                other => return Err(GameError::InvalidVersion(format!("ce modpack demande « {other} », que le launcher ne prend pas en charge"))),
            };
            // Certains packs écrivent la version de Forge précédée de celle du jeu (`1.20.1-47.2.0`).
            Ok((loader, version.strip_prefix(&format!("{minecraft}-")).unwrap_or(version).to_owned()))
        });
        let (loader, version) = loaders.next().ok_or_else(|| GameError::InvalidVersion("modpack sans loader".into()))??;
        if loaders.next().is_some() {
            return Err(GameError::InvalidVersion("ce modpack demande plusieurs loaders à la fois".into()));
        }
        Ok((minecraft.clone(), loader, version))
    }
}

/// Télécharge le `.mrpack` de `project` dans `dir` et lit son index : la version `version`
/// (identifiant Modrinth) ou, sans elle, la dernière stable.
pub async fn fetch_modpack(http: &reqwest::Client, project: &str, version: Option<&str>, dir: &Path) -> Result<(PathBuf, Index)> {
    let version = match version {
        Some(version) => modrinth::project_version(http, project, version).await?,
        None => {
            let mut versions = modrinth::modpack_versions(http, project).await?;
            let stable = versions.iter().position(|version| version.version_type == "release").unwrap_or(0);
            if versions.is_empty() {
                return Err(GameError::NoUpdate);
            }
            versions.swap_remove(stable)
        }
    };
    std::fs::create_dir_all(dir)?;
    let archive = dir.join(format!("{project}.mrpack"));
    download_all(http, vec![primary_download(&version, archive.clone())?], &|_, _| {}).await?;
    let index = read_index(&archive)?.ok_or_else(|| GameError::Corrupted("modrinth.index.json absent".into()))?;
    Ok((archive, index))
}

/// Index d'un `.mrpack` ; `None` si l'archive n'en a pas (ce n'est pas un modpack Modrinth).
pub fn read_index(archive: &Path) -> Result<Option<Index>> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(archive)?).map_err(|e| GameError::Corrupted(e.to_string()))?;
    let mut text = String::new();
    match zip.by_name("modrinth.index.json") {
        Ok(file) => file.take(16 * 1024 * 1024).read_to_string(&mut text)?,
        Err(_) => return Ok(None),
    };
    Ok(Some(serde_json::from_str(&text)?))
}

/// Chemin relatif sûr (`mods/x.jar`, `config/y.json`), jamais hors du dossier de l'instance.
fn relative(path: &str) -> Option<PathBuf> {
    let path = Path::new(path);
    let plain = path.components().all(|component| matches!(component, Component::Normal(_)));
    (plain && path.components().next().is_some()).then(|| path.to_path_buf())
}

/// Où va un fichier du pack : les `.jar` de `mods/` dans les mods de l'instance (recopiés dans le
/// jeu au lancement), tout le reste dans son dossier de jeu.
fn target(path: &Path, game: &Path, mods: &Path) -> PathBuf {
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) if parent == Path::new("mods") && path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("jar")) => mods.join(name),
        _ => game.join(path),
    }
}

fn allowed(url: &str) -> bool {
    url::Url::parse(url).is_ok_and(|url| url.scheme() == "https" && url.host_str().is_some_and(|host| ALLOWED_HOSTS.contains(&host)))
}

/// Téléchargements de l'index (sauf ceux réservés au serveur), à leur place dans `game` et `mods`.
fn pack_downloads(index: &Index, game: &Path, mods: &Path) -> Result<Vec<Download>> {
    let mut downloads = Vec::new();
    for file in index.files.iter().filter(|file| file.env.as_ref().is_none_or(|env| env.client != "unsupported")) {
        let path = relative(&file.path).ok_or_else(|| GameError::InvalidVersion(format!("chemin refusé « {} »", file.path)))?;
        let url = file.downloads.iter().find(|url| allowed(url)).ok_or_else(|| GameError::InvalidVersion(format!("source refusée pour « {} »", file.path)))?;
        let checksum = match (file.hashes.get("sha512"), file.hashes.get("sha1")) {
            (Some(sha512), _) => Checksum::Sha512(sha512.clone()),
            (None, Some(sha1)) => Checksum::Sha1(sha1.clone()),
            (None, None) => return Err(GameError::InvalidVersion(format!("empreinte absente pour « {} »", file.path))),
        };
        downloads.push(Download { url: url.clone(), path: target(&path, game, mods), checksum: Some(checksum), size: Some(file.file_size), executable: false });
    }
    Ok(downloads)
}

/// Pose les fichiers du modpack dans `game` et `mods` : téléchargements de l'index, puis fichiers
/// inclus (`overrides`, puis `client-overrides` qui l'emporte).
pub async fn install_modpack(http: &reqwest::Client, archive: &Path, index: &Index, game: &Path, mods: &Path, on_progress: &(dyn Fn(usize, usize) + Sync)) -> Result<()> {
    download_all(http, pack_downloads(index, game, mods)?, on_progress).await?;
    copy_overrides(archive, &["overrides", "client-overrides"], game, mods, true)
}

/// Copie les fichiers inclus dans l'archive, dossier par dossier de `folders` (le dernier l'emporte),
/// dans `game` et `mods` ; jamais hors de l'instance. Sans `replace`, un fichier déjà là est gardé.
pub fn copy_overrides(archive: &Path, folders: &[&str], game: &Path, mods: &Path, replace: bool) -> Result<()> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(archive)?).map_err(|e| GameError::Corrupted(e.to_string()))?;
    for folder in folders {
        let prefix = format!("{folder}/");
        for index in 0..zip.len() {
            let mut entry = zip.by_index(index).map_err(|e| GameError::Corrupted(e.to_string()))?;
            let Some(name) = entry.name().strip_prefix(prefix.as_str()).map(str::to_owned) else { continue };
            if entry.is_dir() || name.is_empty() {
                continue;
            }
            let path = relative(&name).ok_or_else(|| GameError::InvalidVersion(format!("chemin refusé « {name} »")))?;
            if entry.size() > MAX_OVERRIDE {
                return Err(GameError::InvalidVersion(format!("fichier trop lourd « {name} »")));
            }
            let destination = target(&path, game, mods);
            if !replace && destination.exists() {
                continue;
            }
            if let Some(parent) = destination.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::io::copy(&mut (&mut entry).take(MAX_OVERRIDE), &mut std::fs::File::create(destination)?)?;
        }
    }
    Ok(())
}

// ── Mise à jour d'un modpack ────────────────────────────────────────────────────

/// Versions Modrinth des mods qu'une version de modpack inclut (Modrinth les liste d'après son index).
fn embedded(version: &modrinth::Version) -> HashSet<&str> {
    version.dependencies.iter().filter_map(|dependency| dependency.version_id.as_deref()).collect()
}

/// Mod de l'instance reconnu sur Modrinth.
struct Present {
    file: String,
    version: String,
    project: String,
}

async fn present_mods(http: &reqwest::Client, mods: &Path) -> Result<Vec<Present>> {
    let files: Vec<(String, String)> = super::personal::jars(mods)
        .iter()
        .filter_map(|path| Some((path.file_name()?.to_string_lossy().into_owned(), super::personal::sha512(path).ok()?)))
        .collect();
    if files.is_empty() {
        return Ok(Vec::new());
    }
    let identified = modrinth::identify(http, files.iter().map(|(_, hash)| hash.clone()).collect()).await?;
    Ok(files
        .into_iter()
        .filter_map(|(file, hash)| {
            let version = identified.get(&hash)?;
            Some(Present { file, version: version.id.clone(), project: version.project_id.clone() })
        })
        .collect())
}

/// Dans `versions` (de la plus récente à la plus ancienne), la version installée : celle qui a le
/// plus de mods de l'instance, au moins la moitié (le pack compte aussi ses packs de ressources et
/// shaders, absents de « Mes mods ») ; puis la version à installer, plus récente, stable si
/// l'installée l'est. Erreur si l'instance ne ressemble à aucune version du pack.
fn pick(versions: &[modrinth::Version], present: &HashSet<&str>) -> Result<(usize, Option<usize>)> {
    let shared = |version: &modrinth::Version| embedded(version).intersection(present).count();
    // À égalité, la plus récente : parcourue en dernier, elle l'emporte.
    let installed = (0..versions.len())
        .rev()
        .filter(|&index| shared(&versions[index]) > 0 && shared(&versions[index]) * 2 >= present.len())
        .max_by_key(|&index| shared(&versions[index]))
        .ok_or_else(|| GameError::InvalidVersion("les mods de cette instance ne correspondent à aucune version de ce modpack".into()))?;
    let stable = versions[installed].version_type == "release";
    let next = (0..installed).find(|&index| !stable || versions[index].version_type == "release");
    // Tous les mods de la version proposée déjà là : rien à faire.
    Ok((installed, next.filter(|&index| !embedded(&versions[index]).is_subset(present))))
}

/// Versions du modpack `project` faites pour `minecraft` et `loader`, de la plus récente à la plus ancienne.
async fn pack_versions(http: &reqwest::Client, project: &str, minecraft: &str, loader: ModLoader) -> Result<Vec<modrinth::Version>> {
    let name = loader.modrinth_loaders()[0];
    Ok(modrinth::modpack_versions(http, project)
        .await?
        .into_iter()
        .filter(|version| version.game_versions.iter().any(|game| game == minecraft) && version.loaders.iter().any(|known| known == name))
        .collect())
}

/// Mise à jour proposée pour l'instance d'un modpack. Mêmes noms que le type `ModpackUpdate` du front.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackUpdate {
    /// Numéro de la version installée.
    installed: String,
    /// Version proposée : identifiant Modrinth et numéro.
    id: String,
    number: String,
}

/// Version plus récente du modpack `project` pour la même version de Minecraft et le même loader,
/// d'après les mods de l'instance (`mods`) ; `None` si elle est à jour.
pub async fn modpack_update(http: &reqwest::Client, project: &str, minecraft: &str, loader: ModLoader, mods: &Path) -> Result<Option<PackUpdate>> {
    let present = present_mods(http, mods).await?;
    let versions = pack_versions(http, project, minecraft, loader).await?;
    let (installed, next) = pick(&versions, &present.iter().map(|entry| entry.version.as_str()).collect())?;
    Ok(next.map(|next| PackUpdate { installed: versions[installed].version_number.clone(), id: versions[next].id.clone(), number: versions[next].version_number.clone() }))
}

/// Ce qu'une mise à jour a changé dans « Mes mods » de l'instance, et le loader demandé.
#[derive(Debug, Default)]
pub struct PackUpdated {
    /// Fichiers remplacés par la version nouvelle du même mod (ancien, nouveau).
    pub renamed: Vec<(String, String)>,
    /// Fichiers supprimés (remplacés ou retirés du pack).
    pub removed: Vec<String>,
    /// Version du loader que demande la version installée.
    pub loader: String,
}

/// Installe la version `version` du modpack dans l'instance : ses fichiers téléchargés (ceux déjà
/// là sont gardés), les mods de l'ancienne version qu'elle remplace ou retire supprimés, et ses
/// fichiers inclus seulement s'ils manquent : les réglages du joueur et ses propres mods restent.
#[allow(clippy::too_many_arguments)]
pub async fn update_modpack(http: &reqwest::Client, project: &str, version: &str, (minecraft, loader): (&str, ModLoader), game: &Path, mods: &Path, staging: &Path, on_progress: &(dyn Fn(usize, usize) + Sync)) -> Result<PackUpdated> {
    let present = present_mods(http, mods).await?;
    let versions = pack_versions(http, project, minecraft, loader).await?;
    let (installed, _) = pick(&versions, &present.iter().map(|entry| entry.version.as_str()).collect())?;
    let old = embedded(&versions[installed]);
    let (archive, index) = fetch_modpack(http, project, Some(version), staging).await?;
    let result = async {
        let (pack_minecraft, pack_loader, loader_version) = index.versions()?;
        if pack_minecraft != minecraft || pack_loader != loader {
            return Err(GameError::InvalidVersion(format!("cette version du modpack demande Minecraft {pack_minecraft} : crée une nouvelle instance pour en changer")));
        }
        let downloads = pack_downloads(&index, game, mods)?;
        // Nouveau fichier de chaque mod, par projet : un ancien fichier désactivé le reste.
        let new_mods: HashMap<String, String> = downloads
            .iter()
            .filter(|download| download.path.parent() == Some(mods))
            .filter_map(|download| Some((modrinth::cdn_project(&download.url)?.to_owned(), download.path.file_name()?.to_string_lossy().into_owned())))
            .collect();
        let kept: HashSet<String> = downloads.iter().filter(|download| download.path.parent() == Some(mods)).filter_map(|download| Some(download.path.file_name()?.to_string_lossy().into_owned())).collect();
        download_all(http, downloads, on_progress).await?;
        copy_overrides(&archive, &["overrides", "client-overrides"], game, mods, false)?;
        let mut updated = PackUpdated { loader: loader_version, ..PackUpdated::default() };
        for entry in present.iter().filter(|entry| !kept.contains(&entry.file)) {
            let replacement = new_mods.get(entry.project.as_str());
            // Un mod ajouté par le joueur, absent de l'ancienne version, n'est jamais touché.
            if replacement.is_none() && !old.contains(entry.version.as_str()) {
                continue;
            }
            std::fs::remove_file(mods.join(&entry.file))?;
            if let Some(new) = replacement {
                updated.renamed.push((entry.file.clone(), new.clone()));
            }
            updated.removed.push(entry.file.clone());
        }
        Ok(updated)
    }
    .await;
    let _ = std::fs::remove_file(&archive);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_installed_pack_version_is_read_from_the_mods() {
        let version = |id: &str, kind: &str, mods: &[&str]| -> modrinth::Version {
            let dependencies: Vec<_> = mods.iter().map(|m| serde_json::json!({ "version_id": m, "dependency_type": "embedded" })).collect();
            serde_json::from_value(serde_json::json!({ "id": id, "project_id": "p", "version_number": id, "version_type": kind, "files": [], "dependencies": dependencies })).unwrap()
        };
        // De la plus récente à la plus ancienne, comme Modrinth.
        let versions = [version("4", "beta", &["a4", "b4"]), version("3", "release", &["a3", "b3"]), version("2", "beta", &["a2", "b2"]), version("1", "release", &["a1", "b1", "pack1", "pack2", "shader"])];
        let present = |ids: &[&'static str]| ids.iter().copied().collect::<HashSet<&str>>();
        // Une stable installée ne passe qu'à une stable ; une bêta, à la plus récente.
        assert_eq!(pick(&versions, &present(&["a1", "b1", "mien"])).unwrap(), (3, Some(1)));
        assert_eq!(pick(&versions, &present(&["a2", "b2"])).unwrap(), (2, Some(0)));
        // La moitié des mods de l'instance suffit, même si le pack compte aussi des packs de
        // ressources ; à jour, rien n'est proposé.
        assert_eq!(pick(&versions, &present(&["a1"])).unwrap(), (3, Some(1)));
        assert_eq!(pick(&versions, &present(&["a3", "b3"])).unwrap(), (1, None));
        assert!(pick(&versions, &present(&["autre"])).is_err());
    }

    #[test]
    fn pack_paths_stay_inside_the_instance() {
        let (game, mods) = (Path::new("/i/game"), Path::new("/i/personal-mods"));
        assert_eq!(target(&relative("mods/sodium.jar").unwrap(), game, mods), mods.join("sodium.jar"));
        assert_eq!(target(&relative("mods/sub/x.jar").unwrap(), game, mods), game.join("mods/sub/x.jar"));
        assert_eq!(target(&relative("config/a.json").unwrap(), game, mods), game.join("config/a.json"));
        assert!(relative("../evil.jar").is_none());
        assert!(relative("/etc/passwd").is_none());
        assert!(relative("C:/Windows/x").is_none() || cfg!(not(windows)));
        assert!(relative("").is_none());
        assert!(allowed("https://cdn.modrinth.com/data/a/b.jar"));
        assert!(!allowed("http://cdn.modrinth.com/data/a/b.jar"));
        assert!(!allowed("https://example.com/b.jar"));
        assert_eq!(safe_archive("pack.zip"), Some("pack.zip"));
        assert_eq!(safe_archive("../pack.zip"), None);
        assert_eq!(safe_archive("pack.jar"), None);
    }

    #[test]
    fn modpacks_on_every_supported_loader_are_accepted() {
        let index = |dependencies: &str| -> Index { serde_json::from_str(&format!(r#"{{"name":"P","files":[],"dependencies":{dependencies}}}"#)).unwrap() };
        assert_eq!(index(r#"{"minecraft":"1.21.1","fabric-loader":"0.16.0"}"#).versions().unwrap(), ("1.21.1".into(), ModLoader::Fabric, "0.16.0".into()));
        assert_eq!(index(r#"{"minecraft":"1.20.1","forge":"47.2.0"}"#).versions().unwrap(), ("1.20.1".into(), ModLoader::Forge, "47.2.0".into()));
        assert_eq!(index(r#"{"minecraft":"1.20.1","forge":"1.20.1-47.2.0"}"#).versions().unwrap().2, "47.2.0");
        assert_eq!(index(r#"{"minecraft":"1.21.1","neoforge":"21.1.77"}"#).versions().unwrap(), ("1.21.1".into(), ModLoader::NeoForge, "21.1.77".into()));
        assert_eq!(index(r#"{"minecraft":"1.21.1","quilt-loader":"0.26.0"}"#).versions().unwrap(), ("1.21.1".into(), ModLoader::Quilt, "0.26.0".into()));
        assert!(index(r#"{"minecraft":"1.21.1","liteloader":"1"}"#).versions().is_err());
        assert!(index(r#"{"minecraft":"1.21.1"}"#).versions().is_err());
        assert!(index(r#"{"minecraft":"1.21.1","fabric-loader":"0.16.0","forge":"52"}"#).versions().is_err());
    }

    /// Réseau : un vrai modpack et un vrai pack de ressources, posés dans un dossier temporaire.
    #[tokio::test]
    #[ignore = "réseau"]
    async fn installs_a_real_modpack_and_resource_pack() {
        let http = super::super::download::client();
        let dir = std::env::temp_dir().join(format!("clover-content-{}", std::process::id()));
        let (archive, index) = fetch_modpack(&http, "fabulously-optimized", None, &dir).await.unwrap();
        let (minecraft, _, _) = index.versions().unwrap();
        install_modpack(&http, &archive, &index, &dir.join("game"), &dir.join("mods"), &|_, _| {}).await.unwrap();
        assert!(std::fs::read_dir(dir.join("mods")).unwrap().count() > 10);
        assert!(dir.join("game/config").is_dir());
        let pack = install_archive(&http, &dir.join("resourcepacks"), Kind::Resourcepack, "fresh-animations", &minecraft).await.unwrap();
        assert!(dir.join("resourcepacks").join(pack).is_file());
        let _ = std::fs::remove_dir_all(dir);
    }
}

