pub mod acp_probe;
pub mod apply;
pub mod cache;
pub mod engine;
pub mod merge;
pub mod native;
pub mod parse;
pub mod spec;
pub mod types;

pub use acp_probe::{
    config_options_from_session_payload, probe_result_from_config_options, AcpLaunchResolved,
    AcpLaunchResolver, StdioAcpCatalogProbe,
};
pub(crate) use acp_probe::{is_mode_config_id, is_permission_mode_config_id};
pub use apply::{
    apply_catalog_defaults_to_current_config, apply_catalog_to_descriptor,
    rebuild_descriptor_for_provider, supported_options_from_catalog,
};
pub use cache::{catalog_cache_dir, CatalogCache, ERROR_CACHE_TTL, OK_CACHE_TTL};
pub use engine::{
    AcpCatalogProbe, AcpProbeResult, CatalogEngine, CommandOutput, CommandRunner,
    NativeCatalogProbe, NativeProbeResult, NoopAcpProbe, NoopNativeProbe,
};
pub use merge::{merge_catalogs, CatalogFragment};
pub use parse::{
    apply_grok_thinking_overlay, grok_thinking_for_model_id, model_id_is_table_noise,
    parse_droid_help, parse_line_list,
};
pub use spec::{
    apply_native_chat_catalog_spec, is_native_chat_catalog_id, thinking_from_builtin,
    AgentCatalogSpec, CatalogParserKind,
};
pub use types::{AgentModelCatalog, CatalogSource, CatalogStatus, CatalogStrategyKind};
