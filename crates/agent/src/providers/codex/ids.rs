//! Atmos ↔ vendor turn map and Codex thread persistence handle.

use std::collections::HashMap;

use crate::contract::AgentPersistenceHandle;

#[derive(Debug, Default)]
pub struct IdMaps {
    pub thread_id: Option<String>,
    atmos_to_vendor: HashMap<String, String>,
    vendor_to_atmos: HashMap<String, String>,
    pub vendor_turn_ids: Vec<String>,
}

impl IdMaps {
    pub fn set_thread(&mut self, thread_id: impl Into<String>) -> AgentPersistenceHandle {
        let thread_id = thread_id.into();
        self.thread_id = Some(thread_id.clone());
        AgentPersistenceHandle::new(thread_id)
    }

    pub fn persistence(&self) -> Option<AgentPersistenceHandle> {
        self.thread_id
            .as_ref()
            .map(|id| AgentPersistenceHandle::new(id.clone()))
    }

    pub fn bind_turn(
        &mut self,
        atmos_turn_id: impl Into<String>,
        vendor_turn_id: impl Into<String>,
    ) {
        let atmos_turn_id = atmos_turn_id.into();
        let vendor_turn_id = vendor_turn_id.into();
        if let Some(previous) = self
            .atmos_to_vendor
            .insert(atmos_turn_id.clone(), vendor_turn_id.clone())
        {
            self.vendor_to_atmos.remove(&previous);
        }
        self.vendor_to_atmos
            .insert(vendor_turn_id.clone(), atmos_turn_id);
        if !self.vendor_turn_ids.iter().any(|id| id == &vendor_turn_id) {
            self.vendor_turn_ids.push(vendor_turn_id);
        }
    }

    pub fn vendor_for_atmos(&self, atmos_turn_id: &str) -> Option<&str> {
        self.atmos_to_vendor.get(atmos_turn_id).map(String::as_str)
    }

    pub fn vendor_for_target(&self, target: &str) -> Option<&str> {
        self.vendor_for_atmos(target).or_else(|| {
            self.vendor_turn_ids
                .iter()
                .find(|id| id.as_str() == target)
                .map(String::as_str)
        })
    }

    pub fn revert_before_turn_id(&self, selected_vendor: &str) -> Option<&str> {
        let index = self
            .vendor_turn_ids
            .iter()
            .position(|id| id == selected_vendor)?;
        self.vendor_turn_ids.get(index + 1).map(String::as_str)
    }

    pub fn rollback_num_turns(&self, selected_vendor: &str) -> Option<u64> {
        let index = self
            .vendor_turn_ids
            .iter()
            .position(|id| id == selected_vendor)?;
        let after = self.vendor_turn_ids.len().saturating_sub(index + 1);
        Some(after as u64)
    }

    #[allow(dead_code)]
    pub fn atmos_for_vendor(&self, vendor_turn_id: &str) -> Option<&str> {
        self.vendor_to_atmos.get(vendor_turn_id).map(String::as_str)
    }

    pub fn clear_vendor_turn(&mut self, vendor_turn_id: &str) {
        if let Some(atmos) = self.vendor_to_atmos.remove(vendor_turn_id) {
            self.atmos_to_vendor.remove(&atmos);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_vendor_map_cannot_steer() {
        let maps = IdMaps::default();
        assert!(maps.vendor_for_atmos("atmos-uuid").is_none());
    }

    #[test]
    fn bind_and_clear_turn_map() {
        let mut maps = IdMaps::default();
        maps.bind_turn("atmos-1", "turn_456");
        assert_eq!(maps.vendor_for_atmos("atmos-1"), Some("turn_456"));
        maps.clear_vendor_turn("turn_456");
        assert!(maps.vendor_for_atmos("atmos-1").is_none());
        maps.bind_turn("atmos-1", "turn_1");
        maps.bind_turn("atmos-2", "turn_2");
        assert_eq!(maps.revert_before_turn_id("turn_1"), Some("turn_2"));
        assert_eq!(maps.rollback_num_turns("turn_1"), Some(1));
        assert_eq!(maps.rollback_num_turns("turn_2"), Some(0));
    }
}
