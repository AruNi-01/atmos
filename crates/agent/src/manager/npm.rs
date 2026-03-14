use anyhow::Context;
use tokio::process::Command;

use crate::models::{AgentInstallResult, KnownAgent, RegistryInstallResult};

use super::manifest::{
    load_install_manifest, save_install_manifest, upsert_manifest_entry, with_manifest,
    ManifestEntry,
};
use super::registry::{fetch_acp_registry, RegistryEntry, RegistryPackageDistribution};
use super::{AgentError, Result};

pub(crate) async fn is_npm_package_installed_globally(package_spec: &str) -> Result<bool> {
    let pkg_name = normalize_npm_package_name(package_spec);
    let output = Command::new("npm")
        .arg("list")
        .arg("-g")
        .arg("--depth=0")
        .arg("--json")
        .output()
        .await
        .map_err(|e| AgentError::Command(format!("failed to run npm list -g: {}", e)))?;

    if !output.status.success() {
        return Ok(false);
    }

    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AgentError::Command(format!("failed to parse npm list output: {}", e)))?;
    if let Some(map) = value.get("dependencies").and_then(|v| v.as_object()) {
        if map.contains_key(&pkg_name) {
            return Ok(true);
        }
    }
    Ok(false)
}

pub(crate) async fn list_global_npm_packages() -> Result<std::collections::HashMap<String, String>>
{
    let output = Command::new("npm")
        .arg("list")
        .arg("-g")
        .arg("--depth=0")
        .arg("--json")
        .output()
        .await
        .map_err(|e| AgentError::Command(format!("failed to run npm list -g: {}", e)))?;

    if !output.status.success() {
        return Ok(std::collections::HashMap::new());
    }

    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AgentError::Command(format!("failed to parse npm list output: {}", e)))?;
    let mut map = std::collections::HashMap::new();
    if let Some(deps) = value.get("dependencies").and_then(|v| v.as_object()) {
        for (key, dep) in deps {
            if let Some(version) = dep.get("version").and_then(|v| v.as_str()) {
                map.insert(key.to_string(), version.to_string());
            } else {
                map.insert(key.to_string(), "unknown".to_string());
            }
        }
    }
    Ok(map)
}

pub(crate) fn normalize_npm_package_name(spec: &str) -> String {
    if spec.starts_with('@') {
        if let Some(pos) = spec.rfind('@') {
            if pos > 0 && spec[..pos].contains('/') {
                return spec[..pos].to_string();
            }
        }
        return spec.to_string();
    }
    spec.split('@').next().unwrap_or(spec).to_string()
}

pub(crate) fn npx_command_preview(spec: &RegistryPackageDistribution) -> String {
    let mut parts = vec!["npx".to_string(), spec.package.clone()];
    if let Some(args) = &spec.args {
        parts.extend(args.iter().cloned());
    }
    parts.join(" ")
}

pub(crate) async fn try_install_from_registry_index(
    agent: &KnownAgent,
) -> Result<Option<AgentInstallResult>> {
    let registry = match fetch_acp_registry(false).await {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };

    let entry = match registry
        .agents
        .into_iter()
        .find(|a| a.id == agent.registry_id)
    {
        Some(v) => v,
        None => return Ok(None),
    };

    if let Some(npx) = entry.distribution.npx {
        let output = Command::new("npm")
            .arg("install")
            .arg("-g")
            .arg(&npx.package)
            .output()
            .await
            .with_context(|| "failed to run npm install from registry package")
            .map_err(|e| AgentError::Command(e.to_string()))?;

        if output.status.success() {
            return Ok(Some(AgentInstallResult {
                id: agent.id,
                installed: true,
                install_method: "acp_registry".to_string(),
                message: format!(
                    "Installed {} via ACP Registry package {}",
                    agent.name, npx.package
                ),
            }));
        }
    }

    Ok(None)
}

pub(crate) async fn install_npm_agent(agent: &KnownAgent) -> Result<AgentInstallResult> {
    let output = Command::new("npm")
        .arg("install")
        .arg("-g")
        .arg(&agent.npm_package)
        .output()
        .await
        .with_context(|| "failed to run npm install")
        .map_err(|e| AgentError::Command(e.to_string()))?;

    if output.status.success() {
        return Ok(AgentInstallResult {
            id: agent.id,
            installed: true,
            install_method: "npm".to_string(),
            message: format!("Installed {}", agent.name),
        });
    }

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Err(AgentError::Command(format!(
        "npm install failed for {}: {}",
        agent.name, stderr
    )))
}

