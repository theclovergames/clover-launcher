//! Fiche d'un monde solo, lue dans son `level.dat` (NBT compressé en gzip) : nom affiché, mode de
//! jeu, difficulté, version, dernière partie, seed. Les champs ont changé de place au fil des
//! versions : toutes les formes sont lues. Pose aussi un monde téléchargé (archive `.zip`).

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;

use serde::Serialize;

/// Un `level.dat` pèse quelques Ko ; au-delà, le fichier n'est pas lu.
const MAX_LEVEL: u64 = 16 * 1024 * 1024;
const MAX_DEPTH: usize = 64;

/// Mêmes noms que le type `WorldInfo` du front.
#[derive(Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldInfo {
    /// Nom donné en jeu, qui peut différer de celui du dossier.
    pub name: Option<String>,
    /// `survival`, `creative`, `adventure` ou `spectator`.
    pub mode: Option<&'static str>,
    pub hardcore: bool,
    /// `peaceful`, `easy`, `normal` ou `hard`.
    pub difficulty: Option<String>,
    pub commands: bool,
    /// Version du jeu de la dernière partie (« 26.2 »).
    pub version: Option<String>,
    /// Dernière partie, en secondes depuis l'époque Unix.
    pub last_played: Option<u64>,
    /// Datapacks posés dans le monde (actifs ou non).
    pub datapacks: usize,
    /// Graine de génération, en texte : un nombre sur 64 bits perd des chiffres en JavaScript.
    pub seed: Option<String>,
}

#[derive(Debug)]
enum Tag {
    Number(i64),
    Text(String),
    Compound(HashMap<String, Tag>),
    /// Listes, tableaux et nombres à virgule : parcourus, jamais lus ici.
    Other,
}

impl Tag {
    fn get(&self, key: &str) -> Option<&Tag> {
        match self {
            Tag::Compound(map) => map.get(key),
            _ => None,
        }
    }
    fn number(&self) -> Option<i64> {
        match self {
            Tag::Number(value) => Some(*value),
            _ => None,
        }
    }
    fn text(&self) -> Option<&str> {
        match self {
            Tag::Text(value) => Some(value),
            _ => None,
        }
    }
}

struct Reader<'a>(&'a [u8]);

impl Reader<'_> {
    fn take(&mut self, count: usize) -> Option<&[u8]> {
        if count > self.0.len() {
            return None;
        }
        let (head, tail) = self.0.split_at(count);
        self.0 = tail;
        Some(head)
    }
    fn int(&mut self, size: usize) -> Option<i64> {
        let bytes = self.take(size)?;
        let value = bytes.iter().fold(0u64, |value, byte| value << 8 | u64::from(*byte));
        // Extension du signe sur 64 bits.
        let shift = 64 - 8 * size as u32;
        Some(((value << shift) as i64) >> shift)
    }
    fn length(&mut self, unit: usize) -> Option<usize> {
        let length = usize::try_from(self.int(4)?).ok()?;
        // Une longueur qui dépasse le reste du fichier est fausse : refusée avant d'allouer.
        (length.checked_mul(unit.max(1))? <= self.0.len()).then_some(length)
    }
    fn string(&mut self) -> Option<String> {
        let length = usize::try_from(self.int(2)?).ok()?;
        Some(String::from_utf8_lossy(self.take(length)?).into_owned())
    }
    fn tag(&mut self, kind: u8, depth: usize) -> Option<Tag> {
        if depth > MAX_DEPTH {
            return None;
        }
        Some(match kind {
            1 => Tag::Number(self.int(1)?),
            2 => Tag::Number(self.int(2)?),
            3 => Tag::Number(self.int(4)?),
            4 => Tag::Number(self.int(8)?),
            5 => self.take(4).map(|_| Tag::Other)?,
            6 => self.take(8).map(|_| Tag::Other)?,
            7 => {
                let length = self.length(1)?;
                self.take(length).map(|_| Tag::Other)?
            }
            8 => Tag::Text(self.string()?),
            9 => {
                let item = self.take(1)?[0];
                let length = self.length(1)?;
                for _ in 0..length {
                    self.tag(item, depth + 1)?;
                }
                Tag::Other
            }
            10 => {
                let mut map = HashMap::new();
                loop {
                    let item = self.take(1)?[0];
                    if item == 0 {
                        break Tag::Compound(map);
                    }
                    let name = self.string()?;
                    map.insert(name, self.tag(item, depth + 1)?);
                }
            }
            11 => {
                let length = self.length(4)?;
                self.take(length * 4).map(|_| Tag::Other)?
            }
            12 => {
                let length = self.length(8)?;
                self.take(length * 8).map(|_| Tag::Other)?
            }
            _ => return None,
        })
    }
}

