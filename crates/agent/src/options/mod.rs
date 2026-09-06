//! Agent options snapshot: probe, cache, merge, and apply onto descriptors.
//!
//! This is the selectable surface for composer pickers (models, modes,
//! permission, thinking/effort, commands) — not a database catalog.

pub mod apply;
pub mod cache;
pub mod merge;
pub mod probe;
pub mod types;

pub use apply::{
    apply_options_defaults_to_current_config, apply_options_to_descriptor,
    rebuild_descriptor_for_provider, supported_options_from_snapshot,
};
pub use cache::{options_cache_dir, OptionsCache, ERROR_CACHE_TTL, OK_CACHE_TTL};
pub use merge::{merge_options_snapshots, OptionsFragment};
pub use probe::{
    apply_grok_thinking_overlay, apply_native_chat_options_plan, collapse_cursor_cli_models,
    config_options_from_session_payload, cursor_model_base, cursor_model_display_label,
    cursor_model_has_brackets, fill_cursor_thinking_by_base, grok_thinking_for_model_id,
    is_native_chat_options_id, map_to_advertised_cursor_model, model_id_is_table_noise,
    models_look_like_cursor_acp, parse_droid_help, parse_line_list,
    probe_result_from_config_options, thinking_from_builtin, AcpLaunchResolved, AcpLaunchResolver,
    AcpOptionsProbe, AcpOptionsProbeResult, CommandOutput, CommandRunner, NativeOptionsProbe,
    NativeOptionsProbeResult, NoopAcpOptionsProbe, NoopNativeOptionsProbe, OptionsParserKind,
    OptionsProbe, ProbePlan, ProcessCommandRunner, StdioAcpOptionsProbe,
};
pub(crate) use probe::{is_mode_config_id, is_permission_mode_config_id};
pub use types::{AgentOptionsSnapshot, OptionsProbeStrategy, OptionsSource, OptionsStatus};
