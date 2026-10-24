//! Messages et amis du compte actif, par le site (`/api/launcher/messages` et
//! `/api/launcher/friends/…`, contrat commun au plugin, au site et au launcher). Le jeton du
//! site reste ici, comme pour la cloche : l'interface ne reçoit que des conversations déjà filtrées
//! (pseudos valides, textes bornés, GIF hébergés par Giphy seulement) et des erreurs en français.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use tauri::State;

use crate::notifications::{authorized_response, session, SiteTokens};
use crate::profile::is_player_name;
use crate::site::{items, lenient};
use crate::CurrentSession;

/// En-tête de négociation : version du contrat des messages que ce launcher comprend.
const CONTRACT: (&str, &str) = ("X-Clover-Messages", "1");
/// Longueurs gardées, en caractères (points de code, comme le site).
const BODY_MAX: usize = 1000;
const PREVIEW_MAX: usize = 200;
const STATUS_MAX: usize = 64;
const SERVER_MAX: usize = 64;
const REASON_MAX: usize = 200;
const QUERY_MAX: usize = 50;
const GIF_TITLE_MAX: usize = 140;
const GIF_ID_MAX: usize = 64;
const ERROR_MAX: usize = 300;
const URL_MAX: usize = 512;
/// Côté d'un GIF au-delà duquel la taille annoncée n'est pas crue.
const GIF_SIDE_MAX: u32 = 4096;
/// Messages par page : plafond du site.
const PAGE_MAX: u32 = 50;
/// Giphy ne pagine pas au-delà.
const GIF_OFFSET_MAX: u32 = 4999;
/// Demandes gardées par sens : au-delà, la liste d'amis (50) serait de toute façon pleine.
const REQUESTS_MAX: usize = 100;
/// Octets d'une réaction : de quoi tenir les émojis composés (familles, drapeaux régionaux).
const REACTION_MAX: usize = 32;
/// Plus grand entier exact en JavaScript : un identifiant au-delà serait arrondi par l'interface.
const ID_MAX: u64 = (1 << 53) - 1;
/// Seuls hôtes d'où un GIF s'affiche : ceux où le site résout les GIF de Giphy.
const GIPHY_HOSTS: [&str; 6] = ["media.giphy.com", "media0.giphy.com", "media1.giphy.com", "media2.giphy.com", "media3.giphy.com", "media4.giphy.com"];

const UNREADABLE: &str = "Réponse du site illisible.";
const UNAVAILABLE: &str = "Les messages ne sont pas encore disponibles.";
const TOO_MANY: &str = "Trop de messages, patiente un instant.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Text,
    Gif,
}

/// Type inconnu (contrat plus récent) : lu comme du texte.
impl<'de> Deserialize<'de> for Kind {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(match Value::deserialize(deserializer)? {
            Value::String(kind) if kind.eq_ignore_ascii_case("gif") => Kind::Gif,
            _ => Kind::Text,
        })
    }
}

/// D'où le message a été écrit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Game,
    Launcher,
    Site,
}

/// Origine inconnue : le site.
impl<'de> Deserialize<'de> for Source {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(match Value::deserialize(deserializer)? {
            Value::String(source) if source.eq_ignore_ascii_case("game") => Source::Game,
            Value::String(source) if source.eq_ignore_ascii_case("launcher") => Source::Launcher,
            _ => Source::Site,
        })
    }
}

fn site_source() -> Source {
    Source::Site
}

/// Ami, ou ancien ami dont l'historique reste lisible : mêmes règles de confidentialité que
/// `/profile` (serveur et dernière connexion seulement si l'ami les partage).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    pub uuid: String,
    pub name: String,
    #[serde(default)]
    pub online: bool,
    #[serde(default, deserialize_with = "lenient")]
    pub server: Option<String>,
    #[serde(default, deserialize_with = "lenient")]
    pub last_seen: Option<i64>,
    #[serde(default, deserialize_with = "lenient")]
    pub status: Option<String>,
    #[serde(default)]
    pub can_join: bool,
    /// Statut choisi dans son launcher (`online`, `busy`, `away`) ; absent launcher fermé ou invisible.
    #[serde(default, deserialize_with = "lenient")]
    pub availability: Option<String>,
}

/// Aperçu d'un message : dernier message d'une conversation, ou message cité par une réponse.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    #[serde(deserialize_with = "id")]
    pub id: u64,
    #[serde(default)]
    pub from_me: bool,
    pub kind: Kind,
    #[serde(default, deserialize_with = "text")]
    pub preview: String,
    #[serde(default)]
    pub at: i64,
    #[serde(default)]
    pub deleted: bool,
}

/// GIF de Giphy, adresse résolue par le site.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Gif {
    #[serde(deserialize_with = "text")]
    pub id: String,
    #[serde(deserialize_with = "text")]
    pub url: String,
    #[serde(default, deserialize_with = "dimension")]
    pub width: u32,
    #[serde(default, deserialize_with = "dimension")]
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    #[serde(deserialize_with = "id")]
    pub id: u64,
    #[serde(default)]
    pub from_me: bool,
    pub kind: Kind,
    /// Texte, ou titre d'un GIF (peut être vide).
    #[serde(default, deserialize_with = "text")]
    pub body: String,
    /// `None` aussi pour un GIF dont l'adresse n'est pas sur Giphy : il ne s'affiche pas.
    #[serde(default, deserialize_with = "lenient")]
    pub gif: Option<Gif>,
    #[serde(default, deserialize_with = "lenient")]
    pub reply_to: Option<Preview>,
    #[serde(default = "site_source")]
    pub source: Source,
    pub at: i64,
    #[serde(default, deserialize_with = "lenient")]
    pub edited_at: Option<i64>,
    /// Supprimé pour tous : la place reste, sans texte ni GIF.
    #[serde(default)]
    pub deleted: bool,
    #[serde(default, deserialize_with = "reactions")]
    pub reactions: Reactions,
}

