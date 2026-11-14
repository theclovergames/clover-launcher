//! API publique de Modrinth (https://docs.modrinth.com/api/) : recherche de mods, packs de
//! ressources, shaders, datapacks et modpacks, version compatible d'un projet, identification d'un
//! fichier par son empreinte, page d'un projet. Filtré sur la version de Minecraft de l'instance
//! (sauf les modpacks, qui créent la leur) et sur Fabric pour ce qui charge du code.

use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use url::Url;

use super::{GameError, Result};

const API: &str = "https://api.modrinth.com/v2";
const TIMEOUT: Duration = Duration::from_secs(10);
/// Résultats par page de recherche.
const PAGE: u32 = 20;

#[derive(Debug, Deserialize)]
pub struct Version {
    #[serde(default)]
    pub id: String,
    pub project_id: String,
    /// Nom donné par l'auteur (« Fabulously Optimized 6.4.0 ») ; vide pour certaines versions.
    #[serde(default)]
    pub name: String,
    pub version_number: String,
    pub version_type: String,
    pub files: Vec<File>,
    #[serde(default)]
    pub dependencies: Vec<Dependency>,
    #[serde(default)]
    pub loaders: Vec<String>,
    #[serde(default)]
    pub game_versions: Vec<String>,
    #[serde(default)]
    pub date_published: String,
}

impl Version {
    /// Fichier principal de la version (le `.jar` du mod).
    pub fn primary_file(&self) -> Option<&File> {
        self.files.iter().find(|file| file.primary).or(self.files.first())
    }
}

#[derive(Debug, Deserialize)]
pub struct File {
    pub url: String,
    pub filename: String,
    pub hashes: HashMap<String, String>,
    pub primary: bool,
    pub size: u64,
}

#[derive(Debug, Deserialize)]
pub struct Dependency {
    pub project_id: Option<String>,
    pub version_id: Option<String>,
    pub dependency_type: String,
}

/// Mod trouvé par la recherche. Mêmes noms que le type `ModrinthHit` du front.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Hit {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    /// Chargeurs du projet (Fabric, Forge…, Iris pour un shader), tirés de ses catégories.
    #[serde(default, rename(deserialize = "categories"))]
    pub loaders: Vec<String>,
    /// Sélection du catalogue Clover, même avant le premier téléchargement du jeu.
    #[serde(default, skip_deserializing)]
    pub provided_by_clover: bool,
    /// Page où télécharger soi-même un projet que le launcher n'a pas le droit d'installer
    /// (monde CurseForge dont l'auteur l'interdit) ; absent : installable.
    #[serde(default, skip_deserializing)]
    pub external: Option<String>,
    /// Taille du fichier, quand la recherche la donne (mondes).
    #[serde(default, skip_deserializing)]
    pub size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct SearchPage {
    pub hits: Vec<Hit>,
    pub total_hits: u64,
}

impl SearchPage {
    pub fn mark_provided(&mut self, selected: &[&super::manifest::Mod]) {
        for hit in &mut self.hits {
            hit.provided_by_clover = selected.iter().any(|m| m.id == hit.slug && m.available && m.file.is_some());
        }
    }
}

/// Page d'un mod. Mêmes noms que le type `ModrinthProject` du front.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Project {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    /// Description complète en Markdown, telle que Modrinth la donne ; jamais envoyée au front.
    #[serde(default, skip_serializing)]
    pub(crate) body: String,
    /// La même, rendue en HTML nettoyé par `project` : seule forme que la page affiche.
    #[serde(skip_deserializing)]
    pub description_html: String,
    pub icon_url: Option<String>,
    /// Chargeurs pris en charge (Fabric, Forge…, Iris pour un shader).
    #[serde(default)]
    pub loaders: Vec<String>,
    /// Versions de Minecraft prises en charge, de la plus ancienne à la plus récente.
    #[serde(default)]
    pub game_versions: Vec<String>,
    /// Auteur tel que la recherche l'affiche ; absent si elle n'a pas répondu.
    #[serde(default)]
    pub author: Option<String>,
    pub downloads: u64,
    pub license: Option<License>,
    pub updated: String,
    pub source_url: Option<String>,
    pub issues_url: Option<String>,
    pub wiki_url: Option<String>,
    pub discord_url: Option<String>,
    /// Images mises en avant d'abord, puis dans l'ordre choisi par l'auteur.
    #[serde(default)]
    pub gallery: Vec<Image>,
    /// Page du projet hors de Modrinth (CurseForge) ; absente : sa page Modrinth.
    #[serde(default, skip_deserializing)]
    pub page_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct License {
    pub id: String,
    pub name: String,
}

