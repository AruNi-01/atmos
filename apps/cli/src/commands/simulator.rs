//! `atmos simulator` — control the Simulator surface in Atmos Desktop.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::Engine as _;
use clap::{Args, Subcommand, ValueEnum};
use reqwest::header::AUTHORIZATION;
use serde::Deserialize;
use serde_json::{json, Value};

const CONTROL_PROTOCOL: &str = "atmos-simulator/v1";
const INVOKE_PATH: &str = "/v1/invoke";

#[derive(Debug)]
pub struct SimulatorOutput {
    pub value: Value,
    pub exit_code: i32,
}

#[derive(Debug, Args)]
pub struct SimulatorOpts {
    /// Workspace to control. If omitted, the bridge resolves the active session.
    #[arg(long, global = true)]
    pub workspace: Option<String>,
}

#[derive(Debug, Subcommand)]
pub enum SimulatorCommand {
    /// List available and active simulators.
    List,
    /// Attach the workspace to a simulator.
    Attach(AttachArgs),
    /// Tap at normalized coordinates.
    Tap(TapArgs),
    /// Type text into the active simulator.
    Type(TypeArgs),
    /// Perform a swipe or pinch gesture.
    Gesture(GestureArgs),
    /// Press a simulator button.
    Button(ButtonArgs),
    /// Change simulator orientation.
    Rotate(RotateArgs),
    /// Capture one frame.
    Screenshot(ScreenshotArgs),
    /// Read the accessibility tree.
    Ax,
    /// Read recent helper logs.
    Logs(LogsArgs),
    /// Disconnect, optionally shutting down the simulator.
    Kill(KillArgs),
}

#[derive(Debug, Args)]
pub struct AttachArgs {
    /// Simulator identifier.
    #[arg(long)]
    pub id: Option<String>,
}

#[derive(Debug, Args)]
pub struct TapArgs {
    #[arg(long)]
    pub x: f64,
    #[arg(long)]
    pub y: f64,
}

#[derive(Debug, Args)]
pub struct TypeArgs {
    /// Text to type.
    #[arg(long)]
    pub text: Option<String>,
    /// Read additional text from standard input.
    #[arg(long, default_value_t = false)]
    pub stdin: bool,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
#[clap(rename_all = "lower")]
pub enum GestureKind {
    Swipe,
    Pinch,
}

impl GestureKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Swipe => "swipe",
            Self::Pinch => "pinch",
        }
    }
}

#[derive(Debug, Args)]
pub struct GestureArgs {
    #[arg(long, value_enum)]
    pub kind: GestureKind,
    #[arg(long)]
    pub x1: f64,
    #[arg(long)]
    pub y1: f64,
    #[arg(long)]
    pub x2: f64,
    #[arg(long)]
    pub y2: f64,
    #[arg(long = "duration-ms")]
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum ButtonName {
    Home,
    Lock,
    Siri,
    #[value(name = "volume_up")]
    VolumeUp,
    #[value(name = "volume_down")]
    VolumeDown,
}

impl ButtonName {
    fn as_str(self) -> &'static str {
        match self {
            Self::Home => "home",
            Self::Lock => "lock",
            Self::Siri => "siri",
            Self::VolumeUp => "volume_up",
            Self::VolumeDown => "volume_down",
        }
    }
}

#[derive(Debug, Args)]
pub struct ButtonArgs {
    #[arg(long, value_enum)]
    pub name: ButtonName,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum Orientation {
    Portrait,
    #[value(name = "portrait_upside_down")]
    PortraitUpsideDown,
    #[value(name = "landscape_left")]
    LandscapeLeft,
    #[value(name = "landscape_right")]
    LandscapeRight,
}

impl Orientation {
    fn as_str(self) -> &'static str {
        match self {
            Self::Portrait => "portrait",
            Self::PortraitUpsideDown => "portrait_upside_down",
            Self::LandscapeLeft => "landscape_left",
            Self::LandscapeRight => "landscape_right",
        }
    }
}

