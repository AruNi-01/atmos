import type {
  QuotaAddProviderApiKeyRequest,
  QuotaAllProvidersSwitchRequest,
  QuotaApplyProviderVisibilityRequest,
  QuotaAutoRefreshRequest,
  QuotaDeleteProviderApiKeyRequest,
  QuotaOverviewRequest,
  QuotaOverviewResponse,
  QuotaProviderManualSetupRequest,
  QuotaProviderSwitchRequest,
} from "../dto/quota";

export type QuotaContract = {
  quota_get_overview: {
    input: QuotaOverviewRequest;
    output: QuotaOverviewResponse;
  };
  quota_set_provider_switch: {
    input: QuotaProviderSwitchRequest;
    output: QuotaOverviewResponse;
  };
  quota_set_provider_footer_carousel: {
    input: QuotaProviderSwitchRequest;
    output: QuotaOverviewResponse;
  };
  quota_set_all_providers_switch: {
    input: QuotaAllProvidersSwitchRequest;
    output: QuotaOverviewResponse;
  };
  quota_apply_provider_visibility: {
    input: QuotaApplyProviderVisibilityRequest;
    output: QuotaOverviewResponse;
  };
  quota_set_provider_manual_setup: {
    input: QuotaProviderManualSetupRequest;
    output: QuotaOverviewResponse;
  };
  quota_add_provider_api_key: {
    input: QuotaAddProviderApiKeyRequest;
    output: QuotaOverviewResponse;
  };
  quota_delete_provider_api_key: {
    input: QuotaDeleteProviderApiKeyRequest;
    output: QuotaOverviewResponse;
  };
  quota_set_auto_refresh: {
    input: QuotaAutoRefreshRequest;
    output: QuotaOverviewResponse;
  };
};