/// `url` est une miniature (350 px de large), `raw_url` l'image d'origine.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Image {
    pub url: String,
    pub raw_url: Option<String>,
    pub title: Option<String>,
    #[serde(default, skip_serializing)]
    pub(crate) featured: bool,
    #[serde(default, skip_serializing)]
    pub(crate) ordering: i64,
}

/// Type de projet cherché ; mêmes noms que le type `ModrinthKind` du front.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Mod,
    Resourcepack,
    Shader,
    Datapack,
    Modpack,
}

impl Kind {
    /// « Loader » Modrinth des fichiers voulus : celui qui sait les charger.
    pub fn loader(self) -> &'static str {
        match self {
            Kind::Mod | Kind::Modpack => "fabric",
            Kind::Resourcepack => "minecraft",
            Kind::Shader => "iris",
            Kind::Datapack => "datapack",
        }
    }

    /// `loaders` : noms Modrinth des loaders dont les mods tournent sur l'instance, pour les mods.
    fn facets(self, minecraft: &str, loaders: &[&str]) -> serde_json::Value {
        let version = format!("versions:{minecraft}");
        match self {
            // Utiles côté client et sans rien exiger du serveur.
            Kind::Mod => serde_json::json!([
                ["project_type:mod"],
                loaders.iter().map(|loader| format!("categories:{loader}")).collect::<Vec<_>>(),
                [version],
                ["client_side:required", "client_side:optional"],
                ["server_side:optional", "server_side:unsupported"],
            ]),
            Kind::Resourcepack => serde_json::json!([["project_type:resourcepack"], [version]]),
            Kind::Shader => serde_json::json!([["project_type:shader"], ["categories:iris"], [version]]),
            Kind::Datapack => serde_json::json!([["project_type:datapack"], [version]]),
            Kind::Modpack => serde_json::json!([["project_type:modpack"], MODPACK_LOADERS.map(|loader| format!("categories:{loader}"))]),
        }
    }
}

/// Chargeurs des modpacks que le launcher sait installer.
pub const MODPACK_LOADERS: [&str; 4] = ["fabric", "quilt", "forge", "neoforge"];

/// Chargeurs affichés, dans cet ordre : ceux des mods, puis ceux des shaders. Le reste des
/// catégories Modrinth (« minecraft » des packs, « datapack », thèmes) n'en est pas.
const LOADERS: [&str; 6] = ["fabric", "quilt", "forge", "neoforge", "iris", "optifine"];

/// Ne garde de `list` que les chargeurs connus, dans l'ordre de `LOADERS`.
fn known_loaders(list: &mut Vec<String>) {
    list.retain(|loader| LOADERS.contains(&loader.as_str()));
    list.sort_by_key(|loader| LOADERS.iter().position(|known| known == loader));
    list.dedup();
}

/// Ordre des résultats ; mêmes noms que le type `SearchSort` du front.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Sort {
    #[default]
    Relevance,
    Downloads,
    Follows,
    Newest,
    Updated,
}

impl Sort {
    /// Index Modrinth. Sans texte, la pertinence ne classe rien : les plus téléchargés d'abord.
    fn index(self, query: &str) -> &'static str {
        match self {
            Sort::Relevance if query.is_empty() => "downloads",
            Sort::Relevance => "relevance",
            Sort::Downloads => "downloads",
            Sort::Follows => "follows",
            Sort::Newest => "newest",
            Sort::Updated => "updated",
        }
    }
}

/// Tri et catégories choisis dans la recherche ; mêmes noms que le type `SearchFilters` du front.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Filters {
    #[serde(default)]
    pub sort: Sort,
    /// Toutes exigées à la fois.
    #[serde(default)]
    pub categories: Vec<String>,
    /// Modpacks seulement : version de Minecraft exigée, celle de la nouvelle instance voulue.
    #[serde(default)]
    pub version: Option<String>,
}

