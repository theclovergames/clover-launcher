//! Contenu publié par le site pour l'accueil : actualités, joueurs par mode, maintenance
//! (`/api/launcher/*` de clovergames.fr). Chaque partie est facultative : une route qui ne répond
//! pas laisse la sienne vide, l'interface garde alors ce qu'elle affichait.

use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

use crate::game::download;

const SITE_URL: &str = "https://clovergames.fr";
/// Adresse du site à la place de clovergames.fr (développement, ex. `http://localhost:3000`).
const SITE_OVERRIDE_ENV: &str = "CLOVER_SITE_URL";
const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    pub title: String,
    pub excerpt: String,
    /// Catégorie du blog (« Annonce », « Mise à jour »…).
    #[serde(default)]
    pub category: Option<String>,
    /// Article lisible dans le launcher (`blog_article`) ; absent avant le site du 2026-10-06.
    #[serde(default)]
    pub slug: Option<String>,
    pub image: Option<String>,
    pub url: String,
    pub published_at: String,
}

/// Annonce officielle de Minecraft (`/api/launcher/minecraft-news`), en anglais ou traduite par le site.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftItem {
    pub id: String,
    /// `release`, `snapshot` ou `news`.
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub image: Option<String>,
    /// Article sur minecraft.net (en anglais) ; `None` pour une note de version, lue dans le launcher.
    pub url: Option<String>,
    pub published_at: String,
    /// Note complète lisible dans le launcher (`minecraft_article`).
    pub readable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MinecraftNews {
    /// `false` : annonces en anglais, comme Mojang les publie.
    pub translated: bool,
    pub items: Vec<MinecraftItem>,
}

/// Note publiée du changelog du site, quel que soit le produit concerné.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangelogItem {
    pub slug: String,
    pub title: String,
    pub excerpt: String,
    pub version: Option<String>,
    pub category: String,
    pub image: Option<String>,
    pub url: String,
    pub published_at: String,
}

/// Note complète ; les métadonnées suivent le même contrat que la liste.
#[derive(Debug, Serialize, Deserialize)]
pub struct ChangelogArticle {
    #[serde(flatten)]
    pub item: ChangelogItem,
    pub author: Option<String>,
    pub html: String,
}

/// Page Actualités ; chaque source vaut `None` si sa route ne répond pas.
#[derive(Debug, Serialize)]
pub struct NewsPage {
    pub blog: Option<Vec<NewsItem>>,
    pub minecraft: Option<MinecraftNews>,
    pub changelog: Option<Vec<ChangelogItem>>,
}

/// Note de version complète ; `html` déjà réduit par le site (filtré une seconde fois par
/// l'interface).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftArticle {
    pub id: String,
    pub title: String,
    pub html: String,
    pub published_at: String,
    pub image: Option<String>,
}

/// `online`/`players` à `None` : l'échantillon du site est trop ancien pour être affirmé.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeStatus {
    pub id: String,
    pub online: Option<bool>,
    pub players: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct Feed {
    pub news: Option<Vec<NewsItem>>,
    pub modes: Option<Vec<ModeStatus>>,
    /// Maintenance annoncée par l'équipe sur le site (bandeau de l'accueil).
    pub maintenance: Option<bool>,
}

#[derive(Deserialize)]
struct NewsResponse {
    items: Vec<NewsItem>,
}

#[derive(Deserialize)]
struct ChangelogResponse {
    #[serde(default, deserialize_with = "items")]
    items: Vec<ChangelogItem>,
}

#[derive(Deserialize)]
struct StatusResponse {
    #[serde(default)]
    maintenance: bool,
    servers: Vec<ModeStatus>,
}

/// Adresse du site (clovergames.fr, ou `CLOVER_SITE_URL` en développement).
pub fn base() -> String {
    std::env::var(SITE_OVERRIDE_ENV).unwrap_or_else(|_| SITE_URL.to_owned())
}

