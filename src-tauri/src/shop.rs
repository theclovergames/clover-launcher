//! Boutique du serveur pour la page Boutique, lue sur le site : catalogue public
//! (`/api/launcher/shop`, mis en cache par le site), fiche d'un produit, puis, avec le jeton du
//! site, le solde de pièces du joueur, ce qu'il ne peut pas acheter, et les deux paiements. Les
//! euros passent par Stripe dans le navigateur (le launcher ne voit jamais une carte) ; les pièces,
//! monnaie du jeu, se dépensent ici. Réponses réduites à ce qui s'affiche : textes bornés, adresses
//! en https seulement, identifiants sûrs pour une adresse.

use std::collections::BTreeMap;
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use tauri::State;

use crate::game::download;
use crate::messages::{clean, decode_body, failure, is_contract_error, site_response};
use crate::notifications::SiteTokens;
use crate::profile::is_player_name;
use crate::{site, CurrentSession};

const TIMEOUT: Duration = Duration::from_secs(10);
/// Bornes de ce que le site peut envoyer : au-delà, le reste est ignoré.
const CATEGORIES_MAX: usize = 30;
const PRODUCTS_MAX: usize = 300;
const FEATURES_MAX: usize = 30;
const RECENT_MAX: usize = 5;
const BLOCKED_MAX: usize = 300;
const ID_MAX: usize = 64;
const NAME_MAX: usize = 80;
const LABEL_MAX: usize = 120;
const DESCRIPTION_MAX: usize = 600;
const REASON_MAX: usize = 200;
const URL_MAX: usize = 1024;
/// Fiche d'un produit (HTML de l'éditeur du site) : au-delà, elle n'est pas affichée.
const CONTENT_MAX: usize = 200_000;
/// Prix borné (100 000 €) : un nombre plus grand vient d'une erreur du site.
const PRICE_MAX: u64 = 10_000_000;
const STRIPE_CHECKOUT: &str = "https://checkout.stripe.com/";