#[derive(Debug, Args)]
pub struct RotateArgs {
    #[arg(long, value_enum)]
    pub orientation: Orientation,
}

#[derive(Debug, Args)]
pub struct ScreenshotArgs {
    /// Write the returned frame to this path.
    #[arg(long)]
    pub out: Option<PathBuf>,
}

#[derive(Debug, Args)]
pub struct LogsArgs {
    #[arg(long)]
    pub tail: u64,
}

#[derive(Debug, Args)]
pub struct KillArgs {
    #[arg(long, default_value_t = false)]
    pub shutdown_simulator: bool,
}

#[derive(Debug, Deserialize)]
struct ControlFile {
    #[serde(default)]
    protocol: Option<String>,
    base_url: String,
    token: String,
}

pub async fn execute(
    workspace: Option<String>,
    command: SimulatorCommand,
) -> Result<SimulatorOutput, String> {
    let client = SimulatorClient::discover()?;
    let screenshot_out = match &command {
        SimulatorCommand::Screenshot(args) => args.out.clone(),
        _ => None,
    };
    let (op, args) = match command {
        SimulatorCommand::List => ("list", json!({})),
        SimulatorCommand::Attach(args) => ("attach", json!({ "id": args.id })),
        SimulatorCommand::Tap(args) => {
            if let Err(error_code) = assert_normalized_coord(args.x, args.y) {
                return Ok(protocol_error(
                    error_code,
                    "Coordinates must be in the inclusive 0–1 range",
                ));
            }
            ("tap", json!({ "x": args.x, "y": args.y }))
        }
        SimulatorCommand::Type(args) => {
            let text = match read_type_text(args) {
                Ok(text) => text,
                Err(output) => return Ok(output),
            };
            ("type", json!({ "text": text }))
        }
        SimulatorCommand::Gesture(args) => {
            for (x, y) in [(args.x1, args.y1), (args.x2, args.y2)] {
                if let Err(error_code) = assert_normalized_coord(x, y) {
                    return Ok(protocol_error(
                        error_code,
                        "Coordinates must be in the inclusive 0–1 range",
                    ));
                }
            }
            (
                "gesture",
                json!({
                    "kind": args.kind.as_str(),
                    "x1": args.x1,
                    "y1": args.y1,
                    "x2": args.x2,
                    "y2": args.y2,
                    "durationMs": args.duration_ms,
                }),
            )
        }
        SimulatorCommand::Button(args) => ("button", json!({ "name": args.name.as_str() })),
        SimulatorCommand::Rotate(args) => (
            "rotate",
            json!({ "orientation": args.orientation.as_str() }),
        ),
        SimulatorCommand::Screenshot(_) => ("screenshot", json!({})),
        SimulatorCommand::Ax => ("ax", json!({})),
        SimulatorCommand::Logs(args) => ("logs", json!({ "tail": args.tail })),
        SimulatorCommand::Kill(args) => (
            "kill",
            json!({ "shutdownSimulator": args.shutdown_simulator }),
        ),
    };

    let output = client.invoke(op, workspace.as_deref(), args).await?;
    if output.exit_code == 0 {
        if let Some(path) = screenshot_out {
            let result = output
                .value
                .get("result")
                .ok_or_else(|| "screenshot response is missing result".to_string())?;
            write_screenshot_result(result, &path)?;
        }
    }
    Ok(output)
}

fn read_type_text(args: TypeArgs) -> Result<String, SimulatorOutput> {
    if args.text.is_none() && !args.stdin {
        return Err(protocol_error(
            "invalid_args",
            "type requires --text and/or --stdin",
        ));
    }

    let mut text = args.text.unwrap_or_default();
    if args.stdin {
        let mut stdin_text = String::new();
        if let Err(error) = std::io::stdin().read_to_string(&mut stdin_text) {
            return Err(protocol_error(
                "stdin_read_failed",
                &format!("failed to read stdin: {error}"),
            ));
        }
        text.push_str(&stdin_text);
    }
    Ok(text)
}

