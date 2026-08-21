use serde::{Deserialize, Serialize};

use crate::consent::consent;
use crate::presence::local_product_present;
use crate::resources::{resource_spec, Capability, RESOURCES};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Decision {
    Allow,
    SkipNotInstalled,
    SkipNoConsent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResourceStatus {
    pub id: String,
    pub label: String,
    pub capability: String,
    pub detected: bool,
    pub has_install_fingerprint: bool,
    pub consent: Option<bool>,
    pub decision: Decision,
}

pub fn check(resource_id: &str, capability: Capability) -> Decision {
    let Some(spec) = resource_spec(resource_id, capability) else {
        return Decision::SkipNotInstalled;
    };
    if spec.has_install_fingerprint() && !local_product_present(spec) {
        return Decision::SkipNotInstalled;
    }
    match consent(resource_id, capability) {
        Some(true) => Decision::Allow,
        _ => Decision::SkipNoConsent,
    }
}

pub fn list_statuses() -> Vec<ResourceStatus> {
    RESOURCES
        .iter()
        .filter(|spec| spec.user_visible)
        .map(|spec| {
            let detected = if spec.has_install_fingerprint() {
                local_product_present(spec)
            } else {
                true
            };
            ResourceStatus {
                id: spec.id.to_string(),
                label: spec.label.to_string(),
                capability: spec.capability.as_str().to_string(),
                detected,
                has_install_fingerprint: spec.has_install_fingerprint(),
                consent: consent(spec.id, spec.capability),
                decision: check(spec.id, spec.capability),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_resource_is_not_installed() {
        assert_eq!(
            check("not-a-resource", Capability::BrowserCookie),
            Decision::SkipNotInstalled
        );
    }

    #[test]
    fn web_only_resource_is_gated_by_consent() {
        assert_eq!(
            check("mimo", Capability::BrowserCookie),
            Decision::SkipNoConsent
        );
    }

    #[test]
    fn list_excludes_hidden_resources() {
        let ids: Vec<_> = list_statuses().into_iter().map(|item| item.id).collect();
        assert!(ids.contains(&"cursor".to_string()));
        assert!(!ids.contains(&"commandcode".to_string()));
    }
}