fn parse(bytes: &[u8]) -> Option<Tag> {
    let mut reader = Reader(bytes);
    let kind = reader.take(1)?[0];
    reader.string()?;
    reader.tag(kind, 0)
}

fn info(root: &Tag) -> Option<WorldInfo> {
    let data = root.get("Data")?;
    let byte = |key: &str| data.get(key).and_then(Tag::number);
    // 26.1 et après : `difficulty_settings` ; avant : `Difficulty` et `hardcore` à la racine.
    let settings = data.get("difficulty_settings");
    let difficulty = settings.and_then(|s| s.get("difficulty")).and_then(Tag::text).map(str::to_owned).or_else(|| {
        byte("Difficulty").and_then(|level| ["peaceful", "easy", "normal", "hard"].get(usize::try_from(level).ok()?).map(|name| (*name).to_owned()))
    });
    let hardcore = settings.and_then(|s| s.get("hardcore")).and_then(Tag::number).or_else(|| byte("hardcore")).is_some_and(|value| value != 0);
    Some(WorldInfo {
        name: data.get("LevelName").and_then(Tag::text).map(str::to_owned).filter(|name| !name.trim().is_empty()),
        mode: byte("GameType").and_then(|mode| ["survival", "creative", "adventure", "spectator"].get(usize::try_from(mode).ok()?).copied()),
        hardcore,
        difficulty,
        commands: byte("allowCommands").is_some_and(|value| value != 0),
        version: data.get("Version").and_then(|v| v.get("Name")).and_then(Tag::text).map(str::to_owned),
        last_played: byte("LastPlayed").and_then(|ms| u64::try_from(ms / 1000).ok()).filter(|&secs| secs > 0),
        datapacks: 0,
        // 1.16 à 1.21 : `WorldGenSettings.seed` ; avant : `RandomSeed`. Après : un fichier à part.
        seed: data.get("WorldGenSettings").and_then(|settings| settings.get("seed")).or_else(|| data.get("RandomSeed")).and_then(Tag::number).map(|seed| seed.to_string()),
    })
}

/// NBT d'un fichier, compressé en gzip ou non.
fn read_nbt(path: &Path) -> Option<Tag> {
    let file = std::fs::File::open(path).ok()?;
    if file.metadata().ok()?.len() > MAX_LEVEL {
        return None;
    }
    let mut raw = Vec::new();
    file.take(MAX_LEVEL).read_to_end(&mut raw).ok()?;
    if raw.starts_with(&[0x1f, 0x8b]) {
        let mut bytes = Vec::new();
        flate2::read::GzDecoder::new(raw.as_slice()).take(MAX_LEVEL).read_to_end(&mut bytes).ok()?;
        parse(&bytes)
    } else {
        parse(&raw)
    }
}

/// 26.1 et après : la graine est dans `data/minecraft/world_gen_settings.dat`, sous `data.seed`.
fn separate_seed(dir: &Path) -> Option<String> {
    let root = read_nbt(&dir.join("data").join("minecraft").join("world_gen_settings.dat"))?;
    root.get("data")?.get("seed")?.number().map(|seed| seed.to_string())
}

