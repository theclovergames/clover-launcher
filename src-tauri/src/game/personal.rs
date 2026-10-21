//! « Mes mods » : mods ajoutés par le joueur, hors catalogue Clover, non vérifiés par l'équipe.
//!
//! Les `.jar` vivent dans `~/.cloverlauncher/personal-mods/`. Au lancement, ceux qui sont activés,
//! faits pour Fabric et pour la version du serveur sont copiés dans `game/mods/` (voir `mods::sync`).
//! Un mod prévu pour une autre version peut être remplacé par sa version compatible, trouvée sur
//! Modrinth par l'empreinte du fichier ; un mod trouvé par la recherche Modrinth s'installe ici avec
//! ses dépendances obligatoires.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::io::{Read, Seek};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::download::{download_all, Checksum, Download};
use super::modrinth;
use super::{GameError, Result};

/// Mod tel qu'affiché dans l'onglet « Mes mods ». Mêmes noms que le type `PersonalMod` du front.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalMod {
    /// Nom du fichier, unique dans le dossier.
    pub id: String,
    /// Nom du projet Modrinth, sinon celui que donne le `.jar`.
    pub name: String,
    /// Logo du projet Modrinth, sinon celui du `.jar` (adresse `data:`).
    pub icon: Option<String>,
    pub version: Option<String>,
    pub filename: String,
    /// Launcher d'origine pour un mod importé ; `None` pour un fichier ajouté à la main.
    pub source: Option<String>,
    /// Projet Modrinth du fichier, s'il y est publié (marque « Installé » dans la recherche).
    pub project_id: Option<String>,
    pub enabled: bool,
    pub status: Status,
    /// Version plus récente publiée sur Modrinth pour la version et le loader de l'instance, pour un
    /// mod qui se charge déjà.
    pub newer: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Status {
    Ok,
    /// Prévu pour une autre version, mais Modrinth connaît une version pour celle du serveur.
    Update { built_for: String, version: String },
    Outdated { built_for: String },
    /// Fait pour un autre loader que celui de l'instance.
    Loader { loader: String },
}

/// Loader qui charge les mods d'une instance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModLoader {
    Fabric,
    Quilt,
    Forge,
    NeoForge,
}

impl ModLoader {
    /// Loaders Modrinth dont les mods tournent sur celui-ci : Quilt charge aussi ceux de Fabric.
    pub fn modrinth_loaders(self) -> &'static [&'static str] {
        match self {
            ModLoader::Fabric => &["fabric"],
            ModLoader::Quilt => &["quilt", "fabric"],
            ModLoader::Forge => &["forge"],
            ModLoader::NeoForge => &["neoforge"],
        }
    }

    fn label(self) -> &'static str {
        match self {
            ModLoader::Fabric => "Fabric",
            ModLoader::Quilt => "Quilt",
            ModLoader::Forge => "Forge",
            ModLoader::NeoForge => "NeoForge",
        }
    }
}

