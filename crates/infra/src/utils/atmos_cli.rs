use std::path::{Path, PathBuf};
use std::io::Write;

use tracing::{info, warn};

const ATMOS_CLI_BIN_ENV: &str = "ATMOS_CLI_BIN";

fn binary_name() -> &'static str {
    #[cfg(windows)]
    {
        "atmos.exe"
    }
    #[cfg(not(windows))]
    {
        "atmos"
    }
}

fn home_bin_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".atmos").join("bin"))
}

pub fn installed_cli_path() -> Option<PathBuf> {
    home_bin_dir().map(|dir| dir.join(binary_name()))
}

fn source_cli_candidate() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os(ATMOS_CLI_BIN_ENV).map(PathBuf::from) {
        if path.is_file() {
            return Some(path);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let sibling = parent.join(binary_name());
            if sibling.is_file() {
                return Some(sibling);
            }
        }
    }

    None
}

fn set_executable_if_needed(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let metadata = std::fs::metadata(path)
            .map_err(|error| format!("failed to stat {}: {}", path.display(), error))?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions).map_err(|error| {
            format!(
                "failed to set executable permissions on {}: {}",
                path.display(),
                error
            )
        })?;
    }

    Ok(())
}

fn prepend_bin_dir_to_process_path(bin_dir: &Path) -> Result<(), String> {
    let existing = std::env::var_os("PATH").unwrap_or_default();
    let mut paths = std::env::split_paths(&existing).collect::<Vec<_>>();
    if paths.iter().any(|path| path == bin_dir) {
        return Ok(());
    }

    let mut next_paths = vec![bin_dir.to_path_buf()];
    next_paths.append(&mut paths);
    let joined = std::env::join_paths(next_paths)
        .map_err(|error| format!("failed to join PATH entries: {}", error))?;
    // SAFETY: `ensure_atmos_cli_on_startup` is only called once, synchronously from the top of
    // `main()` in `apps/api` before any task, server handler, or child process that reads `PATH`
    // is spawned. No concurrent readers/writers of the environment exist at this point, so the
    // thread-safety preconditions of `std::env::set_var` (Rust 2024) are upheld.
    unsafe {
        std::env::set_var("PATH", joined);
    }
    Ok(())
}

pub fn ensure_atmos_cli_on_startup() -> Result<Option<PathBuf>, String> {
    let Some(bin_dir) = home_bin_dir() else {
        return Err("Cannot determine home directory for Atmos CLI install".to_string());
    };
    std::fs::create_dir_all(&bin_dir).map_err(|error| {
        format!(
            "failed to create Atmos CLI bin dir {}: {}",
            bin_dir.display(),
            error
        )
    })?;

    let installed = bin_dir.join(binary_name());
    if let Some(source) = source_cli_candidate() {
        if source != installed {
            std::fs::copy(&source, &installed).map_err(|error| {
                format!(
                    "failed to install Atmos CLI from {} to {}: {}",
                    source.display(),
                    installed.display(),
                    error
                )
            })?;
            set_executable_if_needed(&installed)?;
            info!("Installed Atmos CLI to {}", installed.display());
        }
    } else if !installed.is_file() {
        warn!(
            "Atmos CLI source binary was not found; review-fix terminal flows may be unavailable. \
             Build it with `just build-cli` (or `cargo build --bin atmos`) and restart the API."
        );
        return Ok(None);
    }

    prepend_bin_dir_to_process_path(&bin_dir)?;
    
    // Automatically add to shell config if not already present
    ensure_cli_in_shell_config(&bin_dir);
    
    Ok(installed.is_file().then_some(installed))
}

// ===== Shell Config Modification =====

