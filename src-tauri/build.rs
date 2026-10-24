fn main() {
    // Rebuild the executable's Windows resources when its icon changes.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    client_mods();
    tauri_build::build()
}

/// Mod Clover des instances du joueur : un JAR par époque de Minecraft dans `client-mods/`
/// (`gradlew launcherJars` depuis `mod/`), embarqués par `include_bytes!` (`game::client_mod`).
fn client_mods() {
    println!("cargo:rerun-if-changed=client-mods");
    let dir = std::path::Path::new("client-mods");
    let mut jars: Vec<_> = std::fs::read_dir(dir)
        .map(|entries| entries.flatten().map(|entry| entry.path()).filter(|path| path.extension().is_some_and(|ext| ext == "jar")).collect())
        .unwrap_or_default();
    jars.sort();
    let entries: String = jars
        .iter()
        .map(|path| {
            let name = path.file_name().unwrap().to_string_lossy();
            let absolute = std::env::current_dir().unwrap().join(path);
            format!("    (\"{name}\", include_bytes!(r#\"{}\"#)),\n", absolute.display())
        })
        .collect();
    let out = std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("client_mods.rs");
    std::fs::write(out, format!("pub const JARS: &[(&str, &[u8])] = &[\n{entries}];\n")).unwrap();
}
