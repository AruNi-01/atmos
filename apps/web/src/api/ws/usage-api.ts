"use client";

import { wsRequest } from "@/api/ws/request";
import { useWebSocketStore } from "@/hooks/use-websocket";

export type UsageDetailRowTone =
  | "default"
  | "muted"
  | "success"
  | "warning"
  | "danger";
export type UsageProviderKind = "cli" | "desktop" | "api" | "hybrid";
export type UsageAuthStateStatus = "detected" | "missing" | "unsupported";
export type UsageFetchStateStatus =
  | "ready"
  | "unavailable"
  | "partial"
  | "error"
  | "unsupported";

export interface UsageDetailRowResponse {
  label: string;
  value: string;
  tone: UsageDetailRowTone;
}

export interface UsageDetailSectionResponse {
  title: string;
  rows: UsageDetailRowResponse[];
}

export interface UsageAuthStateResponse {
  status: UsageAuthStateStatus;
  source: string | null;
  detail: string | null;
  setup_hint: string | null;
}

export interface UsageFetchStateResponse {
  status: UsageFetchStateStatus;
  message: string | null;
}

export interface UsageManualSetupOptionResponse {
  value: string;
  label: string;
}

export interface UsageConfiguredApiKey {
  id: string;
  region: string | null;
}

export interface UsageManualSetupResponse {
  selected_region: string | null;
  region_options: UsageManualSetupOptionResponse[];
  api_key_configured: boolean;
  configured_keys: UsageConfiguredApiKey[];
}

export interface UsageSubscriptionSummaryResponse {
  plan_label: string | null;
  window_label: string | null;
  credits_label: string | null;
  billing_state: string | null;
  reset_at: number | null;
}

export interface UsageSummaryResponse {
  unit: string | null;
  currency: string | null;
  used: number | null;
  remaining: number | null;
  cap: number | null;
  percent: number | null;
  used_label: string | null;
  remaining_label: string | null;
  cap_label: string | null;
}

export interface UsageProviderResponse {
  id: string;
  label: string;
  kind: UsageProviderKind;
  enabled: boolean;
  switch_enabled: boolean;
  footer_carousel_show: boolean;
  healthy: boolean;
  last_updated_at: number | null;
  subscription_summary: UsageSubscriptionSummaryResponse | null;
  usage_summary: UsageSummaryResponse | null;
  detail_sections: UsageDetailSectionResponse[];
  warnings: string[];
  auth_state: UsageAuthStateResponse;
  fetch_state: UsageFetchStateResponse;
  manual_setup: UsageManualSetupResponse | null;
}

export interface UsageAggregateResponse {
  enabled_count: number;
  total_count: number;
  active_subscription_count: number;
  comparable_credit_currency: string | null;
  total_credits_used: number | null;
  total_credits_remaining: number | null;
  near_limit_sources: string[];
  degraded_sources: string[];
  soonest_reset_at: number | null;
}

export interface UsageFetchIssueResponse {
  provider_id: string;
  provider_label: string;
  message: string;
}

export interface UsageAutoRefreshResponse {
  interval_minutes: number | null;
}

export interface UsageOverviewResponse {
  all: UsageAggregateResponse;
  providers: UsageProviderResponse[];
  generated_at: number;
  partial_failures: UsageFetchIssueResponse[];
  auto_refresh: UsageAutoRefreshResponse;
}

function emitUsageOverviewUpdated(overview: UsageOverviewResponse): void {
  const listeners = useWebSocketStore.getState().eventListeners.get("usage_overview_updated");
  if (!listeners) return;
  listeners.forEach((listener) => listener(overview));
}

export const usageWsApi = {
  getOverview: async (
    refresh = false,
    providerId?: string | null,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_get_overview",
      {
        refresh,
        provider_id: providerId ?? null,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  setProviderSwitch: async (
    providerId: string,
    enabled: boolean,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_set_provider_switch",
      {
        provider_id: providerId,
        enabled,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  setProviderFooterCarousel: async (
    providerId: string,
    enabled: boolean,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_set_provider_footer_carousel",
      {
        provider_id: providerId,
        enabled,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  setAllProvidersSwitch: async (
    enabled: boolean,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_set_all_providers_switch",
      { enabled },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  setProviderManualSetup: async (
    providerId: string,
    region: string | null,
    apiKey?: string | null,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_set_provider_manual_setup",
      {
        provider_id: providerId,
        region,
        api_key: apiKey ?? null,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  addProviderApiKey: async (
    providerId: string,
    region: string | null,
    apiKey: string,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_add_provider_api_key",
      {
        provider_id: providerId,
        region,
        api_key: apiKey,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  deleteProviderApiKey: async (
    providerId: string,
    keyId: string,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_delete_provider_api_key",
      {
        provider_id: providerId,
        key_id: keyId,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  setAutoRefresh: async (
    intervalMinutes?: number | null,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_set_auto_refresh",
      {
        interval_minutes: intervalMinutes ?? null,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },
};
