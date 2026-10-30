//! Pastille des non-lus, comme Discord : chiffre en surimpression sur l'icône de la barre des
//! tâches (Windows), point rouge sur l'icône de la zone de notification.

use tauri::image::Image;
use tauri::{AppHandle, Manager};

const RED: [u8; 3] = [0xe5, 0x48, 0x4d];
const WHITE: [u8; 3] = [0xff, 0xff, 0xff];

/// Chiffres 3×5 pixels, une ligne par octet, colonne de gauche sur le bit 2.
const DIGITS: [[u8; 5]; 10] = [
    [0b111, 0b101, 0b101, 0b101, 0b111],
    [0b010, 0b110, 0b010, 0b010, 0b111],
    [0b111, 0b001, 0b111, 0b100, 0b111],
    [0b111, 0b001, 0b111, 0b001, 0b111],
    [0b101, 0b101, 0b111, 0b001, 0b001],
    [0b111, 0b100, 0b111, 0b001, 0b111],
    [0b111, 0b100, 0b111, 0b101, 0b111],
    [0b111, 0b001, 0b001, 0b001, 0b001],
    [0b111, 0b101, 0b111, 0b101, 0b111],
    [0b111, 0b101, 0b111, 0b001, 0b111],
];
const PLUS: [u8; 5] = [0b000, 0b010, 0b111, 0b010, 0b000];

/// Taille de la surimpression : Windows la réduit à 16 px, 32 garde le chiffre net en haute densité.
const OVERLAY: u32 = 32;

/// Pose `color` d'opacité `alpha` par-dessus le pixel (alpha non prémultiplié).
fn blend(pixel: &mut [u8], color: [u8; 3], alpha: f32) {
    let below = pixel[3] as f32 / 255.0;
    let out = alpha + below * (1.0 - alpha);
    if out <= 0.0 {
        return;
    }
    for channel in 0..3 {
        let mixed = (color[channel] as f32 * alpha + pixel[channel] as f32 * below * (1.0 - alpha)) / out;
        pixel[channel] = mixed.round() as u8;
    }
    pixel[3] = (out * 255.0).round() as u8;
}

/// Disque lissé : la couverture de chaque pixel est estimée sur 4×4 points.
fn disc(rgba: &mut [u8], width: u32, (cx, cy): (f32, f32), radius: f32, color: [u8; 3]) {
    let height = rgba.len() as u32 / 4 / width;
    for y in 0..height {
        for x in 0..width {
            let mut inside = 0;
            for i in 0..4 {
                for j in 0..4 {
                    let dx = x as f32 + (i as f32 + 0.5) / 4.0 - cx;
                    let dy = y as f32 + (j as f32 + 0.5) / 4.0 - cy;
                    inside += (dx * dx + dy * dy <= radius * radius) as u32;
                }
            }
            if inside > 0 {
                let at = ((y * width + x) * 4) as usize;
                blend(&mut rgba[at..at + 4], color, inside as f32 / 16.0);
            }
        }
    }
}

/// Disque rouge et compte en blanc, « 9+ » au-delà de neuf.
fn overlay(count: u32) -> Image<'static> {
    let mut rgba = vec![0; (OVERLAY * OVERLAY * 4) as usize];
    let half = OVERLAY as f32 / 2.0;
    disc(&mut rgba, OVERLAY, (half, half), half, RED);

    let glyphs = if count > 9 { vec![DIGITS[9], PLUS] } else { vec![DIGITS[count as usize]] };
    let scale = if glyphs.len() == 1 { 4 } else { 3 };
    let text = glyphs.len() as u32 * 4 * scale - scale;
    let (left, top) = ((OVERLAY - text) / 2, (OVERLAY - 5 * scale) / 2);
    for (index, glyph) in glyphs.iter().enumerate() {
        for (row, bits) in glyph.iter().enumerate() {
            for column in 0..3 {
                if bits >> (2 - column) & 1 == 0 {
                    continue;
                }
                let x0 = left + (index as u32 * 4 + column) * scale;
                let y0 = top + row as u32 * scale;
                for y in y0..y0 + scale {
                    for x in x0..x0 + scale {
                        let at = ((y * OVERLAY + x) * 4) as usize;
                        rgba[at..at + 4].copy_from_slice(&[WHITE[0], WHITE[1], WHITE[2], 255]);
                    }
                }
            }
        }
    }
    Image::new_owned(rgba, OVERLAY, OVERLAY)
}

/// Icône de la zone de notification avec un point rouge en bas à droite : trop petite pour un chiffre.
fn tray_icon(base: &Image<'_>) -> Image<'static> {
    let (width, height) = (base.width(), base.height());
    let mut rgba = base.rgba().to_vec();
    let radius = width.min(height) as f32 * 0.24;
    disc(&mut rgba, width, (width as f32 - radius, height as f32 - radius), radius, RED);
    Image::new_owned(rgba, width, height)
}

/// Messages, demandes d'ami et notifications non lus ; zéro retire la pastille.
#[tauri::command]
pub fn set_unread_badge(app: AppHandle, count: u32) -> Result<(), String> {
    if let (Some(tray), Some(base)) = (app.tray_by_id("main"), app.default_window_icon()) {
        let icon = if count > 0 { tray_icon(base) } else { base.clone() };
        tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
        let tooltip = match count {
            0 => "Clover Launcher".to_owned(),
            1 => "Clover Launcher — 1 non lu".to_owned(),
            n => format!("Clover Launcher — {n} non lus"),
        };
        tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;
    }
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(windows)]
        window.set_overlay_icon((count > 0).then(|| overlay(count))).map_err(|e| e.to_string())?;
        #[cfg(not(windows))]
        window.set_badge_count((count > 0).then_some(count as i64)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pixel(image: &Image<'_>, x: u32, y: u32) -> [u8; 4] {
        let at = ((y * image.width() + x) * 4) as usize;
        image.rgba()[at..at + 4].try_into().unwrap()
    }

    #[test]
    fn overlay_draws_white_count_on_red_disc() {
        let one = overlay(1);
        assert_eq!(pixel(&one, 0, 0)[3], 0, "coin hors du disque");
        assert_eq!(pixel(&one, 16, 3), [RED[0], RED[1], RED[2], 255]);
        // Barre verticale du « 1 » (colonne du milieu, scale 4).
        assert_eq!(pixel(&one, 15, 16), [255, 255, 255, 255]);
        let many = overlay(42);
        assert_eq!(pixel(&many, 21, 16), [255, 255, 255, 255], "barre du « + »");
    }

    #[test]
    fn tray_icon_keeps_size_and_marks_corner() {
        let base = Image::new_owned(vec![0, 128, 0, 255].repeat(32 * 32), 32, 32);
        let marked = tray_icon(&base);
        assert_eq!((marked.width(), marked.height()), (32, 32));
        assert_eq!(pixel(&marked, 0, 0), [0, 128, 0, 255]);
        assert_eq!(pixel(&marked, 25, 25), [RED[0], RED[1], RED[2], 255]);
    }
}