/// Ce que le `.jar` dit de lui-même.
#[derive(Debug)]
enum Jar {
    Fabric(FabricMod),
    Other { loader: &'static str },
}

#[derive(Debug, Deserialize)]
struct FabricMod {
    id: String,
    name: Option<String>,
    version: String,
    #[serde(default)]
    depends: HashMap<String, serde_json::Value>,
    /// Chemin du logo dans le `.jar`, ou chemins par taille.
    #[serde(default)]
    icon: Option<serde_json::Value>,
}

/// Au-delà, le logo du `.jar` n'est pas repris : il voyagerait en entier vers l'interface.
const MAX_ICON: u64 = 256 * 1024;

impl FabricMod {
    /// Chemin du logo, le plus grand s'il y en a plusieurs.
    fn icon_path(&self) -> Option<String> {
        match self.icon.as_ref()? {
            serde_json::Value::String(path) => Some(path.clone()),
            serde_json::Value::Object(sizes) => sizes
                .iter()
                .filter_map(|(size, path)| Some((size.parse::<u32>().ok()?, path.as_str()?)))
                .max_by_key(|(size, _)| *size)
                .map(|(_, path)| path.to_owned()),
            _ => None,
        }
    }
}

/// Logo PNG déclaré par le `fabric.mod.json` du `.jar`, en adresse `data:`.
fn jar_icon(path: &Path) -> Option<String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let Jar::Fabric(fabric) = read_jar_file(path)? else { return None };
    let icon = fabric.icon_path()?;
    let mut archive = zip::ZipArchive::new(std::fs::File::open(path).ok()?).ok()?;
    let mut entry = archive.by_name(icon.trim_start_matches('/')).ok()?;
    if entry.size() > MAX_ICON || !icon.to_ascii_lowercase().ends_with(".png") {
        return None;
    }
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes).ok()?;
    Some(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

impl FabricMod {
    /// Versions de Minecraft acceptées : une seule alternative doit correspondre. `None` : aucune
    /// contrainte déclarée.
    fn minecraft(&self) -> Option<Vec<String>> {
        match self.depends.get("minecraft")? {
            serde_json::Value::String(range) => Some(vec![range.clone()]),
            serde_json::Value::Array(ranges) => Some(ranges.iter().filter_map(|range| range.as_str().map(str::to_owned)).collect()),
            _ => None,
        }
    }
}

fn read_jar(reader: impl Read + Seek) -> Option<Jar> {
    let mut archive = zip::ZipArchive::new(reader).ok()?;
    if let Ok(mut entry) = archive.by_name("fabric.mod.json") {
        let mut text = String::new();
        entry.read_to_string(&mut text).ok()?;
        // Fabric Loader accepte des retours à la ligne bruts dans les chaînes (descriptions sur
        // plusieurs lignes), pas le JSON strict : remplacés par des espaces, sans effet ailleurs.
        return serde_json::from_str(&text.replace(|c: char| c.is_ascii_control(), " ")).ok().map(Jar::Fabric);
    }
    let names: HashSet<&str> = archive.file_names().collect();
    let loader = if names.contains("quilt.mod.json") {
        "Quilt"
    } else if names.contains("META-INF/neoforge.mods.toml") {
        "NeoForge"
    } else if names.contains("META-INF/mods.toml") {
        // NeoForge pour Minecraft 1.20.2 à 1.20.4 lisait encore `mods.toml` : le mod y dépend de lui.
        let mut toml = String::new();
        archive.by_name("META-INF/mods.toml").ok()?.take(256 * 1024).read_to_string(&mut toml).ok()?;
        if toml.contains("\"neoforge\"") { "NeoForge" } else { "Forge" }
    } else if names.contains("mcmod.info") {
        "Forge"
    } else {
        return None;
    };
    Some(Jar::Other { loader })
}

fn read_jar_file(path: &Path) -> Option<Jar> {
    read_jar(std::fs::File::open(path).ok()?)
}

/// Identifiant Fabric du mod contenu dans `path`, pour repérer un doublon avec le catalogue.
pub fn fabric_id(path: &Path) -> Option<String> {
    match read_jar_file(path)? {
        Jar::Fabric(fabric) => Some(fabric.id),
        Jar::Other { .. } => None,
    }
}

/// Loader pour lequel le `.jar` est fait (« Fabric », « Quilt », « Forge », « NeoForge »), `None`
/// s'il ne le dit pas.
pub fn jar_loader(path: &Path) -> Option<&'static str> {
    match read_jar_file(path)? {
        Jar::Fabric(_) => Some("Fabric"),
        Jar::Other { loader } => Some(loader),
    }
}

/// Seuls les mods Fabric déclarent leur version de Minecraft dans un format lu ici : ceux de
/// Quilt, Forge et NeoForge sont acceptés dès qu'ils sont faits pour le loader de l'instance.
/// Quilt charge aussi les mods Fabric.
fn status(jar: &Jar, minecraft: &str, loader: ModLoader) -> Status {
    match jar {
        Jar::Fabric(fabric) if matches!(loader, ModLoader::Fabric | ModLoader::Quilt) => match fabric.minecraft() {
            Some(ranges) if !ranges.iter().any(|range| accepts(range, minecraft)) => {
                Status::Outdated { built_for: ranges.first().map(|range| built_for(range)).unwrap_or_default() }
            }
            _ => Status::Ok,
        },
        Jar::Fabric(_) => Status::Loader { loader: "Fabric".into() },
        Jar::Other { loader: found } if *found == loader.label() => Status::Ok,
        Jar::Other { loader } => Status::Loader { loader: (*loader).into() },
    }
}

/// `.jar` de `dir`, triés.
pub(crate) fn jars(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut paths: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("jar")))
        .collect();
    paths.sort();
    paths
}

fn filename(path: &Path) -> String {
    path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default()
}