fn protocol_error(error_code: &str, message: &str) -> SimulatorOutput {
    SimulatorOutput {
        value: json!({
            "ok": false,
            "error_code": error_code,
            "error": message,
        }),
        exit_code: exit_code_for(error_code),
    }
}

#[derive(Debug)]
struct SimulatorClient {
    base_url: String,
    token: String,
    client: reqwest::Client,
}

impl SimulatorClient {
    fn discover() -> Result<Self, String> {
        let control_path = simulator_control_path()?;
        let raw = std::fs::read_to_string(&control_path).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                format!(
                    "Simulator control file not found at {}. Atmos Desktop must be running.",
                    control_path.display()
                )
            } else {
                format!(
                    "failed to read Simulator control file {}: {error}",
                    control_path.display()
                )
            }
        })?;
        let control: ControlFile = serde_json::from_str(&raw).map_err(|error| {
            format!(
                "failed to parse Simulator control file {}: {error}",
                control_path.display()
            )
        })?;
        if let Some(protocol) = control.protocol.as_deref() {
            if protocol != CONTROL_PROTOCOL {
                return Err(format!(
                    "unsupported Simulator control protocol {protocol:?}; expected {CONTROL_PROTOCOL:?}"
                ));
            }
        }
        if !is_loopback_base_url(&control.base_url) {
            return Err(format!(
                "refusing non-loopback Simulator control URL: {}",
                control.base_url
            ));
        }

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| format!("failed to create Simulator HTTP client: {error}"))?;
        Ok(Self {
            base_url: control.base_url,
            token: control.token,
            client,
        })
    }

    async fn invoke(
        &self,
        op: &str,
        workspace: Option<&str>,
        args: Value,
    ) -> Result<SimulatorOutput, String> {
        let endpoint = format!("{}{}", self.base_url.trim_end_matches('/'), INVOKE_PATH);
        let mut body = json!({
            "op": op,
            "args": args,
        });
        if let Some(workspace) = workspace {
            body["workspaceId"] = json!(workspace);
        }

        let response = self
            .client
            .post(&endpoint)
            .header(AUTHORIZATION, format!("Bearer {}", self.token))
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("Simulator request failed ({endpoint}): {error}"))?;
        let status = response.status();
        let raw = response
            .bytes()
            .await
            .map_err(|error| format!("failed to read Simulator response: {error}"))?;
        let value: Value = serde_json::from_slice(&raw).map_err(|error| {
            format!(
                "failed to parse Simulator response (HTTP {}): {}",
                status,
                response_preview(&raw, error)
            )
        })?;

        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(format!(
                "Simulator control request was rejected (HTTP {status})"
            ));
        }
        let protocol_error_code = value
            .get("error_code")
            .and_then(Value::as_str)
            .filter(|_| value.get("ok").and_then(Value::as_bool) == Some(false));
        if !status.is_success() && protocol_error_code.is_none() {
            return Err(format!(
                "Simulator control request failed (HTTP {status}): {value}"
            ));
        }

        let exit_code = protocol_error_code.map(exit_code_for).unwrap_or(0);
        Ok(SimulatorOutput { value, exit_code })
    }
}

fn simulator_control_path() -> Result<PathBuf, String> {
    let state_dir =
        if let Some(home) = std::env::var_os("ATMOS_HOME").filter(|home| !home.is_empty()) {
            PathBuf::from(home).join("state")
        } else {
            runtime_manager::state_dir()?
        };
    Ok(state_dir.join("simulator").join("control.json"))
}

fn response_preview(raw: &[u8], parse_error: serde_json::Error) -> String {
    let text = String::from_utf8_lossy(raw);
    let text = text.trim();
    let preview = if text.is_empty() {
        "<empty body>".to_string()
    } else if text.chars().count() > 512 {
        format!("{}…", text.chars().take(512).collect::<String>())
    } else {
        text.to_string()
    };
    format!("{preview} ({parse_error})")
}

pub fn assert_normalized_coord(x: f64, y: f64) -> Result<(), String> {
    if !x.is_finite() || !y.is_finite() || !(0.0..=1.0).contains(&x) || !(0.0..=1.0).contains(&y) {
        return Err("coord_out_of_range".to_string());
    }
    Ok(())
}

