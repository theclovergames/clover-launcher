//! `servers.dat` : NBT non compressé, composé racine qui ne contient que la liste `servers`
//! (`name`, `ip`, `icon`, `hidden`, `acceptTextures`…). Juste de quoi compter, comparer et fusionner
//! les entrées, et accepter d'office le pack de ressources des serveurs Clover Games.

const END: u8 = 0;
const BYTE: u8 = 1;
const STRING: u8 = 8;
const LIST: u8 = 9;
const COMPOUND: u8 = 10;
/// Profondeur d'imbrication acceptée, bien au-delà de celle d'une entrée de serveur.
const MAX_DEPTH: u8 = 32;

struct Reader<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let slice = self.bytes.get(self.pos..self.pos.checked_add(n)?)?;
        self.pos += n;
        Some(slice)
    }

    fn byte(&mut self) -> Option<u8> {
        Some(self.take(1)?[0])
    }

    fn length(&mut self) -> Option<usize> {
        usize::try_from(i32::from_be_bytes(self.take(4)?.try_into().ok()?)).ok()
    }

    fn string(&mut self) -> Option<&'a [u8]> {
        let n = u16::from_be_bytes(self.take(2)?.try_into().ok()?);
        self.take(usize::from(n))
    }

    /// Passe la valeur d'une balise de type `kind`.
    fn skip(&mut self, kind: u8, depth: u8) -> Option<()> {
        if depth > MAX_DEPTH {
            return None;
        }
        match kind {
            1 => self.take(1).map(drop),
            2 => self.take(2).map(drop),
            3 | 5 => self.take(4).map(drop),
            4 | 6 => self.take(8).map(drop),
            7 => {
                let n = self.length()?;
                self.take(n).map(drop)
            }
            STRING => self.string().map(drop),
            LIST => {
                let item = self.byte()?;
                for _ in 0..self.length()? {
                    self.skip(item, depth + 1)?;
                }
                Some(())
            }
            COMPOUND => loop {
                let tag = self.byte()?;
                if tag == END {
                    return Some(());
                }
                self.string()?;
                self.skip(tag, depth + 1)?;
            },
            11 => {
                let n = self.length()?;
                self.take(n.checked_mul(4)?).map(drop)
            }
            12 => {
                let n = self.length()?;
                self.take(n.checked_mul(8)?).map(drop)
            }
            _ => None,
        }
    }

    /// Dans un composé, se place sur la valeur de la balise `name` de type `kind`.
    fn find(mut self, kind: u8, name: &[u8]) -> Option<Self> {
        loop {
            let tag = self.byte()?;
            if tag == END {
                return None;
            }
            let found = self.string()? == name;
            if found && tag == kind {
                return Some(self);
            }
            self.skip(tag, 1)?;
        }
    }
}

/// Entrées de la liste (valeur brute du composé, balise de fin comprise) ; `None` si le
/// fichier n'est pas lisible.
pub fn entries(bytes: &[u8]) -> Option<Vec<&[u8]>> {
    let mut reader = Reader { bytes, pos: 0 };
    if reader.byte()? != COMPOUND {
        return None;
    }
    reader.string()?;
    let mut entries = Vec::new();
    loop {
        let tag = reader.byte()?;
        if tag == END {
            return Some(entries);
        }
        let name = reader.string()?;
        if tag == LIST && name == b"servers" {
            let item = reader.byte()?;
            let n = reader.length()?;
            if n > 0 && item != COMPOUND {
                return None;
            }
            for _ in 0..n {
                let start = reader.pos;
                reader.skip(COMPOUND, 1)?;
                entries.push(&bytes[start..reader.pos]);
            }
        } else {
            reader.skip(tag, 1)?;
        }
    }
}

/// Adresse en minuscules, pour reconnaître un serveur déjà enregistré.
pub fn address(entry: &[u8]) -> Option<String> {
    let ip = Reader { bytes: entry, pos: 0 }.find(STRING, b"ip")?.string()?;
    Some(String::from_utf8_lossy(ip).trim().to_ascii_lowercase())
}

/// Entrée gardée par le jeu pour une connexion directe, absente du menu Multijoueur.
pub fn hidden(entry: &[u8]) -> bool {
    Reader { bytes: entry, pos: 0 }.find(BYTE, b"hidden").and_then(|mut reader| reader.byte()).is_some_and(|value| value != 0)
}