/// Réactions d'un message : un émoji au plus pour chacun des deux amis.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Reactions {
    #[serde(default, deserialize_with = "lenient")]
    pub mine: Option<String>,
    #[serde(default, deserialize_with = "lenient")]
    pub theirs: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub friend: Friend,
    #[serde(default, deserialize_with = "lenient")]
    pub last: Option<Preview>,
    #[serde(default)]
    pub unread: u32,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub muted: bool,
    /// Faux pour un ancien ami : la conversation reste en lecture seule.
    #[serde(default)]
    pub can_write: bool,
    /// Ami actuel, qu'on peut retirer ; faux pour un ancien ami (ou un site qui ne le dit pas).
    #[serde(default)]
    pub is_friend: bool,
}

/// Demande d'ami en attente, reçue ou envoyée ; elle expire d'elle-même à `expires_at`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendRequest {
    pub uuid: String,
    pub name: String,
    #[serde(default)]
    pub at: i64,
    #[serde(default)]
    pub expires_at: i64,
}

/// Demandes d'amis en attente, plus récentes d'abord.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Requests {
    #[serde(default, deserialize_with = "items")]
    pub incoming: Vec<FriendRequest>,
    #[serde(default, deserialize_with = "items")]
    pub outgoing: Vec<FriendRequest>,
}

/// Conversations du compte : tous les amis, même sans message, et les anciens amis avec historique.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Inbox {
    /// Heure du site (millisecondes), pour le délai de modification.
    #[serde(default)]
    pub now: i64,
    #[serde(default)]
    pub unread: u32,
    /// Recherche de GIF configurée sur le site.
    #[serde(default)]
    pub gifs: bool,
    #[serde(default, deserialize_with = "items")]
    pub conversations: Vec<Conversation>,
    /// Absentes d'un site antérieur aux demandes d'amis : aucune.
    #[serde(default, deserialize_with = "requests")]
    pub requests: Requests,
}

/// Une page d'une conversation, avec les messages modifiés ou supprimés depuis `since`.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    #[serde(default)]
    pub now: i64,
    pub friend: Friend,
    /// Ordre croissant.
    #[serde(default, deserialize_with = "items")]
    pub messages: Vec<Message>,
    #[serde(default, deserialize_with = "items")]
    pub updates: Vec<Message>,
    #[serde(default, deserialize_with = "lenient_id")]
    pub last_read_id: u64,
    /// Mes messages jusqu'à celui-ci sont vus par l'ami.
    #[serde(default, deserialize_with = "lenient_id")]
    pub seen_up_to: u64,
    #[serde(default)]
    pub has_more: bool,
    #[serde(default)]
    pub can_write: bool,
    #[serde(default)]
    pub is_friend: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub muted: bool,
}

#[derive(Deserialize)]
struct Sent {
    message: Message,
}

/// GIF proposé par la recherche, rendu `fixed_width` (200 px de large).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GifResult {
    pub id: String,
    pub title: String,
    pub url: String,
    pub width: u32,
    pub height: u32,
}

/// `next` : décalage de la page suivante, `None` à la fin.
#[derive(Debug, Serialize)]
pub struct GifPage {
    pub gifs: Vec<GifResult>,
    pub next: Option<u32>,
}

/// Réponse de `/api/launcher/gifs`, au format de l'API Giphy réduit aux champs utiles.
#[derive(Deserialize)]
struct GiphyResponse {
    #[serde(default, deserialize_with = "items")]
    data: Vec<GiphyGif>,
    #[serde(default, deserialize_with = "lenient")]
    pagination: Option<GiphyPagination>,
}

#[derive(Deserialize)]
struct GiphyPagination {
    #[serde(default)]
    total_count: u64,
    #[serde(default)]
    count: u64,
    #[serde(default)]
    offset: u64,
}

#[derive(Deserialize)]
struct GiphyGif {
    #[serde(deserialize_with = "text")]
    id: String,
    #[serde(default, deserialize_with = "text")]
    title: String,
    images: GiphyImages,
}

#[derive(Deserialize)]
struct GiphyImages {
    #[serde(default, deserialize_with = "lenient")]
    fixed_width: Option<GiphyImage>,
    #[serde(default, deserialize_with = "lenient")]
    fixed_width_downsampled: Option<GiphyImage>,
    #[serde(default, deserialize_with = "lenient")]
    downsized: Option<GiphyImage>,
}

#[derive(Deserialize)]
struct GiphyImage {
    #[serde(default, deserialize_with = "lenient")]
    url: Option<String>,
    #[serde(default, deserialize_with = "dimension")]
    width: u32,
    #[serde(default, deserialize_with = "dimension")]
    height: u32,
}

fn requests<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Requests, D::Error> {
    Ok(lenient::<D, Requests>(deserializer)?.unwrap_or_default())
}

fn reactions<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Reactions, D::Error> {
    Ok(lenient::<D, Reactions>(deserializer)?.unwrap_or_default())
}

/// Texte, `null` lu comme vide.
fn text<'de, D: Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    Ok(match Value::deserialize(deserializer)? {
        Value::String(text) => text,
        _ => String::new(),
    })
}

/// Identifiant `BIGINT` d'un message, en nombre ou en texte selon le pilote MySQL du site.
fn parse_id(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => text.parse().ok(),
        _ => None,
    }
    .filter(|id| *id <= ID_MAX)
}

fn id<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u64, D::Error> {
    parse_id(&Value::deserialize(deserializer)?).ok_or_else(|| serde::de::Error::custom("identifiant de message invalide"))
}

fn lenient_id<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u64, D::Error> {
    Ok(parse_id(&Value::deserialize(deserializer)?).unwrap_or(0))
}

/// Côté d'une image : Giphy l'écrit en texte (« 200 »).
fn dimension<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u32, D::Error> {
    let side = match Value::deserialize(deserializer)? {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    };
    Ok(side.map_or(0, |side| side.min(u64::from(GIF_SIDE_MAX)) as u32))
}

/// Marques de direction : elles retourneraient l'affichage du texte qui suit (pseudo, aperçu).
fn is_bidi_control(c: char) -> bool {
    matches!(c, '\u{061C}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}')
}