pub async fn feed() -> Feed {
    let http = download::client();
    let site = base();
    let (news, modes) = tokio::join!(
        get::<NewsResponse>(&http, &site, "news"),
        get::<StatusResponse>(&http, &site, "status"),
    );
    Feed {
        // Les liens s'ouvrent dans le navigateur et les images se chargent dans l'interface :
        // seules les adresses https sont gardées.
        news: news.map(|response| https_news(response.items)),
        maintenance: modes.as_ref().map(|response| response.maintenance),
        modes: modes.map(|response| response.servers),
    }
}

/// Articles du blog sans adresse https retirés, images non https effacées.
fn https_news(items: Vec<NewsItem>) -> Vec<NewsItem> {
    items.into_iter().filter(|item| is_https(&item.url)).map(|item| NewsItem { image: item.image.filter(|image| is_https(image)), ..item }).collect()
}

/// Blog, changelog (30 notes chacun) et annonces de Minecraft, lus ensemble.
pub async fn news_page() -> NewsPage {
    let http = download::client();
    let site = base();
    let (blog, minecraft, changelog) = tokio::join!(
        get::<NewsResponse>(&http, &site, "news?limit=30"),
        get::<MinecraftNews>(&http, &site, "minecraft-news"),
        get::<ChangelogResponse>(&http, &site, "changelog?limit=30"),
    );
    NewsPage {
        blog: blog.map(|response| https_news(response.items)),
        minecraft: minecraft.map(|mut news| {
            news.items.retain(|item| item.url.as_deref().is_none_or(is_https) && is_identifier(&item.id));
            for item in &mut news.items {
                item.image = item.image.take().filter(|image| is_https(image));
            }
            news
        }),
        changelog: changelog.map(|response| response.items.into_iter().filter_map(clean_changelog).collect()),
    }
}

fn clean_changelog(mut item: ChangelogItem) -> Option<ChangelogItem> {
    if !is_slug(&item.slug) || !is_https(&item.url) || !matches!(item.category.as_str(), "launcher" | "site" | "minecraft") {
        return None;
    }
    item.image = item.image.filter(|image| is_https(image));
    Some(item)
}

/// Identifiant de note de Mojang : 64 caractères hexadécimaux, ou slug (`26-4-snapshot-5`) depuis
/// septembre 2026.
fn is_identifier(id: &str) -> bool {
    !id.is_empty() && id.len() <= 100 && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
}

/// Article du blog lisible dans le launcher, HTML préparé par le site.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlogArticle {
    pub slug: String,
    pub title: String,
    pub category: Option<String>,
    pub image: Option<String>,
    pub author: Option<String>,
    pub published_at: String,
    pub url: String,
    pub html: String,
}

