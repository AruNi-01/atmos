//! `atmos simulator` — thin invoke client for Device Preview control.
//!
//! Talks only to Atmos Server via `POST /api/cli/invoke`. Never calls helper HTTP.

use clap::{Args, Subcommand, ValueEnum};
use serde_json::{json, Map, Value};

use crate::api_client::ApiClientArgs;
use crate::context;
use crate::envelope::{next, CliEnvelope, NextAction};
use crate::server_invoke::{invoke, wrap_ok, InvokeError};

const START_TIMEOUT_MS: u64 = 600_000;

const STATUS_AGENT_FIELDS: &[&str] = &["udid", "name", "platform", "helper", "workspace_id"];

#[derive(Debug, Clone, Copy, ValueEnum)]
#[clap(rename_all = "lowercase")]
pub enum SimulatorPlatform {
    Ios,
    Android,
}

impl SimulatorPlatform {
    fn as_str(self) -> &'static str {
        match self {
            Self::Ios => "ios",
            Self::Android => "android",
        }
    }
}

#[derive(Debug, Clone, Copy, ValueEnum)]
#[clap(rename_all = "lowercase")]
pub enum SimulatorPressKey {
    Home,
    Back,
    Recents,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
#[clap(rename_all = "lowercase")]
pub enum SimulatorAppearance {
    Light,
    Dark,
}

impl SimulatorAppearance {
    fn as_str(self) -> &'static str {
        match self {
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }
}

#[derive(Debug, Clone, Copy, ValueEnum)]
#[clap(rename_all = "lowercase")]
pub enum SimulatorCameraLens {
    Front,
    Back,
}

impl SimulatorCameraLens {
    fn as_str(self) -> &'static str {
        match self {
            Self::Front => "front",
            Self::Back => "back",
        }
    }
}

impl SimulatorPressKey {
    fn as_str(self) -> &'static str {
        match self {
            Self::Home => "home",
            Self::Back => "back",
            Self::Recents => "recents",
        }
    }
}

#[derive(Debug, Subcommand)]
pub enum SimulatorCommand {
    /// Probe host simulator and emulator capability
    Probe,
    /// Start Device Preview for this workspace
    Start(SimulatorStartArgs),
    /// Stop this workspace's Device Preview claim
    Stop,
    /// Show this workspace's claimed device handle
    Status,
    /// List live Device Preview claims on this Computer
    List,
    /// Capture a screenshot of a claimed device
    Screenshot(SimulatorScreenshotArgs),
    /// Tap using PNG-normalized coordinates
    Tap(SimulatorTapArgs),
    /// Swipe using PNG-normalized coordinates
    Swipe(SimulatorSwipeArgs),
    /// Type text into the claimed device
    Type(SimulatorTypeArgs),
    /// Press a hardware key
    Press(SimulatorPressArgs),
    /// Host simulator/emulator inventory
    Inventory,
    /// Create an iOS simulator or Android AVD
    Create(SimulatorCreateArgs),
    /// Power on a VM without claiming Device Preview
    Boot(SimulatorDeviceArgs),
    /// Power off a VM (stops our claim first)
    Shutdown(SimulatorDeviceArgs),
    /// Delete a VM
    Delete(SimulatorDeviceArgs),
    /// Get or set light/dark appearance
    Appearance {
        #[command(subcommand)]
        command: SimulatorAppearanceCommand,
    },
    /// Inject or clear Android emulator camera PNG
    Camera {
        #[command(subcommand)]
        command: SimulatorCameraCommand,
    },
}

#[derive(Debug, Args)]
pub struct SimulatorStartArgs {
    #[arg(long)]
    pub platform: Option<SimulatorPlatform>,
    #[arg(long)]
    pub udid: Option<String>,
}

#[derive(Debug, Args)]
pub struct SimulatorScreenshotArgs {
    #[arg(long)]
    pub udid: Option<String>,
    #[arg(long)]
    pub platform: Option<SimulatorPlatform>,
    #[arg(long)]
    pub out: Option<String>,
}

#[derive(Debug, Args)]
pub struct SimulatorTapArgs {
    #[arg(long)]
    pub x: f64,
    #[arg(long)]
    pub y: f64,
    #[arg(long)]
    pub udid: Option<String>,
    #[arg(long)]
    pub platform: Option<SimulatorPlatform>,
}

