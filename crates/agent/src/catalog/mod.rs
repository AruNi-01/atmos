pub mod acp_probe;
pub mod cache;
pub mod engine;
pub mod merge;
pub mod parse;
pub mod spec;

pub use acp_probe::{
    probe_result_from_config_options, AcpLaunchResolved, AcpLaunchResolver, StdioAcpCatalogProbe,
};
pub use cache::{catalog_cache_dir, CatalogCache, ERROR_CACHE_TTL, OK_CACHE_TTL};
pub use engine::{
    AcpCatalogProbe, AcpProbeResult, CatalogEngine, CommandOutput, CommandRunner, NoopAcpProbe,
};
pub use merge::{merge_catalogs, CatalogFragment};
pub use parse::{parse_droid_help, parse_line_list};
pub use spec::{thinking_from_builtin, AgentCatalogSpec, CatalogParserKind};