/// Catégorie Modrinth (« worldgen », « 16x », « 512x+ ») : jamais autre chose qu'un nom de facette.
fn valid_category(category: &str) -> bool {
    (1..=32).contains(&category.len()) && category.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '-' | '+' | '_'))
}

/// Version de Minecraft (« 1.21.1 », « 25w14a », « 1.21-pre1 ») : même règle que pour les facettes.
fn valid_game_version(version: &str) -> bool {
    (1..=32).contains(&version.len()) && version.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

fn endpoint(path: &str, params: &[(&str, &str)]) -> Result<Url> {
    Url::parse_with_params(&format!("{API}/{path}"), params).map_err(|e| GameError::InvalidVersion(e.to_string()))
}

/// Projets de type `kind` pour `minecraft`, triés et filtrés selon `filters`.
pub async fn search(http: &reqwest::Client, kind: Kind, query: &str, minecraft: &str, loaders: &[&str], filters: &Filters, offset: u32) -> Result<SearchPage> {
    let mut facets = kind.facets(minecraft, loaders);
    for category in &filters.categories {
        if !valid_category(category) {
            return Err(GameError::InvalidVersion(format!("catégorie « {category} »")));
        }
        facets.as_array_mut().expect("facettes en liste").push(serde_json::json!([format!("categories:{category}")]));
    }
    if let (Kind::Modpack, Some(version)) = (kind, filters.version.as_deref()) {
        if !valid_game_version(version) {
            return Err(GameError::InvalidVersion(format!("version « {version} »")));
        }
        facets.as_array_mut().expect("facettes en liste").push(serde_json::json!([format!("versions:{version}")]));
    }
    let query = query.trim();
    let url = endpoint(
        "search",
        &[
            ("query", query),
            ("facets", &facets.to_string()),
            ("index", filters.sort.index(query)),
            ("limit", &PAGE.to_string()),
            ("offset", &offset.to_string()),
        ],
    )?;
    let response = http
        .get(url)
        .timeout(TIMEOUT)
        .send()
        .await?
        .error_for_status()?;
    let mut page: SearchPage = response.json().await?;
    page.hits.iter_mut().for_each(|hit| known_loaders(&mut hit.loaders));
    Ok(page)
}

/// Modpack qui porte exactement ce nom (casse ignorée), s'il existe.
pub async fn modpack_named(http: &reqwest::Client, name: &str) -> Result<Option<Hit>> {
    let page = search(http, Kind::Modpack, name, "", &[], &Filters::default(), 0).await?;
    Ok(page.hits.into_iter().find(|hit| hit.title.trim().eq_ignore_ascii_case(name.trim())))
}

/// Versions d'un modpack que le launcher sait installer, de la plus récente à la plus ancienne.
pub async fn modpack_versions(http: &reqwest::Client, project: &str) -> Result<Vec<Version>> {
    if !valid_project(project) {
        return Err(GameError::InvalidVersion(format!("projet Modrinth « {project} »")));
    }
    let url = endpoint(&format!("project/{project}/version"), &[("loaders", &serde_json::json!(MODPACK_LOADERS).to_string())])?;
    let mut versions: Vec<Version> = http.get(url).timeout(TIMEOUT).send().await?.error_for_status()?.json().await?;
    versions.iter_mut().for_each(|version| known_loaders(&mut version.loaders));
    Ok(versions)
}

/// Version `version` (identifiant) de `project` : Modrinth refuse une version d'un autre projet.
pub async fn project_version(http: &reqwest::Client, project: &str, version: &str) -> Result<Version> {
    if !valid_project(project) || !valid_project(version) {
        return Err(GameError::InvalidVersion(format!("version Modrinth « {version} »")));
    }
    Ok(http.get(format!("{API}/project/{project}/version/{version}")).timeout(TIMEOUT).send().await?.error_for_status()?.json().await?)
}

/// Dernière version de `project` (identifiant ou slug) pour l'un des `loaders` et `minecraft`
/// (toutes versions sans lui), stable de préférence.
pub async fn compatible_version(http: &reqwest::Client, project: &str, loaders: &[&str], minecraft: Option<&str>) -> Result<Option<Version>> {
    if !valid_project(project) {
        return Err(GameError::InvalidVersion(format!("projet Modrinth « {project} »")));
    }
    let loaders = serde_json::json!(loaders).to_string();
    let game_versions = serde_json::json!([minecraft]).to_string();
    let mut params = vec![("loaders", loaders.as_str())];
    if minecraft.is_some() {
        params.push(("game_versions", &game_versions));
    }
    let url = endpoint(&format!("project/{project}/version"), &params)?;
    let response = http
        .get(url)
        .timeout(TIMEOUT)
        .send()
        .await?
        .error_for_status()?;
    let mut versions: Vec<Version> = response.json().await?;
    let stable = versions.iter().position(|version| version.version_type == "release").unwrap_or(0);
    Ok((!versions.is_empty()).then(|| versions.swap_remove(stable)))
}

/// Page d'un mod, par identifiant ou slug. L'auteur vient de la recherche, comme dans la liste
/// de résultats (les rôles d'équipe sont libres et ne désignent pas toujours un propriétaire) ;
/// il est facultatif : sans lui, la page s'affiche quand même.
pub async fn project(http: &reqwest::Client, project: &str) -> Result<Project> {
    if !valid_project(project) {
        return Err(GameError::InvalidVersion(format!("projet Modrinth « {project} »")));
    }
    let response = http.get(format!("{API}/project/{project}")).timeout(TIMEOUT).send().await?.error_for_status()?;
    let mut page: Project = response.json().await?;
    known_loaders(&mut page.loaders);
    page.gallery.sort_by_key(|image| (!image.featured, image.ordering));
    page.description_html = description_html(&page.body);
    page.author = author(http, &page.id).await;
    Ok(page)
}

/// Markdown de Modrinth (HTML brut permis) en HTML sûr : la page l'insère tel quel dans la
/// fenêtre du launcher, qui a accès aux commandes Tauri. Pas de script, de style, de formulaire
/// ni d'attribut d'événement ; liens et images relatifs ramenés sur modrinth.com.
pub fn description_html(markdown: &str) -> String {
    use pulldown_cmark::{html, Options, Parser};
    let mut raw = String::new();
    html::push_html(&mut raw, Parser::new_ext(markdown, Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH));
    clean_html(&raw, "https://modrinth.com/")
}

/// HTML d'une page de projet nettoyé comme ci-dessus ; liens et images relatifs ramenés sur `base`.
pub fn clean_html(raw: &str, base: &str) -> String {
    ammonia::Builder::default()
        .url_relative(ammonia::UrlRelative::RewriteWithBase(Url::parse(base).expect("URL valide")))
        .set_tag_attribute_value("img", "loading", "lazy")
        .clean(raw)
        .to_string()
}

async fn author(http: &reqwest::Client, project_id: &str) -> Option<String> {
    let facets = serde_json::json!([[format!("project_id:{project_id}")]]).to_string();
    let url = endpoint("search", &[("facets", &facets)]).ok()?;
    let response = http.get(url).timeout(TIMEOUT).send().await.ok()?.error_for_status().ok()?;
    let page: SearchPage = response.json().await.ok()?;
    page.hits.into_iter().next().map(|hit| hit.author)
}

/// Projet d'un fichier du CDN de Modrinth, lu dans son adresse (`cdn.modrinth.com/data/<projet>/versions/…`).
pub fn cdn_project(url: &str) -> Option<&str> {
    url.strip_prefix("https://cdn.modrinth.com/data/")?.split('/').next()
}

/// Identifiant ou slug Modrinth, qui ne doit jamais sortir de `/project/` une fois dans l'URL.
fn valid_project(project: &str) -> bool {
    (1..=64).contains(&project.len())
        && !project.starts_with('.')
        && project.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// Nom et logo d'un projet, pour « Mes mods » et les packs des instances.
#[derive(Debug, Clone, Deserialize)]
pub struct Summary {
    pub id: String,
    #[serde(default)]
    pub slug: String,
    pub title: String,
    pub icon_url: Option<String>,
}

/// Noms et logos de plusieurs projets en une requête, par identifiant.
pub async fn projects(http: &reqwest::Client, ids: &[String]) -> Result<HashMap<String, Summary>> {
    let url = endpoint("projects", &[("ids", &serde_json::to_string(ids).expect("liste sérialisable"))])?;
    let response = http.get(url).timeout(TIMEOUT).send().await?.error_for_status()?;
    let list: Vec<Summary> = response.json().await?;
    Ok(list.into_iter().map(|summary| (summary.id.clone(), summary)).collect())
}

/// Projet d'une version précise (dépendance qui ne donne que `version_id`).
pub async fn version_project(http: &reqwest::Client, version_id: &str) -> Result<String> {
    let response = http.get(format!("{API}/version/{version_id}")).timeout(TIMEOUT).send().await?.error_for_status()?;
    Ok(response.json::<Version>().await?.project_id)
}

/// Versions correspondant à ces fichiers (empreintes SHA-512) ; les fichiers inconnus de
/// Modrinth sont absents du résultat.
pub async fn identify(http: &reqwest::Client, hashes: Vec<String>) -> Result<HashMap<String, Version>> {
    #[derive(Serialize)]
    struct Query {
        hashes: Vec<String>,
        algorithm: &'static str,
    }
    let response = http
        .post(format!("{API}/version_files"))
        .json(&Query { hashes, algorithm: "sha512" })
        .timeout(TIMEOUT)
        .send()
        .await?
        .error_for_status()?;
    Ok(response.json().await?)
}

/// Dernière version pour l'un des `loaders` et `minecraft` de chaque fichier connu de Modrinth, par
/// empreinte ; seulement parmi les versions stables si `stable`.
pub async fn updates(http: &reqwest::Client, hashes: Vec<String>, minecraft: &str, loaders: &[&str], stable: bool) -> Result<HashMap<String, Version>> {
    #[derive(Serialize)]
    struct Query<'a> {
        hashes: Vec<String>,
        algorithm: &'static str,
        loaders: &'a [&'a str],
        game_versions: [&'a str; 1],
        #[serde(skip_serializing_if = "Option::is_none")]
        version_types: Option<[&'static str; 1]>,
    }
    if hashes.is_empty() {
        return Ok(HashMap::new());
    }
    let query = Query { hashes, algorithm: "sha512", loaders, game_versions: [minecraft], version_types: stable.then_some(["release"]) };
    let response = http
        .post(format!("{API}/version_files/update"))
        .json(&query)
        .timeout(TIMEOUT)
        .send()
        .await?
        .error_for_status()?;
    Ok(response.json().await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sorts_and_categories() {
        assert_eq!(Sort::Relevance.index(""), "downloads");
        assert_eq!(Sort::Relevance.index("sodium"), "relevance");
        assert_eq!(Sort::Updated.index(""), "updated");
        assert!(valid_category("worldgen"));
        assert!(valid_category("512x+"));
        assert!(valid_category("8x-"));
        assert!(!valid_category(""));
        assert!(!valid_category("worldgen\"]"));
        assert!(!valid_category("Worldgen"));
        assert!(valid_game_version("1.21.1") && valid_game_version("25w14a") && valid_game_version("1.21-pre1"));
        assert!(!valid_game_version("") && !valid_game_version("1.21\"]") && !valid_game_version("1.21 1"));
        assert_eq!(serde_json::from_str::<Sort>(r#""newest""#).unwrap(), Sort::Newest);
    }

    /// Réseau : les catégories s'ajoutent aux filtres du type.
    #[tokio::test]
    #[ignore]
    async fn searches_by_category() {
        let potato = Filters { sort: Sort::Downloads, categories: vec!["potato".into()], version: None };
        let page = search(&reqwest::Client::new(), Kind::Shader, "", "1.21.1", &["fabric"], &potato, 0).await.unwrap();
        assert!(page.total_hits > 0);
        // Modpacks d'une seule version de Minecraft : moins nombreux que tous les modpacks.
        let all = search(&reqwest::Client::new(), Kind::Modpack, "", "", &[], &Filters::default(), 0).await.unwrap();
        let old = Filters { version: Some("1.12.2".into()), ..Filters::default() };
        let old = search(&reqwest::Client::new(), Kind::Modpack, "", "", &[], &old, 0).await.unwrap();
        assert!(old.total_hits > 0 && old.total_hits < all.total_hits);
        let invalid = Filters { sort: Sort::Relevance, categories: vec!["a\"]".into()], version: None };
        let invalid = search(&reqwest::Client::new(), Kind::Mod, "", "1.21.1", &["fabric"], &invalid, 0).await;
        assert!(invalid.is_err());
    }

    #[test]
    fn project_ids_stay_inside_the_api() {
        assert!(valid_project("sodium"));
        assert!(valid_project("AANobbMI"));
        assert!(valid_project("ferrite-core"));
        assert!(!valid_project(""));
        assert!(!valid_project(".."));
        assert!(!valid_project("sodium/version"));
        assert!(!valid_project("sodium?x=1"));
    }

    /// Réseau : lit la page de Sodium, auteur et galerie compris.
    #[tokio::test]
    #[ignore]
    async fn reads_a_real_project_page() {
        let page = project(&reqwest::Client::new(), "sodium").await.unwrap();
        assert_eq!(page.id, "AANobbMI");
        assert!(page.author.is_some());
        assert!(!page.gallery.is_empty());
        assert!(page.description_html.contains("<p>"));
    }

    #[test]
    fn description_keeps_formatting_but_no_active_content() {
        let html = description_html(concat!(
            "## Fonctions\n\n**Rapide** et [wiki](/mod/sodium/wiki).\n\n",
            "<p align=\"center\" style=\"position:fixed\"><img src=\"x.png\" onerror=\"alert(1)\"></p>\n\n",
            "<script>alert(1)</script><a href=\"javascript:alert(1)\">lien</a><form><input></form>",
        ));
        assert!(html.contains("<h2>Fonctions</h2>"));
        assert!(html.contains("<strong>Rapide</strong>"));
        assert!(html.contains(r#"href="https://modrinth.com/mod/sodium/wiki""#));
        assert!(html.contains(r#"src="https://modrinth.com/x.png""#));
        assert!(html.contains(r#"loading="lazy""#));
        for banned in ["<script", "alert", "style=", "javascript:", "<form", "<input"] {
            assert!(!html.contains(banned), "{banned} dans {html}");
        }
    }

    #[test]
    fn gallery_puts_featured_first() {
        let json = r#"{"id":"AANobbMI","slug":"sodium","title":"Sodium","description":"d","icon_url":null,"downloads":1,
            "body":"Sodium **rapide**","license":{"id":"LicenseRef-Polyform-Shield-1.0.0","name":"","url":null},"updated":"2026-09-01T00:00:00Z",
            "source_url":null,"issues_url":null,"wiki_url":null,"discord_url":null,
            "gallery":[{"url":"b","title":null,"featured":false,"ordering":0},{"url":"a","title":"Vue","featured":true,"ordering":5}]}"#;
        let mut page: Project = serde_json::from_str(json).unwrap();
        page.gallery.sort_by_key(|image| (!image.featured, image.ordering));
        assert_eq!(page.gallery[0].url, "a");
        let out = serde_json::to_value(&page).unwrap();
        assert_eq!(out["iconUrl"], serde_json::Value::Null);
        assert!(out["gallery"][0].get("featured").is_none());
        assert!(out.get("body").is_none());
        assert_eq!(out["gallery"][0]["rawUrl"], serde_json::Value::Null);
    }
    #[test]
    fn keeps_only_known_loaders_in_order() {
        let mut list = vec!["technology".into(), "neoforge".into(), "minecraft".into(), "fabric".into(), "forge".into(), "fabric".into()];
        known_loaders(&mut list);
        assert_eq!(list, ["fabric", "forge", "neoforge"]);
    }

    /// Réseau : un modpack publié pour Forge et NeoForge, et ses chargeurs dans la recherche.
    #[tokio::test]
    #[ignore = "réseau"]
    async fn lists_modpacks_on_forge_and_neoforge() {
        let http = super::super::download::client();
        let versions = modpack_versions(&http, "battlearmorytacz").await.unwrap();
        assert!(versions.iter().any(|version| version.loaders.iter().any(|loader| loader == "forge")));
        assert!(versions.iter().all(|version| !version.id.is_empty() && version.loaders.iter().all(|loader| MODPACK_LOADERS.contains(&loader.as_str()))));
        let version = project_version(&http, "battlearmorytacz", &versions[0].id).await.unwrap();
        assert_eq!(version.id, versions[0].id);
        let page = search(&http, Kind::Modpack, "BattleArmory TACZ", "", &[], &Filters::default(), 0).await.unwrap();
        assert!(page.hits.iter().any(|hit| hit.slug == "battlearmorytacz" && hit.loaders.contains(&"forge".to_owned())));
    }
}
