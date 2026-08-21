use serde_json::{json, Value};

use core_service::{Result, ServiceError};

use super::{PermissionAccessSetRequest, WsMessageService};

impl WsMessageService {
    pub(super) async fn handle_permission_access_list(&self) -> Result<Value> {
        token_usage::import_legacy_cookie_consents();
        Ok(json!({
            "resources": permission_access::list_statuses(),
        }))
    }

    pub(super) async fn handle_permission_access_set(
        &self,
        req: PermissionAccessSetRequest,
    ) -> Result<Value> {
        token_usage::import_legacy_cookie_consents();
        let capability = match req.capability.as_deref() {
            None | Some("") => permission_access::Capability::BrowserCookie,
            Some(raw) => permission_access::Capability::parse(raw).ok_or_else(|| {
                ServiceError::Validation(format!("Unknown Permission Access capability `{raw}`"))
            })?,
        };
        permission_access::set_consent(&req.resource_id, capability, req.granted).map_err(
            |error| match error {
                permission_access::ConsentError::UnknownResource { .. } => {
                    ServiceError::Validation(error.to_string())
                }
                _ => ServiceError::Processing(error.to_string()),
            },
        )?;
        Ok(json!({
            "resources": permission_access::list_statuses(),
        }))
    }
}
