//! Modpacks CurseForge importés depuis le `.zip` exporté par l'application CurseForge :
//! `manifest.json` (version de Minecraft, loader, fichiers du pack par identifiant CurseForge),
//! `modlist.html` (nom et page de chacun de ces fichiers) et dossier de fichiers inclus (`overrides`).
//!
//! Par le relais Clover de l'API CurseForge, les mods, packs de ressources et shaders listés se
//! téléchargent depuis CurseForge, sauf ceux dont l'auteur l'interdit hors de son application.
//! Ceux-là, et tous les fichiers si le relais est injoignable, sont cherchés sur
//! Modrinth sous le même identifiant de page (slug), à condition que le nom concorde, dans leur
//! version compatible ; les autres sont rendus au joueur avec leur page CurseForge, à ajouter à la main.
//!
//! Plus bas : recherche, page et téléchargement des mondes CurseForge (classe 17), que Modrinth
//! n'a pas. Seuls ceux dont l'auteur permet la diffusion hors de CurseForge se téléchargent.

use std::collections::HashMap;
use std::path::{Component, Path};
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use super::download::{download_all, Checksum, Download};
use super::modrinth::{self, Kind};
use super::personal::ModLoader;
use super::{GameError, Result};

/// Relais de l'API CurseForge (`relay/`, Worker Cloudflare) : il y ajoute la clé, qui reste dans
/// ses secrets et que le launcher n'embarque pas.
const API: &str = "https://curseforge.clovergames.fr/v1";
const TIMEOUT: Duration = Duration::from_secs(20);
/// Seuls hôtes acceptés pour les fichiers donnés par l'API.
const FILE_HOSTS: [&str; 2] = ["edge.forgecdn.net", "mediafilez.forgecdn.net"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub name: String,
    minecraft: Minecraft,
    #[serde(default = "default_overrides")]
    pub overrides: String,
    #[serde(default)]
    files: Vec<PackFile>,
}

fn default_overrides() -> String {
    "overrides".into()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Minecraft {
    version: String,
    #[serde(default)]
    mod_loaders: Vec<Loader>,
}

#[derive(Debug, Deserialize)]
struct Loader {
    /// « fabric-0.16.10 », « forge-47.2.0 », « neoforge-21.1.77 ».
    id: String,
    #[serde(default)]
    primary: bool,
}

#[derive(Debug, Deserialize)]
struct PackFile {
    #[serde(rename = "projectID")]
    project_id: u64,
    #[serde(rename = "fileID", default)]
    file_id: u64,
    #[serde(default = "required")]
    required: bool,
}

fn required() -> bool {
    true
}

impl Manifest {
    /// Version de Minecraft, loader (Fabric, Quilt, Forge ou NeoForge) et version du loader demandés.
    pub fn versions(&self) -> Result<(String, ModLoader, String)> {
        let loader = self.minecraft.mod_loaders.iter().find(|loader| loader.primary).or(self.minecraft.mod_loaders.first());
        let Some(loader) = loader else { return Err(GameError::InvalidVersion("modpack sans loader".into())) };
        let minecraft = self.minecraft.version.clone();
        match loader.id.split_once('-') {
            Some((_, "")) => Err(GameError::InvalidVersion(format!("loader sans version « {} »", loader.id))),
            Some(("fabric", version)) => Ok((minecraft, ModLoader::Fabric, version.to_owned())),
            Some(("quilt", version)) => Ok((minecraft, ModLoader::Quilt, version.to_owned())),
            Some(("forge", version)) => Ok((minecraft, ModLoader::Forge, version.to_owned())),
            Some(("neoforge", version)) => Ok((minecraft, ModLoader::NeoForge, version.to_owned())),
            Some((other, _)) => Err(GameError::InvalidVersion(format!("ce modpack demande {}, que le launcher ne prend pas en charge", loader_name(other)))),
            None => Err(GameError::InvalidVersion(format!("loader inconnu « {} »", loader.id))),
        }
    }

    /// Pages des fichiers obligatoires, quand le pack n'a pas de `modlist.html`.
    fn pages(&self) -> Vec<Entry> {
        self.files.iter().filter(|file| file.required).map(|file| Entry::page(file.project_id)).collect()
    }
}

fn loader_name(id: &str) -> &str {
    match id {
        "forge" => "Forge",
        "neoforge" => "NeoForge",
        "quilt" => "Quilt",
        other => other,
    }
}

/// Fichier du pack, d'après `modlist.html` : son nom et sa page CurseForge.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Entry {
    pub name: String,
    pub url: String,
}