/// Texte du site prêt à afficher : sans caractères de contrôle ni marques de direction, les sauts
/// de ligne gardés seulement si `multiline`, tronqué à `max` caractères.
pub(crate) fn clean(text: &str, max: usize, multiline: bool) -> String {
    text.chars()
        .filter_map(|c| match c {
            '\n' if multiline => Some('\n'),
            '\n' | '\t' => Some(' '),
            c if c.is_control() || is_bidi_control(c) => None,
            c => Some(c),
        })
        .take(max)
        .collect()
}

/// UUID avec tirets, en minuscules, comme dans les bases du jeu.
pub(crate) fn is_uuid(text: &str) -> bool {
    text.len() == 36
        && text.bytes().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte),
        })
}

/// GIF affichable : adresse https sur `media.giphy.com` ou `media0` à `media4`, rien d'autre.
fn is_giphy_media(url: &str) -> bool {
    url.len() <= URL_MAX
        && !url.chars().any(|c| c.is_whitespace() || c.is_control() || matches!(c, '"' | '\'' | '<' | '>' | '\\'))
        && url.strip_prefix("https://").is_some_and(|rest| GIPHY_HOSTS.iter().any(|host| rest.strip_prefix(host).is_some_and(|path| path.starts_with('/'))))
}

/// Identifiant de GIF de Giphy : lettres et chiffres.
fn is_gif_id(id: &str) -> bool {
    (1..=GIF_ID_MAX).contains(&id.len()) && id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn friend(mut friend: Friend) -> Option<Friend> {
    friend.uuid = friend.uuid.to_ascii_lowercase();
    // Le pseudo entre dans l'adresse de la tête de l'ami.
    if !is_uuid(&friend.uuid) || !is_player_name(&friend.name) {
        return None;
    }
    let line = |text: String, max| Some(clean(&text, max, false)).filter(|text| !text.trim().is_empty());
    friend.server = friend.server.and_then(|server| line(server, SERVER_MAX));
    friend.status = friend.status.and_then(|status| line(status, STATUS_MAX));
    friend.availability = friend.availability.filter(|availability| matches!(availability.as_str(), "online" | "busy" | "away"));
    Some(friend)
}

fn preview(mut preview: Preview) -> Preview {
    preview.preview = if preview.deleted { String::new() } else { clean(&preview.preview, PREVIEW_MAX, false) };
    preview
}

fn gif(mut gif: Gif) -> Option<Gif> {
    if !is_giphy_media(&gif.url) {
        return None;
    }
    gif.id = Some(gif.id).filter(|id| is_gif_id(id)).unwrap_or_default();
    Some(gif)
}

/// Réaction affichable : un émoji court (le site n'accepte qu'un seul émoji), sans lettres,
/// espaces, caractères de contrôle ni marques de direction.
fn is_reaction(emoji: &str) -> bool {
    (1..=REACTION_MAX).contains(&emoji.len()) && !emoji.chars().any(|c| c.is_ascii_alphabetic() || c.is_whitespace() || c.is_control() || is_bidi_control(c))
}

fn message(mut message: Message) -> Message {
    message.reply_to = message.reply_to.map(preview);
    if message.deleted {
        message.body.clear();
        message.gif = None;
        message.reactions = Reactions::default();
        return message;
    }
    let reaction = |emoji: Option<String>| emoji.filter(|emoji| is_reaction(emoji));
    message.reactions = Reactions { mine: reaction(message.reactions.mine), theirs: reaction(message.reactions.theirs) };
    message.body = clean(&message.body, BODY_MAX, message.kind == Kind::Text);
    message.gif = match message.kind {
        Kind::Gif => message.gif.and_then(gif),
        Kind::Text => None,
    };
    message
}

fn conversation(mut conversation: Conversation) -> Option<Conversation> {
    conversation.friend = friend(conversation.friend)?;
    conversation.last = conversation.last.map(preview);
    Some(conversation)
}

/// Demandes au pseudo et à l'UUID valides, comme les amis.
fn friend_requests(list: Vec<FriendRequest>) -> Vec<FriendRequest> {
    list.into_iter()
        .filter_map(|mut request| {
            request.uuid = request.uuid.to_ascii_lowercase();
            (is_uuid(&request.uuid) && is_player_name(&request.name)).then_some(request)
        })
        .take(REQUESTS_MAX)
        .collect()
}

fn inbox(mut inbox: Inbox) -> Inbox {
    inbox.conversations = inbox.conversations.into_iter().filter_map(conversation).collect();
    inbox.requests.incoming = friend_requests(std::mem::take(&mut inbox.requests.incoming));
    inbox.requests.outgoing = friend_requests(std::mem::take(&mut inbox.requests.outgoing));
    inbox
}

fn thread(mut thread: Thread) -> Result<Thread, String> {
    thread.friend = friend(thread.friend).ok_or(UNREADABLE)?;
    thread.messages = thread.messages.into_iter().map(message).collect();
    thread.messages.sort_by_key(|message| message.id);
    thread.messages.dedup_by_key(|message| message.id);
    thread.updates = thread.updates.into_iter().map(message).collect();
    Ok(thread)
}

/// Page de GIF : premier rendu affichable de chaque GIF (`fixed_width`, sinon un plus léger).
fn gif_page(response: GiphyResponse) -> GifPage {
    let gifs = response
        .data
        .into_iter()
        .filter(|gif| is_gif_id(&gif.id))
        .filter_map(|gif| {
            let GiphyImages { fixed_width, fixed_width_downsampled, downsized } = gif.images;
            let image = [fixed_width, fixed_width_downsampled, downsized].into_iter().flatten().find(|image| image.url.as_deref().is_some_and(is_giphy_media))?;
            Some(GifResult { id: gif.id, title: clean(&gif.title, GIF_TITLE_MAX, false), url: image.url?, width: image.width, height: image.height })
        })
        .collect();
    let next = response.pagination.and_then(|page| {
        let next = page.offset.checked_add(page.count)?;
        (page.count > 0 && next < page.total_count && next <= u64::from(GIF_OFFSET_MAX)).then_some(next as u32)
    });
    GifPage { gifs, next }
}

/// Message d'une réponse en erreur : celui du site s'il en donne un, sinon selon le code. Une route
/// absente (site pas encore à jour) répond 404 sans message.
fn failure_message(status: u16, body: &str) -> String {
    #[derive(Deserialize)]
    struct SiteError {
        #[serde(default, deserialize_with = "lenient")]
        error: Option<String>,
    }
    let site = serde_json::from_str::<SiteError>(body).ok().and_then(|error| error.error).map(|error| clean(error.trim(), ERROR_MAX, false));
    if let Some(error) = site.filter(|error| !error.trim().is_empty()) {
        return error;
    }
    match status {
        404 => UNAVAILABLE.into(),
        429 => TOO_MANY.into(),
        400 => "Le site a refusé cette demande.".into(),
        403 => "Action refusée par le site.".into(),
        _ => "Messages indisponibles pour le moment : réessaie plus tard.".into(),
    }
}

pub(crate) fn decode<T: DeserializeOwned>(body: &str) -> Result<T, String> {
    serde_json::from_str(body).map_err(|_| UNREADABLE.to_owned())
}

/// Appel authentifié au site, avec l'en-tête du contrat : corps de la réponse si elle réussit,
/// sinon l'erreur à afficher.
async fn request(current: &CurrentSession, tokens: &SiteTokens, send: impl Fn(&reqwest::Client, &str) -> reqwest::RequestBuilder) -> Result<String, String> {
    site_request(current, tokens, UNAVAILABLE, send).await
}

/// Code et corps de la réponse du site, pour l'appelant qui lit lui-même un code d'erreur.
pub(crate) async fn site_response(current: &CurrentSession, tokens: &SiteTokens, send: impl Fn(&reqwest::Client, &str) -> reqwest::RequestBuilder) -> Result<(u16, String), String> {
    let session = session(current).await?;
    let response = authorized_response(tokens, &session, |http, base, token| send(http, base).bearer_auth(token).header(CONTRACT.0, CONTRACT.1)).await?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|_| UNREADABLE.to_owned())?;
    Ok((status, body))
}