/// Liste les mods du joueur. Pour ceux qui ne se chargent pas en `minecraft`, demande à Modrinth
/// s'il existe une version compatible ; sans réponse, ils restent signalés comme incompatibles.
pub async fn list(http: &reqwest::Client, dir: &Path, disabled: &[String], minecraft: &str, loader: ModLoader) -> Vec<PersonalMod> {
    let mut mods: Vec<PersonalMod> = jars(dir)
        .into_iter()
        .filter_map(|path| {
            let jar = read_jar_file(&path)?;
            let filename = filename(&path);
            let (name, version) = match &jar {
                Jar::Fabric(fabric) => (fabric.name.clone().unwrap_or_else(|| fabric.id.clone()), Some(fabric.version.clone())),
                Jar::Other { .. } => (filename.trim_end_matches(".jar").to_owned(), None),
            };
            Some(PersonalMod {
                id: filename.clone(),
                name,
                icon: None,
                version,
                enabled: !disabled.contains(&filename),
                status: status(&jar, minecraft, loader),
                filename,
                source: None,
                project_id: None,
                newer: None,
            })
        })
        .collect();

    let hashes: Vec<String> = mods.iter().map(|m| sha512(&dir.join(&m.filename)).unwrap_or_default()).collect();
    let identified = modrinth::identify(http, hashes.clone()).await.unwrap_or_else(|e| {
        eprintln!("[mods] Modrinth injoignable pour identifier les mods : {e}");
        HashMap::new()
    });
    for (m, hash) in mods.iter_mut().zip(&hashes) {
        m.project_id = identified.get(hash).map(|version| version.project_id.clone());
    }
    // Le nom du `.jar` est souvent technique (« essential-container ») : celui de Modrinth est
    // celui que le joueur a vu en l'installant.
    let ids: Vec<String> = mods.iter().filter_map(|m| m.project_id.clone()).collect::<HashSet<_>>().into_iter().collect();
    if !ids.is_empty() {
        match modrinth::projects(http, &ids).await {
            Ok(projects) => {
                for m in &mut mods {
                    if let Some(project) = m.project_id.as_ref().and_then(|id| projects.get(id)) {
                        m.name = project.title.clone();
                        m.icon = project.icon_url.clone();
                    }
                }
            }
            Err(e) => eprintln!("[mods] Modrinth injoignable pour les noms des mods : {e}"),
        }
    }
    for m in mods.iter_mut().filter(|m| m.icon.is_none()) {
        m.icon = jar_icon(&dir.join(&m.filename));
    }

    let files: Vec<(&Status, String)> = mods.iter().map(|m| &m.status).zip(hashes).collect();
    let found = replacements(http, &files, &identified, minecraft, loader).await.unwrap_or_else(|e| {
        eprintln!("[mods] Modrinth injoignable pour les mises à jour : {e}");
        HashMap::new()
    });
    let found: Vec<Option<String>> = files.iter().map(|(_, hash)| found.get(hash).map(|version| version.version_number.clone())).collect();
    for (m, version) in mods.iter_mut().zip(found) {
        let Some(version) = version else { continue };
        match &m.status {
            Status::Outdated { built_for } => m.status = Status::Update { built_for: built_for.clone(), version },
            _ => m.newer = Some(version),
        }
    }
    mods
}

/// Versions Modrinth à installer à la place des fichiers (statut, empreinte), par empreinte : pour
/// un mod qui ne se charge pas en `minecraft`, sa version pour elle ; pour un mod qui se charge, une
/// version publiée après la sienne (`identified`), stable si la sienne l'est. Rien pour un mod fait
/// pour un autre loader.
async fn replacements(http: &reqwest::Client, files: &[(&Status, String)], identified: &HashMap<String, modrinth::Version>, minecraft: &str, loader: ModLoader) -> Result<HashMap<String, modrinth::Version>> {
    let (mut stable, mut any) = (Vec::new(), Vec::new());
    for (status, hash) in files {
        match (status, identified.get(hash)) {
            (Status::Ok, Some(current)) if current.version_type == "release" => stable.push(hash.clone()),
            (Status::Ok | Status::Outdated { .. }, Some(_)) => any.push(hash.clone()),
            _ => {}
        }
    }
    let mut found = modrinth::updates(http, stable, minecraft, loader.modrinth_loaders(), true).await?;
    found.extend(modrinth::updates(http, any, minecraft, loader.modrinth_loaders(), false).await?);
    found.retain(|hash, latest| {
        let outdated = files.iter().any(|(status, other)| other == hash && matches!(status, Status::Outdated { .. }));
        outdated || identified.get(hash).is_some_and(|current| newer(latest, current))
    });
    Ok(found)
}

/// `latest` est une autre version, publiée après `current`. Dates RFC 3339 en UTC : comparées à la
/// seconde, comme du texte.
fn newer(latest: &modrinth::Version, current: &modrinth::Version) -> bool {
    let second = |version: &modrinth::Version| version.date_published.get(..19).unwrap_or_default().to_owned();
    latest.id != current.id && second(latest) > second(current)
}

/// Nom de fichier acceptable dans le dossier : un `.jar`, sans chemin ni fichier caché.
pub(crate) fn safe_filename(name: &str) -> Option<&str> {
    let ok = name.to_ascii_lowercase().ends_with(".jar") && !name.starts_with('.') && !name.contains(['/', '\\', ':']) && name.len() <= 200;
    ok.then_some(name)
}

