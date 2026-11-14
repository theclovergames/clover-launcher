//! Discord Rich Presence : « Joue à Clover Games », ou à Minecraft avec le serveur rejoint.
//!
//! L'identifiant d'application est public (il figure dans tout statut Discord) ; aucun secret.
//! Discord fermé ou absent n'est jamais une erreur : on réessaie discrètement au changement
//! d'état suivant et toutes les 30 s (`keep_alive`). Le nom affiché après « Joue à » est celui de
//! l'application Discord.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use discord_rich_presence::{
    activity::{Activity, Assets, Button, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use tokio::sync::Mutex;

use crate::game::quick_play::Joined;

const APPLICATION_ID: &str = "1556616919925268480";
/// Clé de l'image téléversée dans Rich Presence → Art Assets de l'application Discord.
const LOGO_KEY: &str = "logo";
const SERVER_HOST: &str = "play.clovergames.fr";
const DISCORD_URL: &str = "https://discord.gg/theclovergames";
const SITE_URL: &str = "https://clovergames.fr";
/// Tête du skin, rendue par Minotar ; Discord accepte une URL comme image. Pas Crafatar : il
/// renvoie le robot de Discord vers une page d'erreur (crafatar/crafatar#322).
const HEAD_URL: &str = "https://minotar.net/helm";
/// Délai entre deux tentatives de connexion quand Discord est fermé ou absent.
const RETRY: Duration = Duration::from_secs(30);
/// Discord refuse un état de plus de 128 caractères.
const MAX_ADDRESS: usize = 100;

/// Compte actif, en petite image : sa tête et son pseudo au survol.
#[derive(Debug, Clone, PartialEq)]
pub struct Player {
    pub uuid: String,
    pub name: String,
}

/// Ce que voient les amis Discord.
#[derive(Debug, Clone, PartialEq)]
pub enum State {
    /// Launcher ouvert, pas de partie.
    Launcher,
    /// Minecraft tourne depuis `since` (secondes Unix).
    Playing { since: i64, place: Place },
}

/// Où en est la partie.
#[derive(Debug, Clone, PartialEq)]
pub enum Place {
    /// Lieu inconnu : partie que le journal Quick Play ne nomme pas (avant 1.20), ou jeu dont le
    /// titre ne dit pas quand il quitte le menu (avant 1.15).
    Unknown,
    /// Menu du jeu, sur aucun serveur ni monde.
    Menu,
    /// Sur Clover Games (`play.clovergames.fr` ou un de ses modes).
    Clover,
    /// Sur un autre serveur, par son adresse.
    Server(String),
    World,
    Realms,
}

impl State {
    pub fn playing_now(place: Place) -> Self {
        let since = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_secs() as i64);
        Self::Playing { since, place }
    }
}

#[derive(Default)]
pub struct Presence {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    client: Option<DiscordIpcClient>,
    enabled: bool,
    state: Option<State>,
    player: Option<Player>,
}

impl Presence {
    /// Active ou désactive le statut (réglage « Afficher mon activité sur Discord »).
    pub async fn set_enabled(&self, enabled: bool) {
        let mut inner = self.inner.lock().await;
        inner.enabled = enabled;
        if enabled {
            inner.publish();
        } else if let Some(mut client) = inner.client.take() {
            let _ = client.clear_activity();
            let _ = client.close();
        }
    }

    pub async fn set_state(&self, state: State) {
        let mut inner = self.inner.lock().await;
        inner.state = Some(state);
        if inner.enabled {
            inner.publish();
        }
    }

    /// Suit la partie en cours (`Place::follow`). Relu toutes les 2 s : ne republie que si le lieu
    /// change, et garde l'heure de début.
    pub async fn follow(&self, in_world: Option<bool>, joined: Option<&Joined>) {
        let mut inner = self.inner.lock().await;
        let Some(State::Playing { since, place: current }) = &inner.state else { return };
        let place = current.follow(in_world, joined);
        if *current == place {
            return;
        }
        inner.state = Some(State::Playing { since: *since, place });
        if inner.enabled {
            inner.publish();
        }
    }

    /// Reconnecte le statut si Discord est ouvert après le launcher ou redémarré, toutes les 30 s,
    /// pour toujours : à lancer une fois au démarrage.
    pub async fn keep_alive(&self) {
        let mut ticks = tokio::time::interval(RETRY);
        ticks.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticks.tick().await;
            let mut inner = self.inner.lock().await;
            if inner.enabled && inner.client.is_none() {
                inner.publish();
            }
        }
    }

    /// Changement de compte actif (`None` : plus aucun compte connecté).
    pub async fn set_player(&self, player: Option<Player>) {
        let mut inner = self.inner.lock().await;
        if inner.player == player {
            return;
        }
        inner.player = player;
        if inner.enabled {
            inner.publish();
        }
    }
}

impl Inner {
    fn publish(&mut self) {
        let Some(state) = self.state.clone() else { return };
        // Une connexion coupée (Discord redémarré) échoue à l'envoi : on repart de zéro une fois.
        for _ in 0..2 {
            if self.client.is_none() {
                let mut client = DiscordIpcClient::new(APPLICATION_ID);
                if client.connect().is_err() {
                    return;
                }
                self.client = Some(client);
            }
            let client = self.client.as_mut().expect("client connecté");
            if client.set_activity(activity(state.clone(), self.player.as_ref())).is_ok() {
                return;
            }
            self.client = None;
        }
    }
}

impl Place {
    /// Lieu d'une partie sur ce serveur.
    pub fn server(address: &str) -> Self {
        if is_clover_address(address) { Self::Clover } else { Self::Server(address.chars().take(MAX_ADDRESS).collect()) }
    }