/// Réponse d'erreur au format du contrat (`{"schema":1,"error":…}`) : elle vient de la route, pas
/// d'une page 404 d'un site qui ne la connaît pas encore.
pub(crate) fn is_contract_error(body: &str) -> bool {
    serde_json::from_str::<Value>(body).is_ok_and(|value| value.get("schema").is_some() && value.get("error").is_some_and(Value::is_string))
}

pub(crate) fn failure(status: u16, body: &str, unavailable: &str) -> String {
    let error = failure_message(status, body);
    if error == UNAVAILABLE { unavailable.to_owned() } else { error }
}

/// Comme `request`, pour une route plus récente que les messages : une route absente dit
/// `unavailable` plutôt que « messages pas encore disponibles ».
pub(crate) async fn site_request(current: &CurrentSession, tokens: &SiteTokens, unavailable: &str, send: impl Fn(&reqwest::Client, &str) -> reqwest::RequestBuilder) -> Result<String, String> {
    let (status, body) = site_response(current, tokens, send).await?;
    if (200..300).contains(&status) {
        Ok(body)
    } else {
        Err(failure(status, &body, unavailable))
    }
}

fn friend_id(friend: &str) -> Result<String, String> {
    Some(friend.trim().to_ascii_lowercase()).filter(|friend| is_uuid(friend)).ok_or_else(|| "Ami introuvable.".to_owned())
}

fn message_id(id: u64) -> Result<u64, String> {
    if (1..=ID_MAX).contains(&id) {
        Ok(id)
    } else {
        Err("Message introuvable.".into())
    }
}

/// Texte à envoyer : caractères de contrôle retirés (sauf les sauts de ligne), espaces de tête et
/// de queue aussi, puis 1 à 1000 caractères. Le site refait ces vérifications.
fn message_body(body: &str) -> Result<String, String> {
    let body = clean(body, usize::MAX, true);
    let body = body.trim();
    match body.chars().count() {
        0 => Err("Écris un message avant de l'envoyer.".into()),
        length if length > BODY_MAX => Err(format!("Message trop long : {BODY_MAX} caractères au plus.")),
        _ => Ok(body.to_owned()),
    }
}

/// Paramètres d'une page de conversation : `before` (plus anciens) ou `after` (plus récents).
fn thread_query(before: Option<u64>, after: Option<u64>, since: Option<i64>, limit: Option<u32>) -> Result<String, String> {
    if before.is_some() && after.is_some() {
        return Err("Page de conversation invalide.".into());
    }
    let mut query = Vec::new();
    if let Some(before) = before {
        query.push(format!("before={}", message_id(before)?));
    }
    if let Some(after) = after {
        query.push(format!("after={}", after.min(ID_MAX)));
    }
    if let Some(since) = since.filter(|since| *since > 0) {
        query.push(format!("since={since}"));
    }
    query.push(format!("limit={}", limit.unwrap_or(PAGE_MAX).clamp(1, PAGE_MAX)));
    Ok(format!("?{}", query.join("&")))
}

