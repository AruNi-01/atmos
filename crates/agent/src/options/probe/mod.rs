pub mod acp;
pub mod cli;
pub mod native;
pub mod plan;
pub mod run;

pub use acp::{
    config_options_from_session_payload, probe_result_from_config_options, AcpLaunchResolved,
    AcpLaunchResolver, AcpOptionsProbe, AcpOptionsProbeResult, NoopAcpOptionsProbe,
    StdioAcpOptionsProbe,
};
pub(crate) use acp::{is_mode_config_id, is_permission_mode_config_id};
pub use cli::parse::{
    apply_grok_thinking_overlay, grok_thinking_for_model_id, model_id_is_table_noise,
    parse_droid_help, parse_line_list,
};
pub use cli::{
    collapse_cursor_cli_models, cursor_model_base, cursor_model_display_label,
    cursor_model_has_brackets, fill_cursor_thinking_by_base, map_to_advertised_cursor_model,
    models_look_like_cursor_acp, CommandOutput, CommandRunner, ProcessCommandRunner,
};
pub use native::{
    DispatchNativeOptionsProbe, NativeOptionsProbe, NativeOptionsProbeResult,
    NoopNativeOptionsProbe,
};
pub use plan::{
    apply_native_chat_options_plan, is_native_chat_options_id, thinking_from_builtin,
    OptionsParserKind, ProbePlan,
};
pub use run::OptionsProbe;
