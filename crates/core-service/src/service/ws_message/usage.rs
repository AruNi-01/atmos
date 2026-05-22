use serde_json::{Value, json};

use crate::error::{Result, ServiceError};

use super::{
    UsageAddProviderApiKeyRequest, UsageAllProvidersSwitchRequest, UsageAutoRefreshRequest,
    UsageDeleteProviderApiKeyRequest, UsageOverviewRequest, UsageProviderFooterCarouselRequest,
    UsageProviderManualSetupRequest, UsageProviderSwitchRequest, WsMessageService,
};

impl WsMessageService {
    pub(super) async fn handle_usage_get_overview(
        &self,
        req: UsageOverviewRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .get_overview(req.refresh, req.provider_id.as_deref())
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_usage_set_provider_switch(
        &self,
        req: UsageProviderSwitchRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .set_provider_switch(&req.provider_id, req.enabled)
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_usage_set_provider_footer_carousel(
        &self,
        req: UsageProviderFooterCarouselRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .set_provider_footer_carousel_show(&req.provider_id, req.enabled)
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_usage_set_all_providers_switch(
        &self,
        req: UsageAllProvidersSwitchRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .set_all_provider_switch(req.enabled)
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_usage_set_provider_manual_setup(
        &self,
        req: UsageProviderManualSetupRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .set_provider_manual_setup(&req.provider_id, req.region, req.api_key)
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_usage_add_provider_api_key(
        &self,
        req: UsageAddProviderApiKeyRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .add_provider_api_key(&req.provider_id, req.region, req.api_key)
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_usage_delete_provider_api_key(
        &self,
        req: UsageDeleteProviderApiKeyRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .delete_provider_api_key(&req.provider_id, &req.key_id)
            .await;
        Ok(json!(overview))
    }

    pub(super) async fn handle_usage_set_auto_refresh(
        &self,
        req: UsageAutoRefreshRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .set_auto_refresh_interval(req.interval_minutes)
            .await
            .map_err(ServiceError::Validation)?;
        Ok(json!(overview))
    }
}