    /// Lieu qui suit celui-ci, d'après la fenêtre du jeu (`in_world` : une partie y est ouverte,
    /// `None` si son titre ne le dit pas) et la dernière connexion de la partie (`joined`).
    pub fn follow(&self, in_world: Option<bool>, joined: Option<&Joined>) -> Self {
        match (in_world, joined) {
            // Menu du jeu : plus sur aucun serveur, même si le journal garde le dernier rejoint.
            (Some(false), _) => Self::Menu,
            (_, Some(Joined::Server(server))) => Self::server(&server.address),
            (_, Some(Joined::World)) => Self::World,
            (_, Some(Joined::Realms)) => Self::Realms,
            // Partie ouverte depuis le menu, sans connexion notée : avant 1.20, ou journal pas
            // encore écrit.
            (Some(true), None) if *self == Self::Menu => Self::Unknown,
            _ => self.clone(),
        }
    }
}

/// Adresse d'un serveur Clover Games : `play.clovergames.fr` ou un mode
/// (`bedwars.play.clovergames.fr`), avec ou sans port.
fn is_clover_address(address: &str) -> bool {
    let host = address.rsplit_once(':').map_or(address, |(host, _)| host).trim_end_matches('.').to_ascii_lowercase();
    host == "clovergames.fr" || host.ends_with(".clovergames.fr")
}

fn activity(state: State, player: Option<&Player>) -> Activity<'static> {
    let mut assets = Assets::new().large_image(LOGO_KEY).large_text("Clover Games");
    if let Some(player) = player {
        assets = assets.small_image(format!("{HEAD_URL}/{}/64.png", player.uuid.replace('-', ""))).small_text(player.name.clone());
    }
    let base = Activity::new()
        .assets(assets)
        .buttons(vec![Button::new("Rejoindre le Discord", DISCORD_URL), Button::new("Site", SITE_URL)]);
    let State::Playing { since, place } = state else {
        return base.details("Dans le launcher").state("Prépare sa partie");
    };
    let (details, place) = match place {
        Place::Clover => ("Joue à Clover Games", Some(format!("Sur {SERVER_HOST}"))),
        Place::Server(address) => ("Joue à Minecraft", Some(format!("Sur {address}"))),
        Place::World => ("Joue à Minecraft", Some("En solo".into())),
        Place::Realms => ("Joue à Minecraft", Some("Sur Realms".into())),
        Place::Menu => ("Joue à Minecraft", Some("Dans le menu".into())),
        Place::Unknown => ("Joue à Minecraft", None),
    };
    let activity = base.details(details).timestamps(Timestamps::new().start(since));
    match place {
        Some(place) => activity.state(place),
        None => activity,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playing_state_carries_start_time() {
        let State::Playing { since, .. } = State::playing_now(Place::Clover) else { panic!("attendu : Playing") };
        assert!(since > 1_700_000_000);
    }

    #[test]
    fn builds_every_activity() {
        let player = Player { uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5".into(), name: "Notch".into() };
        let _ = activity(State::Launcher, None);
        for place in [Place::Unknown, Place::Menu, Place::Clover, Place::Server("mc.hypixel.net".into()), Place::World, Place::Realms] {
            let _ = activity(State::Playing { since: 1_790_000_000, place }, Some(&player));
        }
    }

    #[test]
    fn recognises_clover_addresses() {
        assert_eq!(Place::server("play.clovergames.fr"), Place::Clover);
        assert_eq!(Place::server("Bedwars.Play.CloverGames.fr:25565"), Place::Clover);
        assert_eq!(Place::server("mc.hypixel.net"), Place::Server("mc.hypixel.net".into()));
        assert_eq!(Place::server("clovergames.fr.example.com"), Place::Server("clovergames.fr.example.com".into()));
        assert_eq!(Place::server("notclovergames.fr"), Place::Server("notclovergames.fr".into()));
        assert_eq!(Place::server(&"a".repeat(300)), Place::Server("a".repeat(MAX_ADDRESS)));
    }

    #[test]
    fn follows_the_current_connection() {
        let server = |address: &str| Joined::Server(crate::store::RecentServer { address: address.into(), name: String::new() });
        let clover = server("play.clovergames.fr");
        assert_eq!(Place::Menu.follow(Some(true), Some(&clover)), Place::Clover);
        // Revenu au menu après Clover Games.
        assert_eq!(Place::Clover.follow(Some(false), Some(&clover)), Place::Menu);
        assert_eq!(Place::Menu.follow(None, Some(&server("mc.hypixel.net"))), Place::Server("mc.hypixel.net".into()));
        assert_eq!(Place::Menu.follow(Some(true), Some(&Joined::World)), Place::World);
        // Partie ouverte que le journal ne nomme pas : plus au menu, lieu inconnu.
        assert_eq!(Place::Menu.follow(Some(true), None), Place::Unknown);
        // Lancé vers Clover Games, connexion pas encore notée : on garde la destination.
        assert_eq!(Place::Clover.follow(Some(true), None), Place::Clover);
        assert_eq!(Place::Unknown.follow(None, None), Place::Unknown);
    }

    #[tokio::test]
    async fn joined_server_updates_the_game_state_only() {
        let presence = Presence::default();
        presence.follow(Some(false), None).await;
        assert_eq!(presence.inner.lock().await.state, None);
        presence.set_state(State::Playing { since: 1_790_000_000, place: Place::Clover }).await;
        presence.follow(Some(false), None).await;
        assert_eq!(presence.inner.lock().await.state, Some(State::Playing { since: 1_790_000_000, place: Place::Menu }));
    }

    #[tokio::test]
    async fn disabled_presence_never_connects() {
        let presence = Presence::default();
        presence.set_state(State::Launcher).await;
        assert!(presence.inner.lock().await.client.is_none());
    }
}