fn ensure_cli_in_shell_config(bin_dir: &Path) {
    let home_dir = dirs::home_dir();
    if home_dir.is_none() {
        warn!("Cannot determine home directory for shell config modification");
        return;
    }

    let home = home_dir.unwrap();
    let shell = std::env::var("SHELL").unwrap_or_default();
    let shell_name = std::path::Path::new(&shell)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("bash");

    let config_files = get_shell_config_files(&home, shell_name);
    let bin_dir_str = bin_dir.to_string_lossy().to_string();
    let path_command = format!("export PATH=\"{}:$PATH\"", bin_dir_str);

    // Find the first writable config file
    for config_file in &config_files {
        if config_file.exists() {
            // Check if already in the file
            if let Ok(content) = std::fs::read_to_string(config_file) {
                if content.contains(&path_command) || content.contains(&bin_dir_str) {
                    info!("Atmos CLI already configured in {}", config_file.display());
                    return;
                }
            }

            // Try to write to the file
            if let Ok(mut file) = std::fs::OpenOptions::new().append(true).open(config_file) {
                if writeln!(file, "\n# Atmos CLI").is_ok() 
                    && writeln!(file, "{}", path_command).is_ok() 
                {
                    info!("Successfully added Atmos CLI to PATH in {}", config_file.display());
                    return;
                } else {
                    warn!("Failed to write to config file {}", config_file.display());
                }
            } else {
                warn!("Failed to open config file {} for writing", config_file.display());
            }
        }
    }

    // No writable config file found, try to create a default one
    if let Some(default_config) = get_default_config_file(&home, shell_name) {
        if !default_config.exists() {
            if let Some(parent) = default_config.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(mut file) = std::fs::File::create(&default_config) {
                if writeln!(file, "# Atmos CLI").is_ok() 
                    && writeln!(file, "{}", path_command).is_ok() 
                {
                    info!("Created {} and added Atmos CLI to PATH", default_config.display());
                    return;
                } else {
                    warn!("Failed to write to default config file {}", default_config.display());
                }
            } else {
                warn!("Failed to create default config file {}", default_config.display());
            }
        } else {
            info!("Default config file {} already exists, skipping creation", default_config.display());
        }
    }

    warn!("No writable shell config file found. Tried: {:?}", config_files);
}

fn get_shell_config_files(home: &Path, shell_name: &str) -> Vec<PathBuf> {
    let xdg_config_home = std::env::var("XDG_CONFIG_HOME")
        .map(|path| PathBuf::from(path))
        .unwrap_or_else(|_| home.join(".config"));

    match shell_name {
        "fish" => vec![
            home.join(".config/fish/config.fish"),
        ],
        "zsh" => vec![
            std::env::var("ZDOTDIR")
                .map(|path| PathBuf::from(path).join(".zshrc"))
                .unwrap_or_else(|_| home.join(".zshrc")),
            std::env::var("ZDOTDIR")
                .map(|path| PathBuf::from(path).join(".zshenv"))
                .unwrap_or_else(|_| home.join(".zshenv")),
            xdg_config_home.join("zsh/.zshrc"),
            xdg_config_home.join("zsh/.zshenv"),
        ],
        "bash" => vec![
            home.join(".bashrc"),
            home.join(".bash_profile"),
            home.join(".profile"),
            xdg_config_home.join("bash/.bashrc"),
            xdg_config_home.join("bash/.bash_profile"),
        ],
        "ash" | "sh" => vec![
            home.join(".ashrc"),
            home.join(".profile"),
            PathBuf::from("/etc/profile"),
        ],
        _ => vec![
            home.join(".bashrc"),
            home.join(".bash_profile"),
            xdg_config_home.join("bash/.bashrc"),
            xdg_config_home.join("bash/.bash_profile"),
        ],
    }
}

fn get_default_config_file(home: &Path, shell_name: &str) -> Option<PathBuf> {
    match shell_name {
        "zsh" => Some(home.join(".zshrc")),
        "bash" => Some(home.join(".bashrc")),
        "fish" => Some(home.join(".config/fish/config.fish")),
        _ => Some(home.join(".bashrc")),
    }
}