pub fn write(entries: &[&[u8]]) -> Vec<u8> {
    let mut out = vec![COMPOUND, 0, 0, LIST, 0, 7];
    out.extend_from_slice(b"servers");
    out.push(COMPOUND);
    out.extend_from_slice(&i32::try_from(entries.len()).unwrap_or(i32::MAX).to_be_bytes());
    for entry in entries {
        out.extend_from_slice(entry);
    }
    out.push(END);
    out
}

/// Entrée renommée : sa balise `name` remplacée (ou ajoutée), le reste recopié tel quel.
fn renamed(entry: &[u8], name: &str) -> Option<Vec<u8>> {
    let mut reader = Reader { bytes: entry, pos: 0 };
    let mut out = Vec::new();
    tag(&mut out, STRING, "name");
    string(&mut out, name);
    loop {
        let start = reader.pos;
        let kind = reader.byte()?;
        if kind == END {
            out.push(END);
            return Some(out);
        }
        let key = reader.string()?;
        reader.skip(kind, 1)?;
        if !(kind == STRING && key == b"name") {
            out.extend_from_slice(&entry[start..reader.pos]);
        }
    }
}

/// Donne le nom `name` aux serveurs visibles d'adresse `address` (sans casse). `None` si le fichier
/// est illisible ; le même contenu si aucune entrée ne correspond.
pub fn rename(bytes: &[u8], address: &str, name: &str) -> Option<Vec<u8>> {
    let address = address.to_ascii_lowercase();
    let list = entries(bytes)?;
    let mut changed = Vec::with_capacity(list.len());
    for entry in &list {
        changed.push(if !hidden(entry) && self::address(entry).as_deref() == Some(address.as_str()) { renamed(entry, name)? } else { entry.to_vec() });
    }
    let out = write(&changed.iter().map(Vec::as_slice).collect::<Vec<_>>());
    // Relu avant d'être écrit : un fichier qui ne se relit pas n'est pas rendu.
    (entries(&out)?.len() == list.len()).then_some(out)
}

/// Nom du serveur principal dans le menu Multijoueur.
const SERVER_NAME: &str = "Clover Games";

/// Entrée qui accepte le pack de ressources du serveur sans question. Cachée (absente du menu
/// Multijoueur), c'est celle que le jeu garde pour une connexion directe.
fn accepted_entry(name: &str, host: &str, hidden: bool) -> Vec<u8> {
    let mut entry = Vec::new();
    for (key, value) in [("name", name), ("ip", host)] {
        tag(&mut entry, STRING, key);
        string(&mut entry, value);
    }
    for (key, value) in [("hidden", hidden), ("acceptTextures", true)] {
        tag(&mut entry, BYTE, key);
        entry.push(u8::from(value));
    }
    entry.push(END);
    entry
}

/// Prépare `servers.dat` pour le réseau (adresses comparées sans casse). Le serveur principal
/// `server` est mis en tête du menu Multijoueur s'il n'y est pas : sans lui, la seule entrée Clover
/// visible pouvait être celle d'un mode, et le joueur arrivait sur ce mode au lieu du Lobby. Ses
/// entrées cachées (celle du Quick Play) sont remplacées. Chaque mode de `modes` absent reçoit une
/// entrée cachée. Toutes acceptent le pack de ressources ; les entrées visibles déjà là ne sont pas
/// touchées, un fichier illisible non plus. Renvoie le nombre d'entrées ajoutées.
pub fn prepare(path: &std::path::Path, server: &str, modes: &[&str]) -> std::io::Result<usize> {
    let existing = std::fs::read(path).unwrap_or_default();
    let current = if existing.is_empty() { Vec::new() } else if let Some(current) = entries(&existing) { current } else { return Ok(0) };
    let main = server.to_ascii_lowercase();
    let listed = current.iter().any(|entry| !hidden(entry) && address(entry).as_deref() == Some(main.as_str()));
    let head = (!listed).then(|| accepted_entry(SERVER_NAME, server, false));
    let kept: Vec<&[u8]> = current.into_iter().filter(|entry| listed || address(entry).as_deref() != Some(main.as_str())).collect();
    let mut known: std::collections::HashSet<String> = kept.iter().filter_map(|entry| address(entry)).collect();
    known.insert(main);
    let added: Vec<Vec<u8>> = modes.iter().filter(|host| known.insert(host.to_ascii_lowercase())).map(|host| accepted_entry(host, host, true)).collect();
    let count = usize::from(head.is_some()) + added.len();
    if count == 0 {
        return Ok(0);
    }
    let merged: Vec<&[u8]> = head.iter().map(Vec::as_slice).chain(kept).chain(added.iter().map(Vec::as_slice)).collect();
    crate::storage::write_atomically(path, &write(&merged))?;
    Ok(count)
}