impl Entry {
    /// Projet connu par son seul identifiant CurseForge.
    fn page(project_id: u64) -> Self {
        Self { name: format!("Projet CurseForge n° {project_id}"), url: format!("https://www.curseforge.com/projects/{project_id}") }
    }

    /// Type de contenu et identifiant de page, pour une page de mod, de pack de ressources ou de shader.
    fn target(&self) -> Option<(Kind, &str)> {
        let path = self.url.strip_prefix("https://www.curseforge.com/minecraft/")?;
        let (category, slug) = path.trim_end_matches('/').split_once('/')?;
        let kind = match category {
            "mc-mods" => Kind::Mod,
            "texture-packs" => Kind::Resourcepack,
            "shaders" => Kind::Shader,
            _ => return None,
        };
        let valid = !slug.is_empty() && slug.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'));
        valid.then_some((kind, slug))
    }
}

/// Entrées de `modlist.html` : `<li><a href="https://www.curseforge.com/minecraft/mc-mods/x">Nom (by auteur)</a></li>`.
pub fn modlist(html: &str) -> Vec<Entry> {
    html.split("<a href=\"")
        .skip(1)
        .filter_map(|part| {
            let (url, rest) = part.split_once('"')?;
            let label = rest.split_once('>')?.1.split_once("</a>")?.0;
            let name = unescape(label.rsplit_once(" (by ").map_or(label, |(name, _)| name)).trim().to_owned();
            (url.starts_with("https://www.curseforge.com/") && !name.is_empty()).then(|| Entry { name, url: unescape(url) })
        })
        .collect()
}

fn unescape(text: &str) -> String {
    text.replace("&quot;", "\"").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
}

/// Lettres et chiffres en minuscules : « Just Enough Items (JEI) » → « justenoughitemsjei ».
fn simplified(name: &str) -> String {
    name.chars().filter(char::is_ascii_alphanumeric).map(|c| c.to_ascii_lowercase()).collect()
}

/// Le projet Modrinth `title` est bien celui de CurseForge nommé `name` : l'un contient l'autre.
fn same_project(name: &str, title: &str) -> bool {
    let (name, title) = (simplified(name), simplified(title));
    !name.is_empty() && !title.is_empty() && (name.contains(&title) || title.contains(&name))
}

/// Lit `manifest.json` et `modlist.html` d'une archive CurseForge ; `None` si ce n'en est pas une.
pub fn read(archive: &Path) -> Result<Option<(Manifest, Vec<Entry>)>> {
    use std::io::Read;
    let mut zip = zip::ZipArchive::new(std::fs::File::open(archive)?).map_err(|e| GameError::Corrupted(e.to_string()))?;
    let mut text = String::new();
    match zip.by_name("manifest.json") {
        Ok(file) => file.take(1024 * 1024).read_to_string(&mut text)?,
        Err(_) => return Ok(None),
    };
    let manifest: Manifest = serde_json::from_str(&text)?;
    let mut html = String::new();
    let entries = match zip.by_name("modlist.html") {
        Ok(file) => {
            file.take(4 * 1024 * 1024).read_to_string(&mut html)?;
            modlist(&html)
        }
        Err(_) => manifest.pages(),
    };
    Ok(Some((manifest, entries)))
}

