pub(crate) mod amp;
pub(crate) mod antigravity;
pub(crate) mod claude;
pub(crate) mod codex;
// CommandCode provider disabled due to API data issues:
// - API returns inconsistent credit amounts ($11.89 vs expected $10 for Go plan)
// - planId field exists but doesn't reliably match plan types
// - Credit breakdown doesn't match actual plan quotas
// TODO: Re-enable after API data consistency is fixed
// pub(crate) mod commandcode;
pub(crate) mod cursor;
pub(crate) mod factory;
pub(crate) mod gemini;
pub(crate) mod kimi;
pub(crate) mod mimo;
pub(crate) mod minimax;
pub(crate) mod opencode;
pub(crate) mod zai;
pub(crate) mod zed;
