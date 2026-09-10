//! CLI options probe strategy: argv runner, stdout parsers, Cursor / Droid collapse.

use std::time::Duration;

use async_trait::async_trait;
use tokio::process::Command;
use tokio::time::timeout;

use crate::policy::canonicalize_chat_provider_id;

use super::plan::OptionsParserKind;

pub mod cursor;
pub mod droid;
pub mod droid_catalog;
pub mod parse;

pub use cursor::{
    collapse_cursor_cli_models, cursor_model_base, cursor_model_display_label,
    cursor_model_has_brackets, fill_cursor_thinking_by_base, map_to_advertised_cursor_model,
    models_look_like_cursor_acp,
};
pub use droid::{
    apply_droid_fast_current_config, collapse_droid_fast_models, droid_fast_base,
    encode_droid_fast_model,
};
pub use droid_catalog::{
    droid_catalog_path, overlay_droid_model_catalog, refresh_droid_factory_catalog,
    set_droid_catalog_path,
};
pub use parse::{
    apply_grok_thinking_overlay, grok_thinking_for_model_id, model_id_is_table_noise,
    parse_droid_help, parse_line_list,
};

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

#[async_trait]
pub trait CommandRunner: Send + Sync {
    async fn run(&self, argv: &[String], timeout: Duration) -> Result<CommandOutput, String>;
}

pub struct ProcessCommandRunner;

#[async_trait]
impl CommandRunner for ProcessCommandRunner {
    async fn run(&self, argv: &[String], max: Duration) -> Result<CommandOutput, String> {
        if argv.is_empty() {
            return Err("empty command".into());
        }
        let mut cmd = Command::new(&argv[0]);
        if argv.len() > 1 {
            cmd.args(&argv[1..]);
        }
        cmd.kill_on_drop(true);
        let output = timeout(max, cmd.output())
            .await
            .map_err(|_| "model list timed out".to_string())?
            .map_err(|e| e.to_string())?;
        Ok(CommandOutput {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }
}

pub fn cli_timeout(parser: OptionsParserKind) -> Duration {
    match parser {
        // Live `grok models` on this machine is ~13s; 8s stored `model list timed out`.
        OptionsParserKind::DroidHelp | OptionsParserKind::GrokLineList => Duration::from_secs(20),
        _ => Duration::from_secs(8),
    }
}

pub fn cli_timeout_for(agent_id: &str, parser: OptionsParserKind) -> Duration {
    if canonicalize_chat_provider_id(agent_id) == "cursor" {
        // `cursor-agent --list-models` talks to Cursor's catalog; 8s was racing it.
        Duration::from_secs(20)
    } else {
        cli_timeout(parser)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grok_cli_timeout_matches_droid_help_not_default_eight_seconds() {
        assert_eq!(
            cli_timeout(OptionsParserKind::GrokLineList),
            Duration::from_secs(20)
        );
        assert_eq!(
            cli_timeout(OptionsParserKind::DroidHelp),
            Duration::from_secs(20)
        );
        assert_eq!(
            cli_timeout(OptionsParserKind::LineList),
            Duration::from_secs(8)
        );
        assert_eq!(
            cli_timeout_for("cursor", OptionsParserKind::LineList),
            Duration::from_secs(20)
        );
        assert_eq!(
            cli_timeout_for("codex", OptionsParserKind::LineList),
            Duration::from_secs(8)
        );
    }
}