/// Installe les fichiers obligatoires du pack (mods dans `mods`, packs de ressources et shaders dans
/// le dossier de jeu `game`) : depuis CurseForge quand c'est possible, sinon depuis Modrinth, d'après
/// les entrées de `modlist.html` si le relais ne répond pas, pour `loader`. Renvoie ceux à ajouter à la main.
#[allow(clippy::too_many_arguments)]
pub async fn install(http: &reqwest::Client, manifest: &Manifest, entries: &[Entry], minecraft: &str, loader: ModLoader, game: &Path, mods: &Path, on_progress: &(dyn Fn(usize, usize) + Sync)) -> Result<Vec<Entry>> {
    let resolved = match resolve(http, manifest, game, mods).await {
        Ok(resolved) => Some(resolved),
        Err(error) => {
            eprintln!("[curseforge] API injoignable, repli sur Modrinth : {error}");
            None
        }
    };
    let (downloads, entries) = resolved.unwrap_or_else(|| (Vec::new(), entries.to_vec()));
    let total = downloads.len() + entries.len();
    download_all(http, downloads, &|done, _| on_progress(done, total)).await?;
    let offset = total - entries.len();
    from_modrinth(http, &entries, minecraft, loader, game, mods, &|done, _| on_progress(offset + done, total)).await
}

#[derive(Deserialize)]
struct Data<T> {
    data: Vec<T>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct File {
    id: u64,
    mod_id: u64,
    file_name: String,
    /// Absente quand l'auteur interdit le téléchargement hors de l'application CurseForge.
    download_url: Option<String>,
    #[serde(default)]
    hashes: Vec<Hash>,
    file_length: u64,
    #[serde(default)]
    file_date: String,
    /// Versions de Minecraft (et loaders) visées.
    #[serde(default)]
    game_versions: Vec<String>,
}

#[derive(Deserialize)]
struct Hash {
    value: String,
    /// 1 : SHA-1, 2 : MD5.
    algo: u8,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: u64,
    name: String,
    class_id: Option<u64>,
    links: Links,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Links {
    website_url: String,
}

async fn post<T: DeserializeOwned>(http: &reqwest::Client, path: &str, body: serde_json::Value) -> Result<Vec<T>> {
    let response = http.post(format!("{API}/{path}")).json(&body).timeout(TIMEOUT).send().await?.error_for_status()?;
    Ok(response.json::<Data<T>>().await?.data)
}

async fn get<T: DeserializeOwned>(http: &reqwest::Client, path: &str, params: &[(&str, String)]) -> Result<T> {
    let url = url::Url::parse_with_params(&format!("{API}/{path}"), params).map_err(|e| GameError::InvalidVersion(e.to_string()))?;
    let response = http.get(url).timeout(TIMEOUT).send().await?.error_for_status()?;
    Ok(response.json().await?)
}

// ── Mondes (classe 17) ──

const WORLDS: u32 = 17;
const PAGE: u32 = 20;
/// CurseForge refuse une recherche dont `index + pageSize` dépasse 10 000.
const MAX_INDEX: u32 = 10_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Listing {
    id: u64,
    name: String,
    slug: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    download_count: f64,
    #[serde(default)]
    authors: Vec<Author>,
    logo: Option<Logo>,
    /// `false` : téléchargement réservé à l'application CurseForge.
    allow_mod_distribution: Option<bool>,
    links: Links,
    #[serde(default)]
    latest_files: Vec<File>,
    #[serde(default)]
    screenshots: Vec<Screenshot>,
    #[serde(default)]
    date_modified: String,
}

impl Listing {
    fn distributable(&self) -> bool {
        self.allow_mod_distribution != Some(false)
    }

    fn author(&self) -> String {
        self.authors.first().map(|author| author.name.clone()).unwrap_or_default()
    }

