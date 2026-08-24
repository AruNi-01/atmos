export type TokenUsageGroupBy =
  | "model"
  | "client_model"
  | "client_provider_model";

export type TokenUsageOverviewRequest = {
  refresh?: boolean;
  try_cookies?: boolean;
  since?: string | null;
  until?: string | null;
  year?: string | null;
  group_by?: TokenUsageGroupBy | null;
  clients?: string[] | null;
};

export type TokenUsageBrowserCookieConsentRequest = {
  provider_id: string;
  granted: boolean;
};

export type TokenUsageQueryResponse = {
  clients?: string[] | null;
  since?: string | null;
  until?: string | null;
  year?: string | null;
  group_by: TokenUsageGroupBy;
};

export type TokenBreakdownResponse = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
};

export type TokenUsageSummaryResponse = {
  total_tokens: number;
  total_cost_usd: number | null;
  total_messages: number;
  active_days: number;
  range_start: string | null;
  range_end: string | null;
  processing_time_ms: number;
};

export type ClientTokenUsageResponse = {
  client_id: string;
  total_tokens: number;
  total_cost_usd: number | null;
  message_count: number;
  model_count: number;
};

export type ModelTokenUsageResponse = {
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
};

export type DailyClientTokenUsageResponse = {
  client_id: string;
  model_id: string;
  provider_id: string;
  breakdown: TokenBreakdownResponse;
  total_tokens: number;
  cost_usd: number | null;
  message_count: number;
};

export type DailyTokenUsageResponse = {
  date: string;
  breakdown: TokenBreakdownResponse;
  total_tokens: number;
  total_cost_usd: number | null;
  message_count: number;
  by_client: DailyClientTokenUsageResponse[];
};

export type MonthlyTokenUsageResponse = {
  month: string;
  breakdown: TokenBreakdownResponse;
  total_tokens: number;
  total_cost_usd: number | null;
  message_count: number;
  models: string[];
};

export type BrowserCookieConsent =
  | "not_applicable"
  | "needed"
  | "granted"
  | "denied";

export type BrowserCookieAccessResponse = {
  provider_id: string;
  label: string;
  detected: boolean;
  consent: BrowserCookieConsent;
  has_manual_token: boolean;
};

export type TokenUsageOverviewResponse = {
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
  computer_count?: number;
};

export type TokenUsageUpdateResponse = {
  overview: TokenUsageOverviewResponse;
};
