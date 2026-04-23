#[derive(Debug, Clone)]
pub struct LspDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub version: &'static str,
    pub extensions: &'static [&'static str],
    pub executable_name: &'static str,
    pub install: InstallMethod,
    pub launch_args: &'static [&'static str],
    pub initialization_options: &'static str,
}

#[derive(Debug, Clone)]
pub enum InstallMethod {
    GitHubRelease {
        repo: &'static str,
        asset_pattern: &'static str,
    },
    Npm {
        package: &'static str,
        bin: &'static str,
    },
    Pip {
        package: &'static str,
        bin: &'static str,
    },
    GoInstall {
        package: &'static str,
        bin: &'static str,
    },
    SystemBinary {
        bin: &'static str,
    },
}

pub fn builtin_lsp_registry() -> Vec<LspDefinition> {
    vec![
        LspDefinition {
            id: "rust-analyzer",
            name: "Rust Analyzer",
            version: "2025-01-13",
            extensions: &["rs"],
            executable_name: "rust-analyzer",
            launch_args: &[],
            initialization_options: "{}",
            install: InstallMethod::GitHubRelease {
                repo: "rust-lang/rust-analyzer",
                asset_pattern: "rust-analyzer-{arch}-{os}.gz",
            },
        },
        LspDefinition {
            id: "pyright",
            name: "Pyright",
            version: "1.1.390",
            extensions: &["py"],
            executable_name: "pyright-langserver",
            launch_args: &["--stdio"],
            initialization_options: "{}",
            install: InstallMethod::Npm {
                package: "pyright",
                bin: "pyright-langserver",
            },
        },
        LspDefinition {
            id: "typescript-language-server",
            name: "TypeScript / JavaScript",
            version: "4.3.4",
            extensions: &["ts", "tsx", "js", "jsx"],
            executable_name: "typescript-language-server",
            launch_args: &["--stdio"],
            initialization_options: "{}",
            install: InstallMethod::Npm {
                package: "typescript-language-server",
                bin: "typescript-language-server",
            },
        },
        LspDefinition {
            id: "gopls",
            name: "Go",
            version: "v0.16.2",
            extensions: &["go"],
            executable_name: "gopls",
            launch_args: &[],
            initialization_options: "{}",
            install: InstallMethod::GoInstall {
                package: "golang.org/x/tools/gopls",
                bin: "gopls",
            },
        },
        LspDefinition {
            id: "clangd",
            name: "C / C++",
            version: "19.1.2",
            extensions: &["c", "cpp", "h", "hpp"],
            executable_name: "clangd",
            launch_args: &["--background-index"],
            initialization_options: "{}",
            install: InstallMethod::GitHubRelease {
                repo: "clangd/clangd",
                asset_pattern: "clangd-{os}-{version}.zip",
            },
        },
        LspDefinition {
            id: "kotlin-language-server",
            name: "Kotlin",
            version: "1.3.13",
            extensions: &["kt", "kts"],
            executable_name: "kotlin-language-server",
            launch_args: &[],
            initialization_options: "{}",
            install: InstallMethod::GitHubRelease {
                repo: "fwcd/kotlin-language-server",
                asset_pattern: "server.zip",
            },
        },
        LspDefinition {
            id: "sourcekit-lsp",
            name: "Swift",
            version: "system",
            extensions: &["swift"],
            executable_name: "sourcekit-lsp",
            launch_args: &[],
            initialization_options: "{}",
            install: InstallMethod::SystemBinary {
                bin: "sourcekit-lsp",
            },
        },
        LspDefinition {
            id: "lua-language-server",
            name: "Lua",
            version: "3.13.6",
            extensions: &["lua"],
            executable_name: "lua-language-server",
            launch_args: &[],
            initialization_options: "{}",
            install: InstallMethod::GitHubRelease {
                repo: "LuaLS/lua-language-server",
                asset_pattern: "lua-language-server-{os}-{arch}.tar.gz",
            },
        },
        LspDefinition {
            id: "yaml-language-server",
            name: "YAML",
            version: "1.17.0",
            extensions: &["yaml", "yml"],
            executable_name: "yaml-language-server",
            launch_args: &["--stdio"],
            initialization_options: "{}",
            install: InstallMethod::Npm {
                package: "yaml-language-server",
                bin: "yaml-language-server",
            },
        },
        LspDefinition {
            id: "taplo",
            name: "TOML",
            version: "0.9.3",
            extensions: &["toml"],
            executable_name: "taplo",
            launch_args: &["lsp", "stdio"],
            initialization_options: "{}",
            install: InstallMethod::GitHubRelease {
                repo: "tamasfe/taplo",
                asset_pattern: "taplo-{arch}-{os}.gz",
            },
        },
    ]
}

pub fn find_by_extension<'a>(
    registry: &'a [LspDefinition],
    extension: &str,
) -> Option<&'a LspDefinition> {
    let ext = extension.trim_start_matches('.').to_ascii_lowercase();
    registry.iter().find(|definition| {
        definition
            .extensions
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(&ext))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_ts_extension() {
        let registry = builtin_lsp_registry();
        let def = find_by_extension(&registry, "tsx").expect("tsx should be registered");
        assert_eq!(def.id, "typescript-language-server");
    }
}