fn tag(out: &mut Vec<u8>, kind: u8, name: &str) {
    out.push(kind);
    string(out, name);
}

fn string(out: &mut Vec<u8>, value: &str) {
    let bytes = value.as_bytes();
    out.extend_from_slice(&u16::try_from(bytes.len()).unwrap_or(u16::MAX).to_be_bytes());
    out.extend_from_slice(&bytes[..bytes.len().min(usize::from(u16::MAX))]);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renames_only_the_matching_visible_server() {
        let entry = |name: &str, ip: &str, hidden_entry: bool| {
            let mut entry = Vec::new();
            tag(&mut entry, STRING, "name");
            string(&mut entry, name);
            tag(&mut entry, STRING, "ip");
            string(&mut entry, ip);
            tag(&mut entry, STRING, "icon");
            string(&mut entry, "iVBORw0K");
            if hidden_entry {
                tag(&mut entry, BYTE, "hidden");
                entry.push(1);
            }
            entry.push(END);
            entry
        };
        let (a, b, c) = (entry("Serveur Minecraft", "Play.Example.net", false), entry("Autre", "autre.net", false), entry("", "play.example.net", true));
        let bytes = write(&[&a, &b, &c]);
        let out = rename(&bytes, "play.example.net", "Mon serveur").unwrap();
        let list = entries(&out).unwrap();
        let name = |entry: &[u8]| Reader { bytes: entry, pos: 0 }.find(STRING, b"name").and_then(|mut reader| reader.string().map(<[u8]>::to_vec));
        assert_eq!(name(list[0]).as_deref(), Some(&b"Mon serveur"[..]));
        assert_eq!(address(list[0]).as_deref(), Some("play.example.net"));
        assert!(Reader { bytes: list[0], pos: 0 }.find(STRING, b"icon").is_some());
        assert_eq!(list[1], &b[..]);
        assert_eq!(list[2], &c[..]);
        assert!(rename(b"pas du NBT", "x", "y").is_none());
    }

    #[test]
    fn main_server_is_listed_first_and_modes_stay_hidden() {
        let path = std::env::temp_dir().join(format!("clover-servers-{}", rand::random::<u64>())).join("servers.dat");
        let (server, modes) = ("play.clovergames.fr", ["bedwars.play.clovergames.fr", "practice.play.clovergames.fr"]);
        let accepts = |entry: &[u8]| Reader { bytes: entry, pos: 0 }.find(BYTE, b"acceptTextures").and_then(|mut reader| reader.byte()) == Some(1);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        // Ce que laisse le Quick Play : le serveur principal caché, un mode resté visible.
        let practice = accepted_entry("Serveur Minecraft", "practice.play.clovergames.fr", false);
        std::fs::write(&path, write(&[&practice, &accepted_entry("Serveur Minecraft", server, true), &accepted_entry("Autre", "autre.net", false)])).unwrap();

        assert_eq!(prepare(&path, server, &modes).unwrap(), 2);
        assert_eq!(prepare(&path, server, &modes).unwrap(), 0);
        let bytes = std::fs::read(&path).unwrap();
        let list = entries(&bytes).unwrap();
        assert_eq!(list.iter().map(|entry| address(entry).unwrap()).collect::<Vec<_>>(), [server, modes[1], "autre.net", modes[0]]);
        assert_eq!(list[0], accepted_entry(SERVER_NAME, server, false));
        assert!(!hidden(list[0]) && accepts(list[0]));
        assert_eq!(list[1], &practice[..]);
        assert!(hidden(list[3]) && accepts(list[3]));

        // Entrée visible du joueur : gardée telle quelle, à sa place.
        let mine = accepted_entry("Mon serveur", "PLAY.clovergames.fr", false);
        std::fs::write(&path, write(&[&accepted_entry("Autre", "autre.net", false), &mine])).unwrap();
        assert_eq!(prepare(&path, server, &[]).unwrap(), 0);
        assert_eq!(entries(&std::fs::read(&path).unwrap()).unwrap()[1], &mine[..]);

        std::fs::write(&path, b"pas du NBT").unwrap();
        assert_eq!(prepare(&path, server, &modes).unwrap(), 0);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