    fn icon(&self) -> Option<String> {
        self.logo.as_ref().map(|logo| logo.thumbnail_url.clone())
    }
}

#[derive(Deserialize)]
struct Author {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Logo {
    thumbnail_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Screenshot {
    title: Option<String>,
    thumbnail_url: String,
    url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchResult {
    data: Vec<Listing>,
    pagination: Pagination,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pagination {
    total_count: u64,
}

/// Champ de tri CurseForge : pas de pertinence ni d'abonnés, la popularité les remplace.
fn sort_field(sort: modrinth::Sort) -> &'static str {
    match sort {
        modrinth::Sort::Relevance | modrinth::Sort::Follows => "2",
        modrinth::Sort::Downloads => "6",
        modrinth::Sort::Newest => "11",
        modrinth::Sort::Updated => "3",
    }
}

/// Résultat de recherche, sous la forme des résultats Modrinth.
fn hit(listing: Listing, minecraft: &str) -> modrinth::Hit {
    let size = listing.latest_files.iter().find(|file| file.game_versions.iter().any(|version| version == minecraft)).or(listing.latest_files.first()).map(|file| file.file_length);
    modrinth::Hit {
        project_id: listing.id.to_string(),
        author: listing.author(),
        icon_url: listing.icon(),
        external: (!listing.distributable()).then(|| listing.links.website_url.clone()),
        downloads: listing.download_count as u64,
        size,
        loaders: Vec::new(),
        provided_by_clover: false,
        slug: listing.slug,
        title: listing.name,
        description: listing.summary,
    }
}

/// Mondes pour `minecraft`. Les catégories CurseForge sont des nombres (248 : Aventure…).
pub async fn search_worlds(http: &reqwest::Client, query: &str, minecraft: &str, filters: &modrinth::Filters, offset: u32) -> Result<modrinth::SearchPage> {
    if offset + PAGE > MAX_INDEX {
        return Ok(modrinth::SearchPage { hits: Vec::new(), total_hits: u64::from(offset) });
    }
    let categories: Vec<u64> = filters.categories.iter().map(|category| category.parse().map_err(|_| GameError::InvalidVersion(format!("catégorie « {category} »")))).collect::<Result<_>>()?;
    let mut params = vec![
        ("gameId", "432".to_owned()),
        ("classId", WORLDS.to_string()),
        ("gameVersion", minecraft.to_owned()),
        ("searchFilter", query.trim().to_owned()),
        ("sortField", sort_field(filters.sort).to_owned()),
        ("sortOrder", "desc".to_owned()),
        ("index", offset.to_string()),
        ("pageSize", PAGE.to_string()),
    ];
    if !categories.is_empty() {
        params.push(("categoryIds", serde_json::to_string(&categories)?));
    }
    let result: SearchResult = get(http, "mods/search", &params).await?;
    let total_hits = result.pagination.total_count.min(u64::from(MAX_INDEX));
    Ok(modrinth::SearchPage { hits: result.data.into_iter().map(|listing| hit(listing, minecraft)).collect(), total_hits })
}

fn world_id(project: &str) -> Result<u64> {
    project.parse().map_err(|_| GameError::InvalidVersion(format!("monde CurseForge « {project} »")))
}

/// Page d'un monde, sous la forme des pages Modrinth : description nettoyée, captures en galerie.
pub async fn world_page(http: &reqwest::Client, project: &str) -> Result<modrinth::Project> {
    let id = world_id(project)?;
    let listing: Listing = get::<Single<Listing>>(http, &format!("mods/{id}"), &[]).await?.data;
    let description: String = get::<Single<String>>(http, &format!("mods/{id}/description"), &[]).await.map(|page| page.data).unwrap_or_default();
    let mut page: modrinth::Project = serde_json::from_value(serde_json::json!({
        "id": project,
        "slug": listing.slug,
        "title": listing.name,
        "description": listing.summary,
        "icon_url": listing.icon(),
        "author": listing.author(),
        "downloads": listing.download_count as u64,
        "license": null,
        "updated": listing.date_modified,
        "source_url": null,
        "issues_url": null,
        "wiki_url": null,
        "discord_url": null,
    }))?;
    page.description_html = modrinth::clean_html(&description, "https://www.curseforge.com/");
    page.page_url = Some(listing.links.website_url.clone());
    page.gallery = listing
        .screenshots
        .into_iter()
        .map(|shot| serde_json::from_value(serde_json::json!({ "url": shot.thumbnail_url, "raw_url": shot.url, "title": shot.title })))
        .collect::<std::result::Result<_, _>>()?;
    Ok(page)
}

#[derive(Deserialize)]
struct Single<T> {
    data: T,
}

/// Télécharge l'archive du dernier fichier de `project` pour `minecraft` (le plus récent sinon) dans
/// `dir`, vérifiée par son SHA-1 ; renvoie son chemin et le nom du monde.
pub async fn download_world(http: &reqwest::Client, project: &str, minecraft: &str, dir: &Path, on_bytes: &(dyn Fn(u64, u64) + Sync)) -> Result<(std::path::PathBuf, String)> {
    let id = world_id(project)?;
    let listing: Listing = get::<Single<Listing>>(http, &format!("mods/{id}"), &[]).await?.data;
    if !listing.distributable() {
        return Err(GameError::Refused("L'auteur de ce monde ne permet de le télécharger que sur CurseForge.".into()));
    }
    let params = |version: Option<&str>| {
        let mut params = vec![("pageSize", "50".to_owned())];
        params.extend(version.map(|version| ("gameVersion", version.to_owned())));
        params
    };
    let mut files: Vec<File> = get::<Data<File>>(http, &format!("mods/{id}/files"), &params(Some(minecraft))).await?.data;
    if files.is_empty() {
        files = get::<Data<File>>(http, &format!("mods/{id}/files"), &params(None)).await?.data;
    }
    files.sort_by(|a, b| b.file_date.cmp(&a.file_date));
    let file = files.iter().find(|file| file.download_url.as_deref().is_some_and(allowed) && file.hashes.iter().any(|hash| hash.algo == 1));
    let file = file.ok_or_else(|| GameError::Refused("Ce monde n'a pas de fichier téléchargeable.".into()))?;
    let sha1 = file.hashes.iter().find(|hash| hash.algo == 1).expect("SHA-1 vérifié");
    let download = Download {
        url: file.download_url.clone().expect("adresse vérifiée"),
        path: dir.join(format!("{}.zip", file.id)),
        checksum: Some(Checksum::Sha1(sha1.value.to_ascii_lowercase())),
        size: Some(file.file_length),
        executable: false,
    };
    let total = file.file_length;
    super::download::ensure_with_progress(http, &download, &|done| on_bytes(done, total)).await?;
    Ok((download.path, listing.name))
}

/// Adresse de fichier donnée par l'API : HTTPS, sur le CDN de CurseForge.
fn allowed(url: &str) -> bool {
    url::Url::parse(url).is_ok_and(|url| url.scheme() == "https" && url.host_str().is_some_and(|host| FILE_HOSTS.contains(&host)))
}

/// Fichiers obligatoires du pack d'après l'API : téléchargements depuis CurseForge, et entrées des
/// autres, pour Modrinth puis pour le joueur.
async fn resolve(http: &reqwest::Client, manifest: &Manifest, game: &Path, mods: &Path) -> Result<(Vec<Download>, Vec<Entry>)> {
    let wanted: Vec<&PackFile> = manifest.files.iter().filter(|file| file.required).collect();
    if wanted.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }
    let file_ids: Vec<u64> = wanted.iter().map(|file| file.file_id).collect();
    let project_ids: Vec<u64> = wanted.iter().map(|file| file.project_id).collect();
    let files: HashMap<u64, File> = post::<File>(http, "mods/files", serde_json::json!({ "fileIds": file_ids })).await?.into_iter().map(|file| (file.id, file)).collect();
    let projects: HashMap<u64, Project> = post::<Project>(http, "mods", serde_json::json!({ "modIds": project_ids })).await?.into_iter().map(|project| (project.id, project)).collect();
    let (mut downloads, mut entries) = (Vec::new(), Vec::new());
    for wanted in wanted {
        let project = projects.get(&wanted.project_id);
        let file = files.get(&wanted.file_id).filter(|file| file.mod_id == wanted.project_id);
        match file.zip(project).and_then(|(file, project)| download(file, project, game, mods)) {
            Some(download) => downloads.push(download),
            None => entries.push(project.map_or_else(|| Entry::page(wanted.project_id), |project| Entry { name: project.name.clone(), url: project.links.website_url.clone() })),
        }
    }
    Ok((downloads, entries))
}

/// Téléchargement d'un mod, d'un pack de ressources ou d'un shader que l'auteur laisse distribuer,
/// vérifié par son SHA-1 ; `None` pour le reste.
fn download(file: &File, project: &Project, game: &Path, mods: &Path) -> Option<Download> {
    let folder = match project.class_id? {
        6 => mods.to_path_buf(),
        12 => game.join("resourcepacks"),
        6552 => game.join("shaderpacks"),
        _ => return None,
    };
    let url = file.download_url.as_deref().filter(|url| allowed(url))?;
    let sha1 = file.hashes.iter().find(|hash| hash.algo == 1)?;
    let mut components = Path::new(&file.file_name).components();
    let plain = matches!((components.next(), components.next()), (Some(Component::Normal(_)), None));
    plain.then(|| Download { url: url.to_owned(), path: folder.join(&file.file_name), checksum: Some(Checksum::Sha1(sha1.value.to_ascii_lowercase())), size: Some(file.file_length), executable: false })
}

/// Installe depuis Modrinth les entrées qui s'y trouvent ; renvoie celles à ajouter à la main.
async fn from_modrinth(http: &reqwest::Client, entries: &[Entry], minecraft: &str, loader: ModLoader, game: &Path, mods: &Path, on_progress: &(dyn Fn(usize, usize) + Sync)) -> Result<Vec<Entry>> {
    let slugs: Vec<String> = entries.iter().filter_map(|entry| entry.target().map(|(_, slug)| slug.to_owned())).collect();
    let titles: HashMap<String, String> = if slugs.is_empty() {
        HashMap::new()
    } else {
        modrinth::projects(http, &slugs).await?.into_values().map(|summary| (summary.slug, summary.title)).collect()
    };
    let mut missing = Vec::new();
    for (done, entry) in entries.iter().enumerate() {
        on_progress(done, entries.len());
        let found = entry.target().filter(|(_, slug)| titles.get(*slug).is_some_and(|title| same_project(&entry.name, title)));
        let installed = match found {
            Some((Kind::Mod, slug)) => super::personal::install(http, mods, slug, minecraft, loader, &[]).await.map(drop),
            Some((kind, slug)) => {
                let folder = if kind == Kind::Shader { "shaderpacks" } else { "resourcepacks" };
                super::content::install_archive(http, &game.join(folder), kind, slug, minecraft).await.map(drop)
            }
            None => Err(GameError::NoUpdate),
        };
        match installed {
            Ok(()) => {}
            // Introuvable ou sans version pour cette version de Minecraft : à ajouter à la main.
            Err(GameError::NoUpdate) => missing.push(entry.clone()),
            Err(error) => return Err(error),
        }
    }
    on_progress(entries.len(), entries.len());
    Ok(missing)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MODLIST: &str = "\u{feff}<ul>\n<li><a href=\"https://www.curseforge.com/minecraft/mc-mods/fabric-api\">Fabric API (by modmuss50)</a></li>\n<li><a href=\"https://www.curseforge.com/minecraft/mc-mods/jei\">Just Enough Items (JEI) (by mezz)</a></li>\n<li><a href=\"https://www.curseforge.com/minecraft/texture-packs/faithful-32x\">Faithful 32x (by Faithful &amp; co)</a></li>\n<li><a href=\"https://www.curseforge.com/minecraft/customization/a-world\">A World (by x)</a></li>\n</ul>";

    #[test]
    fn reads_the_modlist() {
        let entries = modlist(MODLIST);
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0], Entry { name: "Fabric API".into(), url: "https://www.curseforge.com/minecraft/mc-mods/fabric-api".into() });
        assert_eq!(entries[1].name, "Just Enough Items (JEI)");
        assert_eq!(entries[2].name, "Faithful 32x");
        assert_eq!(entries[0].target().map(|(kind, slug)| (kind == Kind::Mod, slug)), Some((true, "fabric-api")));
        assert!(entries[2].target().is_some_and(|(kind, _)| kind == Kind::Resourcepack));
        assert!(entries[3].target().is_none());
        assert!(Entry { name: "x".into(), url: "https://www.curseforge.com/minecraft/mc-mods/../x".into() }.target().is_none());
    }

