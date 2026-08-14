use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use crate::resources::ResourceSpec;

pub fn local_product_present(spec: &ResourceSpec) -> bool {
    app_installed(spec) || binary_installed(spec) || extra_markers_present(spec)
}

fn app_installed(spec: &ResourceSpec) -> bool {
    spec.app_markers
        .iter()
        .flat_map(|marker| app_candidates(marker))
        .any(|path| path.exists())
}

fn binary_installed(spec: &ResourceSpec) -> bool {
    spec.binaries.iter().any(|name| {
        well_known_binary_candidates(name)
            .into_iter()
            .any(|path| is_executable_file(&path))
            || path_has_binary(name)
    })
}

fn extra_markers_present(spec: &ResourceSpec) -> bool {
    let Some(home) = dirs::home_dir() else {
        return false;
    };
    spec.extra_markers.iter().any(|marker| {
        let trimmed = marker.trim_start_matches("~/");
        home.join(trimmed).exists()
    })
}

fn app_candidates(marker: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let stem = marker.trim_end_matches(".app");

    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/Applications").join(marker));
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join("Applications").join(marker));
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local) = env::var("LOCALAPPDATA") {
            let local = PathBuf::from(local);
            candidates.push(
                local
                    .join("Programs")
                    .join(stem)
                    .join(format!("{stem}.exe")),
            );
            candidates.push(local.join(stem).join(format!("{stem}.exe")));
        }
        if let Ok(pf) = env::var("PROGRAMFILES") {
            candidates.push(PathBuf::from(pf).join(stem).join(format!("{stem}.exe")));
        }
    }

    #[cfg(target_os = "linux")]
    {
        candidates.push(PathBuf::from("/opt").join(stem));
        candidates.push(PathBuf::from("/usr/share").join(stem.to_lowercase()));
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join(".local/share").join(stem.to_lowercase()));
        }
    }

    let _ = stem;
    candidates
}

fn well_known_binary_candidates(name: &str) -> Vec<PathBuf> {
    let file_name = binary_file_name(name);
    let mut candidates = vec![
        PathBuf::from("/opt/homebrew/bin").join(&file_name),
        PathBuf::from("/usr/local/bin").join(&file_name),
    ];
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".local/bin").join(&file_name));
        if let Some(versioned) = newest_versioned_binary(&home, name) {
            candidates.push(versioned);
        }
    }
    candidates
}

pub(crate) fn newest_versioned_binary(home: &Path, name: &str) -> Option<PathBuf> {
    let versions = home.join(".local/share").join(name).join("versions");
    let mut found = None;
    let entries = fs::read_dir(&versions).ok()?;
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        for candidate_name in [name, "agent"] {
            let candidate = dir.join(binary_file_name(candidate_name));
            if is_executable_file(&candidate) {
                found = Some(candidate);
            }
        }
    }
    found
}

fn path_has_binary(name: &str) -> bool {
    let Ok(path) = env::var("PATH") else {
        return false;
    };
    env::split_paths(&path).any(|dir| {
        is_executable_file(&dir.join(name)) || is_executable_file(&dir.join(binary_file_name(name)))
    })
}

fn binary_file_name(name: &str) -> String {
    #[cfg(windows)]
    {
        if name.ends_with(".exe") {
            name.to_string()
        } else {
            format!("{name}.exe")
        }
    }
    #[cfg(not(windows))]
    {
        name.to_string()
    }
}

fn is_executable_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(path)
            .map(|meta| meta.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newest_versioned_binary_finds_executable() {
        let home = std::env::temp_dir().join(format!(
            "atmos-permission-access-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let dir = home.join(".local/share/cursor-agent/versions/1.2.3");
        fs::create_dir_all(&dir).unwrap();
        let agent = dir.join("cursor-agent");
        fs::write(&agent, b"#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&agent).unwrap().permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&agent, perms).unwrap();
        }
        assert_eq!(newest_versioned_binary(&home, "cursor-agent"), Some(agent));
        let _ = fs::remove_dir_all(&home);
    }
}
