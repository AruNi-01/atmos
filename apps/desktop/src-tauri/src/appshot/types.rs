use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppshotPlatform {
    Macos,
    Windows,
    Linux,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppshotQuality {
    ScreenshotAndAccessibility,
    ScreenshotOnly,
    AccessibilityOnly,
    MetadataOnly,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotPendingPreview {
    pub preview_id: String,
    pub app_name: String,
    pub window_title: Option<String>,
    pub captured_at: String,
    pub quality: AppshotQuality,
    pub screenshot_preview_base64: Option<String>,
    pub permissions: Vec<AppshotPermissionState>,
    pub warnings: Vec<String>,
    pub expires_in_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotStatus {
    pub supported: bool,
    pub platform: AppshotPlatform,
    pub reason: Option<String>,
    pub trigger: AppshotTriggerStatus,
    pub permissions: Vec<AppshotPermissionState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotAcceptResponse {
    pub timestamp: String,
    pub record_dir: String,
    pub protocol_text: String,
    pub metadata: AppshotRecordMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotCopyResponse {
    pub timestamp: String,
    pub protocol_text: String,
    pub copied: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotReadRecordsRequest {
    pub timestamps: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotPendingAutoAcceptRequest {
    pub preview_id: String,
    pub held: bool,
    pub resume_in_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotRecordListItem {
    pub timestamp: String,
    pub record_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotRecordDetail {
    pub timestamp: String,
    pub metadata: AppshotRecordMetadata,
    pub context_preview: String,
    pub snapshot_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotRecordMetadata {
    pub timestamp: String,
    pub captured_at: String,
    pub platform: AppshotPlatform,
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub process_id: Option<u32>,
    pub window_title: Option<String>,
    pub window_id: Option<String>,
    pub quality: AppshotQuality,
    pub record_dir: String,
    pub snapshot_path: String,
    pub context_path: String,
    pub metadata_path: String,
    pub screenshot: AppshotScreenshotMetadata,
    pub warnings: Vec<String>,
    pub context_bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotScreenshotMetadata {
    pub available: bool,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub media_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppshotPermissionName {
    Accessibility,
    ScreenRecording,
    InputMonitoring,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppshotSettingsTarget {
    Accessibility,
    ScreenRecording,
    InputMonitoring,
    PrivacySecurity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotPermissionRecoveryAction {
    pub label: String,
    pub target: AppshotSettingsTarget,
    pub manual_steps: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotPermissionState {
    pub name: AppshotPermissionName,
    pub display_name: String,
    pub granted: bool,
    pub required_for: Vec<String>,
    pub recovery_action: Option<AppshotPermissionRecoveryAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotOpenPermissionsRequest {
    pub target: AppshotSettingsTarget,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppshotTriggerMode {
    MacosModifierGesture,
    RegularHotkeyFallback,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppshotTriggerStatus {
    pub mode: AppshotTriggerMode,
    pub enabled: bool,
    pub required_modifiers: Vec<String>,
    pub last_error: Option<String>,
    pub permissions: Vec<AppshotPermissionState>,
}

#[derive(Debug, Clone)]
pub struct CapturedAppshot {
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub process_id: Option<u32>,
    pub window_title: Option<String>,
    pub window_id: Option<String>,
    pub captured_at: String,
    pub platform: AppshotPlatform,
    pub quality: AppshotQuality,
    pub screenshot_png: Vec<u8>,
    pub screenshot: AppshotScreenshotMetadata,
    pub context_markdown: String,
    pub permissions: Vec<AppshotPermissionState>,
    pub warnings: Vec<String>,
}
