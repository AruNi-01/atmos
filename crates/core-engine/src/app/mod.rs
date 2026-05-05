use crate::error::EngineError;
use std::process::Command;

/// App engine for opening external applications
pub struct AppEngine;

impl AppEngine {
    pub fn new() -> Self {
        Self
    }

    /// Open a path with the specified application
    ///
    /// # Arguments
    /// * `app_name` - Name of the application (e.g., "Finder", "VS Code", "Terminal")
    /// * `path` - Path to open
    ///
    /// # Returns
    /// Result indicating success or failure
    pub fn open_with_app(&self, app_name: &str, path: &str) -> Result<(), EngineError> {
        #[cfg(target_os = "macos")]
        {
            self.open_with_app_macos(app_name, path)
        }

        #[cfg(target_os = "windows")]
        {
            self.open_with_app_windows(app_name, path)
        }

        #[cfg(target_os = "linux")]
        {
            self.open_with_app_linux(app_name, path)
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        {
            Err(EngineError::Processing(format!(
                "Opening applications is not supported on this platform"
            )))
        }
    }

    #[cfg(target_os = "macos")]
    fn open_with_app_macos(&self, app_name: &str, path: &str) -> Result<(), EngineError> {
        // Map app names to their bundle identifiers or commands
        let result = match app_name {
            "Default" => Command::new("open").arg(path).status(),
            // File Managers
            "Finder" => {
                Command::new("open")
                    .arg("-R") // Reveal in Finder
                    .arg(path)
                    .status()
            }

            // Terminals
            "Terminal" => Command::new("open")
                .arg("-a")
                .arg("Terminal")
                .arg(path)
                .status(),
            "iTerm" => Command::new("open")
                .arg("-a")
                .arg("iTerm")
                .arg(path)
                .status(),
            "Warp" => Command::new("open")
                .arg("-a")
                .arg("Warp")
                .arg(path)
                .status(),
            "Ghostty" => Command::new("open")
                .arg("-a")
                .arg("Ghostty")
                .arg(path)
                .status(),

            // Code Editors
            "VS Code" => {
                // Try using the 'code' command first, fall back to 'open'
                let code_result = Command::new("code").arg(path).status();

                if code_result.is_ok() {
                    code_result
                } else {
                    Command::new("open")
                        .arg("-a")
                        .arg("Visual Studio Code")
                        .arg(path)
                        .status()
                }
            }
            "VS Code Insiders" => {
                let code_result = Command::new("code-insiders").arg(path).status();

                if code_result.is_ok() {
                    code_result
                } else {
                    Command::new("open")
                        .arg("-a")
                        .arg("Visual Studio Code - Insiders")
                        .arg(path)
                        .status()
                }
            }
            "Cursor" => {
                let cursor_result = Command::new("cursor").arg(path).status();

                if cursor_result.is_ok() {
                    cursor_result
                } else {
                    Command::new("open")
                        .arg("-a")
                        .arg("Cursor")
                        .arg(path)
                        .status()
                }
            }
            "Windsurf" => {
                let windsurf_result = Command::new("windsurf").arg(path).status();

                if windsurf_result.is_ok() {
                    windsurf_result
                } else {
                    Command::new("open")
                        .arg("-a")
                        .arg("Windsurf")
                        .arg(path)
                        .status()
                }
            }
            "Antigravity" => {
                let ag_result = Command::new("antigravity").arg(path).status();

                if ag_result.is_ok() {
                    ag_result
                } else {
                    Command::new("open")
                        .arg("-a")
                        .arg("Antigravity")
                        .arg(path)
                        .status()
                }
            }
            "Zed" => Command::new("open").arg("-a").arg("Zed").arg(path).status(),
            "Sublime Text" => {
                let subl_result = Command::new("subl").arg(path).status();

                if subl_result.is_ok() {
                    subl_result
                } else {
                    Command::new("open")
                        .arg("-a")
                        .arg("Sublime Text")
                        .arg(path)
                        .status()
                }
            }
            "Xcode" => Command::new("open")
                .arg("-a")
                .arg("Xcode")
                .arg(path)
                .status(),

            // JetBrains IDEs
            "IntelliJ IDEA" => Command::new("open")
                .arg("-a")
                .arg("IntelliJ IDEA")
                .arg(path)
                .status(),
            "WebStorm" => Command::new("open")
                .arg("-a")
                .arg("WebStorm")
                .arg(path)
                .status(),
            "PyCharm" => Command::new("open")
                .arg("-a")
                .arg("PyCharm")
                .arg(path)
                .status(),
            "GoLand" => Command::new("open")
                .arg("-a")
                .arg("GoLand")
                .arg(path)
                .status(),
            "CLion" => Command::new("open")
                .arg("-a")
                .arg("CLion")
                .arg(path)
                .status(),
            "Rider" => Command::new("open")
                .arg("-a")
                .arg("Rider")
                .arg(path)
                .status(),
            "RustRover" => Command::new("open")
                .arg("-a")
                .arg("RustRover")
                .arg(path)
                .status(),

            _ => {
                return Err(EngineError::Processing(format!(
                    "Unsupported application: {}",
                    app_name
                )));
            }
        };

        match result {
            Ok(status) if status.success() => Ok(()),
            Ok(status) => Err(EngineError::Processing(format!(
                "Failed to open {} with {}: exit code {:?}",
                path,
                app_name,
                status.code()
            ))),
            Err(e) => Err(EngineError::Processing(format!(
                "Failed to execute open command: {}",
                e
            ))),
        }
    }

    #[cfg(target_os = "windows")]
    fn open_with_app_windows(&self, app_name: &str, path: &str) -> Result<(), EngineError> {
        let result = match app_name {
            "Default" => Command::new("cmd")
                .arg("/c")
                .arg("start")
                .arg("")
                .arg(path)
                .status(),
            // File Managers
            "Finder" | "Explorer" => {
                // Windows Explorer
                Command::new("explorer").arg(path).status()
            }

            // Terminals
            "Terminal" | "Command Prompt" => Command::new("cmd")
                .arg("/c")
                .arg("start")
                .arg("cmd")
                .arg("/K")
                .arg(format!("cd /d \"{}\"", path))
                .status(),
            "PowerShell" => Command::new("powershell")
                .arg("-NoExit")
                .arg("-Command")
                .arg(format!("Set-Location '{}'", path))
                .status(),
            "Windows Terminal" => Command::new("wt").arg("-d").arg(path).status(),

            // Code Editors
            "VS Code" => {
                let code_result = Command::new("code").arg(path).status();

                if code_result.is_ok() {
                    code_result
                } else {
                    // Try opening via start command
                    Command::new("cmd")
                        .arg("/c")
                        .arg("start")
                        .arg("code")
                        .arg(path)
                        .status()
                }
            }
            "VS Code Insiders" => Command::new("code-insiders").arg(path).status(),
            "Cursor" => Command::new("cursor").arg(path).status(),
            "Windsurf" => Command::new("windsurf").arg(path).status(),
            "Antigravity" => Command::new("antigravity").arg(path).status(),
            "Sublime Text" => {
                let subl_result = Command::new("subl").arg(path).status();

                if subl_result.is_ok() {
                    subl_result
                } else {
                    Command::new("cmd")
                        .arg("/c")
                        .arg("start")
                        .arg("sublime_text")
                        .arg(path)
                        .status()
                }
            }

            // JetBrains IDEs (Windows uses .exe or .bat launchers)
            "IntelliJ IDEA" => Command::new("idea").arg(path).status(),
            "WebStorm" => Command::new("webstorm").arg(path).status(),
            "PyCharm" => Command::new("pycharm").arg(path).status(),

            _ => {
                return Err(EngineError::Processing(format!(
                    "Unsupported application: {}",
                    app_name
                )));
            }
        };

        match result {
            Ok(status) if status.success() => Ok(()),
            Ok(status) => Err(EngineError::Processing(format!(
                "Failed to open {} with {}: exit code {:?}",
                path,
                app_name,
                status.code()
            ))),
            Err(e) => Err(EngineError::Processing(format!(
                "Failed to execute open command: {}",
                e
            ))),
        }
    }

    #[cfg(target_os = "linux")]
    fn open_with_app_linux(&self, app_name: &str, path: &str) -> Result<(), EngineError> {
        let result = match app_name {
            "Default" => Command::new("xdg-open").arg(path).status(),
            // File Managers
            "Finder" | "Files" | "Nautilus" => {
                // Try common Linux file managers
                let nautilus = Command::new("nautilus").arg(path).status();
                if nautilus.is_ok() {
                    nautilus
                } else {
                    let dolphin = Command::new("dolphin").arg(path).status();
                    if dolphin.is_ok() {
                        dolphin
                    } else {
                        // Fallback to xdg-open
                        Command::new("xdg-open").arg(path).status()
                    }
                }
            }

            // Terminals
            "Terminal" | "GNOME Terminal" => Command::new("gnome-terminal")
                .arg("--working-directory")
                .arg(path)
                .status(),
            "Konsole" => Command::new("konsole").arg("--workdir").arg(path).status(),
            "Alacritty" => Command::new("alacritty")
                .arg("--working-directory")
                .arg(path)
                .status(),
            "Kitty" => Command::new("kitty").arg("--directory").arg(path).status(),

            // Code Editors
            "VS Code" => Command::new("code").arg(path).status(),
            "VS Code Insiders" => Command::new("code-insiders").arg(path).status(),
            "Cursor" => Command::new("cursor").arg(path).status(),
            "Windsurf" => Command::new("windsurf").arg(path).status(),
            "Antigravity" => Command::new("antigravity").arg(path).status(),
            "Sublime Text" => Command::new("subl").arg(path).status(),
            "Zed" => Command::new("zed").arg(path).status(),

            // JetBrains IDEs
            "IntelliJ IDEA" => Command::new("idea").arg(path).status(),
            "WebStorm" => Command::new("webstorm").arg(path).status(),
            "PyCharm" => Command::new("pycharm").arg(path).status(),
            "GoLand" => Command::new("goland").arg(path).status(),
            "CLion" => Command::new("clion").arg(path).status(),
            "Rider" => Command::new("rider").arg(path).status(),
            "RustRover" => Command::new("rustrover").arg(path).status(),

            _ => {
                return Err(EngineError::Processing(format!(
                    "Unsupported application: {}",
                    app_name
                )));
            }
        };

        match result {
            Ok(status) if status.success() => Ok(()),
            Ok(status) => Err(EngineError::Processing(format!(
                "Failed to open {} with {}: exit code {:?}",
                path,
                app_name,
                status.code()
            ))),
            Err(e) => Err(EngineError::Processing(format!(
                "Failed to execute open command: {}",
                e
            ))),
        }
    }
}

impl Default for AppEngine {
    fn default() -> Self {
        Self::new()
    }
}