const UNAVAILABLE: &str = "La boutique n'est pas encore disponible dans le launcher.";
const UNREACHABLE: &str = "Boutique injoignable : vérifie ta connexion.";
const DOWN: &str = "Boutique indisponible pour le moment.";
const UNREADABLE: &str = "Réponse du site illisible.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    OneTime,
    Subscription,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Interval {
    Month,
    Year,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Badge {
    Popular,
    BestOffer,
    New,
    Sale,
}

/// Valeur d'une ligne du tableau comparatif : coche ou texte.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FeatureValue {
    Included(bool),
    Text(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feature {
    pub label: String,
    pub value: FeatureValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: String,
    #[serde(default, deserialize_with = "lenient")]
    pub slug: Option<String>,
    /// Slug de la catégorie.
    pub category: String,
    pub name: String,
    #[serde(default, deserialize_with = "lenient")]
    pub description: Option<String>,
    #[serde(default, deserialize_with = "lenient")]
    pub image_url: Option<String>,
    pub price_cents: u64,
    /// Prix en pièces ; `None` si le produit ne se paie pas en pièces.
    #[serde(default, deserialize_with = "lenient")]
    pub credits: Option<u64>,
    /// Payable en euros.
    #[serde(default)]
    pub euro: bool,
    #[serde(rename = "type")]
    pub kind: Kind,
    #[serde(default, deserialize_with = "lenient")]
    pub interval: Option<Interval>,
    #[serde(default, deserialize_with = "lenient")]
    pub badge: Option<Badge>,
    #[serde(default, deserialize_with = "lenient")]
    pub section: Option<String>,
    #[serde(default, deserialize_with = "items")]
    pub features: Vec<Feature>,
    /// Grade : un seul par joueur.
    #[serde(default)]
    pub grade: bool,
    /// Fiche complète en HTML, seulement dans `shop_product` (filtrée encore à l'affichage).
    #[serde(default, deserialize_with = "lenient", skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub slug: String,
    pub name: String,
    #[serde(default, deserialize_with = "lenient")]
    pub description: Option<String>,
    /// Clé de couleur et icône Lucide choisies dans l'administration du site.
    #[serde(default, deserialize_with = "lenient")]
    pub color: Option<String>,
    #[serde(default, deserialize_with = "lenient")]
    pub icon: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Credits {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub per_euro: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Banner {
    pub text: String,
    #[serde(default, deserialize_with = "lenient")]
    pub url: Option<String>,
}

/// Objectif du mois, en euros.
#[derive(Debug, Serialize, Deserialize)]
pub struct Goal {
    pub label: String,
    pub target: f64,
    pub current: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Buyer {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Order {
    pub name: String,
    pub product: String,
    /// Date ISO du site.
    pub at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    #[serde(default, deserialize_with = "lenient")]
    pub credits: Option<Credits>,
    #[serde(default, deserialize_with = "lenient")]
    pub banner: Option<Banner>,
    #[serde(default, deserialize_with = "lenient")]
    pub goal: Option<Goal>,
    #[serde(default, deserialize_with = "lenient")]
    pub top_buyer: Option<Buyer>,
    #[serde(default, deserialize_with = "items")]
    pub recent: Vec<Order>,
    #[serde(default, deserialize_with = "items")]
    pub categories: Vec<Category>,
    #[serde(default, deserialize_with = "items")]
    pub products: Vec<Product>,
}

/// Le joueur face à la boutique : son solde (`None` : économie du jeu injoignable) et, par produit,
/// la raison qui l'empêche de l'acheter pour lui.
#[derive(Debug, Serialize, Deserialize)]
pub struct Account {
    #[serde(default, deserialize_with = "lenient")]
    pub balance: Option<u64>,
    #[serde(default, deserialize_with = "lenient")]
    pub blocked: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditsPaid {
    pub product_name: String,
    pub credits: u64,
    #[serde(default, deserialize_with = "lenient")]
    pub remaining: Option<u64>,
}

fn lenient<'de, D: Deserializer<'de>, T: DeserializeOwned>(deserializer: D) -> Result<Option<T>, D::Error> {
    Ok(serde_json::from_value::<Option<T>>(Value::deserialize(deserializer)?).ok().flatten())
}

fn items<'de, D: Deserializer<'de>, T: DeserializeOwned>(deserializer: D) -> Result<Vec<T>, D::Error> {
    Ok(match Value::deserialize(deserializer)? {
        Value::Array(values) => values.into_iter().filter_map(|value| serde_json::from_value(value).ok()).collect(),
        _ => Vec::new(),
    })
}

/// Identifiant de produit : il entre dans l'adresse de sa fiche.
fn is_id(id: &str) -> bool {
    (1..=ID_MAX).contains(&id.len()) && id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

/// Clé de couleur ou nom d'icône.
fn is_key(key: &str) -> bool {
    (1..=32).contains(&key.len()) && key.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn https(url: Option<String>) -> Option<String> {
    url.filter(|url| url.len() <= URL_MAX && url.starts_with("https://") && !url.chars().any(|c| c.is_whitespace() || c.is_control() || matches!(c, '"' | '\'' | '<' | '>' | '\\')))
}

fn line(text: &str, max: usize) -> Option<String> {
    Some(clean(text, max, false).trim().to_owned()).filter(|text| !text.is_empty())
}

fn feature(feature: Feature) -> Option<Feature> {
    Some(Feature {
        label: line(&feature.label, LABEL_MAX)?,
        value: match feature.value {
            FeatureValue::Included(included) => FeatureValue::Included(included),
            FeatureValue::Text(text) => FeatureValue::Text(clean(&text, LABEL_MAX, false).trim().to_owned()),
        },
    })
}

fn product(mut product: Product) -> Option<Product> {
    if !is_id(&product.id) || product.price_cents > PRICE_MAX {
        return None;
    }
    product.name = line(&product.name, NAME_MAX)?;
    product.category = clean(&product.category, ID_MAX, false);
    product.slug = product.slug.and_then(|slug| line(&slug, ID_MAX));
    product.description = product.description.and_then(|text| line(&text, DESCRIPTION_MAX));
    product.image_url = https(product.image_url);
    product.credits = product.credits.filter(|credits| *credits <= PRICE_MAX * 1000);
    // Un abonnement se renouvelle par Stripe : jamais en pièces.
    if product.kind == Kind::Subscription {
        product.credits = None;
        product.interval = product.interval.or(Some(Interval::Month));
    } else {
        product.interval = None;
    }
    product.section = product.section.and_then(|section| line(&section, LABEL_MAX));
    product.features = product.features.into_iter().filter_map(feature).take(FEATURES_MAX).collect();
    product.content = product.content.filter(|content| content.len() <= CONTENT_MAX);
    Some(product)
}

fn category(mut category: Category) -> Option<Category> {
    category.slug = line(&category.slug, ID_MAX)?;
    category.name = line(&category.name, NAME_MAX)?;
    category.description = category.description.and_then(|text| line(&text, DESCRIPTION_MAX));
    category.color = category.color.filter(|color| is_key(color));
    category.icon = category.icon.filter(|icon| is_key(icon));
    Some(category)
}

fn catalog(mut catalog: Catalog) -> Catalog {
    catalog.categories = catalog.categories.into_iter().filter_map(category).take(CATEGORIES_MAX).collect();
    catalog.products = catalog.products.into_iter().filter_map(product).take(PRODUCTS_MAX).collect();
    catalog.banner = catalog.banner.and_then(|banner| Some(Banner { text: line(&banner.text, DESCRIPTION_MAX)?, url: https(banner.url) }));
    catalog.goal = catalog.goal.and_then(|goal| {
        let valid = |value: f64| value.is_finite() && value >= 0.0;
        (valid(goal.target) && valid(goal.current) && goal.target > 0.0).then(|| Some(Goal { label: line(&goal.label, LABEL_MAX)?, ..goal })).flatten()
    });
    catalog.top_buyer = catalog.top_buyer.filter(|buyer| is_player_name(&buyer.name));
    catalog.recent = catalog
        .recent
        .into_iter()
        .filter(|order| is_player_name(&order.name))
        .filter_map(|order| Some(Order { product: line(&order.product, NAME_MAX)?, at: clean(&order.at, 40, false), ..order }))
        .take(RECENT_MAX)
        .collect();
    catalog
}

fn account(account: Account) -> Account {
    let blocked = account
        .blocked
        .unwrap_or_default()
        .into_iter()
        .filter(|(id, _)| is_id(id))
        .filter_map(|(id, reason)| Some((id, line(&reason, REASON_MAX)?)))
        .take(BLOCKED_MAX)
        .collect();
    Account { balance: account.balance, blocked: Some(blocked) }
}

/// Lecture publique du site, mise en cache par lui.
async fn public<T: DeserializeOwned>(path: &str) -> Result<Option<T>, String> {
    let response = download::client().get(format!("{}{path}", site::base())).timeout(TIMEOUT).send().await.map_err(|_| UNREACHABLE.to_owned())?;
    let status = response.status();
    let body = response.text().await.map_err(|_| UNREADABLE.to_owned())?;
    if status == reqwest::StatusCode::NOT_FOUND {
        return if is_contract_error(&body) { Ok(None) } else { Err(UNAVAILABLE.into()) };
    }
    if !status.is_success() {
        return Err(DOWN.into());
    }
    serde_json::from_str(&body).map(Some).map_err(|_| UNREADABLE.to_owned())
}

#[tauri::command]
pub async fn shop_catalog() -> Result<Catalog, String> {
    Ok(catalog(public("/api/launcher/shop").await?.ok_or(UNAVAILABLE)?))
}

/// Fiche d'un produit, avec son texte complet ; `None` s'il n'est plus en vente.
#[tauri::command]
pub async fn shop_product(id: String) -> Result<Option<Product>, String> {
    #[derive(Deserialize)]
    struct Response {
        product: Product,
    }
    if !is_id(&id) {
        return Ok(None);
    }
    Ok(public::<Response>(&format!("/api/launcher/shop/products/{id}")).await?.and_then(|response| product(response.product)))
}

/// Appel au site avec le jeton du joueur.
async fn signed(current: &CurrentSession, tokens: &SiteTokens, send: impl Fn(&reqwest::Client, &str) -> reqwest::RequestBuilder) -> Result<String, String> {
    let (status, body) = site_response(current, tokens, send).await?;
    if (200..300).contains(&status) {
        Ok(body)
    } else {
        Err(failure(status, &body, UNAVAILABLE))
    }
}

#[tauri::command]
pub async fn shop_account(current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<Account, String> {
    let body = signed(&current, &tokens, |http, base| http.get(format!("{base}/api/launcher/shop/me"))).await?;
    Ok(account(decode_body(&body)?))
}

/// Corps d'un achat ; `gift` : pseudo du joueur à qui l'offrir.
fn purchase(product: &str, gift: Option<&str>) -> Result<Value, String> {
    if !is_id(product) {
        return Err("Produit introuvable.".into());
    }
    let gift = gift.map(str::trim).filter(|gift| !gift.is_empty());
    if gift.is_some_and(|gift| !is_player_name(gift)) {
        return Err("Pseudo Minecraft invalide.".into());
    }
    Ok(serde_json::json!({ "productId": product, "gift": gift }))
}

/// Page de paiement Stripe créée par le site, à ouvrir dans le navigateur ; rien d'autre n'est
/// accepté.
fn checkout_url(body: &str) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Response {
        url: String,
    }
    let url = decode_body::<Response>(body)?.url;
    https(Some(url)).filter(|url| url.starts_with(STRIPE_CHECKOUT)).ok_or_else(|| "Paiement refusé : adresse de paiement inattendue.".to_owned())
}

#[tauri::command]
pub async fn shop_checkout(product: String, gift: Option<String>, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<String, String> {
    let payload = purchase(&product, gift.as_deref())?;
    let body = signed(&current, &tokens, |http, base| http.post(format!("{base}/api/launcher/shop/checkout")).json(&payload)).await?;
    checkout_url(&body)
}

#[tauri::command]
pub async fn shop_pay_credits(product: String, gift: Option<String>, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<CreditsPaid, String> {
    let payload = purchase(&product, gift.as_deref())?;
    let body = signed(&current, &tokens, |http, base| http.post(format!("{base}/api/launcher/shop/credits")).json(&payload)).await?;
    let mut paid: CreditsPaid = decode_body(&body)?;
    paid.product_name = line(&paid.product_name, NAME_MAX).unwrap_or_default();
    Ok(paid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_what_is_shown() {
        let raw: Catalog = serde_json::from_str(
            r#"{"schema":1,"credits":{"enabled":true,"perEuro":100},
              "banner":{"text":"  ","url":null},
              "goal":{"label":"Serveur dédié","target":150,"current":42.5},
              "topBuyer":{"name":"<b>"},
              "recent":[{"name":"Kanname","product":"VIP","at":"2026-10-20T10:00:00.000Z"},{"name":"../x","product":"VIP","at":"x"}],
              "categories":[{"slug":"grades","name":"Grades","color":"yellow","icon":"Crown"},{"slug":"x","name":"","color":"y"},{"slug":"cosmetiques","name":"Cosmétiques","color":"url(x)","icon":null}],
              "products":[
                {"id":"vip","slug":"grade-vip","category":"grades","name":"VIP","description":"Le grade\nVIP","imageUrl":"https://cdn.example/vip.png","priceCents":999,"credits":999,"euro":true,"type":"one_time","interval":"month","badge":"best-offer","section":null,"features":[{"label":"Kit","value":true},{"label":"Homes","value":"5"},{"label":"","value":true},{"label":"Bad","value":{"x":1}}],"grade":true},
                {"id":"plus","category":"grades","name":"Plus","imageUrl":"javascript:alert(1)","priceCents":499,"credits":499,"euro":true,"type":"subscription","interval":null,"badge":"soon"},
                {"id":"../admin","category":"grades","name":"Piège","priceCents":1,"type":"one_time"},
                {"id":"mystery","category":"grades","name":"Mystère","priceCents":1,"type":"lifetime"}
              ]}"#,
        )
        .unwrap();
        let shop = catalog(raw);
        assert!(shop.banner.is_none() && shop.top_buyer.is_none());
        assert_eq!(shop.goal.as_ref().map(|goal| goal.current), Some(42.5));
        assert_eq!(shop.recent.len(), 1);
        assert_eq!(shop.categories.iter().map(|category| category.slug.as_str()).collect::<Vec<_>>(), ["grades", "cosmetiques"]);
        assert!(shop.categories[1].color.is_none());
        assert_eq!(shop.products.iter().map(|product| product.id.as_str()).collect::<Vec<_>>(), ["vip", "plus"]);
        let [vip, plus] = &shop.products[..] else { unreachable!() };
        assert_eq!(vip.description.as_deref(), Some("Le grade VIP"));
        assert_eq!((vip.badge, vip.interval, vip.features.len()), (Some(Badge::BestOffer), None, 2));
        assert!(plus.image_url.is_none() && plus.badge.is_none());
        assert_eq!((plus.credits, plus.interval), (None, Some(Interval::Month)), "un abonnement ne se paie qu'en euros");
    }

    #[test]
    fn checks_purchases_and_the_payment_page() {
        assert!(purchase("vip", Some(" Kanname ")).is_ok_and(|body| body["gift"] == "Kanname"));
        assert!(purchase("vip", Some("")).is_ok_and(|body| body["gift"].is_null()));
        assert!(purchase("vip", Some("Kan name")).is_err());
        assert!(purchase("../vip", None).is_err());
        assert_eq!(checkout_url(r#"{"schema":1,"url":"https://checkout.stripe.com/c/pay/cs_test_a1"}"#).unwrap(), "https://checkout.stripe.com/c/pay/cs_test_a1");
        assert!(checkout_url(r#"{"schema":1,"url":"https://checkout.stripe.com.evil.example/c"}"#).is_err());
        assert!(checkout_url(r#"{"schema":1,"url":"https://evil.example/?https://checkout.stripe.com/"}"#).is_err());
    }

    #[test]
    fn reads_the_account() {
        let raw: Account = serde_json::from_str(r#"{"schema":1,"balance":1250,"blocked":{"vip":"Tu possèdes déjà ce grade.","../x":"non","plus":"  "}}"#).unwrap();
        let account = account(raw);
        assert_eq!(account.balance, Some(1250));
        assert_eq!(account.blocked.unwrap().into_iter().collect::<Vec<_>>(), [("vip".to_owned(), "Tu possèdes déjà ce grade.".to_owned())]);
    }
}
