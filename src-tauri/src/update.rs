//! Mise à jour du launcher par l'updater Tauri : `latest.json` sur `cdn.clovergames.fr`, publié par
//! la CI avec les paquets. Le plugin refuse un paquet qui n'est pas signé par la clé de Clover (clé
//! publique dans `tauri.conf.json`, clé privée dans `Sécurités/` et dans les secrets de la CI).

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

/// Mise à jour trouvée par la dernière vérification, en attente d'installation.
#[derive(Default)]
pub struct PendingUpdate {
    update: Mutex<Option<Update>>,
    /// Le démarrage et l'interface peuvent lancer l'installation en même temps : une seule passe.
    installing: AtomicBool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    done: u64,
    total: Option<u64>,
}

pub async fn check(app: &AppHandle, pending: &PendingUpdate) -> Result<Option<UpdateInfo>, String> {
    if crate::msix::packaged() {
        return Ok(None);
    }
    let endpoints = crate::game::manifest::update_endpoints(crate::game::channel(app))
        .into_iter()
        .map(|url| url.parse().map_err(|e: url::ParseError| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    let update = app
        .updater_builder()
        .endpoints(endpoints)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| format!("Impossible de vérifier les mises à jour du launcher : {e}"))?;
    let info = update.as_ref().map(|update| UpdateInfo { version: update.version.clone() });
    *pending.update.lock().await = update;
    Ok(info)
}

/// Télécharge le paquet (avancement dans l'évènement `update-progress` et dans la fenêtre de
/// chargement), l'installe et relance le launcher. Sous Windows, l'installeur, silencieux, ferme le
/// launcher et le relance lui-même. Fenêtre principale affichée, celle de chargement la remplace le
/// temps de l'installation, et la lui rend en cas d'échec.
pub async fn install(app: &AppHandle, pending: &PendingUpdate) -> Result<(), String> {
    if crate::msix::packaged() {
        return Err("Les mises à jour passent par le Microsoft Store.".into());
    }
    // Gardée en attente : après un échec, « Installer » peut réessayer.
    let update = pending.update.lock().await.clone().ok_or("Aucune mise à jour à installer.")?;
    if pending.installing.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let main = app.get_webview_window("main").filter(|window| window.is_visible().unwrap_or(false));
    let downloading = format!("Téléchargement de la version {}…", update.version);
    if let Some(window) = &main {
        if crate::splash::open(app, &downloading).is_ok() {
            let _ = window.hide();
        }
    }
    let result = download_and_install(app, &update, &downloading).await;
    pending.installing.store(false, Ordering::SeqCst);
    if main.is_some() {
        crate::show_main_window(app);
        crate::splash::close(app);
    }
    result
}

async fn download_and_install(app: &AppHandle, update: &Update, downloading: &str) -> Result<(), String> {
    crate::splash::set(app, downloading, None);
    let mut done = 0;
    let bytes = update
        .download(
            |chunk, total| {
                done += chunk as u64;
                let _ = app.emit("update-progress", DownloadProgress { done, total });
                crate::splash::set(app, downloading, total.map(|total| done as f64 / total as f64));
            },
            || {},
        )
        .await
        .map_err(|e| format!("Téléchargement de la mise à jour impossible : {e}"))?;
    crate::splash::set(app, &format!("Installation de la version {}…", update.version), None);
    update.install(bytes).map_err(|e| format!("Installation de la mise à jour impossible : {e}"))?;
    app.restart()
}
