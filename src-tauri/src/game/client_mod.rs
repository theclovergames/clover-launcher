//! Mod Clover (`mod/`) des instances Fabric et Quilt du joueur, comme dans Clover Games : le trèfle
//! des joueurs du launcher, dans la tablist et au-dessus des têtes. Un JAR par époque de Minecraft,
//! de la 1.14.4 à la dernière, embarqué dans le launcher (`client-mods/`, voir `build.rs`).

use std::path::{Path, PathBuf};

include!(concat!(env!("OUT_DIR"), "/client_mods.rs"));

/// JAR du mod fait pour `minecraft`, écrit dans `dir` s'il n'y est pas déjà à l'identique. `None`
/// pour une version qu'aucun ne couvre, ou une préversion : son API peut déjà avoir changé.
pub fn install(dir: &Path, minecraft: &str) -> Option<PathBuf> {
    let (name, bytes) = for_minecraft(minecraft)?;
    let path = dir.join(name);
    if std::fs::read(&path).ok().as_deref() != Some(bytes) {
        std::fs::create_dir_all(dir).ok()?;
        std::fs::write(&path, bytes).ok()?;
    }
    Some(path)
}

fn for_minecraft(minecraft: &str) -> Option<(&'static str, &'static [u8])> {
    if !minecraft.split('.').all(|part| part.parse::<u32>().is_ok()) {
        return None;
    }
    JARS.iter().copied().find(|(_, bytes)| super::personal::fabric_accepts(bytes, minecraft))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_release_gets_one_jar_and_previews_none() {
        assert!(JARS.len() >= 21, "JAR du mod Clover manquants dans client-mods/");
        for version in ["1.14.4", "1.15.2", "1.16", "1.16.5", "1.17.1", "1.18.2", "1.19", "1.19.4", "1.20.1", "1.20.4", "1.20.6", "1.21", "1.21.3", "1.21.5", "1.21.7", "1.21.10", "1.21.11", "26.1", "26.2.1", "26.3"] {
            let matching: Vec<_> = JARS.iter().filter(|(_, bytes)| crate::game::personal::fabric_accepts(bytes, version)).map(|(name, _)| *name).collect();
            assert_eq!(matching.len(), 1, "{version} : {matching:?}");
        }
        for version in ["1.13.2", "1.21.5-pre1", "25w14a", "26.4-snapshot-1"] {
            assert!(for_minecraft(version).is_none(), "{version}");
        }
        assert_eq!(for_minecraft("1.21.3").map(|(name, _)| name), Some("cloverclient-1.21.4.jar"));
    }
}