/// Ajoute un `.jar` envoyé par l'interface. Refuse ce qui n'est pas un mod Minecraft.
pub fn add(dir: &Path, name: &str, bytes: &[u8]) -> Result<()> {
    let filename = safe_filename(name).ok_or_else(|| GameError::NotAMod(name.to_owned()))?;
    read_jar(std::io::Cursor::new(bytes)).ok_or_else(|| GameError::NotAMod(name.to_owned()))?;
    std::fs::create_dir_all(dir)?;
    std::fs::write(dir.join(filename), bytes)?;
    Ok(())
}

/// Met le mod à la corbeille, comme les packs et les mondes : il se récupère s'il est retiré par erreur.
pub fn remove(dir: &Path, id: &str) -> Result<()> {
    let filename = safe_filename(id).ok_or_else(|| GameError::NotAMod(id.to_owned()))?;
    let path = dir.join(filename);
    if !path.exists() {
        return Ok(());
    }
    trash::delete(&path).map_err(|e| GameError::Io(std::io::Error::other(e.to_string())))
}

/// Télécharge le fichier principal de `version` dans le dossier ; renvoie son nom.
async fn download(http: &reqwest::Client, dir: &Path, version: &modrinth::Version) -> Result<String> {
    let file = version.primary_file().ok_or(GameError::NoUpdate)?;
    let filename = safe_filename(&file.filename).ok_or_else(|| GameError::NotAMod(file.filename.clone()))?;
    let sha512 = file.hashes.get("sha512").ok_or(GameError::NoUpdate)?;
    let download = Download {
        url: file.url.clone(),
        path: dir.join(filename),
        checksum: Some(Checksum::Sha512(sha512.clone())),
        size: Some(file.size),
        executable: false,
    };
    download_all(http, vec![download], &|_, _| {}).await?;
    Ok(filename.to_owned())
}

/// Remplace chaque mod du dossier (seulement `only` s'il est donné) qui a une version à installer
/// (voir `replacements`) ; renvoie les paires (ancien fichier, nouveau fichier).
pub async fn update(http: &reqwest::Client, dir: &Path, only: Option<&str>, minecraft: &str, loader: ModLoader) -> Result<Vec<(String, String)>> {
    let paths = match only {
        Some(id) => vec![dir.join(safe_filename(id).ok_or_else(|| GameError::NotAMod(id.to_owned()))?)],
        None => jars(dir),
    };
    let mut files = Vec::new();
    for path in paths {
        let Some(jar) = read_jar_file(&path) else { continue };
        files.push((filename(&path), status(&jar, minecraft, loader), sha512(&path)?));
    }
    let identified = modrinth::identify(http, files.iter().map(|(_, _, hash)| hash.clone()).collect()).await?;
    let statuses: Vec<(&Status, String)> = files.iter().map(|(_, status, hash)| (status, hash.clone())).collect();
    let found = replacements(http, &statuses, &identified, minecraft, loader).await?;
    let mut updated = Vec::new();
    for (old, _, hash) in &files {
        let Some(version) = found.get(hash) else { continue };
        let new = download(http, dir, version).await?;
        if new != *old {
            std::fs::remove_file(dir.join(old))?;
        }
        updated.push((old.clone(), new));
    }
    Ok(updated)
}

/// Fichiers du dossier et sélection Clover (`provided` : empreintes du manifeste signé), identifiés
/// sur Modrinth par empreinte.
async fn identify_present(http: &reqwest::Client, dir: &Path, provided: &[String]) -> Result<HashMap<String, modrinth::Version>> {
    std::fs::create_dir_all(dir)?;
    let hashes: Vec<String> = jars(dir).iter().filter_map(|path| sha512(path).ok()).chain(provided.iter().cloned()).collect();
    if hashes.is_empty() {
        return Ok(HashMap::new());
    }
    modrinth::identify(http, hashes).await
}

/// Projets des dépendances obligatoires de `version`.
async fn required(http: &reqwest::Client, version: &modrinth::Version) -> Result<Vec<String>> {
    let mut projects = Vec::new();
    for dependency in version.dependencies.iter().filter(|dependency| dependency.dependency_type == "required") {
        match (&dependency.project_id, &dependency.version_id) {
            (Some(project), _) => projects.push(project.clone()),
            (None, Some(version)) => projects.push(modrinth::version_project(http, version).await?),
            (None, None) => {}
        }
    }
    Ok(projects)
}

/// Fichiers téléchargés, et projets sans version pour la version de Minecraft demandée (noms
/// Modrinth une fois résolus par `install_dependencies`).
#[derive(Debug, Default, Serialize)]
pub struct Resolved {
    pub added: Vec<String>,
    pub missing: Vec<String>,
}

