use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use core_engine::{
    serve_emu_key, serve_emu_screenshot, serve_emu_swipe, serve_emu_tap, serve_emu_text,
    serve_sim_button, serve_sim_swipe, serve_sim_tap, serve_sim_type, simctl_screenshot,
    validate_point, DevicePlatform, EngineError, ScreenshotSize,
};
use serde::{Deserialize, Serialize};

use super::service::DevicePreviewService;
use super::types::{DeviceClaim, HelperKind};
use crate::service::project::ProjectService;
use crate::service::workspace::WorkspaceService;

const DEFAULT_SWIPE_DURATION_MS: u32 = 300;
const MAX_SWIPE_DURATION_MS: u32 = 10_000;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum DeviceControlError {
    #[error("no live Device Preview claim for this workspace")]
    NoClaim,
    #[error("unknown device {udid}")]
    DeviceUnknown { udid: String },
    #[error("device {udid} is claimed by workspace {owner_workspace_id}")]
    ClaimedByOtherWorkspace {
        udid: String,
        owner_workspace_id: String,
    },
    #[error("platform mismatch for {udid}")]
    PlatformMismatch {
        requested: DevicePlatform,
        actual: DevicePlatform,
        udid: String,
    },
    #[error("ambiguous device")]
    AmbiguousDevice,
    #[error("unsupported key on this platform")]
    UnsupportedOnPlatform {
        key: PressKey,
        platform: DevicePlatform,
    },
    #[error("invalid coords")]
    InvalidCoords,
    #[error("empty text")]
    EmptyText,
    #[error("helper unreachable: {0}")]
    HelperUnreachable(String),
}

impl DeviceControlError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NoClaim => "NO_CLAIM",
            Self::DeviceUnknown { .. } => "DEVICE_UNKNOWN",
            Self::ClaimedByOtherWorkspace { .. } => "CLAIMED_BY_OTHER_WORKSPACE",
            Self::PlatformMismatch { .. } => "PLATFORM_MISMATCH",
            Self::AmbiguousDevice => "AMBIGUOUS_DEVICE",
            Self::UnsupportedOnPlatform { .. } => "UNSUPPORTED_ON_PLATFORM",
            Self::InvalidCoords => "INVALID_COORDS",
            Self::EmptyText => "EMPTY_TEXT",
            Self::HelperUnreachable(_) => "HELPER_UNREACHABLE",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PressKey {
    Home,
    Back,
    Recents,
}

