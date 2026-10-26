use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::address::{is_foreign_server, is_local_wildcard, LOCAL_SERVER_ID};
use crate::error::BridgeError;

/// Structured slices only. Never transcript, CoT, or secrets.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContextBagSlices {
    #[serde(default)]
    pub goals: Vec<String>,
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub refs: Vec<String>,
    #[serde(default)]
    pub artifacts: Vec<String>,
    #[serde(default)]
    pub danger: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContextBag {
    pub id: String,
    pub server_id: String,
    #[serde(flatten)]
    pub slices: ContextBagSlices,
}

impl ContextBag {
    pub fn new(server_id: impl Into<String>, slices: ContextBagSlices) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            server_id: server_id.into(),
            slices,
        }
    }

    pub fn local_ref(&self) -> String {
        format!("bag:{}", self.id)
    }

    pub fn qualified_ref(&self) -> String {
        format!("{}/bag:{}", self.server_id, self.id)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedContextRef {
    pub server_id: Option<String>,
    pub bag_id: String,
}

pub fn parse_context_ref(raw: &str) -> Result<ParsedContextRef, BridgeError> {
    let raw = raw.trim();
    if let Some(rest) = raw.strip_prefix("bag:") {
        if rest.is_empty() {
            return Err(BridgeError::Invalid("empty context_ref".into()));
        }
        return Ok(ParsedContextRef {
            server_id: None,
            bag_id: rest.to_string(),
        });
    }
    if let Some((server, bag)) = raw.split_once("/bag:") {
        if server.is_empty() || bag.is_empty() {
            return Err(BridgeError::Invalid("invalid context_ref".into()));
        }
        return Ok(ParsedContextRef {
            server_id: Some(server.to_string()),
            bag_id: bag.to_string(),
        });
    }
    Err(BridgeError::Invalid(format!(
        "context_ref must be bag:{{id}} or {{server_id}}/bag:{{id}}, got {raw}"
    )))
}

/// In-memory bag store. No peer-push API by design (V1 pull).
#[derive(Debug, Default, Clone)]
pub struct ContextStore {
    bags: Vec<ContextBag>,
}

impl ContextStore {
    pub fn new() -> Self {
        Self { bags: Vec::new() }
    }

    pub fn put(&mut self, bag: ContextBag) -> ContextBag {
        self.bags.push(bag.clone());
        bag
    }

    pub fn get(&self, bag_id: &str) -> Option<&ContextBag> {
        self.bags.iter().find(|b| b.id == bag_id)
    }

    /// Pull locally. If the ref names another Computer, return `ContextRefRemote`.
    pub fn pull(&self, raw_ref: &str, local_server_id: &str) -> Result<ContextBag, BridgeError> {
        let parsed = parse_context_ref(raw_ref)?;
        if let Some(holder) = &parsed.server_id {
            if is_foreign_server(holder, local_server_id)
                && !is_local_wildcard(holder)
                && holder != LOCAL_SERVER_ID
                && holder != local_server_id
            {
                if self.get(&parsed.bag_id).is_none() {
                    return Err(BridgeError::ContextRefRemote {
                        context_ref: raw_ref.to_string(),
                    });
                }
            }
        }
        self.get(&parsed.bag_id).cloned().ok_or_else(|| {
            if parsed
                .server_id
                .as_ref()
                .map(|s| is_foreign_server(s, local_server_id))
                .unwrap_or(false)
            {
                BridgeError::ContextRefRemote {
                    context_ref: raw_ref.to_string(),
                }
            } else {
                BridgeError::Invalid(format!("unknown context_ref {raw_ref}"))
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pull_local_and_isolated_stores() {
        let mut a = ContextStore::new();
        let b = ContextStore::new();
        let bag = a.put(ContextBag::new(
            "srv-a",
            ContextBagSlices {
                goals: vec!["ship".into()],
                ..Default::default()
            },
        ));
        assert!(a.get(&bag.id).is_some());
        assert!(b.get(&bag.id).is_none());
        let pulled = a.pull(&bag.local_ref(), "srv-a").unwrap();
        assert_eq!(pulled.slices.goals, vec!["ship"]);
        let remote = b.pull(&bag.qualified_ref(), "srv-b").unwrap_err();
        assert_eq!(remote.code(), "CONTEXT_REF_REMOTE");
        // Store B has no push-to-peer method; isolation is the V1 contract.
    }
}