/// Télécharge les projets de `queue` pour `minecraft`, puis leurs dépendances obligatoires, sauf ceux
/// de `present`. Un projet sans version compatible arrête tout si `strict`, sinon il est noté dans
/// `missing`.
async fn resolve(http: &reqwest::Client, dir: &Path, mut queue: Vec<String>, present: &mut HashSet<String>, (minecraft, loader): (&str, ModLoader), strict: bool) -> Result<Resolved> {
    let mut resolved = Resolved::default();
    while let Some(project) = queue.pop() {
        if present.contains(&project) || resolved.missing.contains(&project) {
            continue;
        }
        let Some(version) = modrinth::compatible_version(http, &project, loader.modrinth_loaders(), Some(minecraft)).await? else {
            if strict {
                return Err(GameError::NoUpdate);
            }
            resolved.missing.push(project);
            continue;
        };
        if !present.insert(version.project_id.clone()) {
            continue;
        }
        resolved.added.push(download(http, dir, &version).await?);
        queue.extend(required(http, &version).await?.into_iter().filter(|project| !present.contains(project)));
    }
    Ok(resolved)
}

/// Installe le projet Modrinth `project` pour `minecraft`, avec ses dépendances obligatoires
/// absentes du dossier et de la sélection Clover (`provided` : empreintes du manifeste signé).
/// Renvoie les fichiers ajoutés.
pub async fn install(http: &reqwest::Client, dir: &Path, project: &str, minecraft: &str, loader: ModLoader, provided: &[String]) -> Result<Vec<String>> {
    let mut present: HashSet<String> = identify_present(http, dir, provided).await?.into_values().map(|version| version.project_id).collect();
    Ok(resolve(http, dir, vec![project.to_owned()], &mut present, (minecraft, loader), true).await?.added)
}

/// Dépendances obligatoires des mods `files` du dossier (ajoutés à la main ou importés), d'après
/// leur version sur Modrinth : celles qui manquent au dossier et à la sélection Clover sont
/// téléchargées pour `minecraft`. Un mod inconnu de Modrinth est laissé tel quel.
pub async fn install_dependencies(http: &reqwest::Client, dir: &Path, files: &[String], minecraft: &str, loader: ModLoader, provided: &[String]) -> Result<Resolved> {
    let identified = identify_present(http, dir, provided).await?;
    let mut present: HashSet<String> = identified.values().map(|version| version.project_id.clone()).collect();
    let mut queue = Vec::new();
    for file in files {
        let Some(version) = sha512(&dir.join(file)).ok().and_then(|hash| identified.get(&hash)) else { continue };
        queue.extend(required(http, version).await?.into_iter().filter(|project| !present.contains(project)));
    }
    let mut resolved = resolve(http, dir, queue, &mut present, (minecraft, loader), false).await?;
    if !resolved.missing.is_empty() {
        if let Ok(projects) = modrinth::projects(http, &resolved.missing).await {
            for project in &mut resolved.missing {
                if let Some(summary) = projects.get(project) {
                    project.clone_from(&summary.title);
                }
            }
        }
    }
    Ok(resolved)
}

/// Mods du joueur à charger au lancement : activés, faits pour `loader` et pour `minecraft`.
pub fn loadable(dir: &Path, disabled: &[String], minecraft: &str, loader: ModLoader) -> Vec<PathBuf> {
    jars(dir)
        .into_iter()
        .filter(|path| !disabled.contains(&filename(path)))
        .filter(|path| read_jar_file(path).is_some_and(|jar| status(&jar, minecraft, loader) == Status::Ok))
        .collect()
}

pub(crate) use super::download::sha512;

// ── Versions de Minecraft déclarées par les mods (`depends.minecraft` de `fabric.mod.json`) ──

/// Version découpée : composants numériques, puis préversion éventuelle (`26.2-rc.1`).
struct Version {
    parts: Vec<u64>,
    pre: Option<String>,
}

impl Version {
    fn parse(text: &str) -> Option<Self> {
        let text = text.split('+').next()?;
        let (core, pre) = match text.split_once('-') {
            Some((core, pre)) => (core, Some(pre.to_owned())),
            None => (text, None),
        };
        let parts = core.split('.').map(|part| part.parse().ok()).collect::<Option<Vec<u64>>>()?;
        Some(Self { parts, pre })
    }

    fn part(&self, index: usize) -> u64 {
        self.parts.get(index).copied().unwrap_or(0)
    }

    /// `1.21.4` → `1.22` (`bump(1)`), `2` (`bump(0)`).
    fn bump(&self, index: usize) -> Self {
        let mut parts: Vec<u64> = (0..=index).map(|i| self.part(i)).collect();
        parts[index] += 1;
        Self { parts, pre: None }
    }