/// Où écrire le nom du monde dans `level.dat` décompressé : la chaîne `Data.LevelName` existante
/// (balise comprise), ou le début de `Data` s'il n'en a pas.
fn level_name_span(bytes: &[u8]) -> Option<std::ops::Range<usize>> {
    let mut reader = Reader(bytes);
    let position = |reader: &Reader| bytes.len() - reader.0.len();
    if reader.take(1)? != [10] {
        return None;
    }
    reader.string()?;
    loop {
        let kind = reader.take(1)?[0];
        if kind == 0 {
            return None;
        }
        let name = reader.string()?;
        if kind != 10 || name != "Data" {
            reader.tag(kind, 1)?;
            continue;
        }
        let data = position(&reader);
        loop {
            let start = position(&reader);
            let kind = reader.take(1)?[0];
            if kind == 0 {
                return Some(data..data);
            }
            let name = reader.string()?;
            reader.tag(kind, 2)?;
            if kind == 8 && name == "LevelName" {
                return Some(start..position(&reader));
            }
        }
    }
}

/// Renomme le monde (`Data.LevelName`, le nom affiché en jeu) ; le dossier garde son nom. Seule
/// cette chaîne change, le reste de `level.dat` est recopié tel quel, et le résultat est relu avant
/// de remplacer l'ancien fichier.
pub fn rename(dir: &Path, name: &str) -> Result<(), String> {
    use std::io::Write;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 64 || name.chars().any(|c| c.is_control() || u32::from(c) > 0xFFFF) {
        return Err("Le nom doit faire entre 1 et 64 caractères, sans emoji.".into());
    }
    let path = dir.join("level.dat");
    let file = std::fs::File::open(&path).map_err(|e| format!("level.dat illisible : {e}"))?;
    let mut bytes = Vec::new();
    flate2::read::GzDecoder::new(file).take(MAX_LEVEL).read_to_end(&mut bytes).map_err(|e| format!("level.dat illisible : {e}"))?;
    let span = level_name_span(&bytes).ok_or("level.dat illisible : monde non renommé.")?;
    let mut tag = vec![8, 0, 9];
    tag.extend_from_slice(b"LevelName");
    tag.extend_from_slice(&u16::try_from(name.len()).map_err(|_| "Nom trop long.")?.to_be_bytes());
    tag.extend_from_slice(name.as_bytes());
    bytes.splice(span, tag);
    let renamed = parse(&bytes).and_then(|root| info(&root)).and_then(|world| world.name);
    if renamed.as_deref() != Some(name) {
        return Err("level.dat illisible : monde non renommé.".into());
    }
    let temporary = dir.join("level.dat.clover-tmp");
    let mut encoder = flate2::write::GzEncoder::new(std::fs::File::create(&temporary).map_err(|e| e.to_string())?, flate2::Compression::default());
    encoder.write_all(&bytes).and_then(|()| encoder.finish().map(drop)).map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, &path).map_err(|e| format!("Monde non renommé : {e}"))
}

/// Fiche du monde du dossier `dir` ; `None` si son `level.dat` est illisible.
pub fn read(dir: &Path) -> Option<WorldInfo> {
    let mut world = info(&read_nbt(&dir.join("level.dat"))?)?;
    if world.seed.is_none() {
        world.seed = separate_seed(dir);
    }
    world.datapacks = std::fs::read_dir(dir.join("datapacks"))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| {
            let path = entry.path();
            !entry.file_name().to_string_lossy().starts_with('.')
                && (path.join("pack.mcmeta").is_file() || path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("zip")))
        })
        .count();
    Some(world)
}

/// Plafond d'un monde téléchargé, décompressé.
const MAX_ARCHIVE: u64 = 8 * 1024 * 1024 * 1024;

/// Entrée d'une archive : chemin sûr, taille annoncée, dossier ou non.
type ArchivePath = (std::path::PathBuf, u64, bool);

