//! Journal Quick Play de Minecraft (`--quickPlayPath`) : à chaque connexion à un monde ou à un
//! serveur, le jeu remplace ce fichier par cette seule connexion. Le launcher le relit pendant et
//! après la partie pour garder l'historique des serveurs rejoints (`Stored::recent_servers`) et
//! le statut Discord.

use std::path::Path;
use std::time::SystemTime;

use serde::Deserialize;

use crate::store::RecentServer;

/// Entrée écrite par `QuickPlayLog` : `type` vaut `singleplayer`, `multiplayer` ou `realms`, `id`
/// est l'adresse du serveur. Les autres champs (`lastPlayedTime`, `gamemode`) ne servent pas.
#[derive(Deserialize)]
struct Entry {
    #[serde(rename = "type")]
    kind: String,
    id: String,
    name: String,
}

/// Connexion notée par le jeu.
#[derive(Debug, PartialEq)]
pub enum Joined {
    Server(RecentServer),
    /// Monde solo ou Realms.
    Elsewhere,
}

/// Dernier serveur rejoint, `None` sans journal, pour un monde solo ou Realms, ou si le jeu est en
/// train de réécrire le fichier.
pub fn last_server(path: &Path) -> Option<RecentServer> {
    match parse(&std::fs::read(path).ok()?)? {
        Joined::Server(server) => Some(server),
        Joined::Elsewhere => None,
    }
}

/// Dernière connexion de la partie commencée à `since`. Jusqu'à sa première connexion, le journal
/// garde celle de la partie précédente : `None`.
pub fn joined_since(path: &Path, since: SystemTime) -> Option<Joined> {
    if std::fs::metadata(path).ok()?.modified().ok()? < since {
        return None;
    }
    parse(&std::fs::read(path).ok()?)
}

fn parse(bytes: &[u8]) -> Option<Joined> {
    let entries: Vec<Entry> = serde_json::from_slice(bytes).ok()?;
    let entry = entries.into_iter().next()?;
    Some(if entry.kind == "multiplayer" { Joined::Server(RecentServer { address: entry.id, name: entry.name }) } else { Joined::Elsewhere })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_last_connection_only() {
        let log = br#"[{"type":"multiplayer","id":"mc.hypixel.net","name":"Hypixel","lastPlayedTime":"2026-10-02T18:04:11.204Z","gamemode":"adventure"}]"#;
        assert_eq!(parse(log), Some(Joined::Server(RecentServer { address: "mc.hypixel.net".into(), name: "Hypixel".into() })));
        let world = br#"[{"type":"singleplayer","id":"Nouveau monde","name":"Nouveau monde","lastPlayedTime":"2026-10-02T18:04:11Z","gamemode":"survival"}]"#;
        assert_eq!(parse(world), Some(Joined::Elsewhere));
        assert_eq!(parse(br#"[{"type":"multipla"#), None);
    }

    #[test]
    fn ignores_the_connection_of_the_previous_game() {
        let path = std::env::temp_dir().join(format!("clover-quick-play-{}.json", rand::random::<u64>()));
        std::fs::write(&path, br#"[{"type":"multiplayer","id":"mc.hypixel.net","name":"Hypixel"}]"#).unwrap();
        let modified = std::fs::metadata(&path).unwrap().modified().unwrap();
        assert_eq!(joined_since(&path, modified + std::time::Duration::from_secs(1)), None);
        assert!(matches!(joined_since(&path, modified), Some(Joined::Server(_))));
        assert_eq!(last_server(&path).map(|server| server.address), Some("mc.hypixel.net".into()));
        std::fs::remove_file(path).unwrap();
    }
}