/// Slug d'article ou de changelog : minuscules, chiffres et tirets.
fn is_slug(slug: &str) -> bool {
    !slug.is_empty() && slug.len() <= 200 && slug.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

/// Article du blog, lu dans le launcher sans ouvrir le site.
pub async fn blog_article(slug: &str) -> Result<BlogArticle, String> {
    if !is_slug(slug) {
        return Err("Article introuvable.".into());
    }
    let response = download::client()
        .get(format!("{}/api/launcher/news/{slug}", base()))
        .timeout(TIMEOUT)
        .send()
        .await
        .map_err(|_| "Site injoignable : réessaie dans un instant.".to_owned())?;
    match response.status().as_u16() {
        200 => {}
        404 => return Err("Article introuvable ou retiré du blog.".into()),
        _ => return Err("Article indisponible pour le moment.".into()),
    }
    let mut article: BlogArticle = response.json().await.map_err(|_| "Réponse du site illisible.".to_owned())?;
    article.image = article.image.filter(|image| is_https(image));
    if !is_https(&article.url) {
        article.url = format!("{SITE_URL}/blog/{slug}");
    }
    Ok(article)
}

/// Note du changelog, lue dans le launcher sans ouvrir le site.
pub async fn changelog_article(slug: &str) -> Result<ChangelogArticle, String> {
    if !is_slug(slug) {
        return Err("Note de version introuvable.".into());
    }
    let response = download::client()
        .get(format!("{}/api/launcher/changelog/{slug}", base()))
        .timeout(TIMEOUT)
        .send()
        .await
        .map_err(|_| "Site injoignable : réessaie dans un instant.".to_owned())?;
    match response.status().as_u16() {
        200 => {}
        404 => return Err("Note de version introuvable ou retirée du changelog.".into()),
        _ => return Err("Note de version indisponible pour le moment.".into()),
    }
    let mut article: ChangelogArticle = response.json().await.map_err(|_| "Réponse du site illisible.".to_owned())?;
    if article.item.slug != slug {
        return Err("Réponse du site illisible.".into());
    }
    article.item = clean_changelog(article.item).ok_or_else(|| "Réponse du site illisible.".to_owned())?;
    Ok(article)
}

/// Note de version complète, préparée par le site.
pub async fn minecraft_article(id: &str) -> Result<MinecraftArticle, String> {
    if !is_identifier(id) {
        return Err("Note de version introuvable.".into());
    }
    let response = download::client()
        .get(format!("{}/api/launcher/minecraft-news/{id}", base()))
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .map_err(|_| "Site injoignable : réessaie dans un instant.".to_owned())?;
    match response.status().as_u16() {
        200 => {}
        404 => return Err("Note de version introuvable.".into()),
        _ => return Err("Note de version indisponible pour le moment : réessaie plus tard.".into()),
    }
    let mut article: MinecraftArticle = response.json().await.map_err(|_| "Réponse du site illisible.".to_owned())?;
    article.image = article.image.filter(|image| is_https(image));
    Ok(article)
}

async fn get<T: DeserializeOwned>(http: &reqwest::Client, site: &str, route: &str) -> Option<T> {
    let response = http
        .get(format!("{site}/api/launcher/{route}"))
        .timeout(TIMEOUT)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    response.json().await.ok()
}

fn is_https(url: &str) -> bool {
    url.starts_with("https://")
}

/// Champ mal formé lu comme absent : une évolution du site ne casse pas toute la page.
pub(crate) fn lenient<'de, D: Deserializer<'de>, T: DeserializeOwned>(deserializer: D) -> Result<Option<T>, D::Error> {
    Ok(serde_json::from_value::<Option<T>>(Value::deserialize(deserializer)?).ok().flatten())
}

/// Liste dont les éléments mal formés sont écartés un à un.
pub(crate) fn items<'de, D: Deserializer<'de>, T: DeserializeOwned>(deserializer: D) -> Result<Vec<T>, D::Error> {
    Ok(match Value::deserialize(deserializer)? {
        Value::Array(values) => values.into_iter().filter_map(|value| serde_json::from_value(value).ok()).collect(),
        _ => Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Routes réelles du site (`cargo test -- --ignored`).
    #[tokio::test]
    #[ignore]
    async fn reads_the_real_site() {
        let feed = feed().await;
        println!("{feed:?}");
        assert!(feed.news.is_some() && feed.modes.is_some());
    }

    /// Contrat public du site local (`CLOVER_SITE_URL=... cargo test reads_the_real_changelog -- --ignored`).
    #[tokio::test]
    #[ignore]
    async fn reads_the_real_changelog() {
        let response = get::<ChangelogResponse>(&download::client(), &base(), "changelog?limit=30")
            .await
            .expect("La liste du changelog doit répondre avec le contrat attendu.");
        let count = response.items.len();
        let notes: Vec<_> = response.items.into_iter().filter_map(clean_changelog).collect();
        assert_eq!(notes.len(), count, "Les métadonnées publiées doivent être valides.");
        if let Some(note) = notes.first() {
            let article = changelog_article(&note.slug).await.expect("La note publiée doit être lisible.");
            assert_eq!(article.item.slug, note.slug);
            assert_eq!(article.item.category, note.category);
            assert_eq!(article.item.version, note.version);
            assert_eq!(article.item.title, note.title);
        }
    }

    #[test]
    fn reads_and_filters_changelog_items_independently() {
        let note = serde_json::json!({
            "slug": "launcher-0-6-1", "title": "Nouveautés du launcher", "excerpt": "Un accueil amélioré.",
            "version": "0.6.1", "category": "launcher", "image": "http://example.com/image.png",
            "url": "https://clovergames.fr/changelog#launcher-0-6-1", "publishedAt": "2026-10-23T12:00:00.000Z"
        });
        let mut bad_slug = note.clone();
        bad_slug["slug"] = "../secret".into();
        let mut bad_url = note.clone();
        bad_url["url"] = "javascript:alert(1)".into();
        let mut bad_category = note.clone();
        bad_category["category"] = "autre".into();
        let response: ChangelogResponse = serde_json::from_value(serde_json::json!({
            "schema": 1, "items": [note.clone(), {"title": "Note incomplète"}, bad_slug, bad_url, bad_category]
        })).unwrap();
        let notes: Vec<_> = response.items.into_iter().filter_map(clean_changelog).collect();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].version.as_deref(), Some("0.6.1"));
        assert_eq!(notes[0].image, None);

        for category in ["site", "minecraft"] {
            let mut item = note.clone();
            item["category"] = category.into();
            item["version"] = Value::Null;
            assert!(clean_changelog(serde_json::from_value(item).unwrap()).is_some());
        }
    }

    #[test]
    fn changelog_article_keeps_a_flat_json_contract() {
        let article: ChangelogArticle = serde_json::from_value(serde_json::json!({
            "schema": 1, "slug": "site-2-0", "title": "Le nouveau site", "excerpt": "Une navigation revue.",
            "version": null, "category": "site", "image": null, "author": "Kaysuto",
            "url": "https://clovergames.fr/changelog#site-2-0", "publishedAt": "2026-10-23T12:00:00.000Z",
            "html": "<p>Une navigation revue.</p>"
        })).unwrap();
        let value = serde_json::to_value(article).unwrap();
        assert_eq!(value["slug"], "site-2-0");
        assert_eq!(value["publishedAt"], "2026-10-23T12:00:00.000Z");
        assert_eq!(value["author"], "Kaysuto");
        assert!(value.get("item").is_none() && value["version"].is_null());
    }

    #[tokio::test]
    async fn changelog_article_rejects_invalid_slugs_before_requesting_the_site() {
        for slug in ["", "../secret", "site%2fsecret", "Site-2-0", &"a".repeat(201)] {
            assert_eq!(changelog_article(slug).await.unwrap_err(), "Note de version introuvable.");
        }
    }

    #[test]
    fn keeps_only_safe_minecraft_items() {
        let id = "8df071b98ac92911ae6caae35feb68506bca66894d16f41797164b9a9c6d1824";
        let news: MinecraftNews = serde_json::from_str(&format!(
            r#"{{"schema":1,"translated":true,"items":[
                {{"id":"{id}","kind":"snapshot","title":"Snapshot 3","summary":"Brr","image":"https://launchercontent.mojang.com/v2/images/a.jpg","url":null,"publishedAt":"2026-10-06T12:54:26.000Z","readable":true}},
                {{"id":"../x","kind":"news","title":"T","summary":"S","image":null,"url":"https://www.minecraft.net/article/x","publishedAt":"2026-09-26T12:00:00.000Z","readable":false}}
            ]}}"#
        ))
        .unwrap();
        assert!(news.translated);
        assert!(is_identifier(&news.items[0].id) && !is_identifier(&news.items[1].id));
        assert!(is_identifier("26-4-snapshot-5") && !is_identifier("26.3/x") && !is_identifier(""));
        assert!(is_slug("pvpsoup-saison-1") && !is_slug("../x") && !is_slug("A") && !is_slug(""));
        assert_eq!(news.items[0].url, None);
    }

    #[test]
    fn reads_the_site_responses() {
        let news: NewsResponse = serde_json::from_str(
            r#"{"items":[{"title":"T","excerpt":"E","category":"Annonce","image":null,"url":"https://clovergames.fr/blog/t","publishedAt":"2026-08-22T13:00:00.000Z"}]}"#,
        )
        .unwrap();
        assert_eq!(news.items[0].published_at, "2026-08-22T13:00:00.000Z");
        assert_eq!(news.items[0].slug, None);

        let status: StatusResponse =
            serde_json::from_str(r#"{"servers":[{"id":"lobby","online":true,"players":3},{"id":"creatif","online":null,"players":null}]}"#)
                .unwrap();
        assert_eq!(status.servers[0].players, Some(3));
        assert_eq!(status.servers[1].online, None);

    }
}
