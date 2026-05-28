export type AppshotPlatform = "macos" | "windows" | "linux" | "unknown";

export type AppshotQuality =
  | "screenshot_and_accessibility"
  | "screenshot_only"
  | "accessibility_only"
  | "metadata_only"
  | "unsupported";

export type AppshotPermissionName =
  | "accessibility"
  | "screen_recording";

export type AppshotSettingsTarget =
  | "accessibility"
  | "screen_recording"
  | "privacy_security";

export type AppshotTriggerMode =
  | "macos_modifier_gesture"
  | "regular_hotkey_fallback"
  | "unsupported";

export type AppshotPermissionRecoveryAction = {
  label: string;
  target: AppshotSettingsTarget;
  manual_steps: string[];
};

export type AppshotPermissionState = {
  name: AppshotPermissionName;
  display_name: string;
  granted: boolean;
  required_for: string[];
  recovery_action: AppshotPermissionRecoveryAction | null;
};

export type AppshotTriggerStatus = {
  mode: AppshotTriggerMode;
  enabled: boolean;
  required_modifiers: string[];
  last_error: string | null;
  permissions: AppshotPermissionState[];
};

export type AppshotStatus = {
  supported: boolean;
  platform: AppshotPlatform;
  reason: string | null;
  trigger: AppshotTriggerStatus;
  permissions: AppshotPermissionState[];
};

export type AppshotPendingPreview = {
  preview_id: string;
  app_name: string;
  window_title: string | null;
  captured_at: string;
  quality: AppshotQuality;
  screenshot_preview_base64: string | null;
  permissions?: AppshotPermissionState[] | null;
  warnings: string[];
  expires_in_ms: number;
};

export type AppshotPendingAutoAcceptRequest = {
  preview_id: string;
  held: boolean;
  resume_in_ms: number | null;
};

export type AppshotScreenshotMetadata = {
  available: boolean;
  width: number | null;
  height: number | null;
  media_type: string;
};

export type AppshotRecordMetadata = {
  timestamp: string;
  captured_at: string;
  platform: AppshotPlatform;
  app_name: string;
  bundle_id: string | null;
  process_id: number | null;
  window_title: string | null;
  window_id: string | null;
  quality: AppshotQuality;
  record_dir: string;
  snapshot_path: string;
  context_path: string;
  metadata_path: string;
  screenshot: AppshotScreenshotMetadata;
  warnings: string[];
  context_bytes: number;
};

export type AppshotAcceptResponse = {
  timestamp: string;
  record_dir: string;
  protocol_text: string;
  metadata: AppshotRecordMetadata;
};

export type AppshotCopyResponse = {
  timestamp: string;
  protocol_text: string;
  copied: boolean;
};

export type AppshotRecordListItem = {
  timestamp: string;
  record_dir: string;
};

export type AppshotRecordDetail = {
  timestamp: string;
  metadata: AppshotRecordMetadata;
  context_preview: string;
  snapshot_url: string | null;
};

export type AppshotReadRecordsRequest = {
  timestamps: string[];
};

export type AppshotOpenPermissionsRequest = {
  target: AppshotSettingsTarget;
};

export type AppshotRecordSummary = {
  timestamp: string;
  appLabel: string;
  capturedAtLabel: string;
  qualityLabel: string;
  title: string;
};
