pub mod aliases;
pub mod honesty;
pub mod permission;

pub use aliases::canonicalize_chat_provider_id;
pub use honesty::{
    boolean_fast_modes, capabilities_for_provider, is_fast_on, native_fast_modes_for_provider,
    option_support_for_provider,
};
pub use permission::{
    acp_permission_via_config_option, advertised_permission_modes, default_collaboration_modes,
    expand_sparse_permission_modes, fold_vendor_permission_modes, is_plan_mode,
    merge_plan_into_modes, normalize_stored as normalize_stored_permission, opencode_auto_locked,
    to_vendor_value as atmos_permission_to_vendor, vendor_permission_for_spawn,
};