impl PressKey {
    fn as_android_key(self) -> &'static str {
        match self {
            Self::Home => "home",
            Self::Back => "back",
            Self::Recents => "recents",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SimulatorDeviceHandle {
    pub udid: String,
    pub name: String,
    pub platform: DevicePlatform,
    pub helper: HelperKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SimulatorScreenshotResult {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub udid: String,
    pub name: String,
    pub platform: DevicePlatform,
    pub helper: HelperKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SimulatorControlAck {
    pub ok: bool,
    pub udid: String,
    pub name: String,
    pub platform: DevicePlatform,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SimulatorClaimListItem {
    pub udid: String,
    pub name: String,
    pub platform: DevicePlatform,
    pub helper: HelperKind,
    pub workspace_id: String,
    pub workspace_name: String,
    pub project_id: String,
    pub project_name: String,
    pub current: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SimulatorClaimList {
    pub devices: Vec<SimulatorClaimListItem>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ClaimOwner {
    pub workspace_name: String,
    pub project_id: String,
    pub project_name: String,
}

#[async_trait]
pub trait ClaimOwnerLookup: Send + Sync {
    async fn owner(&self, workspace_id: &str) -> ClaimOwner;
}

#[derive(Debug, Default, Clone)]
pub struct MapClaimOwnerLookup {
    inner: HashMap<String, ClaimOwner>,
}

impl MapClaimOwnerLookup {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&mut self, workspace_id: impl Into<String>, owner: ClaimOwner) {
        self.inner.insert(workspace_id.into(), owner);
    }
}

#[async_trait]
impl ClaimOwnerLookup for MapClaimOwnerLookup {
    async fn owner(&self, workspace_id: &str) -> ClaimOwner {
        self.inner.get(workspace_id).cloned().unwrap_or_default()
    }
}

pub struct WorkspaceProjectOwnerLookup {
    workspaces: Arc<WorkspaceService>,
    projects: Arc<ProjectService>,
}

impl WorkspaceProjectOwnerLookup {
    pub fn new(workspaces: Arc<WorkspaceService>, projects: Arc<ProjectService>) -> Self {
        Self {
            workspaces,
            projects,
        }
    }
}

#[async_trait]
impl ClaimOwnerLookup for WorkspaceProjectOwnerLookup {
    async fn owner(&self, workspace_id: &str) -> ClaimOwner {
        let Ok(Some(ws)) = self
            .workspaces
            .get_workspace(workspace_id.to_string())
            .await
        else {
            return ClaimOwner::default();
        };
        let workspace_name = match ws.model.display_name.as_deref() {
            Some(name) if !name.is_empty() => name.to_string(),
            _ => ws.model.name.clone(),
        };
        let project_id = ws.model.project_guid;
        let project_name = if project_id.is_empty() {
            String::new()
        } else {
            self.projects
                .get_project(project_id.clone())
                .await
                .ok()
                .flatten()
                .map(|project| project.name)
                .unwrap_or_default()
        };
        ClaimOwner {
            workspace_name,
            project_id,
            project_name,
        }
    }
}

pub struct DevicePreviewSwipeInput<'a> {
    pub workspace_id: &'a str,
    pub udid: Option<&'a str>,
    pub platform: Option<DevicePlatform>,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub duration_ms: Option<u32>,
}

pub struct DeviceControlService {
    preview: Arc<DevicePreviewService>,
    owners: Arc<dyn ClaimOwnerLookup>,
}

impl DeviceControlService {
    pub fn new(preview: Arc<DevicePreviewService>, owners: Arc<dyn ClaimOwnerLookup>) -> Self {
        Self { preview, owners }
    }

    pub async fn resolve_target(
        &self,
        workspace_id: &str,
        udid: Option<&str>,
        platform: Option<DevicePlatform>,
    ) -> Result<DeviceClaim, DeviceControlError> {
        if let Some(udid) = udid {
            let live = self.preview.claims().await;
            let claim = live
                .into_iter()
                .find(|claim| claim.udid == udid || claim.argv_id == udid)
                .ok_or_else(|| DeviceControlError::DeviceUnknown {
                    udid: udid.to_string(),
                })?;
            if claim.workspace_id != workspace_id {
                return Err(DeviceControlError::ClaimedByOtherWorkspace {
                    udid: udid.to_string(),
                    owner_workspace_id: claim.workspace_id,
                });
            }
            if let Some(requested) = platform {
                if claim.platform != requested {
                    return Err(DeviceControlError::PlatformMismatch {
                        requested,
                        actual: claim.platform,
                        udid: claim.udid.clone(),
                    });
                }
            }
            return Ok(claim);
        }

        let mine = self
            .preview
            .status(workspace_id)
            .await
            .ok_or(DeviceControlError::NoClaim)?;
        if let Some(requested) = platform {
            if mine.platform != requested {
                return Err(DeviceControlError::PlatformMismatch {
                    requested,
                    actual: mine.platform,
                    udid: mine.udid.clone(),
                });
            }
        }
        Ok(mine)
    }

    pub async fn list(&self, workspace_id: Option<&str>) -> SimulatorClaimList {
        let live = self.preview.claims().await;
        let mut devices = Vec::with_capacity(live.len());
        for claim in live {
            let owner = self.owners.owner(&claim.workspace_id).await;
            let current = workspace_id
                .map(|id| id == claim.workspace_id)
                .unwrap_or(false);
            devices.push(SimulatorClaimListItem {
                udid: claim.udid,
                name: claim.name,
                platform: claim.platform,
                helper: claim.helper,
                workspace_id: claim.workspace_id,
                workspace_name: owner.workspace_name,
                project_id: owner.project_id,
                project_name: owner.project_name,
                current,
            });
        }
        SimulatorClaimList { devices }
    }

    pub async fn screenshot(
        &self,
        workspace_id: &str,
        udid: Option<&str>,
        platform: Option<DevicePlatform>,
        out: Option<&str>,
    ) -> Result<SimulatorScreenshotResult, DeviceControlError> {
        let claim = self.resolve_target(workspace_id, udid, platform).await?;
        let dest = screenshot_dest(self.preview.paths(), workspace_id, out)?;
        let size = match claim.helper {
            HelperKind::ServeSim => {
                let dest = dest.clone();
                let udid = claim.udid.clone();
                spawn_blocking(move || simctl_screenshot(&udid, dest)).await?
            }
            HelperKind::ServeEmu => serve_emu_screenshot(claim.port, &dest)
                .await
                .map_err(map_engine)?,
        };
        Ok(screenshot_result(&claim, dest, size))
    }

    pub async fn tap(
        &self,
        workspace_id: &str,
        udid: Option<&str>,
        platform: Option<DevicePlatform>,
        x: f64,
        y: f64,
    ) -> Result<SimulatorControlAck, DeviceControlError> {
        let claim = self.resolve_target(workspace_id, udid, platform).await?;
        require_point(x, y)?;
        match claim.helper {
            HelperKind::ServeSim => {
                let bin = self.require_serve_sim_bin()?;
                let udid = claim.udid.clone();
                spawn_blocking(move || serve_sim_tap(bin, &udid, x, y)).await?;
            }
            HelperKind::ServeEmu => serve_emu_tap(claim.port, x, y).await.map_err(map_engine)?,
        }
        Ok(ack(&claim))
    }

    pub async fn swipe(
        &self,
        input: DevicePreviewSwipeInput<'_>,
    ) -> Result<SimulatorControlAck, DeviceControlError> {
        let claim = self
            .resolve_target(input.workspace_id, input.udid, input.platform)
            .await?;
        require_point(input.x1, input.y1)?;
        require_point(input.x2, input.y2)?;
        let duration_ms = clamp_swipe_duration(input.duration_ms);
        let DevicePreviewSwipeInput { x1, y1, x2, y2, .. } = input;
        match claim.helper {
            HelperKind::ServeSim => {
                let bin = self.require_serve_sim_bin()?;
                let udid = claim.udid.clone();
                spawn_blocking(move || serve_sim_swipe(bin, &udid, x1, y1, x2, y2)).await?;
            }
            HelperKind::ServeEmu => serve_emu_swipe(claim.port, x1, y1, x2, y2, Some(duration_ms))
                .await
                .map_err(map_engine)?,
        }
        Ok(ack(&claim))
    }

    pub async fn type_text(
        &self,
        workspace_id: &str,
        udid: Option<&str>,
        platform: Option<DevicePlatform>,
        text: &str,
    ) -> Result<SimulatorControlAck, DeviceControlError> {
        let claim = self.resolve_target(workspace_id, udid, platform).await?;
        if text.is_empty() {
            return Err(DeviceControlError::EmptyText);
        }
        match claim.helper {
            HelperKind::ServeSim => {
                let bin = self.require_serve_sim_bin()?;
                let udid = claim.udid.clone();
                let text = text.to_string();
                spawn_blocking(move || serve_sim_type(bin, &udid, &text)).await?;
            }
            HelperKind::ServeEmu => serve_emu_text(claim.port, text).await.map_err(map_engine)?,
        }
        Ok(ack(&claim))
    }

    pub async fn press(
        &self,
        workspace_id: &str,
        udid: Option<&str>,
        platform: Option<DevicePlatform>,
        key: PressKey,
    ) -> Result<SimulatorControlAck, DeviceControlError> {
        let claim = self.resolve_target(workspace_id, udid, platform).await?;
        match (key, claim.platform) {
            (PressKey::Home, _) => {}
            (PressKey::Back | PressKey::Recents, DevicePlatform::Android) => {}
            (key, platform) => {
                return Err(DeviceControlError::UnsupportedOnPlatform { key, platform });
            }
        }
        match claim.helper {
            HelperKind::ServeSim => {
                let bin = self.require_serve_sim_bin()?;
                let udid = claim.udid.clone();
                spawn_blocking(move || serve_sim_button(bin, &udid, "home")).await?;
            }
            HelperKind::ServeEmu => serve_emu_key(claim.port, key.as_android_key())
                .await
                .map_err(map_engine)?,
        }
        Ok(ack(&claim))
    }

    fn require_serve_sim_bin(&self) -> Result<PathBuf, DeviceControlError> {
        let bin = self.preview.serve_sim_binary();
        if bin.is_file() {
            Ok(bin)
        } else {
            Err(DeviceControlError::HelperUnreachable(format!(
                "serve-sim binary missing: {}",
                bin.display()
            )))
        }
    }
}

fn clamp_swipe_duration(duration_ms: Option<u32>) -> u32 {
    duration_ms
        .unwrap_or(DEFAULT_SWIPE_DURATION_MS)
        .min(MAX_SWIPE_DURATION_MS)
}

fn require_point(x: f64, y: f64) -> Result<(), DeviceControlError> {
    validate_point(x, y)
        .map(|_| ())
        .map_err(|_| DeviceControlError::InvalidCoords)
}

fn map_engine(err: EngineError) -> DeviceControlError {
    let msg = err.to_string();
    if msg.contains("invalid coords") {
        DeviceControlError::InvalidCoords
    } else {
        DeviceControlError::HelperUnreachable(msg)
    }
}

async fn spawn_blocking<T, F>(f: F) -> Result<T, DeviceControlError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, EngineError> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|err| DeviceControlError::HelperUnreachable(err.to_string()))?
        .map_err(map_engine)
}

fn screenshot_dest(
    paths: &super::paths::DevicePreviewPaths,
    workspace_id: &str,
    out: Option<&str>,
) -> Result<PathBuf, DeviceControlError> {
    let dest = match out {
        Some(path) => PathBuf::from(path),
        None => {
            let dir = paths.device_preview_tmp(workspace_id);
            let ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            dir.join(format!("screenshot-{ms}.png"))
        }
    };
    if let Some(parent) = dest.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent).map_err(|err| {
            DeviceControlError::HelperUnreachable(format!(
                "failed to create screenshot dir {}: {err}",
                parent.display()
            ))
        })?;
    }
    Ok(dest)
}

fn ack(claim: &DeviceClaim) -> SimulatorControlAck {
    SimulatorControlAck {
        ok: true,
        udid: claim.udid.clone(),
        name: claim.name.clone(),
        platform: claim.platform,
    }
}

fn screenshot_result(
    claim: &DeviceClaim,
    dest: PathBuf,
    size: ScreenshotSize,
) -> SimulatorScreenshotResult {
    SimulatorScreenshotResult {
        path: dest.to_string_lossy().into_owned(),
        width: size.width,
        height: size.height,
        udid: claim.udid.clone(),
        name: claim.name.clone(),
        platform: claim.platform,
        helper: claim.helper,
    }
}

#[cfg(test)]
mod duration_tests {
    use super::clamp_swipe_duration;

    #[test]
    fn swipe_duration_defaults_and_caps() {
        assert_eq!(clamp_swipe_duration(None), 300);
        assert_eq!(clamp_swipe_duration(Some(350)), 350);
        assert_eq!(clamp_swipe_duration(Some(10_000)), 10_000);
        assert_eq!(clamp_swipe_duration(Some(10_001)), 10_000);
    }
}