    #[test]
    fn matches_projects_by_name() {
        assert!(same_project("Just Enough Items (JEI)", "Just Enough Items"));
        assert!(same_project("Fabric API", "Fabric API"));
        assert!(!same_project("Create", "Sodium"));
        assert!(!same_project("!!", "Sodium"));
    }

    #[test]
    fn accepts_packs_on_every_supported_loader() {
        let pack = |loader: &str| -> Manifest {
            serde_json::from_str(&format!(r#"{{"name":"P","minecraft":{{"version":"1.20.4","modLoaders":[{{"id":"{loader}","primary":true}}]}},"files":[{{"projectID":306612,"fileID":1,"required":true}}]}}"#)).unwrap()
        };
        assert_eq!(pack("fabric-0.19.5").versions().unwrap(), ("1.20.4".into(), ModLoader::Fabric, "0.19.5".into()));
        assert_eq!(pack("fabric-0.19.5").overrides, "overrides");
        assert_eq!(pack("forge-47.2.0").versions().unwrap(), ("1.20.4".into(), ModLoader::Forge, "47.2.0".into()));
        assert_eq!(pack("neoforge-21.1.77").versions().unwrap(), ("1.20.4".into(), ModLoader::NeoForge, "21.1.77".into()));
        assert_eq!(pack("quilt-0.26.0").versions().unwrap(), ("1.20.4".into(), ModLoader::Quilt, "0.26.0".into()));
        assert!(pack("liteloader-1").versions().is_err());
        assert!(pack("forge-").versions().is_err());
        assert_eq!(pack("fabric-0.19.5").pages(), [Entry { name: "Projet CurseForge n° 306612".into(), url: "https://www.curseforge.com/projects/306612".into() }]);
    }

    #[test]
    fn downloads_only_distributable_files() {
        let (game, mods) = (Path::new("/i/game"), Path::new("/i/mods"));
        let file = |name: &str, url: Option<&str>| File {
            id: 1,
            mod_id: 2,
            file_name: name.into(),
            download_url: url.map(Into::into),
            hashes: vec![Hash { value: "MD5".into(), algo: 2 }, Hash { value: "ABC".into(), algo: 1 }],
            file_length: 3,
            file_date: String::new(),
            game_versions: Vec::new(),
        };
        let project = |class_id| Project { id: 2, name: "P".into(), class_id: Some(class_id), links: Links { website_url: "https://www.curseforge.com/minecraft/mc-mods/p".into() } };
        let cdn = Some("https://edge.forgecdn.net/files/1/2/a.jar");
        let jar = download(&file("a.jar", cdn), &project(6), game, mods).unwrap();
        assert_eq!((jar.path, jar.checksum, jar.size), (mods.join("a.jar"), Some(Checksum::Sha1("abc".into())), Some(3)));
        assert_eq!(download(&file("a.zip", cdn), &project(6552), game, mods).unwrap().path, game.join("shaderpacks/a.zip"));
        assert_eq!(download(&file("a.zip", cdn), &project(12), game, mods).unwrap().path, game.join("resourcepacks/a.zip"));
        assert!(download(&file("a.zip", cdn), &project(17), game, mods).is_none());
        assert!(download(&file("a.jar", None), &project(6), game, mods).is_none());
        assert!(download(&file("a.jar", Some("https://example.com/a.jar")), &project(6), game, mods).is_none());
        assert!(download(&file("a.jar", Some("http://edge.forgecdn.net/a.jar")), &project(6), game, mods).is_none());
        assert!(download(&file("../a.jar", cdn), &project(6), game, mods).is_none());
        assert!(download(&file("x/a.jar", cdn), &project(6), game, mods).is_none());
    }

    /// Réseau, par le relais : recherche, page et installation d'un petit monde (« one block to
    /// the sky », 250 Ko).
    #[tokio::test]
    #[ignore = "réseau"]
    async fn finds_and_installs_a_world() {
        let http = super::super::download::client();
        let page = search_worlds(&http, "one block to the sky", "1.21.1", &modrinth::Filters::default(), 0).await.unwrap();
        let hit = page.hits.iter().find(|hit| hit.project_id == "1423310").expect("monde trouvé");
        assert!(hit.external.is_none() && hit.size.is_some());
        let adventure = modrinth::Filters { sort: modrinth::Sort::Downloads, categories: vec!["248".into()], version: None };
        assert!(search_worlds(&http, "", "1.21.1", &adventure, 0).await.unwrap().total_hits > 0);
        let project = world_page(&http, "1423310").await.unwrap();
        assert!(project.page_url.as_deref().is_some_and(|url| url.starts_with("https://www.curseforge.com/")));

        let dir = std::env::temp_dir().join(format!("clover-cf-world-{}", std::process::id()));
        let (archive, name) = download_world(&http, "1423310", "1.21.1", &dir, &|_, _| {}).await.unwrap();
        let folder = super::super::world::install_archive(&archive, &dir.join("saves"), &name).unwrap();
        assert!(dir.join("saves").join(folder).join("level.dat").is_file());
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Réseau : export CurseForge Fabric 1.20.4 (un mod inclus, Fabric API et un mod inconnu de
    /// Modrinth listés), posé dans un dossier temporaire.
    #[tokio::test]
    #[ignore = "réseau"]
    async fn imports_a_curseforge_export() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("clover-curseforge-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let archive = dir.join("pack.zip");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&archive).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(br#"{"minecraft":{"version":"1.20.4","modLoaders":[{"id":"fabric-0.19.5","primary":true}]},"manifestType":"minecraftModpack","name":"Arcanis","overrides":"overrides","files":[{"projectID":306612,"fileID":6674317,"required":true}]}"#).unwrap();
        zip.start_file("modlist.html", options).unwrap();
        zip.write_all(b"<ul>\n<li><a href=\"https://www.curseforge.com/minecraft/mc-mods/fabric-api\">Fabric API (by modmuss50)</a></li>\n<li><a href=\"https://www.curseforge.com/minecraft/mc-mods/clover-introuvable-xyz\">Introuvable (by x)</a></li>\n</ul>").unwrap();
        zip.start_file("overrides/mods/Arcanis.jar", options).unwrap();
        zip.write_all(b"jar").unwrap();
        zip.start_file("overrides/config/arcanis.json", options).unwrap();
        zip.write_all(b"{}").unwrap();
        zip.finish().unwrap();

        let (manifest, entries) = read(&archive).unwrap().unwrap();
        let (minecraft, loader, _) = manifest.versions().unwrap();
        let (game, mods) = (dir.join("game"), dir.join("mods"));
        super::super::content::copy_overrides(&archive, &[&manifest.overrides], &game, &mods).unwrap();
        let missing = install(&super::super::download::client(), &manifest, &entries, &minecraft, loader, &game, &mods, &|_, _| {}).await.unwrap();
        // Par le relais, seuls les fichiers du manifeste comptent : `modlist.html` est ignoré.
        assert!(missing.is_empty(), "{:?}", missing.iter().map(|entry| entry.name.as_str()).collect::<Vec<_>>());
        assert!(mods.join("Arcanis.jar").is_file());
        assert!(game.join("config/arcanis.json").is_file());
        let jars: Vec<String> = std::fs::read_dir(&mods).unwrap().map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert!(jars.iter().any(|name| name.starts_with("fabric-api")), "{jars:?}");
        let _ = std::fs::remove_dir_all(dir);
    }
}