#[derive(Debug, Args)]
pub struct SimulatorSwipeArgs {
    #[arg(long)]
    pub x1: f64,
    #[arg(long)]
    pub y1: f64,
    #[arg(long)]
    pub x2: f64,
    #[arg(long)]
    pub y2: f64,
    #[arg(long)]
    pub duration_ms: Option<u32>,
    #[arg(long)]
    pub udid: Option<String>,
}

#[derive(Debug, Args)]
pub struct SimulatorTypeArgs {
    #[arg(long)]
    pub text: String,
    #[arg(long)]
    pub udid: Option<String>,
}

#[derive(Debug, Args)]
pub struct SimulatorPressArgs {
    #[arg(long)]
    pub key: SimulatorPressKey,
    #[arg(long)]
    pub udid: Option<String>,
}

#[derive(Debug, Args)]
pub struct SimulatorCreateArgs {
    #[arg(long)]
    pub platform: SimulatorPlatform,
    #[arg(long = "type")]
    pub device_type: String,
    #[arg(long)]
    pub runtime: String,
    #[arg(long)]
    pub name: Option<String>,
}

#[derive(Debug, Args)]
pub struct SimulatorDeviceArgs {
    #[arg(long)]
    pub udid: String,
    #[arg(long)]
    pub platform: Option<SimulatorPlatform>,
}

#[derive(Debug, Subcommand)]
pub enum SimulatorAppearanceCommand {
    /// Read light/dark appearance
    Get,
    /// Set light or dark appearance
    Set { appearance: SimulatorAppearance },
}

#[derive(Debug, Subcommand)]
pub enum SimulatorCameraCommand {
    /// Inject a Computer-local PNG onto a camera lens
    Inject(SimulatorCameraInjectArgs),
    /// Clear an injected camera PNG
    Clear(SimulatorCameraClearArgs),
}

#[derive(Debug, Args)]
pub struct SimulatorCameraInjectArgs {
    #[arg(long)]
    pub lens: SimulatorCameraLens,
    #[arg(long)]
    pub file: String,
}

#[derive(Debug, Args)]
pub struct SimulatorCameraClearArgs {
    #[arg(long)]
    pub lens: SimulatorCameraLens,
}

