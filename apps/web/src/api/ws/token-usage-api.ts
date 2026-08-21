"use client";

import { wsRequest } from "@/api/ws/request";

export type TokenUsageGroupBy =
  | 'model'
  | 'client_model'
  | 'client_provider_model';

export interface TokenUsageQueryResponse {
  clients?: string[] | null;
  since?: string | null;
  until?: string | null;
  year?: string | null;
  group_by: TokenUsageGroupBy;
}

export interface TokenBreakdownResponse {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
}

export interface TokenUsageSummaryResponse {
  total_tokens: number;
  total_cost_usd: number | null;
  total_messages: number;
  active_days: number;
  range_start: string | null;
  range_end: string | null;
  processing_time_ms: number;
}

export interface ClientTokenUsageResponse {
  client_id: string;
  total_tokens: number;
  total_cost_usd: number | null;
  message_count: number;
  model_count: number;
}

export interface ModelTokenUsageResponse {
  client_id: string;
  provider_id: string;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  cost_usd: number | null;
  message_count: number;
}

export interface DailyClientTokenUsageResponse {
  client_id: string;
  model_id: string;
  provider_id: string;
  breakdown: TokenBreakdownResponse;
  total_tokens: number;
  cost_usd: number | null;
  message_count: number;
}

export interface DailyTokenUsageResponse {
  date: string;
  breakdown: TokenBreakdownResponse;
  total_tokens: number;
  total_cost_usd: number | null;
  message_count: number;
  by_client: DailyClientTokenUsageResponse[];
}

export interface MonthlyTokenUsageResponse {
  month: string;
  breakdown: TokenBreakdownResponse;
  total_tokens: number;
  total_cost_usd: number | null;
  message_count: number;
  models: string[];
}

export type BrowserCookieConsent =
  | "not_applicable"
  | "needed"
  | "granted"
  | "denied";

export interface BrowserCookieAccessResponse {
  provider_id: string;
  label: string;
  detected: boolean;
  consent: BrowserCookieConsent;
  has_manual_token: boolean;
}

export interface TokenUsageOverviewResponse {
  query: TokenUsageQueryResponse;
  summary: TokenUsageSummaryResponse;
  by_client: ClientTokenUsageResponse[];
  by_model: ModelTokenUsageResponse[];
  by_day: DailyTokenUsageResponse[];
  by_month: MonthlyTokenUsageResponse[];
  available_years: string[];
  generated_at: number;
  partial_warnings: string[];
  browser_cookie_access?: BrowserCookieAccessResponse[];
  /** Unique Computers that contributed to this overview (client merge only). */
  computer_count?: number;
}

export interface TokenUsageUpdateResponse {
  overview: TokenUsageOverviewResponse;
}

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
    return wsRequest<TokenUsageOverviewResponse>("token_usage_overview_get", {
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
    return wsRequest<TokenUsageOverviewResponse>(
      "token_usage_set_browser_cookie_consent",
      { provider_id: providerId, granted },
    );
  },
};
