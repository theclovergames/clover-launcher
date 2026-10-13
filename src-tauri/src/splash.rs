//! Fenêtre de chargement (`src/components/Splash.tsx`). Au démarrage, elle cherche une mise à jour,
//! l'installe si le réglage le demande et qu'aucune partie ne tourne, puis laisse la place à la
//! fenêtre principale une fois l'interface prête (`app_ready`). Elle revient pendant une mise à
//! jour lancée depuis la fenêtre principale (`update::install`).

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::utils::config::Color;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::Notify;

const LABEL: &str = "splash";
/// CDN lent ou injoignable : le launcher démarre quand même, la vérification des 6 heures suivra.
const CHECK_TIMEOUT: Duration = Duration::from_secs(8);
/// Interface sans signal : la fenêtre principale s'affiche quand même.
const READY_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Status {
    pub message: String,
    /// Entre 0 et 1 ; absent tant que l'avancement est inconnu.
    pub ratio: Option<f64>,
}

#[derive(Default)]
pub struct Splash {
    status: Mutex<Option<Status>>,
    /// Signal de l'interface ; gardé s'il arrive avant qu'on l'attende.
    ready: Notify,
}

impl Splash {
    pub fn status(&self) -> Status {
        self.status.lock().expect("chargement").clone().unwrap_or_else(|| Status { message: "Chargement…".into(), ratio: None })
    }

    pub fn ready(&self) {
        self.ready.notify_one();
    }
}

pub fn open(app: &AppHandle, message: &str) -> tauri::Result<()> {
    set(app, message, None);
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }
    // Même cadre que la fenêtre principale : sans bordure système, coins et ombre de Windows 11.
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Clover Launcher")
        .inner_size(420.0, 210.0)
        .decorations(false)
        .shadow(true)
        .resizable(false)
        .maximizable(false)
        .background_color(Color(0x14, 0x12, 0x0f, 0xff))
        .center()
        .build()?;
    Ok(())
}

/// Ne renvoie l'état que s'il change : le téléchargement appelle à chaque morceau reçu.
pub fn set(app: &AppHandle, message: &str, ratio: Option<f64>) {
    let status = Status { message: message.into(), ratio: ratio.map(|ratio| (ratio * 100.0).floor() / 100.0) };
    let splash = app.state::<Splash>();
    let mut current = splash.status.lock().expect("chargement");
    if current.as_ref() == Some(&status) {
        return;
    }
    *current = Some(status.clone());
    drop(current);
    let _ = app.emit_to(LABEL, "splash-status", status);
}

pub fn close(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.destroy();
    }
}

/// Démarrage fenêtre ouverte : mise à jour éventuelle, puis fenêtre principale.
pub async fn startup(app: AppHandle) {
    let auto = app.state::<crate::AppState>().snapshot().settings.auto_update;
    let pending = app.state::<crate::update::PendingUpdate>();
    match tokio::time::timeout(CHECK_TIMEOUT, crate::update::check(&app, &pending)).await {
        // Sans réglage ou pendant une partie, l'interface la proposera.
        Ok(Ok(Some(_))) if auto && !app.state::<crate::game::games::Games>().any_running() => {
            if let Err(error) = crate::update::install(&app, &pending).await {
                eprintln!("[update] {error}");
            }
        }
        Ok(Err(error)) => eprintln!("[update] {error}"),
        _ => {}
    }
    set(&app, "Chargement…", None);
    let _ = tokio::time::timeout(READY_TIMEOUT, app.state::<Splash>().ready.notified()).await;
    crate::show_main_window(&app);
    close(&app);
}