pub async fn execute_simulator(api: ApiClientArgs, command: SimulatorCommand) -> CliEnvelope {
    match command {
        SimulatorCommand::Probe => {
            invoke_env(
                &api,
                "atmos simulator probe",
                "simulator_probe",
                json!({}),
                vec![
                    next(
                        "atmos simulator start",
                        "Start Device Preview for this workspace",
                    ),
                    next("atmos simulator list", "List live claims"),
                ],
            )
            .await
        }
        SimulatorCommand::Start(args) => {
            let command = start_command(&args);
            let ws = match require_workspace(&command) {
                Ok(ws) => ws,
                Err(env) => return *env,
            };
            let mut data = workspace_payload(&ws);
            insert_opt_str(&mut data, "udid", args.udid);
            insert_opt_platform(&mut data, args.platform);
            invoke_env(
                &start_api(&api),
                &command,
                "simulator_start",
                Value::Object(data),
                vec![
                    next("atmos simulator status", "Show the claimed device handle"),
                    next("atmos simulator screenshot", "Capture a screenshot"),
                    next("atmos simulator list", "List live claims"),
                ],
            )
            .await
        }
        SimulatorCommand::Stop => {
            let command = "atmos simulator stop";
            let ws = match require_workspace(command) {
                Ok(ws) => ws,
                Err(env) => return *env,
            };
            invoke_env(
                &api,
                command,
                "simulator_stop",
                Value::Object(workspace_payload(&ws)),
                vec![
                    next(
                        "atmos simulator start",
                        "Start Device Preview for this workspace",
                    ),
                    next("atmos simulator list", "List live claims"),
                ],
            )
            .await
        }
        SimulatorCommand::Status => {
            let command = "atmos simulator status";
            let ws = match require_workspace(command) {
                Ok(ws) => ws,
                Err(env) => return *env,
            };
            match invoke(
                &api,
                "simulator_status",
                Value::Object(workspace_payload(&ws)),
            )
            .await
            {
                Ok(result) => wrap_ok(
                    command,
                    strip_status_for_agents(result),
                    vec![
                        next("atmos simulator screenshot", "Capture a screenshot"),
                        next("atmos simulator list", "List live claims"),
                    ],
                ),
                Err(e) => simulator_invoke_error(command, e),
            }
        }
        SimulatorCommand::List => {
            let data = match context::resolve_workspace(None) {
                Some(ws) => Value::Object(workspace_payload(&ws)),
                None => json!({}),
            };
            invoke_env(
                &api,
                "atmos simulator list",
                "simulator_list",
                data,
                vec![
                    next(
                        "atmos simulator screenshot --udid <id>",
                        "Capture a screenshot of a listed device",
                    ),
                    next("atmos simulator status", "Show this workspace's claim"),
                ],
            )
            .await
        }
        SimulatorCommand::Screenshot(args) => {
            let command = screenshot_command(&args);
            let ws = match require_workspace(&command) {
                Ok(ws) => ws,
                Err(env) => return *env,
            };
            let mut data = workspace_payload(&ws);
            insert_opt_str(&mut data, "udid", args.udid);
            insert_opt_platform(&mut data, args.platform);
            insert_opt_str(&mut data, "out", args.out);
            invoke_env(
                &api,
                &command,
                "simulator_screenshot",
                Value::Object(data),
                vec![next(
                    "atmos simulator tap --x <0..1> --y <0..1>",
                    "Tap the claimed device",
                )],
            )
            .await
        }
        SimulatorCommand::Tap(args) => {
            let command = tap_command(&args);
            let ws = match require_workspace(&command) {
                Ok(ws) => ws,
                Err(env) => return *env,
            };
            let mut data = workspace_payload(&ws);
            insert_opt_str(&mut data, "udid", args.udid);
            insert_opt_platform(&mut data, args.platform);
            data.insert("x".into(), json!(args.x));
            data.insert("y".into(), json!(args.y));
            invoke_env(
                &api,
                &command,
                "simulator_tap",
                Value::Object(data),
                vec![next(
                    "atmos simulator screenshot",
                    "Capture a screenshot to verify",
                )],
            )
            .await
        }
        SimulatorCommand::Swipe(args) => {
            let command = swipe_command(&args);
            let ws = match require_workspace(&command) {
                Ok(ws) => ws,
                Err(env) => return *env,
            };
            let mut data = workspace_payload(&ws);
            insert_opt_str(&mut data, "udid", args.udid);
            data.insert("x1".into(), json!(args.x1));
            data.insert("y1".into(), json!(args.y1));
            data.insert("x2".into(), json!(args.x2));
            data.insert("y2".into(), json!(args.y2));
            if let Some(ms) = args.duration_ms {
                data.insert("duration_ms".into(), json!(ms));
            }
            invoke_env(
                &api,
                &command,
                "simulator_swipe",
                Value::Object(data),
                vec![next(
                    "atmos simulator screenshot",
                    "Capture a screenshot to verify",
                )],
            )
            .await
        }
        SimulatorCommand::Type(args) => {
            let command = type_command(&args);
            let ws = match require_workspace(&command) {
                Ok(ws) => ws,
                Err(env) => return *env,
            };
            let mut data = workspace_payload(&ws);
            insert_opt_str(&mut data, "udid", args.udid);
            data.insert("text".into(), json!(args.text));
            invoke_env(
                &api,
                &command,
                "simulator_type",
                Value::Object(data),
                vec![next(
                    "atmos simulator screenshot",
                    "Capture a screenshot to verify",
                )],
            )
            .await
        }
        SimulatorCommand::Press(args) => {
            let command = press_command(&args);
            let ws = match require_workspace(&command) {
                Ok(ws) => ws,
                Err(env) => return *env,
            };
            let mut data = workspace_payload(&ws);
            insert_opt_str(&mut data, "udid", args.udid);
            data.insert("key".into(), json!(args.key.as_str()));
            invoke_env(
                &api,
                &command,
                "simulator_press",
                Value::Object(data),
                vec![next(
                    "atmos simulator screenshot",
                    "Capture a screenshot to verify",
                )],
            )
            .await
        }
        SimulatorCommand::Inventory => {
            let data = match context::resolve_workspace(None) {
                Some(ws) => Value::Object(workspace_payload(&ws)),
                None => json!({}),
            };
            invoke_env(
                &api,
                "atmos simulator inventory",
                "simulator_inventory",
                data,
                vec![
                    next(
                        "atmos simulator create --platform ios --type <id> --runtime <id>",
                        "Create a simulator or AVD",
                    ),
                    next("atmos simulator list", "List live claims"),
                ],
            )
            .await
        }
        SimulatorCommand::Create(args) => {
            let command = create_command(&args);
            invoke_env(
                &api,
                &command,
                "simulator_create",
                Value::Object(create_payload(&args)),
                vec![next(
                    "atmos simulator boot --udid <id> --platform ios|android",
                    "Power on the new device",
                )],
            )
            .await
        }
        SimulatorCommand::Boot(args) => {
            execute_device_op(
                &api,
                "atmos simulator boot",
                "simulator_boot",
                &args,
                vec![
                    next(
                        "atmos simulator start",
                        "Start Device Preview for this workspace",
                    ),
                    next(
                        "atmos simulator appearance get",
                        "Read light/dark appearance",
                    ),
                ],
            )
            .await
        }
        SimulatorCommand::Shutdown(args) => {
            execute_device_op(
                &api,
                "atmos simulator shutdown",
                "simulator_shutdown",
                &args,
                vec![next(
                    "atmos simulator boot --udid <id> --platform ios|android",
                    "Power the device back on",
                )],
            )
            .await
        }
        SimulatorCommand::Delete(args) => {
            execute_device_op(
                &api,
                "atmos simulator delete",
                "simulator_delete",
                &args,
                vec![next("atmos simulator inventory", "Refresh host inventory")],
            )
            .await
        }
        SimulatorCommand::Appearance { command } => execute_appearance(&api, command).await,
        SimulatorCommand::Camera { command } => execute_camera(&api, command).await,
    }
}

