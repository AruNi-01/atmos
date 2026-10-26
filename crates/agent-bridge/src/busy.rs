use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BusyPolicy {
    Wait,
    #[default]
    Queue,
    FailFast,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Occupancy {
    Idle,
    Running,
    PermissionRequest,
    #[default]
    Unknown,
}

impl Occupancy {
    pub fn is_busy(self) -> bool {
        matches!(self, Self::Running | Self::PermissionRequest)
    }

    pub fn from_wire(value: &str) -> Self {
        match value {
            "idle" => Self::Idle,
            "running" => Self::Running,
            "permission_request" => Self::PermissionRequest,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeliveryPlan {
    DeliverNow,
    Queue,
    FailFast,
    Wait,
}

pub fn plan_delivery(busy: bool, policy: BusyPolicy) -> DeliveryPlan {
    if !busy {
        return DeliveryPlan::DeliverNow;
    }
    match policy {
        BusyPolicy::Queue => DeliveryPlan::Queue,
        BusyPolicy::FailFast => DeliveryPlan::FailFast,
        BusyPolicy::Wait => DeliveryPlan::Wait,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_queue() {
        assert_eq!(BusyPolicy::default(), BusyPolicy::Queue);
        assert_eq!(
            plan_delivery(true, BusyPolicy::default()),
            DeliveryPlan::Queue
        );
        assert_eq!(
            plan_delivery(false, BusyPolicy::FailFast),
            DeliveryPlan::DeliverNow
        );
        assert_eq!(
            plan_delivery(true, BusyPolicy::FailFast),
            DeliveryPlan::FailFast
        );
        assert_eq!(plan_delivery(true, BusyPolicy::Wait), DeliveryPlan::Wait);
    }
}