/// Conversations du compte actif, pour la page Messages et la pastille de la colonne.
#[tauri::command]
pub async fn message_conversations(current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<Inbox, String> {
    let body = request(&current, &tokens, |http, base| http.get(format!("{base}/api/launcher/messages"))).await?;
    Ok(inbox(decode(&body)?))
}

/// Une page de la conversation avec `friend` : les 50 derniers messages, ceux d'avant `before` ou
/// d'après `after` ; `since` ajoute ceux modifiés ou supprimés depuis.
#[tauri::command]
pub async fn message_thread(
    friend: String,
    before: Option<u64>,
    after: Option<u64>,
    since: Option<i64>,
    limit: Option<u32>,
    current: State<'_, CurrentSession>,
    tokens: State<'_, SiteTokens>,
) -> Result<Thread, String> {
    let friend = friend_id(&friend)?;
    let query = thread_query(before, after, since, limit)?;
    let body = request(&current, &tokens, |http, base| http.get(format!("{base}/api/launcher/messages/{friend}{query}"))).await?;
    thread(decode(&body)?)
}

/// Corps d'un envoi : `replyTo` seulement pour une réponse.
fn outgoing(mut payload: Value, reply_to: Option<u64>) -> Result<Value, String> {
    if let Some(reply_to) = reply_to {
        payload["replyTo"] = message_id(reply_to)?.into();
    }
    Ok(payload)
}

fn sent(body: &str) -> Result<Message, String> {
    Ok(message(decode::<Sent>(body)?.message))
}

#[tauri::command]
pub async fn send_message(friend: String, body: String, reply_to: Option<u64>, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<Message, String> {
    let friend = friend_id(&friend)?;
    let payload = outgoing(serde_json::json!({ "kind": "text", "body": message_body(&body)? }), reply_to)?;
    let response = request(&current, &tokens, |http, base| http.post(format!("{base}/api/launcher/messages/{friend}")).json(&payload)).await?;
    sent(&response)
}

/// GIF choisi dans la recherche : le site le retrouve chez Giphy par son identifiant, jamais par
/// une adresse envoyée par le launcher.
#[tauri::command]
pub async fn send_gif(friend: String, gif_id: String, reply_to: Option<u64>, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<Message, String> {
    let friend = friend_id(&friend)?;
    if !is_gif_id(&gif_id) {
        return Err("GIF introuvable.".into());
    }
    let payload = outgoing(serde_json::json!({ "kind": "gif", "gifId": gif_id }), reply_to)?;
    let response = request(&current, &tokens, |http, base| http.post(format!("{base}/api/launcher/messages/{friend}")).json(&payload)).await?;
    sent(&response)
}

/// Nouveau texte d'un de ses messages (le site limite à 15 minutes après l'envoi).
#[tauri::command]
pub async fn edit_message(friend: String, id: u64, body: String, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<Message, String> {
    let friend = friend_id(&friend)?;
    let id = message_id(id)?;
    let payload = serde_json::json!({ "body": message_body(&body)? });
    let response = request(&current, &tokens, |http, base| http.patch(format!("{base}/api/launcher/messages/{friend}/{id}")).json(&payload)).await?;
    sent(&response)
}

/// Réagit à un message avec un émoji (le même une seconde fois le retire, un autre le remplace),
/// ou retire sa réaction avec `None`.
#[tauri::command]
pub async fn react_message(friend: String, id: u64, emoji: Option<String>, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<Message, String> {
    let friend = friend_id(&friend)?;
    let id = message_id(id)?;
    if emoji.as_deref().is_some_and(|emoji| !is_reaction(emoji)) {
        return Err("Réaction invalide.".into());
    }
    let payload = serde_json::json!({ "emoji": emoji });
    let response = request(&current, &tokens, |http, base| http.post(format!("{base}/api/launcher/messages/{friend}/{id}/reaction")).json(&payload)).await?;
    sent(&response)
}

/// Supprime un message pour soi, ou pour tous (ses propres messages).
#[tauri::command]
pub async fn delete_message(friend: String, id: u64, for_all: bool, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<(), String> {
    let friend = friend_id(&friend)?;
    let id = message_id(id)?;
    let scope = if for_all { "all" } else { "me" };
    request(&current, &tokens, |http, base| http.delete(format!("{base}/api/launcher/messages/{friend}/{id}?for={scope}"))).await?;
    Ok(())
}

/// Statut choisi dans la page Messages (`online`, `busy`, `away`, `invisible`), redit chaque minute
/// tant que le launcher est ouvert : le site l'oublie après 3 minutes sans nouvelle.
#[tauri::command]
pub async fn set_availability(availability: String, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<(), String> {
    if !matches!(availability.as_str(), "online" | "busy" | "away" | "invisible") {
        return Err("Statut inconnu.".into());
    }
    let payload = serde_json::json!({ "availability": availability });
    site_request(&current, &tokens, "Statut pas encore disponible.", |http, base| http.post(format!("{base}/api/launcher/availability")).json(&payload)).await?;
    Ok(())
}

/// Conversation lue jusqu'au message `up_to`.
#[tauri::command]
pub async fn mark_messages_read(friend: String, up_to: u64, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<(), String> {
    let friend = friend_id(&friend)?;
    let payload = serde_json::json!({ "upTo": message_id(up_to)? });
    request(&current, &tokens, |http, base| http.post(format!("{base}/api/launcher/messages/{friend}/read")).json(&payload)).await?;
    Ok(())
}

/// Archiver, couper les notifications ou vider la conversation (pour soi seulement).
#[tauri::command]
pub async fn conversation_state(
    friend: String,
    archived: Option<bool>,
    muted: Option<bool>,
    clear: Option<bool>,
    current: State<'_, CurrentSession>,
    tokens: State<'_, SiteTokens>,
) -> Result<(), String> {
    let friend = friend_id(&friend)?;
    let mut payload = serde_json::Map::new();
    if let Some(archived) = archived {
        payload.insert("archived".into(), archived.into());
    }
    if let Some(muted) = muted {
        payload.insert("muted".into(), muted.into());
    }
    if clear == Some(true) {
        payload.insert("clear".into(), true.into());
    }
    if payload.is_empty() {
        return Ok(());
    }
    let payload = Value::Object(payload);
    request(&current, &tokens, |http, base| http.post(format!("{base}/api/launcher/messages/{friend}/state")).json(&payload)).await?;
    Ok(())
}

/// Signale un message de l'ami à l'équipe, avec un motif court.
#[tauri::command]
pub async fn report_message(friend: String, id: u64, reason: String, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<(), String> {
    let friend = friend_id(&friend)?;
    let id = message_id(id)?;
    let reason = clean(&reason, usize::MAX, false);
    let reason = reason.trim();
    if reason.is_empty() {
        return Err("Indique le motif du signalement.".into());
    }
    if reason.chars().count() > REASON_MAX {
        return Err(format!("Motif trop long : {REASON_MAX} caractères au plus."));
    }
    let payload = serde_json::json!({ "reason": reason });
    request(&current, &tokens, |http, base| http.post(format!("{base}/api/launcher/messages/{friend}/{id}/report")).json(&payload)).await?;
    Ok(())
}

/// Recherche de GIF par le site (clé Giphy de son côté) ; les tendances sans `query`.
#[tauri::command]
pub async fn search_gifs(query: Option<String>, offset: Option<u32>, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<GifPage, String> {
    let query = clean(query.as_deref().unwrap_or_default(), QUERY_MAX, false);
    let mut route = format!("/api/launcher/gifs?offset={}", offset.unwrap_or(0).min(GIF_OFFSET_MAX));
    if !query.trim().is_empty() {
        route.push_str("&q=");
        route.extend(url::form_urlencoded::byte_serialize(query.trim().as_bytes()));
    }
    let body = request(&current, &tokens, |http, base| http.get(format!("{base}{route}"))).await.map_err(|error| {
        // Sans clé Giphy, le site répond 503 ; une route absente, 404.
        if error == UNAVAILABLE { "La recherche de GIF n'est pas encore disponible.".to_owned() } else { error }
    })?;
    Ok(gif_page(decode(&body)?))
}

const REQUESTS_UNAVAILABLE: &str = "Les demandes d'amis ne sont pas encore disponibles dans le launcher.";

/// Joueur d'une demande envoyée.
#[derive(Debug, Serialize, Deserialize)]
pub struct RequestedPlayer {
    pub uuid: String,
    pub name: String,
}

/// `accepted` : ce joueur avait déjà demandé, vous voilà amis.
#[derive(Debug, Serialize, Deserialize)]
pub struct RequestSent {
    pub result: String,
    pub player: RequestedPlayer,
}

/// Demande d'ami à un joueur déjà venu sur le serveur, par son pseudo.
#[tauri::command]
pub async fn send_friend_request(name: String, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<RequestSent, String> {
    let name = name.trim();
    if !is_player_name(name) {
        return Err("Pseudo invalide : 3 à 16 lettres, chiffres ou _.".into());
    }
    let payload = serde_json::json!({ "name": name });
    let body = site_request(&current, &tokens, REQUESTS_UNAVAILABLE, |http, base| http.post(format!("{base}/api/launcher/friends/requests")).json(&payload)).await?;
    let mut sent: RequestSent = decode(&body)?;
    sent.player.uuid = sent.player.uuid.to_ascii_lowercase();
    if !is_uuid(&sent.player.uuid) || !is_player_name(&sent.player.name) || !matches!(sent.result.as_str(), "sent" | "accepted") {
        return Err(UNREADABLE.into());
    }
    Ok(sent)
}

/// Accepter ou refuser une demande reçue, annuler une demande envoyée.
#[tauri::command]
pub async fn answer_friend_request(player: String, action: String, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<(), String> {
    let player = Some(player.trim().to_ascii_lowercase()).filter(|player| is_uuid(player)).ok_or("Demande introuvable.")?;
    if !matches!(action.as_str(), "accept" | "decline" | "cancel") {
        return Err("Action inconnue.".into());
    }
    let payload = serde_json::json!({ "action": action });
    site_request(&current, &tokens, REQUESTS_UNAVAILABLE, |http, base| http.post(format!("{base}/api/launcher/friends/requests/{player}")).json(&payload)).await?;
    Ok(())
}

/// Retirer un ami (`/friend remove` en jeu) : la conversation reste, en lecture seule.
#[tauri::command]
pub async fn remove_friend(friend: String, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<(), String> {
    let friend = friend_id(&friend)?;
    site_request(&current, &tokens, "Retirer un ami n'est pas encore disponible dans le launcher.", |http, base| {
        http.delete(format!("{base}/api/launcher/friends/{friend}"))
    })
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const KANNAME: &str = "0f3c2b9e-6a1d-4f7e-9b2a-1c3d5e7f9a0b";

    #[test]
    fn reads_the_inbox_and_drops_unsafe_friends() {
        let inbox = inbox(
            serde_json::from_str::<Inbox>(&format!(
                r#"{{"schema":1,"now":1792400000000,"unread":3,"gifs":true,"conversations":[
                {{"friend":{{"uuid":"{}","name":"Kanname","online":true,"server":"Practice{bidi}","lastSeen":null,"status":"{}","canJoin":true,"availability":"busy"}},
                  "last":{{"id":"42","fromMe":false,"kind":"gif","preview":"ah\nah","at":1792399990000,"deleted":false}},"unread":3,"archived":false,"muted":false,"canWrite":true,"isFriend":true}},
                {{"friend":{{"uuid":"ab","name":"Valid_Name","online":false}},"last":null,"unread":0,"canWrite":true}},
                {{"friend":{{"uuid":"{KANNAME}","name":"../x","online":false}},"last":null}},
                {{"friend":{{"uuid":"{KANNAME}","name":"Ancien","online":false,"server":null,"lastSeen":1,"status":null,"canJoin":false,"availability":"invisible"}},"last":{{"id":-1}},"unread":0,"canWrite":false}},
                "pas une conversation"
            ]}}"#,
                KANNAME.to_uppercase(),
                "é".repeat(80),
                bidi = '\u{202e}',
            ))
            .unwrap(),
        );
        assert!(inbox.gifs && inbox.unread == 3);
        assert_eq!(inbox.conversations.len(), 2);
        let first = &inbox.conversations[0];
        assert_eq!(first.friend.uuid, KANNAME);
        assert_eq!(first.friend.server.as_deref(), Some("Practice"));
        assert_eq!(first.friend.status.as_ref().unwrap().chars().count(), STATUS_MAX);
        assert_eq!(first.friend.availability.as_deref(), Some("busy"));
        let last = first.last.as_ref().unwrap();
        assert_eq!((last.id, last.kind, last.preview.as_str()), (42, Kind::Gif, "ah ah"));
        // Ancien ami : lecture seule, et un aperçu illisible est simplement absent.
        let former = &inbox.conversations[1];
        assert!(!former.can_write && !former.is_friend && former.last.is_none());
        // Invisible ou inconnu : le site ne devrait pas l'envoyer, le launcher ne le montre pas.
        assert_eq!(former.friend.availability, None);
    }

    #[test]
    fn reads_friend_requests() {
        let inbox = inbox(
            serde_json::from_str::<Inbox>(&format!(
                r#"{{"schema":1,"conversations":[],"requests":{{
                  "incoming":[{{"uuid":"{}","name":"Kanname","at":1,"expiresAt":2}},{{"uuid":"{KANNAME}","name":"../x","at":1,"expiresAt":2}},"oops"],
                  "outgoing":"oops"}}}}"#,
                KANNAME.to_uppercase(),
            ))
            .unwrap(),
        );
        assert_eq!(inbox.requests.incoming.len(), 1);
        assert_eq!((inbox.requests.incoming[0].uuid.as_str(), inbox.requests.incoming[0].expires_at), (KANNAME, 2));
        assert!(inbox.requests.outgoing.is_empty());
        // Site antérieur aux demandes d'amis : aucune.
        let older = inbox_of(r#"{"schema":1,"conversations":[]}"#);
        assert!(older.requests.incoming.is_empty() && older.requests.outgoing.is_empty());
    }

    fn inbox_of(json: &str) -> Inbox {
        inbox(serde_json::from_str(json).unwrap())
    }

    #[test]
    fn reads_a_thread_with_updates() {
        let thread = thread(
            serde_json::from_str::<Thread>(&format!(
                r#"{{"schema":1,"now":1792400000000,"friend":{{"uuid":"{KANNAME}","name":"Kanname","online":false,"server":null,"lastSeen":1792300000000,"status":null,"canJoin":false}},
                "messages":[
                  {{"id":12,"fromMe":true,"kind":"text","body":"salut\r\n\u0007ça va ?","gif":null,"replyTo":null,"source":"launcher","at":1792399000000,"editedAt":1792399100000,"deleted":false,"reactions":{{"mine":"❤️","theirs":"lol"}}}},
                  {{"id":10,"fromMe":false,"kind":"gif","body":"chat","gif":{{"id":"abc123","url":"https://media2.giphy.com/media/abc123/200w.gif","width":"200","height":"150"}},"replyTo":null,"source":"game","at":1792398000000,"deleted":false,"reactions":"oops"}},
                  {{"id":11,"fromMe":false,"kind":"gif","body":"piège","gif":{{"id":"x","url":"https://evil.example/x.gif","width":200,"height":200}},"replyTo":{{"id":10,"fromMe":false,"kind":"gif","preview":"chat","at":1,"deleted":false}},"source":"SITE","at":1792398500000,"deleted":false}},
                  {{"id":13,"fromMe":false,"kind":"text","body":"secret","gif":null,"replyTo":null,"source":"plugin","at":1792399500000,"deleted":true,"reactions":{{"mine":null,"theirs":"😂"}}}},
                  {{"id":"oops"}}
                ],
                "updates":[{{"id":9,"fromMe":true,"kind":"text","body":"","gif":null,"replyTo":null,"source":"site","at":1,"editedAt":null,"deleted":true}}],
                "lastReadId":"11","seenUpTo":12,"hasMore":true,"canWrite":true,"archived":false,"muted":true}}"#
            ))
            .unwrap(),
        )
        .unwrap();
        assert_eq!(thread.messages.iter().map(|message| message.id).collect::<Vec<_>>(), [10, 11, 12, 13]);
        let [gif, trap, text, deleted] = &thread.messages[..] else { unreachable!() };
        assert_eq!(gif.gif.as_ref().map(|gif| (gif.width, gif.height)), Some((200, 150)));
        assert_eq!(gif.source, Source::Game);
        assert!(trap.gif.is_none(), "un GIF hors de Giphy ne s'affiche pas");
        assert_eq!(trap.reply_to.as_ref().map(|reply| reply.id), Some(10));
        assert_eq!(trap.source, Source::Site);
        assert_eq!(text.body, "salut\nça va ?");
        assert_eq!(text.edited_at, Some(1792399100000));
        assert!(deleted.deleted && deleted.body.is_empty() && deleted.source == Source::Site);
        assert_eq!((text.reactions.mine.as_deref(), text.reactions.theirs.as_deref()), (Some("❤️"), None), "du texte n'est pas une réaction");
        assert!(gif.reactions.mine.is_none() && deleted.reactions.theirs.is_none());
        assert_eq!((thread.last_read_id, thread.seen_up_to), (11, 12));
        assert!(thread.has_more && thread.muted && thread.updates[0].deleted);
    }

    #[test]
    fn refuses_a_thread_with_an_unsafe_friend() {
        let raw = r#"{"friend":{"uuid":"0f3c2b9e-6a1d-4f7e-9b2a-1c3d5e7f9a0b","name":"<img>"},"messages":[]}"#;
        assert_eq!(thread(serde_json::from_str(raw).unwrap()).unwrap_err(), UNREADABLE);
    }

    #[test]
    fn keeps_only_giphy_media_urls() {
        for url in ["https://media.giphy.com/media/a/giphy.gif", "https://media0.giphy.com/media/a/200w.gif?cid=1&rid=200w.gif", "https://media4.giphy.com/x.webp"] {
            assert!(is_giphy_media(url), "{url}");
        }
        for url in [
            "http://media.giphy.com/media/a/giphy.gif",
            "https://media5.giphy.com/media/a.gif",
            "https://media.giphy.com.evil.com/a.gif",
            "https://media.giphy.com:8443/a.gif",
            "https://media.giphy.com",
            "https://i.giphy.com/a.gif",
            "https://user@media.giphy.com/a.gif",
            "https://media.giphy.com/a b.gif",
            "https://media.giphy.com/\"onerror=\".gif",
            "javascript:alert(1)//https://media.giphy.com/",
        ] {
            assert!(!is_giphy_media(url), "{url}");
        }
        assert!(!is_giphy_media(&format!("https://media.giphy.com/{}", "a".repeat(URL_MAX))));
    }

    #[test]
    fn maps_site_errors_to_french_messages() {
        // Route absente : page 404 du site, sans message.
        assert_eq!(failure_message(404, "<!DOCTYPE html><html>…</html>"), UNAVAILABLE);
        assert_eq!(failure(404, "<!DOCTYPE html>", "Profils indisponibles."), "Profils indisponibles.");
        assert!(is_contract_error(r#"{"schema":1,"error":"Joueur introuvable."}"#));
        assert!(!is_contract_error("<!DOCTYPE html>") && !is_contract_error(r#"{"error":"x"}"#));
        assert_eq!(failure_message(404, r#"{"schema":1,"error":"Ce joueur n'est pas ton ami."}"#), "Ce joueur n'est pas ton ami.");
        assert_eq!(failure_message(429, ""), TOO_MANY);
        assert_eq!(failure_message(429, r#"{"schema":1,"error":"Doucement !"}"#), "Doucement !");
        assert_eq!(failure_message(403, r#"{"schema":1,"error":"Ce joueur ne reçoit pas tes messages."}"#), "Ce joueur ne reçoit pas tes messages.");
        assert_eq!(failure_message(403, r#"{"schema":1,"error":"  "}"#), "Action refusée par le site.");
        assert_eq!(failure_message(400, r#"{"error":42}"#), "Le site a refusé cette demande.");
        assert_eq!(failure_message(502, "Bad gateway"), "Messages indisponibles pour le moment : réessaie plus tard.");
        let long = failure_message(400, &format!(r#"{{"error":"{}{}"}}"#, '\u{202e}', "x".repeat(400)));
        assert_eq!(long.chars().count(), ERROR_MAX);
        assert!(!long.contains('\u{202e}'));
    }

    #[test]
    fn validates_what_the_interface_sends() {
        assert_eq!(friend_id(&format!(" {} ", KANNAME.to_uppercase())).unwrap(), KANNAME);
        for bad in ["", "../../admin", "0f3c2b9e6a1d4f7e9b2a1c3d5e7f9a0b", "0f3c2b9e-6a1d-4f7e-9b2a-1c3d5e7f9a0g", "0f3c2b9e-6a1d-4f7e-9b2a-1c3d5e7f9a0b/x"] {
            assert!(friend_id(bad).is_err(), "{bad}");
        }
        assert_eq!(message_body("  salut\r\n toi \u{0}").unwrap(), "salut\n toi");
        assert!(message_body(" \n\t ").is_err());
        assert!(message_body(&"a".repeat(BODY_MAX)).is_ok());
        assert!(message_body(&"a".repeat(BODY_MAX + 1)).is_err());
        // Points de code, pas octets : 1000 émojis passent.
        assert!(message_body(&"🍀".repeat(BODY_MAX)).is_ok());
        assert!(message_id(0).is_err() && message_id(ID_MAX + 1).is_err() && message_id(7).is_ok());
        assert!(is_gif_id("xT9IgG50Fb7Mi0prBC") && !is_gif_id("") && !is_gif_id("a/b") && !is_gif_id(&"a".repeat(GIF_ID_MAX + 1)));
        assert_eq!(outgoing(serde_json::json!({ "kind": "text" }), None).unwrap(), serde_json::json!({ "kind": "text" }));
        assert_eq!(outgoing(serde_json::json!({ "kind": "text" }), Some(4)).unwrap()["replyTo"], 4);
    }

    #[test]
    fn builds_thread_pages() {
        assert_eq!(thread_query(None, None, None, None).unwrap(), "?limit=50");
        assert_eq!(thread_query(Some(120), None, None, Some(500)).unwrap(), "?before=120&limit=50");
        assert_eq!(thread_query(None, Some(130), Some(1792400000000), Some(20)).unwrap(), "?after=130&since=1792400000000&limit=20");
        assert!(thread_query(Some(1), Some(2), None, None).is_err());
        assert!(thread_query(Some(0), None, None, None).is_err());
    }

    #[test]
    fn reads_a_giphy_page() {
        let page = gif_page(
            serde_json::from_str(
                r#"{"data":[
                {"id":"abc","title":"Chat qui danse","images":{"fixed_width":{"url":"https://media1.giphy.com/media/abc/200w.gif","width":"200","height":"113"}}},
                {"id":"def","title":"","images":{"fixed_width":{"url":"https://evil.example/def.gif","width":"200","height":"200"},"downsized":{"url":"https://media.giphy.com/media/def/giphy-downsized.gif","width":"480","height":"270"}}},
                {"id":"ghi","title":"x","images":{"fixed_width":{"url":"http://media.giphy.com/ghi.gif","width":"200","height":"200"}}},
                {"id":"../j","title":"x","images":{"fixed_width":{"url":"https://media.giphy.com/j.gif","width":"200","height":"200"}}},
                {"title":"sans id"}
            ],"pagination":{"total_count":120,"count":24,"offset":24},"meta":{"status":200}}"#,
            )
            .unwrap(),
        );
        assert_eq!(page.gifs.iter().map(|gif| gif.id.as_str()).collect::<Vec<_>>(), ["abc", "def"]);
        assert_eq!((page.gifs[0].width, page.gifs[0].height), (200, 113));
        assert!(page.gifs[1].url.starts_with("https://media.giphy.com/"));
        assert_eq!(page.next, Some(48));
        let last: GiphyResponse = serde_json::from_str(r#"{"data":[],"pagination":{"total_count":30,"count":6,"offset":24}}"#).unwrap();
        assert_eq!(gif_page(last).next, None);
    }

    #[test]
    fn cleans_displayed_text() {
        assert_eq!(clean("a\u{202e}b\u{200d}c\td", 10, false), "ab\u{200d}c d");
        assert_eq!(clean("l1\nl2", 10, true), "l1\nl2");
        assert_eq!(clean("l1\nl2", 3, false), "l1 ");
    }
}