async fn execute_device_op(
    api: &ApiClientArgs,
    command_prefix: &str,
    action: &str,
    args: &SimulatorDeviceArgs,
    next_actions: Vec<NextAction>,
) -> CliEnvelope {
    let command = device_op_command(command_prefix, args);
    let ws = match require_workspace(&command) {
        Ok(ws) => ws,
        Err(env) => return *env,
    };
    let platform = match require_platform(&command, args.platform) {
        Ok(platform) => platform,
        Err(env) => return *env,
    };
    invoke_env(
        api,
        &command,
        action,
        Value::Object(device_op_payload(&ws, &args.udid, platform)),
        next_actions,
    )
    .await
}

async fn execute_appearance(
    api: &ApiClientArgs,
    command: SimulatorAppearanceCommand,
) -> CliEnvelope {
    match command {
        SimulatorAppearanceCommand::Get => {
            let command = "atmos simulator appearance get";
            let ws = match require_workspace(command) {
                Ok(ws) => ws,
                Err(env) => return *env,
            };
            invoke_env(
                api,
                command,
                "simulator_appearance_get",
                Value::Object(workspace_payload(&ws)),
                vec![next(
                    "atmos simulator appearance set dark",
                    "Set dark appearance",
                )],
            )
            .await
        }
        SimulatorAppearanceCommand::Set { appearance } => {
            let command = format!("atmos simulator appearance set {}", appearance.as_str());
            let ws = match require_workspace(&command) {
                Ok(ws) => ws,
                Err(env) => return *env,
            };
            let mut data = workspace_payload(&ws);
            data.insert("appearance".into(), json!(appearance.as_str()));
            invoke_env(
                api,
                &command,
                "simulator_appearance_set",
                Value::Object(data),
                vec![next(
                    "atmos simulator appearance get",
                    "Read the current appearance",
                )],
            )
            .await
        }
    }
}

