use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use chrono::{DateTime, Utc};
use clap::Args;
use runtime_manager::{
    fetch_latest_cli_release, install_cli_release, version_gt, LatestCliRelease,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const CHECK_INTERVAL_HOURS: i64 = 24;
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Args)]
pub struct UpdateArgs {
    /// Check for updates without installing.
    #[arg(long, default_value_t = false)]
    pub check: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UpdateCheckCache {
    checked_at: String,
    latest_version: String,
    latest_tag: String,
    release_url: String,
}

pub async fn execute(args: UpdateArgs) -> Result<Value, String> {
    let latest = fetch_latest_cli_release().await?;
    write_update_cache(&latest);
    let update_available = version_gt(&latest.version, CURRENT_VERSION);

    if args.check {
        return Ok(json!({
            "ok": true,
            "current_version": CURRENT_VERSION,
            "latest_version": latest.version,
            "latest_tag": latest.tag,
            "release_url": latest.url,
            "update_available": update_available,
        }));
    }

    if !update_available {
        return Ok(json!({
            "ok": true,
            "action": "already_up_to_date",
            "current_version": CURRENT_VERSION,
            "latest_version": latest.version,
            "latest_tag": latest.tag,
            "release_url": latest.url,
        }));
    }

    let install = install_cli_release(&latest).await?;

    Ok(json!({
        "ok": true,
        "action": "updated",
        "from_version": CURRENT_VERSION,
        "to_version": install.version,
        "latest_tag": latest.tag,
        "installed_path": install.install_path.to_string_lossy(),
        "install_method": install.install_method,
    }))
}

pub async fn update_hint_if_needed() -> Option<String> {
    if std::env::var_os("ATMOS_NO_UPDATE_CHECK").is_some() {
        return None;
    }

    let latest = match read_fresh_update_cache() {
        Some(cache) => LatestCliRelease {
            version: cache.latest_version,
            tag: cache.latest_tag,
            url: cache.release_url,
            asset_url: None,
        },
        None => {
            let latest = tokio::time::timeout(Duration::from_secs(2), fetch_latest_cli_release())
                .await
                .ok()?
                .ok()?;
            write_update_cache(&latest);
            latest
        }
    };

    if !version_gt(&latest.version, CURRENT_VERSION) {
        return None;
    }

    Some(format!(
        "\x1b[32mA new Atmos CLI version is available: {} -> {}. Run `atmos update` to update.\x1b[0m",
        CURRENT_VERSION, latest.version
    ))
}

fn cache_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| {
        home.join(".atmos")
            .join("state")
            .join("cli")
            .join("update-check.json")
    })
}

fn read_fresh_update_cache() -> Option<UpdateCheckCache> {
    let path = cache_path()?;
    let content = fs::read_to_string(path).ok()?;
    let cache = serde_json::from_str::<UpdateCheckCache>(&content).ok()?;
    let checked_at = DateTime::parse_from_rfc3339(&cache.checked_at)
        .ok()?
        .with_timezone(&Utc);
    if Utc::now().signed_duration_since(checked_at).num_hours() < CHECK_INTERVAL_HOURS {
        return Some(cache);
    }
    None
}

fn write_update_cache(latest: &LatestCliRelease) {
    let Some(path) = cache_path() else {
        return;
    };
    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    let cache = UpdateCheckCache {
        checked_at: Utc::now().to_rfc3339(),
        latest_version: latest.version.clone(),
        latest_tag: latest.tag.clone(),
        release_url: latest.url.clone(),
    };
    let Ok(content) = serde_json::to_string_pretty(&cache) else {
        return;
    };
    let _ = fs::write(path, content);
}
