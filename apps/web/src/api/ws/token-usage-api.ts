"use client";

import { wsRequest } from "@/api/ws/request";
import type {
  TokenUsageGroupBy,
  TokenUsageOverviewResponse,
} from "@atmos/api-types/ws/dto/token-usage";

export type {
  BrowserCookieAccessResponse,
  BrowserCookieConsent,
  ClientTokenUsageResponse,
  DailyClientTokenUsageResponse,
  DailyTokenUsageResponse,
  ModelTokenUsageResponse,
  MonthlyTokenUsageResponse,
  TokenBreakdownResponse,
  TokenUsageGroupBy,
  TokenUsageOverviewResponse,
  TokenUsageQueryResponse,
  TokenUsageSummaryResponse,
  TokenUsageUpdateResponse,
} from "@atmos/api-types/ws/dto/token-usage";

export const tokenUsageApi = {
  /**
   * 获取本地 token usage 概览
   */
  getOverview: async (params?: {
    refresh?: boolean;
    tryCookies?: boolean;
    year?: string | null;
    since?: string | null;
    until?: string | null;
    clients?: string[] | null;
    groupBy?: TokenUsageGroupBy;
  }): Promise<TokenUsageOverviewResponse> => {
    return wsRequest("token_usage_overview_get", {
      refresh: params?.refresh ?? false,
      try_cookies: params?.tryCookies ?? false,
      year: params?.year ?? null,
      since: params?.since ?? null,
      until: params?.until ?? null,
      clients: params?.clients?.length ? params.clients : null,
      group_by: params?.groupBy ?? null,
    });
  },

  setBrowserCookieConsent: async (
    providerId: string,
    granted: boolean,
  ): Promise<TokenUsageOverviewResponse> => {
    const result = await wsRequest("token_usage_set_browser_cookie_consent", {
      provider_id: providerId,
      granted,
    });
    return result.overview;
  },
};