async fn execute_camera(api: &ApiClientArgs, command: SimulatorCameraCommand) -> CliEnvelope {
    match command {
        SimulatorCameraCommand::Inject(args) => {
            let command = format!(
                "atmos simulator camera inject --lens {} --file {}",
                args.lens.as_str(),
                args.file
            );
            let ws = match require_workspace(&command) {
                Ok(ws) => ws,
                Err(env) => return *env,
            };
            let mut data = workspace_payload(&ws);
            data.insert("lens".into(), json!(args.lens.as_str()));
            data.insert("path".into(), json!(args.file));
            invoke_env(
                api,
                &command,
                "simulator_camera_inject",
                Value::Object(data),
                vec![next(
                    "atmos simulator camera clear --lens front",
                    "Clear the injected camera image",
                )],
            )
            .await
        }
        SimulatorCameraCommand::Clear(args) => {
            let command = format!("atmos simulator camera clear --lens {}", args.lens.as_str());
            let ws = match require_workspace(&command) {
                Ok(ws) => ws,
                Err(env) => return *env,
            };
            let mut data = workspace_payload(&ws);
            data.insert("lens".into(), json!(args.lens.as_str()));
            invoke_env(
                api,
                &command,
                "simulator_camera_clear",
                Value::Object(data),
                vec![next(
                    "atmos simulator camera inject --lens front --file <png>",
                    "Inject a camera PNG",
                )],
            )
            .await
        }
    }
}

async fn invoke_env(
    api: &ApiClientArgs,
    command: &str,
    action: &str,
    data: Value,
    next_actions: Vec<NextAction>,
) -> CliEnvelope {
    match invoke(api, action, data).await {
        Ok(result) => wrap_ok(command, result, next_actions),
        Err(e) => simulator_invoke_error(command, e),
    }
}

/// Map Device Control invoke codes onto agent-facing CLI envelopes.
/// Does not auto-start preview; `NO_CLAIM` tells the agent to use the Simulator tab.
fn simulator_invoke_error(command: &str, err: InvokeError) -> CliEnvelope {
    match err {
        InvokeError::Action { code, message } if code == "NO_CLAIM" => CliEnvelope::failure(
            command,
            code,
            message,
            "Start the Simulator tab, then retry",
            vec![
                next(
                    "Open the Simulator tab and start preview",
                    "Start Device Preview in the Simulator tab, then retry",
                ),
                next(
                    "atmos simulator start",
                    "Start Device Preview for this workspace, then retry",
                ),
            ],
        ),
        other => other.to_envelope(command),
    }
}

fn start_api(api: &ApiClientArgs) -> ApiClientArgs {
    let mut cloned = api.clone();
    cloned.timeout_ms = Some(api.timeout_ms.unwrap_or(START_TIMEOUT_MS));
    cloned
}

fn require_workspace(command: &str) -> Result<String, Box<CliEnvelope>> {
    require_workspace_id(command, context::resolve_workspace(None))
}

fn require_workspace_id(
    command: &str,
    workspace: Option<String>,
) -> Result<String, Box<CliEnvelope>> {
    match workspace {
        Some(id) if !id.trim().is_empty() => Ok(id),
        _ => Err(Box::new(missing_workspace(command))),
    }
}

fn missing_workspace(command: &str) -> CliEnvelope {
    CliEnvelope::failure(
        command,
        "CONTEXT_REQUIRED",
        "workspace id required",
        "Pass --workspace <id> or run: atmos context set --workspace <id>",
        vec![next(
            "atmos context set --workspace <id>",
            "Set sticky workspace context",
        )],
    )
}

fn require_platform(
    command: &str,
    platform: Option<SimulatorPlatform>,
) -> Result<SimulatorPlatform, Box<CliEnvelope>> {
    match platform {
        Some(platform) => Ok(platform),
        None => Err(Box::new(missing_platform(command))),
    }
}

fn missing_platform(command: &str) -> CliEnvelope {
    CliEnvelope::failure(
        command,
        "PLATFORM_REQUIRED",
        "platform required",
        "Pass --platform ios or --platform android",
        vec![next(
            format!("{command} --platform ios"),
            "Retry with an explicit platform",
        )],
    )
}

fn workspace_payload(workspace_id: &str) -> Map<String, Value> {
    let mut data = Map::new();
    data.insert("workspace_id".into(), json!(workspace_id));
    data
}

