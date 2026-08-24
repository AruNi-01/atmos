import type {
  TokenUsageBrowserCookieConsentRequest,
  TokenUsageOverviewRequest,
  TokenUsageOverviewResponse,
  TokenUsageUpdateResponse,
} from "../dto/token-usage";

export type TokenUsageContract = {
  token_usage_overview_get: {
    input: TokenUsageOverviewRequest;
    output: TokenUsageOverviewResponse;
  };
  token_usage_set_browser_cookie_consent: {
    input: TokenUsageBrowserCookieConsentRequest;
    output: TokenUsageUpdateResponse;
  };
};
