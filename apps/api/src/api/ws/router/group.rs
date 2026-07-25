use serde_json::{json, Value};

use super::{
    GroupCreateRequest, GroupDeleteRequest, GroupRemoveMemberRequest, GroupSetMemberRequest,
    GroupUpdateMemberOrderRequest, GroupUpdateOrderRequest, GroupUpdateRequest, WsMessageService,
};
use core_service::Result;

impl WsMessageService {
    pub(super) async fn handle_group_list(&self) -> Result<Value> {
        let groups = self.group_service.list_groups().await?;
        Ok(json!(groups))
    }

    pub(super) async fn handle_group_create(&self, req: GroupCreateRequest) -> Result<Value> {
        let group = self
            .group_service
            .create_group(req.name, req.sidebar_order)
            .await?;
        Ok(json!(group))
    }

    pub(super) async fn handle_group_update(&self, req: GroupUpdateRequest) -> Result<Value> {
        if let Some(name) = req.name {
            self.group_service.rename_group(req.guid, name).await?;
        }
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_group_update_order(
        &self,
        req: GroupUpdateOrderRequest,
    ) -> Result<Value> {
        let orders = req
            .orders
            .into_iter()
            .map(|item| (item.guid, item.order))
            .collect();
        self.group_service.update_group_order(orders).await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_group_delete(&self, req: GroupDeleteRequest) -> Result<Value> {
        self.group_service.delete_group(req.guid).await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_group_set_member(
        &self,
        req: GroupSetMemberRequest,
    ) -> Result<Value> {
        let member = self
            .group_service
            .set_member(req.group_guid, req.member_type, req.member_guid)
            .await?;
        Ok(json!(member))
    }

    pub(super) async fn handle_group_remove_member(
        &self,
        req: GroupRemoveMemberRequest,
    ) -> Result<Value> {
        self.group_service
            .remove_member(req.member_type, req.member_guid)
            .await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_group_update_member_order(
        &self,
        req: GroupUpdateMemberOrderRequest,
    ) -> Result<Value> {
        self.group_service
            .update_member_order(req.group_guid, req.member_guids)
            .await?;
        Ok(json!({ "success": true }))
    }
}
