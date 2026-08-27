pub mod cache;
pub mod engine;
pub mod merge;
pub mod parse;
pub mod spec;

pub use cache::{catalog_cache_dir, CatalogCache, ERROR_CACHE_TTL, OK_CACHE_TTL};
pub use engine::{AcpCatalogProbe, AcpProbeResult, CatalogEngine, CommandOutput, CommandRunner};
pub use merge::{merge_catalogs, CatalogFragment};
pub use spec::{thinking_from_builtin, AgentCatalogSpec, CatalogParserKind};
