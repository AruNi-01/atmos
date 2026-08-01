"use client";

import { wsRequest } from "@/api/ws/request";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";

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

export interface QuotaDetailRowResponse {
  label: string;
  value: string;
  tone: QuotaDetailRowTone;
}

export interface QuotaDetailSectionResponse {
  title: string;
  rows: QuotaDetailRowResponse[];
}

export interface QuotaAuthStateResponse {
  status: QuotaAuthStateStatus;
  source: string | null;
  detail: string | null;
  setup_hint: string | null;
}

export interface QuotaFetchStateResponse {
  status: QuotaFetchStateStatus;
  message: string | null;
}

export interface QuotaManualSetupOptionResponse {
  value: string;
  label: string;
}

export interface QuotaConfiguredApiKey {
  id: string;
  region: string | null;
}

export interface QuotaManualSetupResponse {
  selected_region: string | null;
  region_options: QuotaManualSetupOptionResponse[];
  api_key_configured: boolean;
  configured_keys: QuotaConfiguredApiKey[];
}

export interface QuotaSubscriptionSummaryResponse {
  plan_label: string | null;
  window_label: string | null;
  credits_label: string | null;
  billing_state: string | null;
  reset_at: number | null;
}

export interface QuotaSummaryResponse {
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

export interface QuotaProviderResponse {
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
}

export interface QuotaAggregateResponse {
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

export interface QuotaFetchIssueResponse {
  provider_id: string;
  provider_label: string;
  message: string;
}

export interface QuotaAutoRefreshResponse {
  interval_minutes: number | null;
}

export interface QuotaOverviewResponse {
  all: QuotaAggregateResponse;
  providers: QuotaProviderResponse[];
  generated_at: number;
  partial_failures: QuotaFetchIssueResponse[];
  auto_refresh: QuotaAutoRefreshResponse;
}

function emitQuotaOverviewUpdated(overview: QuotaOverviewResponse): void {
  const listeners = useWebSocketStore.getState().eventListeners.get("quota_overview_updated");
  if (!listeners) return;
  listeners.forEach((listener) => listener(overview));
}

export const quotaUsageApi = {
  getOverview: async (
    refresh = false,
    providerId?: string | null,
  ): Promise<QuotaOverviewResponse> => {
    const overview = await wsRequest<QuotaOverviewResponse>(
      "quota_get_overview",
      {
        refresh,
        provider_id: providerId ?? null,
      },
      45_000,
    );
    // Provider-scoped fetches are not authoritative for the shared overview
    // cache (refresh=false may even return an empty shell). Callers that pass
    // providerId write the result themselves when appropriate.
    if (!providerId) {
      emitQuotaOverviewUpdated(overview);
    }
    return overview;
  },

  setProviderSwitch: async (
    providerId: string,
    enabled: boolean,
  ): Promise<QuotaOverviewResponse> => {
    const overview = await wsRequest<QuotaOverviewResponse>(
      "quota_set_provider_switch",
      {
        provider_id: providerId,
        enabled,
      },
      45_000,
    );
    emitQuotaOverviewUpdated(overview);
    return overview;
  },

  setProviderFooterCarousel: async (
    providerId: string,
    enabled: boolean,
  ): Promise<QuotaOverviewResponse> => {
    const overview = await wsRequest<QuotaOverviewResponse>(
      "quota_set_provider_footer_carousel",
      {
        provider_id: providerId,
        enabled,
      },
      45_000,
    );
    emitQuotaOverviewUpdated(overview);
    return overview;
  },

  setAllProvidersSwitch: async (
    enabled: boolean,
  ): Promise<QuotaOverviewResponse> => {
    const overview = await wsRequest<QuotaOverviewResponse>(
      "quota_set_all_providers_switch",
      { enabled },
      45_000,
    );
    emitQuotaOverviewUpdated(overview);
    return overview;
  },

  /**
   * Batch-apply switch + footer carousel flags.
   * Unspecified known providers are turned off by the backend.
   */
  applyProviderVisibility: async (
    providers: Array<{
      provider_id: string;
      switch_enabled: boolean;
      footer_carousel_show: boolean;
    }>,
  ): Promise<QuotaOverviewResponse> => {
    const overview = await wsRequest<QuotaOverviewResponse>(
      "quota_apply_provider_visibility",
      { providers },
      45_000,
    );
    emitQuotaOverviewUpdated(overview);
    return overview;
  },

  setProviderManualSetup: async (
    providerId: string,
    region: string | null,
    apiKey?: string | null,
  ): Promise<QuotaOverviewResponse> => {
    const overview = await wsRequest<QuotaOverviewResponse>(
      "quota_set_provider_manual_setup",
      {
        provider_id: providerId,
        region,
        api_key: apiKey ?? null,
      },
      45_000,
    );
    emitQuotaOverviewUpdated(overview);
    return overview;
  },

  addProviderApiKey: async (
    providerId: string,
    region: string | null,
    apiKey: string,
  ): Promise<QuotaOverviewResponse> => {
    const overview = await wsRequest<QuotaOverviewResponse>(
      "quota_add_provider_api_key",
      {
        provider_id: providerId,
        region,
        api_key: apiKey,
      },
      45_000,
    );
    emitQuotaOverviewUpdated(overview);
    return overview;
  },

  deleteProviderApiKey: async (
    providerId: string,
    keyId: string,
  ): Promise<QuotaOverviewResponse> => {
    const overview = await wsRequest<QuotaOverviewResponse>(
      "quota_delete_provider_api_key",
      {
        provider_id: providerId,
        key_id: keyId,
      },
      45_000,
    );
    emitQuotaOverviewUpdated(overview);
    return overview;
  },

  setAutoRefresh: async (
    intervalMinutes?: number | null,
  ): Promise<QuotaOverviewResponse> => {
    const overview = await wsRequest<QuotaOverviewResponse>(
      "quota_set_auto_refresh",
      {
        interval_minutes: intervalMinutes ?? null,
      },
      45_000,
    );
    emitQuotaOverviewUpdated(overview);
    return overview;
  },
};
