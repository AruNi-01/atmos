use serde_json::{json, Value};

use core_service::{Result, ServiceError};

use super::{
    TokenUsageOverviewRequest, QuotaAddProviderApiKeyRequest, QuotaAllProvidersSwitchRequest,
    QuotaApplyProviderVisibilityRequest, QuotaAutoRefreshRequest, QuotaDeleteProviderApiKeyRequest,
    QuotaOverviewRequest, QuotaProviderFooterCarouselRequest, QuotaProviderManualSetupRequest,
    QuotaProviderSwitchRequest, WsMessageService,
};

impl WsMessageService {
    pub(super) async fn handle_quota_get_overview(
        &self,
        req: QuotaOverviewRequest,
    ) -> Result<Value> {
        let overview = self
            .quota_usage_service
            .get_overview(req.refresh, req.provider_id.as_deref())
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_quota_set_provider_switch(
        &self,
        req: QuotaProviderSwitchRequest,
    ) -> Result<Value> {
        let overview = self
            .quota_usage_service
            .set_provider_switch(&req.provider_id, req.enabled)
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_quota_set_provider_footer_carousel(
        &self,
        req: QuotaProviderFooterCarouselRequest,
    ) -> Result<Value> {
        let overview = self
            .quota_usage_service
            .set_provider_footer_carousel_show(&req.provider_id, req.enabled)
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_quota_set_all_providers_switch(
        &self,
        req: QuotaAllProvidersSwitchRequest,
    ) -> Result<Value> {
        let overview = self
            .quota_usage_service
            .set_all_provider_switch(req.enabled)
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_quota_apply_provider_visibility(
        &self,
        req: QuotaApplyProviderVisibilityRequest,
    ) -> Result<Value> {
        let prefs = req
            .providers
            .into_iter()
            .map(|pref| {
                (
                    pref.provider_id,
                    pref.switch_enabled,
                    pref.footer_carousel_show,
                )
            })
            .collect();
        let overview = self.quota_usage_service.apply_provider_visibility(prefs).await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_quota_set_provider_manual_setup(
        &self,
        req: QuotaProviderManualSetupRequest,
    ) -> Result<Value> {
        let overview = self
            .quota_usage_service
            .set_provider_manual_setup(&req.provider_id, req.region, req.api_key)
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_quota_add_provider_api_key(
        &self,
        req: QuotaAddProviderApiKeyRequest,
    ) -> Result<Value> {
        let overview = self
            .quota_usage_service
            .add_provider_api_key(&req.provider_id, req.region, req.api_key)
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_quota_delete_provider_api_key(
        &self,
        req: QuotaDeleteProviderApiKeyRequest,
    ) -> Result<Value> {
        let overview = self
            .quota_usage_service
            .delete_provider_api_key(&req.provider_id, &req.key_id)
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_token_usage_overview_get(
        &self,
        req: TokenUsageOverviewRequest,
    ) -> Result<Value> {
        let overview = self
            .token_usage_service
            .get_overview(
                token_usage::TokenUsageQuery {
                    clients: req.clients.filter(|clients| !clients.is_empty()),
                    since: req.since,
                    until: req.until,
                    year: req.year,
                    group_by: req.group_by.unwrap_or_default(),
                },
                req.refresh,
            )
            .await
            .map_err(|error| ServiceError::Processing(error.to_string()))?;
        Ok(json!(overview))
    }

    pub(super) async fn handle_quota_set_auto_refresh(
        &self,
        req: QuotaAutoRefreshRequest,
    ) -> Result<Value> {
        let overview = self
            .quota_usage_service
            .set_auto_refresh_interval(req.interval_minutes)
            .await
            .map_err(ServiceError::Validation)?;
        Ok(json!(overview))
    }
}
