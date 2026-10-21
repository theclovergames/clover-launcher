//! Notifications du site pour le compte actif, via `/api/launcher/notifications`, et
//! session du launcher sur le site, partagée avec la page Profil (`profile.rs`).
//!
//! Le site doit savoir quel compte Minecraft joue, sans jamais recevoir son jeton : le launcher
//! fait la poignée de main des serveurs Minecraft. Il demande un `serverId` au site, l'annonce à
//! Mojang (`session/minecraft/join`, avec le jeton qui reste ici), puis le site vérifie auprès de
//! Mojang (`hasJoined`) et rend un jeton court, gardé en mémoire le temps de la session du launcher.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex;

use crate::{auth, game::download, site, CurrentSession};

const JOIN_URL: &str = "https://sessionserver.mojang.com/session/minecraft/join";
const TIMEOUT: Duration = Duration::from_secs(10);
/// Après une connexion manquée, délai avant la suivante pour ce compte.
const LOGIN_RETRY: Duration = Duration::from_secs(60);

/// Jetons du site par compte (UUID avec tirets). Le second verrou fait passer une seule connexion à
/// la fois et garde, par compte, l'heure et le message du dernier échec.
#[derive(Default)]
pub struct SiteTokens(Mutex<HashMap<String, String>>, Mutex<HashMap<String, (Instant, String)>>);

/// Notification affichée par la cloche. Mêmes noms que `LauncherNotification` du front.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub message: String,
    /// Page du site (chemin ou adresse https), ou `None`.
    pub url: Option<String>,
    pub created_at: String,
    pub read: bool,
    /// `game` pour un évènement du jeu (niveau, succès, classement), sinon le site.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// `linked: false` : aucun compte du site n'est lié à ce compte Minecraft.