fn insert_opt_str(data: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value.filter(|s| !s.is_empty()) {
        data.insert(key.to_string(), json!(value));
    }
}

fn insert_opt_platform(data: &mut Map<String, Value>, platform: Option<SimulatorPlatform>) {
    if let Some(platform) = platform {
        data.insert("platform".into(), json!(platform.as_str()));
    }
}

fn create_payload(args: &SimulatorCreateArgs) -> Map<String, Value> {
    let mut data = Map::new();
    data.insert("platform".into(), json!(args.platform.as_str()));
    data.insert("device_type".into(), json!(args.device_type));
    data.insert("runtime".into(), json!(args.runtime));
    insert_opt_str(&mut data, "name", args.name.clone());
    data
}

fn device_op_payload(
    workspace_id: &str,
    udid: &str,
    platform: SimulatorPlatform,
) -> Map<String, Value> {
    let mut data = workspace_payload(workspace_id);
    data.insert("udid".into(), json!(udid));
    data.insert("platform".into(), json!(platform.as_str()));
    data
}

fn create_command(args: &SimulatorCreateArgs) -> String {
    let mut cmd = format!(
        "atmos simulator create --platform {} --type {} --runtime {}",
        args.platform.as_str(),
        args.device_type,
        args.runtime
    );
    if let Some(name) = &args.name {
        cmd.push_str(&format!(" --name {name}"));
    }
    cmd
}

fn device_op_command(prefix: &str, args: &SimulatorDeviceArgs) -> String {
    let mut cmd = format!("{prefix} --udid {}", args.udid);
    if let Some(platform) = args.platform {
        cmd.push_str(&format!(" --platform {}", platform.as_str()));
    }
    cmd
}

fn strip_status_for_agents(result: Value) -> Value {
    if result.is_null() {
        return Value::Null;
    }
    let Some(obj) = result.as_object() else {
        return result;
    };
    let mut out = Map::new();
    for key in STATUS_AGENT_FIELDS {
        if let Some(value) = obj.get(*key) {
            out.insert((*key).to_string(), value.clone());
        }
    }
    Value::Object(out)
}

fn start_command(args: &SimulatorStartArgs) -> String {
    let mut cmd = String::from("atmos simulator start");
    if let Some(platform) = args.platform {
        cmd.push_str(&format!(" --platform {}", platform.as_str()));
    }
    if let Some(udid) = &args.udid {
        cmd.push_str(&format!(" --udid {udid}"));
    }
    cmd
}

fn screenshot_command(args: &SimulatorScreenshotArgs) -> String {
    let mut cmd = String::from("atmos simulator screenshot");
    if let Some(udid) = &args.udid {
        cmd.push_str(&format!(" --udid {udid}"));
    }
    if let Some(platform) = args.platform {
        cmd.push_str(&format!(" --platform {}", platform.as_str()));
    }
    if let Some(out) = &args.out {
        cmd.push_str(&format!(" --out {out}"));
    }
    cmd
}

fn tap_command(args: &SimulatorTapArgs) -> String {
    let mut cmd = format!("atmos simulator tap --x {} --y {}", args.x, args.y);
    if let Some(udid) = &args.udid {
        cmd.push_str(&format!(" --udid {udid}"));
    }
    if let Some(platform) = args.platform {
        cmd.push_str(&format!(" --platform {}", platform.as_str()));
    }
    cmd
}

fn swipe_command(args: &SimulatorSwipeArgs) -> String {
    let mut cmd = format!(
        "atmos simulator swipe --x1 {} --y1 {} --x2 {} --y2 {}",
        args.x1, args.y1, args.x2, args.y2
    );
    if let Some(ms) = args.duration_ms {
        cmd.push_str(&format!(" --duration-ms {ms}"));
    }
    if let Some(udid) = &args.udid {
        cmd.push_str(&format!(" --udid {udid}"));
    }
    cmd
}

fn type_command(args: &SimulatorTypeArgs) -> String {
    let mut cmd = format!("atmos simulator type --text {}", args.text);
    if let Some(udid) = &args.udid {
        cmd.push_str(&format!(" --udid {udid}"));
    }
    cmd
}

