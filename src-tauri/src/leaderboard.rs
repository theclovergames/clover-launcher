//! Classement du réseau pour la page Classement, lu sur le site (`/api/launcher/leaderboard`, public
//! et mis en cache par le site) : les mêmes tableaux que clovergames.fr/leaderboard, réglés dans son
//! administration. Réponse réduite à ce qui s'affiche : pseudos valides (ils entrent dans l'adresse
//! des têtes et du profil), libellés bornés, chiffres seulement.

use std::time::Duration;

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};

use crate::game::download;
use crate::messages::{clean, is_uuid};
use crate::profile::is_player_name;
use crate::site::{self, items, lenient};

const TIMEOUT: Duration = Duration::from_secs(10);
/// Bornes de ce que le site peut envoyer : au-delà, le reste est ignoré.
const BOARDS_MAX: usize = 20;
const STATS_MAX: usize = 12;
const ROWS_MAX: usize = 100;
const NAME_MAX: usize = 40;
const KEY_MAX: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Number,
    Duration,
}

/// Format inconnu (site plus récent) : un nombre.
impl<'de> Deserialize<'de> for Format {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(match Value::deserialize(deserializer)? {
            Value::String(format) if format.eq_ignore_ascii_case("duration") => Format::Duration,
            _ => Format::Number,
        })
    }
}

fn number_format() -> Format {
    Format::Number
}

/// Colonne d'un tableau ; une durée est en secondes.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stat {
    pub key: String,
    pub label: String,
    #[serde(default = "number_format")]
    pub format: Format,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    #[serde(default, deserialize_with = "lenient")]
    pub uuid: Option<String>,
    pub name: String,
    /// Chiffres par clé de colonne ; `null` si la base n'en a pas.
    #[serde(default)]
    pub values: Map<String, Value>,
}

/// Un tableau du site (un mode, le niveau, le temps de jeu…), déjà trié et dédoublonné par le site.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub name: String,
    /// Clé d'icône Lucide et clé de couleur de la palette du site.
    #[serde(default, deserialize_with = "lenient")]
    pub icon: Option<String>,
    #[serde(default, deserialize_with = "lenient")]
    pub color: Option<String>,
    #[serde(default, deserialize_with = "items")]
    pub stats: Vec<Stat>,
    pub sort_key: String,
    /// `true` : le plus petit en tête.
    #[serde(default, deserialize_with = "ascending", rename(deserialize = "order"))]
    pub ascending: bool,
    #[serde(default, deserialize_with = "items")]
    pub rows: Vec<Row>,
}

#[derive(Deserialize)]
struct Response {
    #[serde(default, deserialize_with = "items")]
    boards: Vec<Board>,
}

fn ascending<'de, D: Deserializer<'de>>(deserializer: D) -> Result<bool, D::Error> {
    Ok(matches!(Value::deserialize(deserializer)?, Value::String(order) if order.eq_ignore_ascii_case("asc")))
}

/// Identifiant ou clé de colonne : lettres, chiffres, `_` et `-`.
fn is_key(key: &str) -> bool {
    (1..=KEY_MAX).contains(&key.len()) && key.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

/// UUID du jeu avec tirets, en minuscules ; accepté aussi sans tirets.
fn uuid(raw: &str) -> Option<String> {
    let raw = raw.trim().to_ascii_lowercase();
    let dashed = if raw.len() == 32 && raw.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        format!("{}-{}-{}-{}-{}", &raw[..8], &raw[8..12], &raw[12..16], &raw[16..20], &raw[20..])
    } else {
        raw
    };
    is_uuid(&dashed).then_some(dashed)
}

fn label(text: &str) -> Option<String> {
    Some(clean(text, NAME_MAX, false).trim().to_owned()).filter(|text| !text.is_empty())
}

fn board(mut board: Board) -> Option<Board> {
    if !is_key(&board.id) || !is_key(&board.sort_key) {
        return None;
    }
    board.name = label(&board.name)?;
    board.icon = board.icon.filter(|icon| is_key(icon));
    board.color = board.color.filter(|color| is_key(color));
    board.stats = board
        .stats
        .into_iter()
        .filter(|stat| is_key(&stat.key))
        .filter_map(|mut stat| {
            stat.label = label(&stat.label)?;
            Some(stat)
        })
        .take(STATS_MAX)
        .collect();
    let kept = |key: &str| key == board.sort_key || board.stats.iter().any(|stat| stat.key == key);
    let mut rows: Vec<Row> = Vec::new();
    for mut row in board.rows.drain(..) {
        if rows.len() == ROWS_MAX {
            break;
        }
        if !is_player_name(&row.name) {
            continue;
        }
        row.uuid = row.uuid.as_deref().and_then(uuid);
        row.values.retain(|key, value| kept(key) && (value.is_number() || value.is_null()));
        rows.push(row);
    }
    board.rows = rows;
    Some(board)
}

fn boards(response: Response) -> Vec<Board> {
    response.boards.into_iter().filter_map(board).take(BOARDS_MAX).collect()
}

#[tauri::command]
pub async fn leaderboard() -> Result<Vec<Board>, String> {
    let response = download::client()
        .get(format!("{}/api/launcher/leaderboard", site::base()))
        .timeout(TIMEOUT)
        .send()
        .await
        .map_err(|_| "Classement injoignable : vérifie ta connexion.".to_owned())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("Le classement n'est pas encore disponible dans le launcher.".into());
    }
    let response = response.error_for_status().map_err(|_| "Classement indisponible pour le moment.".to_owned())?;
    let body: Response = response.json().await.map_err(|_| "Réponse du site illisible.".to_owned())?;
    Ok(boards(body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_what_is_shown() {
        let response: Response = serde_json::from_str(
            r#"{"schema":1,"boards":[
              {"id":"bw","name":"BedWars","icon":"swords","color":"emerald","stats":[{"key":"wins","label":"Victoires","format":"number"},{"key":"time","label":"Temps","format":"duration"},{"key":"x y","label":"Bad"}],
               "sortKey":"wins","order":"desc","rows":[
                 {"uuid":"0123456789ABCDEF0123456789abcdef","name":"Kanname","values":{"wins":12,"time":3600,"secret":"x","label":"<b>"}},
                 {"uuid":null,"name":"../x","values":{"wins":1}},
                 {"uuid":"nope","name":"Kaysuto","values":{"wins":null}}]},
              {"id":"../bad","name":"X","sortKey":"wins","rows":[]},
              {"id":"lvl","name":"  ","sortKey":"level","rows":[]},
              {"id":"time","name":"Temps de jeu","sortKey":"seconds","order":"asc","rows":"oops"}]}"#,
        )
        .unwrap();
        let boards = boards(response);
        assert_eq!(boards.len(), 2);
        let bedwars = &boards[0];
        assert_eq!(bedwars.stats.len(), 2);
        assert_eq!(bedwars.stats[1].format, Format::Duration);
        assert!(!bedwars.ascending);
        assert_eq!(bedwars.rows.len(), 2);
        assert_eq!(bedwars.rows[0].uuid.as_deref(), Some("01234567-89ab-cdef-0123-456789abcdef"));
        assert_eq!(bedwars.rows[0].values.len(), 2);
        assert!(bedwars.rows[1].uuid.is_none() && bedwars.rows[1].values["wins"].is_null());
        assert!(boards[1].ascending && boards[1].rows.is_empty());
    }
}