    fn compare(&self, other: &Self) -> Ordering {
        let length = self.parts.len().max(other.parts.len());
        (0..length)
            .map(|i| self.part(i).cmp(&other.part(i)))
            .find(|ordering| ordering.is_ne())
            .unwrap_or_else(|| match (&self.pre, &other.pre) {
                (None, None) => Ordering::Equal,
                (None, Some(_)) => Ordering::Greater,
                (Some(_), None) => Ordering::Less,
                (Some(a), Some(b)) => a.cmp(b),
            })
    }
}

const OPERATORS: [&str; 7] = [">=", "<=", ">", "<", "=", "~", "^"];

fn split_operator(predicate: &str) -> (&str, &str) {
    OPERATORS
        .iter()
        .find_map(|op| predicate.strip_prefix(op).map(|rest| (*op, rest)))
        .unwrap_or(("", predicate))
}

/// Une plage de `fabric.mod.json` (`>=1.21.4 <1.22`, `~1.21`, `1.21.x`, `*`…) accepte-t-elle
/// `version` ? Les prédicats séparés par des espaces doivent tous correspondre.
fn accepts(range: &str, version: &str) -> bool {
    let Some(target) = Version::parse(version) else { return range.trim() == "*" || range.trim() == version };
    range.split_whitespace().all(|predicate| accepts_one(predicate, &target))
}

fn accepts_one(predicate: &str, target: &Version) -> bool {
    if predicate == "*" {
        return true;
    }
    let (op, rest) = split_operator(predicate);
    let components: Vec<&str> = rest.trim_end_matches('-').split('.').collect();
    if let Some(wildcard) = components.iter().position(|part| matches!(*part, "x" | "X" | "*")) {
        let prefix = &components[..wildcard];
        let same_prefix = prefix.iter().enumerate().all(|(i, part)| part.parse::<u64>().ok() == Some(target.part(i)));
        return matches!(op, "" | "=") && same_prefix;
    }
    // `>=1.21-` : le tiret final donne une préversion vide, la plus basse, qui inclut les préversions.
    let Some(bound) = Version::parse(rest) else { return false };
    let ordering = target.compare(&bound);
    match op {
        ">=" => ordering.is_ge(),
        ">" => ordering.is_gt(),
        "<=" => ordering.is_le(),
        "<" => ordering.is_lt(),
        "~" => ordering.is_ge() && target.compare(&bound.bump(1.min(bound.parts.len() - 1))).is_lt(),
        "^" => ordering.is_ge() && target.compare(&bound.bump(0)).is_lt(),
        _ => ordering.is_eq(),
    }
}