fn press_command(args: &SimulatorPressArgs) -> String {
    let mut cmd = format!("atmos simulator press --key {}", args.key.as_str());
    if let Some(udid) = &args.udid {
        cmd.push_str(&format!(" --udid {udid}"));
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_workspace_is_context_required() {
        let err = require_workspace_id("atmos simulator tap", None).unwrap_err();
        let v = err.to_value();
        assert_eq!(v["ok"], false);
        assert_eq!(v["error"]["code"], "CONTEXT_REQUIRED");
        let fix = v["fix"].as_str().unwrap();
        assert!(fix.contains("atmos context set --workspace"));
        let actions = v["next_actions"].as_array().unwrap();
        assert!(actions.iter().any(|a| {
            a["command"]
                .as_str()
                .unwrap()
                .contains("atmos context set --workspace")
        }));
    }

    #[test]
    fn no_claim_action_uses_simulator_tab_fix() {
        let env = simulator_invoke_error(
            "atmos simulator tap --x 0.5 --y 0.5",
            InvokeError::Action {
                code: "NO_CLAIM".into(),
                message: "no live Device Preview claim".into(),
            },
        );
        let v = env.to_value();
        assert_eq!(v["ok"], false);
        assert_eq!(v["error"]["code"], "NO_CLAIM");
        assert_eq!(v["error"]["message"], "no live Device Preview claim");
        assert_eq!(v["fix"], "Start the Simulator tab, then retry");
        let actions = v["next_actions"].as_array().unwrap();
        assert!(actions
            .iter()
            .any(|a| a["command"].as_str().unwrap().contains("Simulator tab")));
        assert!(actions
            .iter()
            .any(|a| a["command"].as_str() == Some("atmos simulator start")));
    }

    #[test]
    fn other_action_codes_keep_generic_envelope() {
        let env = simulator_invoke_error(
            "atmos simulator screenshot",
            InvokeError::Action {
                code: "DEVICE_OFFLINE".into(),
                message: "helper is not reachable".into(),
            },
        );
        let v = env.to_value();
        assert_eq!(v["error"]["code"], "DEVICE_OFFLINE");
        assert_eq!(
            v["fix"],
            "Inspect the error code and fix the request payload or resource state"
        );
    }

    #[test]
    fn status_strip_keeps_only_agent_fields() {
        let raw = json!({
            "udid": "Pixel_8",
            "name": "Pixel 8",
            "platform": "android",
            "helper": "serve_emu",
            "workspace_id": "ws-1",
            "url": "http://127.0.0.1:9000",
            "port": 9000,
            "pid": 123,
            "version": "1.0",
            "argv_id": "Pixel_8",
        });
        let stripped = strip_status_for_agents(raw);
        assert_eq!(
            stripped,
            json!({
                "udid": "Pixel_8",
                "name": "Pixel 8",
                "platform": "android",
                "helper": "serve_emu",
                "workspace_id": "ws-1",
            })
        );
        assert_eq!(stripped.as_object().unwrap().len(), 5);
        assert!(stripped.get("url").is_none());
        assert!(stripped.get("port").is_none());
        assert!(stripped.get("pid").is_none());
    }

    #[test]
    fn status_strip_null_stays_null() {
        assert!(strip_status_for_agents(Value::Null).is_null());
    }

    #[test]
    fn stripped_status_json_has_no_url() {
        let text = serde_json::to_string(&strip_status_for_agents(json!({
            "udid": "AAA",
            "name": "iPhone",
            "platform": "ios",
            "helper": "serve_sim",
            "workspace_id": "ws-1",
            "url": "http://127.0.0.1:1",
            "port": 1,
            "pid": 9,
        })))
        .unwrap();
        assert!(!text.contains("url"));
        assert!(!text.contains("http://"));
        assert!(!text.contains("127.0.0.1"));
    }

    fn parse_simulator(args: &[&str]) -> SimulatorCommand {
        use clap::Parser;
        #[derive(Parser)]
        struct Probe {
            #[command(subcommand)]
            command: SimulatorCommand,
        }
        Probe::try_parse_from(std::iter::once("simulator").chain(args.iter().copied()))
            .unwrap_or_else(|e| panic!("{e}"))
            .command
    }

    #[test]
    fn parses_simulator_inventory_and_lifecycle_verbs() {
        assert!(matches!(
            parse_simulator(&["inventory"]),
            SimulatorCommand::Inventory
        ));
        match parse_simulator(&[
            "create",
            "--platform",
            "ios",
            "--type",
            "iPhone17,1",
            "--runtime",
            "com.apple.CoreSimulator.SimRuntime.iOS-18-0",
            "--name",
            "Phone",
        ]) {
            SimulatorCommand::Create(args) => {
                assert!(matches!(args.platform, SimulatorPlatform::Ios));
                assert_eq!(args.device_type, "iPhone17,1");
                assert_eq!(args.runtime, "com.apple.CoreSimulator.SimRuntime.iOS-18-0");
                assert_eq!(args.name.as_deref(), Some("Phone"));
                assert_eq!(
                    create_payload(&args),
                    json!({
                        "platform": "ios",
                        "device_type": "iPhone17,1",
                        "runtime": "com.apple.CoreSimulator.SimRuntime.iOS-18-0",
                        "name": "Phone",
                    })
                    .as_object()
                    .cloned()
                    .unwrap()
                );
            }
            other => panic!("expected create, got {other:?}"),
        }
        match parse_simulator(&["boot", "--udid", "AAA", "--platform", "android"]) {
            SimulatorCommand::Boot(args) => {
                assert_eq!(args.udid, "AAA");
                assert!(matches!(args.platform, Some(SimulatorPlatform::Android)));
                assert_eq!(
                    device_op_payload("ws-1", &args.udid, args.platform.unwrap()),
                    json!({
                        "workspace_id": "ws-1",
                        "udid": "AAA",
                        "platform": "android",
                    })
                    .as_object()
                    .cloned()
                    .unwrap()
                );
            }
            other => panic!("expected boot, got {other:?}"),
        }
        assert!(matches!(
            parse_simulator(&["shutdown", "--udid", "AAA", "--platform", "ios"]),
            SimulatorCommand::Shutdown(_)
        ));
        assert!(matches!(
            parse_simulator(&["delete", "--udid", "AAA", "--platform", "ios"]),
            SimulatorCommand::Delete(_)
        ));
    }

    #[test]
    fn parses_simulator_appearance_and_camera_verbs() {
        assert!(matches!(
            parse_simulator(&["appearance", "get"]),
            SimulatorCommand::Appearance {
                command: SimulatorAppearanceCommand::Get
            }
        ));
        match parse_simulator(&["appearance", "set", "dark"]) {
            SimulatorCommand::Appearance {
                command: SimulatorAppearanceCommand::Set { appearance },
            } => assert!(matches!(appearance, SimulatorAppearance::Dark)),
            other => panic!("expected appearance set, got {other:?}"),
        }
        match parse_simulator(&[
            "camera",
            "inject",
            "--lens",
            "front",
            "--file",
            "/tmp/cam.png",
        ]) {
            SimulatorCommand::Camera {
                command: SimulatorCameraCommand::Inject(args),
            } => {
                assert!(matches!(args.lens, SimulatorCameraLens::Front));
                assert_eq!(args.file, "/tmp/cam.png");
            }
            other => panic!("expected camera inject, got {other:?}"),
        }
        match parse_simulator(&["camera", "clear", "--lens", "back"]) {
            SimulatorCommand::Camera {
                command: SimulatorCameraCommand::Clear(args),
            } => assert!(matches!(args.lens, SimulatorCameraLens::Back)),
            other => panic!("expected camera clear, got {other:?}"),
        }
    }

    #[test]
    fn simulator_boot_without_platform_is_platform_required() {
        let err = require_platform("atmos simulator boot --udid AAA", None).unwrap_err();
        let v = err.to_value();
        assert_eq!(v["ok"], false);
        assert_eq!(v["error"]["code"], "PLATFORM_REQUIRED");
        assert!(v["fix"].as_str().unwrap().contains("--platform"));
    }

    #[test]
    fn simulator_lifecycle_verbs_need_workspace() {
        let err = require_workspace_id("atmos simulator boot --udid AAA --platform ios", None)
            .unwrap_err();
        let v = err.to_value();
        assert_eq!(v["error"]["code"], "CONTEXT_REQUIRED");
    }
}
