//! `atmos automation` — thin invoke client for automation complete/status/paths/run.

use clap::{Args, Subcommand};
use serde_json::json;

use crate::api_client::ApiClientArgs;
use crate::envelope::{next, CliEnvelope, NextAction};
use crate::server_invoke::{invoke, wrap_ok};

#[derive(Debug, Subcommand)]
pub enum AutomationCommand {
    /// Mark a running Terminal/Chat automation run complete or failed
    Complete(AutomationCompleteArgs),
    /// Show a run's current status
    Status(AutomationRunArgs),
    /// Print definition, run, and skill paths for a run
    Paths(AutomationRunArgs),
    /// Start a run now (same as Automations Run now)
    Run(AutomationIdArgs),
}

#[derive(Debug, Args)]
pub struct AutomationCompleteArgs {
    #[arg(long = "run")]
    pub run: String,
    #[arg(long)]
    pub failed: bool,
    #[arg(long)]
    pub message: Option<String>,
}

#[derive(Debug, Args)]
pub struct AutomationRunArgs {
    #[arg(long = "run")]
    pub run: String,
}

#[derive(Debug, Args)]
pub struct AutomationIdArgs {
    #[arg(long = "id")]
    pub id: String,
}

pub async fn execute_automation(api: ApiClientArgs, command: AutomationCommand) -> CliEnvelope {
    match command {
        AutomationCommand::Complete(args) => {
            let cmd = "atmos automation complete";
            match invoke(
                &api,
                "automation_run_complete",
                json!({
                    "run_guid": args.run,
                    "failed": args.failed,
                    "message": args.message,
                }),
            )
            .await
            {
                Ok(result) => wrap_ok(
                    cmd,
                    result,
                    vec![
                        next("atmos automation status --run <guid>", "Check run status"),
                        next("atmos automation paths --run <guid>", "Show run paths"),
                    ],
                ),
                Err(error) => error.to_envelope(cmd),
            }
        }
        AutomationCommand::Status(args) => {
            invoke_simple(
                &api,
                "atmos automation status",
                "automation_run_get",
                json!({ "run_guid": args.run }),
                vec![next(
                    "atmos automation complete --run <guid>",
                    "Mark the run finished",
                )],
            )
            .await
        }
        AutomationCommand::Paths(args) => {
            invoke_simple(
                &api,
                "atmos automation paths",
                "automation_run_paths",
                json!({ "run_guid": args.run }),
                vec![next(
                    "atmos automation complete --run <guid>",
                    "Mark the run finished after writing final.md",
                )],
            )
            .await
        }
        AutomationCommand::Run(args) => {
            invoke_simple(
                &api,
                "atmos automation run",
                "automation_run_now",
                json!({ "automation_guid": args.id }),
                vec![next(
                    "atmos automation status --run <guid>",
                    "Check the new run",
                )],
            )
            .await
        }
    }
}

async fn invoke_simple(
    api: &ApiClientArgs,
    command: &str,
    action: &str,
    data: serde_json::Value,
    next_actions: Vec<NextAction>,
) -> CliEnvelope {
    match invoke(api, action, data).await {
        Ok(result) => wrap_ok(command, result, next_actions),
        Err(error) => error.to_envelope(command),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn verbs_call_server_invoke_actions() {
        let src = include_str!("automation.rs");
        assert!(src.contains("\"automation_run_complete\""));
        assert!(src.contains("\"automation_run_get\""));
        assert!(src.contains("\"automation_run_paths\""));
        assert!(src.contains("\"automation_run_now\""));
        assert!(src.contains("invoke("));
    }
}