/// Version visée par une plage, pour l'affichage : `>=1.21.4 <1.22` → `1.21.4`.
fn built_for(range: &str) -> String {
    let first = range.split_whitespace().next().unwrap_or(range);
    split_operator(first).1.trim_end_matches('-').to_owned()
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    #[test]
    fn version_ranges() {
        assert!(accepts("*", "26.2"));
        assert!(accepts("26.2", "26.2"));
        assert!(accepts("26.2.0", "26.2"));
        assert!(accepts(">=26.1", "26.2"));
        assert!(accepts(">=1.21.4", "26.2"));
        assert!(accepts("~26.2", "26.2.1"));
        assert!(accepts("26.x", "26.2"));
        assert!(accepts(">=26.2- <26.3", "26.2"));
        assert!(!accepts("1.21.x", "26.2"));
        assert!(!accepts("~1.21.4", "26.2"));
        assert!(!accepts("^1.21", "26.2"));
        assert!(!accepts(">=1.21.4 <1.22", "26.2"));
        assert!(!accepts("1.21.11", "26.2"));
        assert!(!accepts("26.2", "26.2-rc.1"));
        assert!(accepts(">=26.2-", "26.2-rc.1"));
    }

    #[test]
    fn built_for_shows_the_lower_bound() {
        assert_eq!(built_for(">=1.21.4 <1.22"), "1.21.4");
        assert_eq!(built_for("~1.21"), "1.21");
        assert_eq!(built_for("1.21.x"), "1.21.x");
    }

    fn jar(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, content) in entries {
            writer.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn statuses_from_the_jar() {
        let fabric = |minecraft: &str| jar(&[("fabric.mod.json", &format!(r#"{{"id":"a","version":"1","depends":{{"minecraft":{minecraft}}}}}"#))]);
        let status_of = |bytes: Vec<u8>| status(&read_jar(std::io::Cursor::new(bytes)).unwrap(), "26.2", ModLoader::Fabric);
        assert_eq!(status_of(fabric(r#""~26.2""#)), Status::Ok);
        assert_eq!(status_of(fabric(r#"["1.21.11", "26.2"]"#)), Status::Ok);
        assert_eq!(status_of(fabric(r#"">=1.21.4 <1.22""#)), Status::Outdated { built_for: "1.21.4".into() });
        assert_eq!(status_of(jar(&[("META-INF/neoforge.mods.toml", "")])), Status::Loader { loader: "NeoForge".into() });
        assert!(read_jar(std::io::Cursor::new(jar(&[("readme.txt", "")]))).is_none());
        // Description sur deux lignes, sans échappement : Fabric Loader la lit, Clover aussi.
        let multiline = jar(&[("fabric.mod.json", "{\"id\":\"a\",\"version\":\"1\",\"description\":\"Deux\nlignes\"}")]);
        assert!(matches!(read_jar(std::io::Cursor::new(multiline)), Some(Jar::Fabric(_))));
    }

    #[test]
    fn statuses_follow_the_instance_loader() {
        let status_of = |bytes: Vec<u8>, loader| status(&read_jar(std::io::Cursor::new(bytes)).unwrap(), "1.20.4", loader);
        let forge = || jar(&[("META-INF/mods.toml", r#"[[dependencies.a]] modId="forge""#)]);
        let old_neoforge = || jar(&[("META-INF/mods.toml", r#"[[dependencies.a]] modId="neoforge""#)]);
        let fabric = || jar(&[("fabric.mod.json", r#"{"id":"a","version":"1"}"#)]);
        assert_eq!(status_of(forge(), ModLoader::Forge), Status::Ok);
        assert_eq!(status_of(jar(&[("mcmod.info", "[]")]), ModLoader::Forge), Status::Ok);
        assert_eq!(status_of(old_neoforge(), ModLoader::NeoForge), Status::Ok);
        assert_eq!(status_of(forge(), ModLoader::NeoForge), Status::Loader { loader: "Forge".into() });
        assert_eq!(status_of(fabric(), ModLoader::Forge), Status::Loader { loader: "Fabric".into() });
        assert_eq!(status_of(jar(&[("META-INF/neoforge.mods.toml", "")]), ModLoader::Fabric), Status::Loader { loader: "NeoForge".into() });
        // Quilt charge ses mods et ceux de Fabric ; Fabric ne charge pas ceux de Quilt.
        let quilt = || jar(&[("quilt.mod.json", "{}")]);
        assert_eq!(status_of(fabric(), ModLoader::Quilt), Status::Ok);
        assert_eq!(status_of(quilt(), ModLoader::Quilt), Status::Ok);
        assert_eq!(status_of(quilt(), ModLoader::Fabric), Status::Loader { loader: "Quilt".into() });
        assert_eq!(status_of(forge(), ModLoader::Quilt), Status::Loader { loader: "Forge".into() });
    }

    /// Réseau : installe Xaero's Minimap depuis Modrinth, avec sa dépendance obligatoire.
    #[tokio::test]
    #[ignore]
    async fn installs_from_modrinth_with_dependencies() {
        let http = crate::game::download::client();
        let page = modrinth::search(&http, modrinth::Kind::Mod, "minimap", "26.2", &["fabric"], &modrinth::Filters::default(), 0).await.unwrap();
        assert!(page.hits.iter().any(|hit| hit.slug == "xaeros-minimap"));
        let dir = std::env::temp_dir().join(format!("clover-modrinth-{}", std::process::id()));
        let added = install(&http, &dir, "xaeros-minimap", "26.2", ModLoader::Fabric, &[]).await.unwrap();
        println!("{added:?}");
        assert!(added.len() >= 2);
        assert!(install(&http, &dir, "xaeros-minimap", "26.2", ModLoader::Fabric, &[]).await.unwrap().is_empty());
        assert_eq!(loadable(&dir, &[], "26.2", ModLoader::Fabric).len(), added.len());
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Réseau : un mod ajouté seul (AppleSkin) récupère Fabric API, sauf si la sélection Clover la
    /// fournit ; relancé, rien n'est retéléchargé.
    #[tokio::test]
    #[ignore]
    async fn added_mod_gets_its_required_dependencies() {
        let http = crate::game::download::client();
        let dir = std::env::temp_dir().join(format!("clover-dependencies-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let appleskin = modrinth::compatible_version(&http, "appleskin", &["fabric"], Some("26.2")).await.unwrap().unwrap();
        let file = download(&http, &dir, &appleskin).await.unwrap();
        let fabric_api = modrinth::compatible_version(&http, "fabric-api", &["fabric"], Some("26.2")).await.unwrap().unwrap();
        let provided = fabric_api.primary_file().unwrap().hashes["sha512"].clone();

        let skipped = install_dependencies(&http, &dir, std::slice::from_ref(&file), "26.2", ModLoader::Fabric, &[provided]).await.unwrap();
        assert!(skipped.added.is_empty() && skipped.missing.is_empty(), "{skipped:?}");
        let resolved = install_dependencies(&http, &dir, std::slice::from_ref(&file), "26.2", ModLoader::Fabric, &[]).await.unwrap();
        println!("{resolved:?}");
        assert!(resolved.added.iter().any(|name| name.starts_with("fabric-api")), "{resolved:?}");
        assert!(install_dependencies(&http, &dir, &[file], "26.2", ModLoader::Fabric, &[]).await.unwrap().added.is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Réseau : sélection Clover reconnue avant toute installation locale, par ID et par slug ;
    /// Fabric API déjà fournie n'est pas téléchargée comme dépendance d'un mod personnel.
    #[tokio::test]
    #[ignore]
    async fn skips_clover_mods_and_dependencies_before_first_game_install() {
        let http = crate::game::download::client();
        let dir = std::env::temp_dir().join(format!("clover-modrinth-provided-{}", std::process::id()));
        let sodium = modrinth::compatible_version(&http, "sodium", &["fabric"], Some("26.2")).await.unwrap().unwrap();
        let fabric = modrinth::compatible_version(&http, "fabric-api", &["fabric"], Some("26.2")).await.unwrap().unwrap();
        let provided = vec![sodium.primary_file().unwrap().hashes["sha512"].clone(), fabric.primary_file().unwrap().hashes["sha512"].clone()];
        for project in ["sodium", sodium.project_id.as_str()] {
            assert!(install(&http, &dir, project, "26.2", ModLoader::Fabric, &provided).await.unwrap().is_empty());
            assert!(jars(&dir).is_empty());
        }
        let added = install(&http, &dir, "xaeros-minimap", "26.2", ModLoader::Fabric, &provided).await.unwrap();
        assert_eq!(added.len(), 1, "seule la minimap manque : {added:?}");
        assert_eq!(jars(&dir).len(), 1);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn only_a_later_version_is_newer() {
        let version = |id: &str, date: &str| -> modrinth::Version {
            serde_json::from_value(serde_json::json!({"id": id, "project_id": "p", "version_number": id, "version_type": "release", "files": [], "date_published": date})).unwrap()
        };
        let current = version("a", "2026-07-06T17:19:52.123456Z");
        assert!(newer(&version("b", "2026-08-28T20:55:02Z"), &current));
        assert!(!newer(&version("b", "2026-05-01T00:00:00Z"), &current));
        assert!(!newer(&version("a", "2026-08-28T20:55:02Z"), &current));
    }

    /// Réseau : une ancienne version stable de Sodium est remplacée par la dernière, d'un coup.
    #[tokio::test]
    #[ignore]
    async fn updates_every_mod_with_a_newer_version() {
        let http = crate::game::download::client();
        let dir = std::env::temp_dir().join(format!("clover-updates-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let versions = modrinth::modpack_versions(&http, "sodium").await.unwrap();
        let old = versions.iter().rev().find(|version| version.version_type == "release" && version.loaders.iter().any(|loader| loader == "fabric") && version.game_versions.iter().any(|game| game == "1.21.1")).unwrap();
        let file = download(&http, &dir, old).await.unwrap();
        let listed = list(&http, &dir, &[], "1.21.1", ModLoader::Fabric).await;
        assert!(listed[0].newer.is_some() || matches!(listed[0].status, Status::Update { .. }), "{listed:?}");

        let updated = update(&http, &dir, None, "1.21.1", ModLoader::Fabric).await.unwrap();
        assert_eq!(updated.len(), 1);
        assert_eq!(updated[0].0, file);
        assert_eq!(jars(&dir).len(), 1);
        let listed = list(&http, &dir, &[], "1.21.1", ModLoader::Fabric).await;
        assert!(listed[0].newer.is_none() && listed[0].status == Status::Ok, "{listed:?}");
        assert!(update(&http, &dir, None, "1.21.1", ModLoader::Fabric).await.unwrap().is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn add_rejects_paths_and_non_mods() {
        let dir = std::env::temp_dir().join(format!("clover-personal-{}", std::process::id()));
        let mod_jar = jar(&[("fabric.mod.json", r#"{"id":"a","version":"1"}"#)]);
        assert!(add(&dir, "../evil.jar", &mod_jar).is_err());
        assert!(add(&dir, "notes.jar", &jar(&[("readme.txt", "")])).is_err());
        add(&dir, "a.jar", &mod_jar).unwrap();
        assert_eq!(loadable(&dir, &[], "26.2", ModLoader::Fabric), vec![dir.join("a.jar")]);
        assert!(loadable(&dir, &["a.jar".into()], "26.2", ModLoader::Fabric).is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }
}
