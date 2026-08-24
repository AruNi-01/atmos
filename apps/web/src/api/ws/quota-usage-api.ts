"use client";

import { wsRequest } from "@/api/ws/request";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type { QuotaOverviewResponse } from "@atmos/api-types/ws/dto/quota";

export type {
  QuotaAggregateResponse,
  QuotaAuthStateResponse,
  QuotaAuthStateStatus,
  QuotaAutoRefreshResponse,
  QuotaConfiguredApiKey,
  QuotaDetailRowResponse,
  QuotaDetailRowTone,
  QuotaDetailSectionResponse,
  QuotaFetchIssueResponse,
  QuotaFetchStateResponse,
  QuotaFetchStateStatus,
  QuotaManualSetupOptionResponse,
  QuotaManualSetupResponse,
  QuotaOverviewResponse,
  QuotaProviderKind,
  QuotaProviderResponse,
  QuotaSubscriptionSummaryResponse,
  QuotaSummaryResponse,
} from "@atmos/api-types/ws/dto/quota";

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
    const overview = await wsRequest("quota_get_overview",
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
    const overview = await wsRequest("quota_set_provider_switch",
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
    const overview = await wsRequest("quota_set_provider_footer_carousel",
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
    const overview = await wsRequest("quota_set_all_providers_switch",
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
    const overview = await wsRequest("quota_apply_provider_visibility",
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
    const overview = await wsRequest("quota_set_provider_manual_setup",
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
    const overview = await wsRequest("quota_add_provider_api_key",
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
    const overview = await wsRequest("quota_delete_provider_api_key",
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
    const overview = await wsRequest("quota_set_auto_refresh",
      {
        interval_minutes: intervalMinutes ?? null,
      },
      45_000,
    );
    emitQuotaOverviewUpdated(overview);
    return overview;
  },
};
