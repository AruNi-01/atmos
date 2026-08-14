//! Permission Access — Atmos Server may-touch-this-host-source policy.
//!
//! Settings surface: Privacy & Security → Permission Access.

mod check;
mod consent;
mod paths;
mod presence;
mod resources;

pub use check::{check, list_statuses, Decision, ResourceStatus};
pub use consent::{consent, import_absent_grant, set_consent, ConsentError};
pub use presence::local_product_present;
pub use resources::{
    resource_spec, Capability, ResourceSpec, BROWSER_COOKIE_RESOURCE_IDS, RESOURCES,
};
