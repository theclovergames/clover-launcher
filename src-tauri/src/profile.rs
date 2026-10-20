//! Statistiques Clover Games pour la page Profil (compte actif, `/api/launcher/profile`) et la page
//! d'un autre joueur (`/api/launcher/players/{pseudo}`), via la session du launcher sur le site
//! (`notifications::authorized`). Réponse réduite aux champs affichés ; un bloc absent ou mal formé
//! reste vide sans casser les autres.

use serde::{Deserialize, Deserializer, Serialize};
use tauri::State;

use crate::messages::{decode_body, failure, is_contract_error, is_uuid, site_response};
use crate::notifications::{authorized, session, SiteTokens};
use crate::CurrentSession;

/// Accepte un bloc mal formé comme absent : une évolution du site ne vide pas toute la page.
fn lenient<'de, D: Deserializer<'de>, T: Deserialize<'de>>(deserializer: D) -> Result<Option<T>, D::Error> {
    Ok(Option::<T>::deserialize(serde_json::Value::deserialize(deserializer)?).ok().flatten())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Grade {
    pub label: String,
    pub color: String,
}

/// Grade en jeu : groupe LuckPerms principal, dont l'identifiant choisit le badge livré avec le launcher.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rank {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Level {
    pub level: u32,
    pub total_xp: u64,
    pub into: u64,
    pub needed: u64,
    pub rank: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Votes {
    pub total: u64,
    pub month: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Streak {
    pub current: u32,
    pub best: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    pub first_seen: Option<i64>,
    pub last_seen: Option<i64>,
    pub last_server: Option<String>,
    pub online: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerTime {
    pub id: String,
    pub seconds: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playtime {
    pub total: u64,
    pub longest: u64,
    pub joins: u64,
    pub servers: Vec<ServerTime>,
}

/// Chiffres d'un mode : noms et sens fixés par le site (`siteweb/src/lib/player-stats.ts`).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mode {
    pub id: String,
    pub rank: Option<u32>,
    pub stats: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub name: String,
    pub icon: String,
    pub description: String,
    pub unlocked_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievements {
    pub unlocked: u32,
    pub total: u32,
    pub points: i64,
    pub recent: Vec<Achievement>,
}

/// Ami du compte : serveur et dernière connexion seulement si l'ami les partage (le site applique
/// ses réglages de confidentialité en jeu).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    pub uuid: String,
    pub name: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub online: bool,
    pub server: Option<String>,
    pub last_seen: Option<i64>,
    pub status: Option<String>,
    #[serde(default)]
    pub can_join: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStats {
    #[serde(default)]
    pub linked: bool,
    #[serde(default, deserialize_with = "lenient")]
    pub grade: Option<Grade>,
    #[serde(default, deserialize_with = "lenient")]
    pub rank: Option<Rank>,
    #[serde(default, deserialize_with = "lenient")]
    pub level: Option<Level>,
    #[serde(default, deserialize_with = "lenient")]
    pub coins: Option<i64>,
    #[serde(default, deserialize_with = "lenient")]
    pub votes: Option<Votes>,
    #[serde(default, deserialize_with = "lenient")]
    pub streak: Option<Streak>,
    #[serde(default, deserialize_with = "lenient")]
    pub presence: Option<Presence>,
    #[serde(default, deserialize_with = "lenient")]
    pub playtime: Option<Playtime>,
    #[serde(default, deserialize_with = "lenient")]
    pub modes: Option<Vec<Mode>>,
    #[serde(default, deserialize_with = "lenient")]
    pub achievements: Option<Achievements>,
    #[serde(default, deserialize_with = "lenient")]
    pub friends: Option<Vec<Friend>>,
}

pub(crate) fn is_player_name(name: &str) -> bool {
    (3..=16).contains(&name.len()) && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

/// Les chiffres d'un mode ne gardent que des nombres (ou `null`) : rien d'autre n'est affiché. Un
/// ami au pseudo invalide est écarté (son pseudo entre dans l'adresse de sa tête), son statut tronqué.
fn numbers_only(mut stats: PlayerStats) -> PlayerStats {
    if let Some(friends) = &mut stats.friends {
        friends.retain(|friend| is_player_name(&friend.name));
        for friend in friends.iter_mut() {
            friend.status = friend.status.take().map(|status| status.chars().take(64).collect());
        }
    }
    if let Some(modes) = &mut stats.modes {
        for mode in modes {
            mode.stats.retain(|_, value| value.is_number() || value.is_null());
        }
    }
    // L'identifiant entre dans le chemin du badge : minuscules, chiffres, `_`, `+` et `-` seulement.
    if let Some(rank) = &mut stats.rank {
        let valid_id = (1..=32).contains(&rank.id.len()) && rank.id.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"_+-".contains(&byte));
        if valid_id {
            rank.label = rank.label.chars().take(32).collect();
        } else {
            stats.rank = None;
        }
    }
    if let Some(grade) = &stats.grade {
        let hex = grade.color.strip_prefix('#').unwrap_or_default();
        if !(hex.len() == 6 && hex.bytes().all(|byte| byte.is_ascii_hexdigit())) {
            stats.grade = None;
        }
    }
    stats
}

#[tauri::command]
pub async fn player_stats(current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<PlayerStats, String> {
    let session = session(&current).await?;
    let response = authorized(&tokens, &session, |http, base, token| http.get(format!("{base}/api/launcher/profile")).bearer_auth(token)).await?;
    let stats: PlayerStats = response.json().await.map_err(|_| "Réponse du site illisible.".to_owned())?;
    Ok(numbers_only(stats))
}

/// Lien entre le compte actif et un autre joueur.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Relation {
    #[serde(rename = "self")]
    Myself,
    Friend,
    /// Demande envoyée, en attente.
    Outgoing,
    /// Demande reçue, en attente.
    Incoming,
    #[serde(other)]
    None,
}

/// Profil public d'un joueur : ses statistiques (sans pièces ni amis, présence réservée à ses amis,
/// filtré par le site) et le lien avec le compte actif.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtherPlayer {
    pub uuid: String,
    pub name: String,
    pub relation: Relation,
    /// Il accepte les demandes d'amis, et aucune n'est en cours.
    #[serde(default)]
    pub can_request: bool,
    pub stats: PlayerStats,
}

fn other_player(mut player: OtherPlayer) -> Result<OtherPlayer, String> {
    player.uuid = player.uuid.to_ascii_lowercase();
    if !is_uuid(&player.uuid) || !is_player_name(&player.name) {
        return Err("Réponse du site illisible.".into());
    }
    player.stats = numbers_only(player.stats);
    Ok(player)
}

/// Profil d'un joueur par son pseudo ; `None` s'il n'est jamais venu sur le serveur.
#[tauri::command]
pub async fn player_profile(name: String, current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<Option<OtherPlayer>, String> {
    let name = name.trim();
    if !is_player_name(name) {
        return Ok(None);
    }
    let (status, body) = site_response(&current, &tokens, |http, base| http.get(format!("{base}/api/launcher/players/{name}"))).await?;
    match status {
        200..=299 => other_player(decode_body(&body)?).map(Some),
        404 if is_contract_error(&body) => Ok(None),
        _ => Err(failure(status, &body, "Les profils des joueurs ne sont pas encore disponibles dans le launcher.")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_site_profile() {
        let stats: PlayerStats = serde_json::from_str(
            r##"{"schema":1,"linked":true,"grade":{"label":"Gérant","color":"#eab308"},
            "level":{"level":27,"totalXp":216135,"into":3719,"needed":20675,"rank":1},
            "coins":374,"votes":{"total":34,"month":0},"streak":{"current":4,"best":13},
            "presence":{"firstSeen":1783836549150,"lastSeen":1791292461123,"lastServer":"Lobby","online":null},
            "playtime":{"total":348127,"longest":84092,"joins":909,"servers":[{"id":"Lobby","seconds":180609}]},
            "modes":[{"id":"practice","rank":1,"stats":{"rating":1005,"peakRating":null,"wins":47,"label":"<b>x</b>"}}],
            "achievements":null}"##,
        )
        .unwrap();
        let stats = numbers_only(stats);
        assert!(stats.linked);
        assert_eq!(stats.level.as_ref().unwrap().rank, Some(1));
        assert_eq!(stats.playtime.as_ref().unwrap().servers[0].id, "Lobby");
        let mode = &stats.modes.as_ref().unwrap()[0];
        assert!(mode.stats.contains_key("rating") && mode.stats.contains_key("peakRating") && !mode.stats.contains_key("label"));
    }

    #[test]
    fn keeps_only_valid_friends() {
        let stats: PlayerStats = serde_json::from_str(
            r#"{"friends":[{"uuid":"a","name":"Kanname","online":true,"server":"Practice","lastSeen":null,"status":null,"canJoin":true},
            {"uuid":"b","name":"../x","server":null,"lastSeen":1,"status":null}]}"#,
        )
        .unwrap();
        let friends = numbers_only(stats).friends.unwrap();
        assert_eq!(friends.len(), 1);
        assert!(friends[0].can_join && !friends[0].favorite);
    }

    #[test]
    fn keeps_the_rest_when_a_block_is_malformed() {
        let stats: PlayerStats = serde_json::from_str(r#"{"linked":false,"grade":{"label":"X","color":"red"},"level":"oops","coins":12}"#).unwrap();
        let stats = numbers_only(stats);
        assert!(stats.level.is_none() && stats.grade.is_none());
        assert_eq!(stats.coins, Some(12));
    }

    #[test]
    fn keeps_only_safe_rank_ids() {
        let rank = |json: &str| numbers_only(serde_json::from_str::<PlayerStats>(json).unwrap()).rank;
        assert_eq!(rank(r#"{"rank":{"id":"gerant","label":"Gérant"}}"#).unwrap().label, "Gérant");
        assert!(rank(r#"{"rank":{"id":"../x","label":"X"}}"#).is_none());
        assert!(rank(r#"{"rank":{"id":"Légende","label":"X"}}"#).is_none());
        assert!(rank(r#"{"rank":"oops"}"#).is_none());
    }

    #[test]
    fn reads_another_player() {
        let player: OtherPlayer = serde_json::from_str(
            r#"{"schema":1,"uuid":"0F3C2B9E-6A1D-4F7E-9B2A-1C3D5E7F9A0B","name":"Kanname","relation":"incoming","canRequest":false,
            "stats":{"linked":false,"coins":null,"friends":null,"modes":[{"id":"skypvp","rank":4,"stats":{"kills":10,"name":"x"}}]}}"#,
        )
        .unwrap();
        let player = other_player(player).unwrap();
        assert_eq!(player.uuid, "0f3c2b9e-6a1d-4f7e-9b2a-1c3d5e7f9a0b");
        assert_eq!(player.relation, Relation::Incoming);
        assert!(!player.stats.modes.as_ref().unwrap()[0].stats.contains_key("name"));
        let relation = |json: &str| serde_json::from_str::<Relation>(json).unwrap();
        assert_eq!(relation(r#""self""#), Relation::Myself);
        assert_eq!(relation(r#""blocked""#), Relation::None);
        let bad: OtherPlayer = serde_json::from_str(r#"{"uuid":"x","name":"Kanname","relation":"none","stats":{}}"#).unwrap();
        assert!(other_player(bad).is_err());
    }
}