#[derive(Debug, Serialize, Deserialize)]
pub struct Feed {
    pub linked: bool,
    pub items: Vec<Item>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Challenge {
    server_id: String,
}

#[derive(Deserialize)]
struct Token {
    token: String,
}

/// Erreur réseau ou refus, en texte français.
fn failure(error: impl std::fmt::Display) -> String {
    format!("Site de Clover Games injoignable : {error}")
}

/// Nouveau jeton du site pour `session` : challenge, `join` chez Mojang, échange.
async fn login(http: &reqwest::Client, base: &str, session: &auth::Session) -> Result<String, String> {
    let uuid = &session.profile.uuid;
    let challenge: Challenge = http
        // UUID : chiffres hexadécimaux et tirets, rien à encoder.
        .get(format!("{base}/api/launcher/session?uuid={uuid}"))
        .timeout(TIMEOUT)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(failure)?
        .json()
        .await
        .map_err(failure)?;
    let join = serde_json::json!({
        "accessToken": session.minecraft_token,
        "selectedProfile": uuid.replace('-', ""),
        "serverId": challenge.server_id,
    });
    http.post(JOIN_URL).json(&join).timeout(TIMEOUT).send().await.and_then(reqwest::Response::error_for_status).map_err(failure)?;
    let token: Token = http
        .post(format!("{base}/api/launcher/session"))
        .json(&serde_json::json!({ "uuid": uuid, "name": session.profile.name }))
        .timeout(TIMEOUT)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(failure)?
        .json()
        .await
        .map_err(failure)?;
    Ok(token.token)
}

/// Jeton du site pour le compte : celui en mémoire, sinon une connexion, une seule à la fois. Après
/// un échec, le même pendant `LOGIN_RETRY` : chaque rafraîchissement de l'interface referait sinon
/// un `join` chez Mojang, qui limite alors l'adresse du joueur.
async fn token(tokens: &SiteTokens, http: &reqwest::Client, base: &str, session: &auth::Session) -> Result<String, String> {
    let uuid = &session.profile.uuid;
    if let Some(token) = tokens.0.lock().await.get(uuid).cloned() {
        return Ok(token);
    }
    let mut failed = tokens.1.lock().await;
    // Connecté par un autre appel pendant l'attente du verrou.
    if let Some(token) = tokens.0.lock().await.get(uuid).cloned() {
        return Ok(token);
    }
    if let Some((_, error)) = failed.get(uuid).filter(|(at, _)| at.elapsed() < LOGIN_RETRY) {
        return Err(error.clone());
    }
    match login(http, base, session).await {
        Ok(token) => {
            failed.remove(uuid);
            tokens.0.lock().await.insert(uuid.clone(), token.clone());
            Ok(token)
        }
        Err(error) => {
            failed.insert(uuid.clone(), (Instant::now(), error.clone()));
            Err(error)
        }
    }
}

/// Requête authentifiée ; un jeton refusé (expiré) est redemandé une fois.
pub(crate) async fn authorized(
    tokens: &SiteTokens,
    session: &auth::Session,
    send: impl Fn(&reqwest::Client, &str, &str) -> reqwest::RequestBuilder,
) -> Result<reqwest::Response, String> {
    authorized_response(tokens, session, send).await?.error_for_status().map_err(failure)
}

/// Comme `authorized`, mais une erreur HTTP (hors 401) est rendue telle quelle : l'appelant lit le
/// message d'erreur du site (`messages.rs`).
pub(crate) async fn authorized_response(
    tokens: &SiteTokens,
    session: &auth::Session,
    send: impl Fn(&reqwest::Client, &str, &str) -> reqwest::RequestBuilder,
) -> Result<reqwest::Response, String> {
    let http = download::client();
    let base = site::base();
    for _ in 0..2 {
        let token = token(tokens, &http, &base, session).await?;
        let response = send(&http, &base, &token).timeout(TIMEOUT).send().await.map_err(failure)?;
        if response.status() != reqwest::StatusCode::UNAUTHORIZED {
            return Ok(response);
        }
        tokens.0.lock().await.remove(&session.profile.uuid);
    }
    Err(failure("connexion refusée par le site"))
}

pub(crate) async fn session(current: &CurrentSession) -> Result<auth::Session, String> {
    current.fresh().await.ok_or_else(|| "Aucun compte connecté.".to_owned())
}

#[tauri::command]
pub async fn notifications(current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<Feed, String> {
    let session = session(&current).await?;
    // Schéma 2 : la cloche connaît les types `ranking` et `account` (sinon le site les ramène à
    // des types plus anciens, pour les launchers 0.4.0).
    let response = authorized(&tokens, &session, |http, base, token| {
        http.get(format!("{base}/api/launcher/notifications")).bearer_auth(token).header("X-Clover-Notifications", "2")
    })
    .await?;
    let mut feed: Feed = response.json().await.map_err(failure)?;
    // Liens : pages du site, ou adresses https ; le reste n'est pas ouvert.
    for item in &mut feed.items {
        item.url = item.url.take().filter(|url| url.starts_with('/') || url.starts_with("https://"));
    }
    Ok(feed)
}

/// Marque lues `ids`, ou toutes si `None`.
#[tauri::command]
pub async fn mark_notifications_read(ids: Option<Vec<String>>, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<(), String> {
    let session = session(&current).await?;
    let body = serde_json::json!({ "ids": ids });
    authorized(&tokens, &session, |http, base, token| http.post(format!("{base}/api/launcher/notifications/read")).bearer_auth(token).json(&body)).await?;
    Ok(())
}

/// Bulle du système, quand la fenêtre est cachée ou réduite (réglage « Afficher les notifications
/// sur le bureau »).
#[tauri::command]
pub fn system_notification(title: String, message: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification().builder().title(title.chars().take(120).collect::<String>()).body(message.chars().take(400).collect::<String>()).show().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_site_feed() {
        let feed: Feed = serde_json::from_str(
            r#"{"schema":1,"linked":true,"items":[{"id":"a1","kind":"purchase","title":"Achat confirmé !","message":"Merci","url":"/shop","createdAt":"2026-10-06T10:00:00.000Z","read":false}]}"#,
        )
        .unwrap();
        assert!(feed.linked);
        assert_eq!(feed.items[0].kind, "purchase");
        assert_eq!(feed.items[0].url.as_deref(), Some("/shop"));
    }
}