pub fn resolve_workspace(
    workspace: Option<&str>,
    active_workspaces: &[&str],
) -> Result<String, Value> {
    if let Some(workspace) = workspace {
        return Ok(workspace.to_string());
    }
    match active_workspaces {
        [workspace] => Ok((*workspace).to_string()),
        [] => Err(json!({
            "ok": false,
            "error_code": "no_session",
            "error": "No Simulator session is active",
        })),
        candidates => Err(json!({
            "ok": false,
            "error_code": "workspace_ambiguous",
            "error": "Multiple workspaces have active Simulator sessions",
            "candidates": candidates,
        })),
    }
}

pub fn is_loopback_base_url(base_url: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(base_url) else {
        return false;
    };
    matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
}

pub fn exit_code_for(error_code: &str) -> i32 {
    match error_code {
        "setup_required"
        | "simulator_in_use"
        | "workspace_ambiguous"
        | "coord_out_of_range"
        | "no_session"
        | "missing_simctl"
        | "missing_ios_runtime"
        | "missing_iphone"
        | "helper_missing"
        | "platform_not_macos"
        | "helper_arch_unsupported"
        | "macos_too_old"
        | "capture_xcode_mismatch"
        | "capture_failed"
        | "helper_bind_not_loopback"
        | "helper_dead" => 2,
        _ if error_code.ends_with("_required") => 2,
        _ => 1,
    }
}

fn write_screenshot_result(result: &Value, path: &Path) -> Result<(), String> {
    let bytes = match result {
        Value::String(value) => screenshot_text_bytes(value),
        other => serde_json::to_vec(other)
            .map_err(|error| format!("failed to serialize screenshot result: {error}"))?,
    };
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    std::fs::write(path, bytes)
        .map_err(|error| format!("failed to write screenshot {}: {error}", path.display()))
}

fn screenshot_text_bytes(value: &str) -> Vec<u8> {
    let raw_text = value.trim();
    let json_string = serde_json::from_str::<String>(raw_text).ok();
    let text = json_string.as_deref().unwrap_or(raw_text);
    let encoded = text
        .strip_prefix("data:image/png;base64,")
        .or_else(|| text.strip_prefix("data:image/jpeg;base64,"));
    if let Some(encoded) = encoded {
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(encoded) {
            return bytes;
        }
    }

    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(text) {
        if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return bytes;
        }
    }
    value.as_bytes().to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_out_of_range_coordinates() {
        assert_eq!(
            assert_normalized_coord(1.5, 0.2),
            Err("coord_out_of_range".to_string())
        );
        assert!(assert_normalized_coord(0.0, 1.0).is_ok());
    }

    #[test]
    fn resolves_workspace_or_reports_candidates() {
        let error = resolve_workspace(None, &["a", "b"]).unwrap_err();
        assert_eq!(error["error_code"], "workspace_ambiguous");
        assert_eq!(error["candidates"], json!(["a", "b"]));
        assert_eq!(resolve_workspace(None, &["a"]).unwrap(), "a");
        assert_eq!(resolve_workspace(Some("x"), &["a", "b"]).unwrap(), "x");
    }

    #[test]
    fn accepts_only_loopback_urls() {
        assert!(is_loopback_base_url("http://127.0.0.1:52413"));
        assert!(is_loopback_base_url("http://localhost:52413"));
        assert!(!is_loopback_base_url("http://0.0.0.0:52413"));
        assert!(!is_loopback_base_url("http://example.com"));
    }

    #[test]
    fn maps_protocol_errors_to_exit_codes() {
        assert_eq!(exit_code_for("coord_out_of_range"), 2);
        assert_eq!(exit_code_for("missing_runtime_required"), 2);
        assert_eq!(exit_code_for("missing_iphone"), 2);
        assert_eq!(exit_code_for("helper_dead"), 2);
        assert_eq!(exit_code_for("unknown_op"), 1);
    }
}
