//! On macOS, embed a small Info.plist into the Atmos Server binary so Activity
//! Monitor, Keychain Access, and other system UIs show “Atmos Server”
//! (`land.atmos.server`) instead of a generic name.

fn main() {
    println!("cargo:rerun-if-changed=macos/Server-Info.plist");

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "macos" {
        return;
    }

    let manifest_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let plist = manifest_dir.join("macos/Server-Info.plist");
    if !plist.exists() {
        return;
    }

    let abs = std::fs::canonicalize(&plist).expect("canonicalize macos/Server-Info.plist");
    println!(
        "cargo:rustc-link-arg=-Wl,-sectcreate,__TEXT,__info_plist,{}",
        abs.to_string_lossy()
    );
}