/// Pose dans `saves` le monde de `archive` : le dossier de son `level.dat` le moins profond, à la
/// racine ou dans un sous-dossier ; le reste de l'archive est laissé. Le dossier prend le nom du
/// monde (`LevelName`, sinon `name`), rendu sûr et unique ; renvoie ce nom. Rien ne reste en cas
/// d'échec : l'extraction se fait dans un dossier caché, renommé à la fin.
pub fn install_archive(archive: &Path, saves: &Path, name: &str) -> Result<String, String> {
    let file = std::fs::File::open(archive).map_err(|e| format!("Archive illisible : {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("Archive illisible : {e}"))?;
    let mut paths: Vec<ArchivePath> = Vec::with_capacity(zip.len());
    for index in 0..zip.len() {
        let entry = zip.by_index_raw(index).map_err(|e| format!("Archive illisible : {e}"))?;
        let path = entry.enclosed_name().ok_or("Archive refusée : un de ses chemins sort du dossier du monde.")?;
        paths.push((path, entry.size(), entry.is_dir()));
    }
    let root = paths
        .iter()
        .filter(|(path, _, dir)| !dir && path.file_name().is_some_and(|name| name == "level.dat"))
        .map(|(path, _, _)| path.parent().map(Path::to_path_buf).unwrap_or_default())
        .min_by_key(|parent| parent.components().count())
        .ok_or("Ce fichier ne contient pas de monde.")?;
    let declared: u64 = paths.iter().filter(|(path, _, _)| path.starts_with(&root)).map(|(_, size, _)| size).sum();
    if declared > MAX_ARCHIVE {
        return Err("Ce monde est trop lourd (plus de 8 Go).".into());
    }

    std::fs::create_dir_all(saves).map_err(|e| e.to_string())?;
    let partial = saves.join(format!(".clover-{:016x}.part", rand::random::<u64>()));
    let installed = extract(&mut zip, &paths, &root, &partial).and_then(|()| {
        let level = read(&partial).and_then(|world| world.name);
        let base = folder_name(level.as_deref().unwrap_or(name));
        let mut folder = base.clone();
        for count in 2.. {
            if !saves.join(&folder).exists() {
                break;
            }
            folder = format!("{base} ({count})");
        }
        std::fs::rename(&partial, saves.join(&folder)).map_err(|e| format!("Monde non installé : {e}"))?;
        Ok(folder)
    });
    if installed.is_err() {
        let _ = std::fs::remove_dir_all(&partial);
    }
    installed
}

fn extract(zip: &mut zip::ZipArchive<std::fs::File>, paths: &[ArchivePath], root: &Path, target: &Path) -> Result<(), String> {
    let mut written = 0u64;
    for (index, (path, _, dir)) in paths.iter().enumerate() {
        let Ok(relative) = path.strip_prefix(root) else { continue };
        // Verrou d'une partie ouverte au moment de l'export : Minecraft le recrée.
        if relative.as_os_str().is_empty() || relative == Path::new("session.lock") {
            continue;
        }
        let destination = target.join(relative);
        if *dir {
            std::fs::create_dir_all(&destination).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut entry = zip.by_index(index).map_err(|e| format!("Archive illisible : {e}"))?;
        let mut out = std::fs::File::create(&destination).map_err(|e| e.to_string())?;
        // La taille annoncée peut mentir : la limite porte sur ce qui sort vraiment.
        written += std::io::copy(&mut (&mut entry).take(MAX_ARCHIVE - written + 1), &mut out).map_err(|e| format!("Archive illisible : {e}"))?;
        if written > MAX_ARCHIVE {
            return Err("Ce monde est trop lourd (plus de 8 Go).".into());
        }
    }
    if !target.join("level.dat").is_file() {
        return Err("Ce fichier ne contient pas de monde.".into());
    }
    Ok(())
}

/// Nom de dossier sûr sous Windows, macOS et Linux, tiré du nom du monde.
fn folder_name(name: &str) -> String {
    let clean: String = name.chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
    let clean: String = clean.trim().trim_matches('.').trim().chars().take(60).collect();
    let clean = clean.trim_end().to_owned();
    let stem = clean.split('.').next().unwrap_or_default().to_ascii_uppercase();
    let numbered = stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.ends_with(|c: char| c.is_ascii_digit());
    match clean.as_str() {
        "" => "Monde".into(),
        _ if numbered || ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str()) => format!("{clean} (monde)"),
        _ => clean,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// NBT minimal : compound racine « » contenant `Data`.
    fn level(fields: &[u8]) -> Vec<u8> {
        let mut bytes = vec![10, 0, 0, 10, 0, 4];
        bytes.extend(b"Data");
        bytes.extend(fields);
        bytes.extend([0, 0]);
        bytes
    }

    fn named(kind: u8, name: &str, payload: &[u8]) -> Vec<u8> {
        let mut bytes = vec![kind, 0, name.len() as u8];
        bytes.extend(name.as_bytes());
        bytes.extend(payload);
        bytes
    }

    fn text(value: &str) -> Vec<u8> {
        let mut bytes = vec![0, value.len() as u8];
        bytes.extend(value.as_bytes());
        bytes
    }

    #[test]
    fn reads_new_and_old_layouts() {
        let mut fields = named(8, "LevelName", &text("Base"));
        fields.extend(named(3, "GameType", &[0, 0, 0, 1]));
        fields.extend(named(1, "allowCommands", &[1]));
        fields.extend(named(4, "LastPlayed", &1_791_138_897_572i64.to_be_bytes()));
        let mut settings = named(8, "difficulty", &text("hard"));
        settings.extend(named(1, "hardcore", &[1]));
        settings.push(0);
        fields.extend(named(10, "difficulty_settings", &settings));
        let mut version = named(8, "Name", &text("26.2"));
        version.push(0);
        fields.extend(named(10, "Version", &version));
        fields.extend(named(11, "singleplayer_uuid", &[0, 0, 0, 1, 0, 0, 0, 7]));
        let world = info(&parse(&level(&fields)).unwrap()).unwrap();
        assert_eq!(
            world,
            WorldInfo { name: Some("Base".into()), mode: Some("creative"), hardcore: true, difficulty: Some("hard".into()), commands: true, version: Some("26.2".into()), last_played: Some(1_791_138_897), datapacks: 0, seed: None }
        );

        let mut old = named(1, "Difficulty", &[1]);
        old.extend(named(1, "hardcore", &[0]));
        let world = info(&parse(&level(&old)).unwrap()).unwrap();
        assert_eq!((world.difficulty.as_deref(), world.hardcore, world.mode), (Some("easy"), false, None));
    }

    #[test]
    fn renames_only_the_level_name() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("clover-world-{}", rand::random::<u64>()));
        std::fs::create_dir_all(&dir).unwrap();
        let write = |fields: &[u8]| {
            let mut encoder = flate2::write::GzEncoder::new(std::fs::File::create(dir.join("level.dat")).unwrap(), flate2::Compression::default());
            encoder.write_all(&level(fields)).unwrap();
            encoder.finish().unwrap();
        };
        let mut fields = named(3, "GameType", &[0, 0, 0, 1]);
        fields.extend(named(8, "LevelName", &text("Nouveau monde")));
        fields.extend(named(11, "singleplayer_uuid", &[0, 0, 0, 1, 0, 0, 0, 7]));
        write(&fields);
        rename(&dir, "  Base de printemps été ").unwrap();
        let world = read(&dir).unwrap();
        assert_eq!((world.name.as_deref(), world.mode), (Some("Base de printemps été"), Some("creative")));

        // Sans LevelName (vieux monde) : ajouté, le reste intact.
        write(&named(3, "GameType", &[0, 0, 0, 0]));
        rename(&dir, "Survie").unwrap();
        assert_eq!(read(&dir).unwrap().name.as_deref(), Some("Survie"));
        assert_eq!(read(&dir).unwrap().mode, Some("survival"));

        for bad in ["", "   ", "nom\u{0}", "monde 🌍"] {
            assert!(rename(&dir, bad).is_err(), "{bad:?}");
        }
        std::fs::write(dir.join("level.dat"), b"pas du gzip").unwrap();
        assert!(rename(&dir, "X").is_err());
        assert_eq!(std::fs::read(dir.join("level.dat")).unwrap(), b"pas du gzip");
        std::fs::remove_dir_all(dir).unwrap();
    }

    fn gzip(bytes: &[u8]) -> Vec<u8> {
        use std::io::Write;
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(bytes).unwrap();
        encoder.finish().unwrap()
    }

    #[test]
    fn reads_the_seed_in_every_layout() {
        let seed = (-4_172_144_997_902_289_642i64).to_be_bytes();
        let old = info(&parse(&level(&named(4, "RandomSeed", &seed))).unwrap()).unwrap();
        assert_eq!(old.seed.as_deref(), Some("-4172144997902289642"));
        let mut settings = named(4, "seed", &42i64.to_be_bytes());
        settings.push(0);
        let modern = info(&parse(&level(&named(10, "WorldGenSettings", &settings))).unwrap()).unwrap();
        assert_eq!(modern.seed.as_deref(), Some("42"));

        // 26.1 : rien dans level.dat, la graine est dans data/minecraft/world_gen_settings.dat.
        let dir = std::env::temp_dir().join(format!("clover-seed-{}", rand::random::<u64>()));
        std::fs::create_dir_all(dir.join("data/minecraft")).unwrap();
        std::fs::write(dir.join("level.dat"), gzip(&level(&named(8, "LevelName", &text("Neuf"))))).unwrap();
        let mut data = named(4, "seed", &seed);
        data.push(0);
        let mut settings = vec![10, 0, 0];
        settings.extend(named(3, "DataVersion", &[0, 0, 19, 39]));
        settings.extend(named(10, "data", &data));
        settings.push(0);
        std::fs::write(dir.join("data/minecraft/world_gen_settings.dat"), gzip(&settings)).unwrap();
        assert_eq!(read(&dir).unwrap().seed.as_deref(), Some("-4172144997902289642"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    fn zip_of(files: &[(&str, &[u8])]) -> std::path::PathBuf {
        use std::io::Write;
        let path = std::env::temp_dir().join(format!("clover-world-{}.zip", rand::random::<u64>()));
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        for (name, bytes) in files {
            zip.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap();
        path
    }

    #[test]
    fn installs_the_shallowest_world_of_an_archive() {
        let saves = std::env::temp_dir().join(format!("clover-saves-{}", rand::random::<u64>()));
        let level_dat = gzip(&level(&named(8, "LevelName", &text("Ville: v2"))));
        let archive = zip_of(&[
            ("LISEZMOI.txt", b"x"),
            ("Pack/Ville/level.dat", &level_dat),
            ("Pack/Ville/region/r.0.0.mca", b"region"),
            ("Pack/Ville/session.lock", b"lock"),
            ("Pack/Ville/sauvegarde/level.dat", &level_dat),
        ]);
        assert_eq!(install_archive(&archive, &saves, "Ignoré").unwrap(), "Ville_ v2");
        let world = saves.join("Ville_ v2");
        assert!(world.join("region/r.0.0.mca").is_file());
        assert!(world.join("sauvegarde/level.dat").is_file());
        assert!(!world.join("session.lock").exists());
        assert!(!saves.join("LISEZMOI.txt").exists());
        // Le même monde une deuxième fois : à côté, jamais par-dessus.
        assert_eq!(install_archive(&archive, &saves, "Ignoré").unwrap(), "Ville_ v2 (2)");

        let empty = zip_of(&[("notes.txt", b"x")]);
        assert!(install_archive(&empty, &saves, "X").is_err());
        let evil = zip_of(&[("../level.dat", &level_dat)]);
        assert!(install_archive(&evil, &saves, "X").is_err());
        let names: Vec<String> = std::fs::read_dir(&saves).unwrap().map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(names.len(), 2, "{names:?}");
        for path in [archive, empty, evil] {
            std::fs::remove_file(path).unwrap();
        }
        std::fs::remove_dir_all(saves).unwrap();
    }

    #[test]
    fn folder_names_are_safe() {
        assert_eq!(folder_name("Los Perrito City: Exploration"), "Los Perrito City_ Exploration");
        assert_eq!(folder_name("  ..  "), "Monde");
        assert_eq!(folder_name("CON"), "CON (monde)");
        assert_eq!(folder_name("COM1.txt"), "COM1.txt (monde)");
        assert_eq!(folder_name("a/b\\c"), "a_b_c");
    }

    #[test]
    fn rejects_truncated_or_oversized_lengths() {
        let mut fields = named(9, "Huge", &[1]);
        fields.extend(i32::MAX.to_be_bytes());
        assert!(parse(&level(&fields)).is_none());
        assert!(parse(&[10, 0]).is_none());
    }
}
