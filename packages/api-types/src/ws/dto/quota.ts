export type QuotaOverviewRequest = {
  refresh?: boolean;
  provider_id?: string | null;
};

export type QuotaProviderSwitchRequest = {
  provider_id: string;
  enabled: boolean;
};

export type QuotaAllProvidersSwitchRequest = {
  enabled: boolean;
};

export type QuotaProviderVisibilityPref = {
  provider_id: string;
  switch_enabled: boolean;
  footer_carousel_show: boolean;
};

export type QuotaApplyProviderVisibilityRequest = {
  providers: QuotaProviderVisibilityPref[];
};

export type QuotaProviderManualSetupRequest = {
  provider_id: string;
  region?: string | null;
  api_key?: string | null;
};

export type QuotaAddProviderApiKeyRequest = {
  provider_id: string;
  region?: string | null;
  api_key: string;
};

export type QuotaDeleteProviderApiKeyRequest = {
  provider_id: string;
  key_id: string;
};

export type QuotaAutoRefreshRequest = {
  interval_minutes?: number | null;
};

export type QuotaDetailRowTone =
  | "default"
  | "muted"
  | "success"
  | "warning"
  | "danger";
export type QuotaProviderKind = "cli" | "desktop" | "api" | "hybrid";
export type QuotaAuthStateStatus = "detected" | "missing" | "unsupported";
export type QuotaFetchStateStatus =
  | "ready"
  | "unavailable"
  | "partial"
  | "error"
  | "unsupported";

export type QuotaDetailRowResponse = {
  label: string;
  value: string;
  tone: QuotaDetailRowTone;
};

export type QuotaDetailSectionResponse = {
  title: string;
  rows: QuotaDetailRowResponse[];
};

export type QuotaAuthStateResponse = {
  status: QuotaAuthStateStatus;
  source: string | null;
  detail: string | null;
  setup_hint: string | null;
};

export type QuotaFetchStateResponse = {
  status: QuotaFetchStateStatus;
  message: string | null;
};

export type QuotaManualSetupOptionResponse = {
  value: string;
  label: string;
};

export type QuotaConfiguredApiKey = {
  id: string;
  region: string | null;
};

export type QuotaManualSetupResponse = {
  selected_region: string | null;
  region_options: QuotaManualSetupOptionResponse[];
  api_key_configured: boolean;
  configured_keys: QuotaConfiguredApiKey[];
};

export type QuotaSubscriptionSummaryResponse = {
  plan_label: string | null;
  window_label: string | null;
  credits_label: string | null;
  billing_state: string | null;
  reset_at: number | null;
};

export type QuotaSummaryResponse = {
  unit: string | null;
  currency: string | null;
  used: number | null;
  remaining: number | null;
  cap: number | null;
  percent: number | null;
  used_label: string | null;
  remaining_label: string | null;
  cap_label: string | null;
};

export type QuotaProviderResponse = {
  id: string;
  label: string;
  kind: QuotaProviderKind;
  enabled: boolean;
  switch_enabled: boolean;
  footer_carousel_show: boolean;
  healthy: boolean;
  last_updated_at: number | null;
  subscription_summary: QuotaSubscriptionSummaryResponse | null;
  usage_summary: QuotaSummaryResponse | null;
  detail_sections: QuotaDetailSectionResponse[];
  warnings: string[];
  auth_state: QuotaAuthStateResponse;
  fetch_state: QuotaFetchStateResponse;
  manual_setup: QuotaManualSetupResponse | null;
};

export type QuotaAggregateResponse = {
  enabled_count: number;
  total_count: number;
  active_subscription_count: number;
  comparable_credit_currency: string | null;
  total_credits_used: number | null;
  total_credits_remaining: number | null;
  near_limit_sources: string[];
  degraded_sources: string[];
  soonest_reset_at: number | null;
};

export type QuotaFetchIssueResponse = {
  provider_id: string;
  provider_label: string;
  message: string;
};

export type QuotaAutoRefreshResponse = {
  interval_minutes: number | null;
};

export type QuotaOverviewResponse = {
  all: QuotaAggregateResponse;
  providers: QuotaProviderResponse[];
  generated_at: number;
  partial_failures: QuotaFetchIssueResponse[];
  auto_refresh: QuotaAutoRefreshResponse;
};