pub(crate) async fn install_registry_npx_agent(
    entry: &RegistryEntry,
    registry_id: &str,
    npx_package: &str,
    force_overwrite: bool,
) -> Result<RegistryInstallResult> {
    if !force_overwrite
        && is_npm_package_installed_globally(npx_package)
            .await
            .unwrap_or(false)
    {
        return Ok(RegistryInstallResult {
            registry_id: registry_id.to_string(),
            installed: false,
            install_method: "npx".to_string(),
            message: String::new(),
            needs_confirmation: Some(true),
            overwrite_message: Some(format!(
                "{} ({}) is already installed globally via npm. Install will overwrite/update. Continue?",
                entry.name,
                normalize_npm_package_name(npx_package)
            )),
        });
    }

    // Check if there's an old package to uninstall (package name changed)
    let mut uninstalled_old_package = None;
    let manifest = load_install_manifest().unwrap_or_default();
    let new_package_name = normalize_npm_package_name(npx_package);
    if let Some(old_entry) = manifest
        .registry
        .iter()
        .find(|e| e.registry_id == registry_id && e.install_method == "npx")
    {
        if let Some(ref old_package) = old_entry.npm_package {
            if old_package != &new_package_name {
                let output = Command::new("npm")
                    .arg("uninstall")
                    .arg("-g")
                    .arg(old_package)
                    .output()
                    .await
                    .with_context(|| "failed to run npm uninstall for old package")
                    .map_err(|e| AgentError::Command(e.to_string()))?;

                if output.status.success() {
                    uninstalled_old_package = Some(old_package.clone());
                }
            }
        }
    }

    let output = Command::new("npm")
        .arg("install")
        .arg("-g")
        .arg(npx_package)
        .output()
        .await
        .with_context(|| "failed to run npm install from registry package")
        .map_err(|e| AgentError::Command(e.to_string()))?;

    if output.status.success() {
        let installed_version = list_global_npm_packages()
            .await
            .ok()
            .and_then(|pkgs| pkgs.get(&new_package_name).cloned());

        let reg_id = registry_id.to_string();
        let pkg_name = new_package_name.clone();
        let ver = installed_version.clone();
        let _ = with_manifest(|manifest| {
            let existing_default = manifest
                .registry
                .iter()
                .find(|e| e.registry_id == reg_id && e.install_method == "npx")
                .and_then(|e| e.default_config.clone());

            upsert_manifest_entry(
                manifest,
                ManifestEntry {
                    registry_id: reg_id,
                    install_method: "npx".to_string(),
                    binary_path: None,
                    npm_package: Some(pkg_name),
                    installed_version: ver,
                    default_config: existing_default,
                },
            );
            Ok(())
        });

        let message = if let Some(old_package) = uninstalled_old_package {
            format!("Upgraded from {} to {}", old_package, npx_package)
        } else {
            format!("Installed {} ({})", entry.name, npx_package)
        };

        return Ok(RegistryInstallResult {
            registry_id: registry_id.to_string(),
            installed: true,
            install_method: "acp_registry".to_string(),
            message,
            needs_confirmation: None,
            overwrite_message: None,
        });
    }

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Err(AgentError::Command(format!(
        "registry install failed for {}: {}",
        entry.name, stderr
    )))
}

pub(crate) async fn remove_registry_npx_agent(registry_id: &str) -> Result<RegistryInstallResult> {
    let manifest = load_install_manifest().unwrap_or_default();

    let manifest_entry = manifest
        .registry
        .iter()
        .find(|e| e.registry_id == registry_id && e.install_method == "npx");

    let (package, registry_entry_for_message) = if let Some(entry) = manifest_entry {
        if let Some(ref pkg) = entry.npm_package {
            let registry = fetch_acp_registry(false).await?;
            let registry_entry = registry.agents.iter().find(|a| a.id == registry_id);
            (pkg.clone(), registry_entry.cloned())
        } else {
            let registry = fetch_acp_registry(false).await?;
            let r_entry = registry
                .agents
                .into_iter()
                .find(|a| a.id == registry_id)
                .ok_or_else(|| AgentError::NotFound(format!("registry agent: {}", registry_id)))?;
            let npx = r_entry.distribution.npx.as_ref().ok_or_else(|| {
                AgentError::Command(format!(
                    "registry agent '{}' has no npx distribution",
                    registry_id
                ))
            })?;
            (normalize_npm_package_name(&npx.package), Some(r_entry))
        }
    } else {
        return Err(AgentError::NotFound(format!(
            "no install found for: {}",
            registry_id
        )));
    };

    let reg_id = registry_id.to_string();
    let _ = with_manifest(|manifest| {
        manifest
            .registry
            .retain(|e| !(e.registry_id == reg_id && e.install_method == "npx"));
        Ok(())
    });

    let output = Command::new("npm")
        .arg("uninstall")
        .arg("-g")
        .arg(&package)
        .output()
        .await
        .with_context(|| "failed to run npm uninstall from registry package")
        .map_err(|e| AgentError::Command(e.to_string()))?;

    if output.status.success() {
        let name = registry_entry_for_message
            .as_ref()
            .map(|e| e.name.as_str())
            .unwrap_or(registry_id);
        return Ok(RegistryInstallResult {
            registry_id: registry_id.to_string(),
            installed: false,
            install_method: "acp_registry".to_string(),
            message: format!("Removed {} ({})", name, package),
            needs_confirmation: None,
            overwrite_message: None,
        });
    }

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let name = registry_entry_for_message
        .as_ref()
        .map(|e| e.name.as_str())
        .unwrap_or(registry_id);
    Err(AgentError::Command(format!(
        "registry remove failed for {}: {}",
        name, stderr
    )))
}
