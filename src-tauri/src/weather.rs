//! Météo chez le joueur pour le ciel de l'accueil, par le relais Clover (`relay/`, `GET /weather`) :
//! Cloudflare y déduit une zone d'une dizaine de kilomètres de l'adresse IP, MET Norway donne le
//! temps qu'il y fait. Le launcher n'envoie rien de plus qu'une requête au relais et ne reçoit
//! aucune position, seulement le ciel à dessiner.

use serde::{Deserialize, Serialize};

const URL: &str = "https://curseforge.clovergames.fr/weather";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Sky {
    /// Sans un nuage.
    Clear,
    /// Quelques nuages.
    Fair,
    Cloudy,
    Overcast,
    Fog,
    Rain,
    Storm,
    Snow,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Weather {
    pub sky: Sky,
    /// Averse ou chute de neige forte.
    #[serde(default)]
    pub heavy: bool,
    /// Degrés Celsius, arrondis.
    #[serde(default)]
    pub temperature: Option<f64>,
}

/// `None` : relais injoignable, zone inconnue ou ciel que ce launcher ne connaît pas ; l'accueil
/// garde alors son ciel sans météo.
#[tauri::command]
pub async fn weather() -> Option<Weather> {
    let response = crate::game::download::client().get(URL).send().await.ok()?.error_for_status().ok()?;
    serde_json::from_str(&response.text().await.ok()?).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_relay_answer() {
        let weather: Weather = serde_json::from_str(r#"{"schema":1,"sky":"storm","heavy":true,"temperature":-3}"#).unwrap();
        assert_eq!((weather.sky, weather.heavy, weather.temperature), (Sky::Storm, true, Some(-3.0)));
        assert!(serde_json::from_str::<Weather>(r#"{"schema":1,"sky":"hail"}"#).is_err());
    }
}
