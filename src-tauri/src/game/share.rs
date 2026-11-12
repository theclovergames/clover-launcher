//! Journal du jeu publié sur mclo.gs (service d'Aternos), pour donner un lien au support plutôt
//! qu'un fichier : https://api.mclo.gs/#create-log

use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::{GameError, Result};

const API: &str = "https://api.mclo.gs/1/log";
/// Seule adresse acceptée en réponse : l'interface l'ouvre et la copie telle quelle.
const PAGE: &str = "https://mclo.gs/";
/// Limite du service, qui couperait lui-même au-delà : seule la fin du journal part.
const MAX_LINES: usize = 25_000;
const MAX_BYTES: usize = 10 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Serialize)]
struct Request<'a> {
    content: &'a str,
    /// Logiciel d'origine, affiché sur la page du journal.
    source: &'static str,
}

#[derive(Deserialize)]
struct Response {
    success: bool,
    url: Option<String>,
    error: Option<String>,
}

const MASK: &str = "[jeton masqué]";

/// Publie `log` et renvoie l'adresse de sa page. `token` (jeton Minecraft) est retiré s'il y
/// figure encore, comme tout autre jeton reconnaissable (voir `mask_tokens`).
pub async fn upload(http: &reqwest::Client, log: &str, token: Option<&str>) -> Result<String> {
    let log = match token {
        Some(token) if !token.is_empty() => log.replace(token, MASK),
        _ => log.to_owned(),
    };
    let log = mask_tokens(&log);
    let content = tail(&log);
    if content.trim().is_empty() {
        return Err(GameError::InvalidVersion("journal vide".into()));
    }
    let request = Request { content, source: "Clover Launcher" };
    let response: Response = http.post(API).json(&request).timeout(TIMEOUT).send().await?.json().await?;
    match response.url {
        Some(url) if response.success && url.starts_with(PAGE) && url.len() < 100 => Ok(url),
        _ => Err(GameError::InvalidVersion(format!("mclo.gs a refusé le journal ({})", response.error.unwrap_or_else(|| "réponse inattendue".into())))),
    }
}

/// Masque les jetons d'une session passée ou d'un autre compte : tout JWT (`eyJ….….…`) et la
/// valeur qui suit `--accessToken`.
fn mask_tokens(log: &str) -> String {
    let jwt_char = |c: u8| c.is_ascii_alphanumeric() || c == b'-' || c == b'_';
    let bytes = log.as_bytes();
    let mut out = String::with_capacity(log.len());
    let (mut copied, mut i) = (0, 0);
    while i < bytes.len() {
        // Valeur après `--accessToken`, séparée par des espaces, virgules, `=` ou guillemets.
        if bytes[i..].starts_with(b"--accessToken") {
            let mut start = i + "--accessToken".len();
            while start < bytes.len() && matches!(bytes[start], b' ' | b'\t' | b',' | b'=' | b':' | b'"' | b'\'') {
                start += 1;
            }
            let end = start + bytes[start..].iter().position(|c| c.is_ascii_whitespace() || matches!(c, b',' | b'"' | b'\'' | b']')).unwrap_or(bytes.len() - start);
            if end > start && !log[start..].starts_with(MASK) {
                out.push_str(&log[copied..start]);
                out.push_str(MASK);
                (copied, i) = (end, end);
                continue;
            }
        }
        // JWT : trois segments base64url séparés par des points, le dernier pouvant être vide.
        if bytes[i..].starts_with(b"eyJ") && (i == 0 || !jwt_char(bytes[i - 1])) {
            let segment = |from: usize| from + bytes[from..].iter().take_while(|&&c| jwt_char(c)).count();
            let first = segment(i);
            if bytes.get(first) == Some(&b'.') {
                let second = segment(first + 1);
                if second > first + 1 && bytes.get(second) == Some(&b'.') {
                    let end = segment(second + 1);
                    out.push_str(&log[copied..i]);
                    out.push_str(MASK);
                    (copied, i) = (end, end);
                    continue;
                }
            }
        }
        i += 1;
    }
    out.push_str(&log[copied..]);
    out
}

/// Dernières lignes du journal, dans les limites du service.
fn tail(log: &str) -> &str {
    let mut start = log.len().saturating_sub(MAX_BYTES);
    while !log.is_char_boundary(start) {
        start += 1;
    }
    let log = &log[start..];
    // Le saut de ligne final ne commence pas de nouvelle ligne.
    match log.strip_suffix('\n').unwrap_or(log).rmatch_indices('\n').nth(MAX_LINES - 1) {
        Some((index, _)) => &log[index + 1..],
        None => log,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_jwts_and_access_tokens() {
        let log = "a eyJhbGciOi.eyJzdWIiOjF9.c2ln-_x b\n--accessToken abc123 --version 26.3\n[--accessToken, \"xyz\"] eyJpas.unjwt é";
        assert_eq!(mask_tokens(log), "a [jeton masqué] b\n--accessToken [jeton masqué] --version 26.3\n[--accessToken, \"[jeton masqué]\"] eyJpas.unjwt é");
        assert_eq!(mask_tokens("x eyJa.eyJb. y"), "x [jeton masqué] y");
        assert_eq!(mask_tokens("--accessToken"), "--accessToken");
        assert_eq!(mask_tokens("--accessToken [jeton masqué] x"), "--accessToken [jeton masqué] x");
    }

    #[test]
    fn keeps_the_end_of_long_logs() {
        let lines: String = (0..30_000).map(|n| format!("ligne {n}\n")).collect();
        let kept = tail(&lines);
        assert_eq!(kept.lines().count(), MAX_LINES);
        assert!(kept.starts_with("ligne 5000\n"));
        assert!(kept.ends_with("ligne 29999\n"));
        assert_eq!(tail("court"), "court");
        let wide = "é".repeat(MAX_BYTES);
        assert!(tail(&wide).len() <= MAX_BYTES);
    }
}
