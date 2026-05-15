//! APP-015 `atmos canvas …` subcommands.
//!
//! Every verb (except `skill-dir`) talks to a running `apps/api` over HTTP at
//! `POST /api/canvas/agent/invoke`. The API server then relays the call into
//! the live tldraw editor running in the browser tab the user has open and
//! has explicitly opted in to terminal control.

use std::path::PathBuf;
use std::time::Duration;

use clap::{Args, Subcommand};
use reqwest::header::AUTHORIZATION;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::local::read_state_file;

const DEFAULT_TIMEOUT_MS: u64 = 45_000;

pub async fn execute(command: CanvasCommand) -> Result<Value, String> {
    match command {
        CanvasCommand::SkillDir(args) | CanvasCommand::SkillPath(args) => skill_dir(args),
        CanvasCommand::Status(args) => status(args).await,
        CanvasCommand::GetState(args) => {
            let body = args.body();
            invoke(args.global, "get_state", body).await
        }
        CanvasCommand::CreateNote(args) => {
            let body = args.body();
            invoke(args.global, "create_note", body).await
        }
        CanvasCommand::CreateFrame(args) => {
            let body = args.body();
            invoke(args.global, "create_frame", body).await
        }
        CanvasCommand::CreateGeo(args) => {
            let body = args.body()?;
            invoke(args.global, "create_geo", body).await
        }
        CanvasCommand::CreateArrow(args) => {
            let body = args.body();
            invoke(args.global, "create_arrow", body).await
        }
        CanvasCommand::CreateDraw(args) => {
            let body = args.body()?;
            invoke(args.global, "create_draw", body).await
        }
        CanvasCommand::Select(args) => {
            let body = args.body();
            invoke(args.global, "select", body).await
        }
        CanvasCommand::ClearSelection(args) => {
            invoke(args.global, "clear_selection", json!({})).await
        }
        CanvasCommand::Move(args) => {
            let body = args.body();
            invoke(args.global, "move", body).await
        }
        CanvasCommand::Delete(args) => {
            let body = args.body()?;
            invoke(args.global, "delete", body).await
        }
        CanvasCommand::LayoutRow(args) => {
            let body = args.body();
            invoke(args.global, "layout_row", body).await
        }
        CanvasCommand::LayoutColumn(args) => {
            let body = args.body();
            invoke(args.global, "layout_column", body).await
        }
        CanvasCommand::LayoutGrid(args) => {
            let body = args.body();
            invoke(args.global, "layout_grid", body).await
        }
        CanvasCommand::UpdateShape(args) => {
            let body = args.body()?;
            invoke(args.global, "update_shape", body).await
        }
        CanvasCommand::Viewport(args) => {
            let body = args.body();
            invoke(args.global, "viewport", body).await
        }
    }
}

#[derive(Debug, Subcommand)]
pub enum CanvasCommand {
    /// Print the on-disk path to the bundled canvas-agent skill.
    SkillDir(SkillDirArgs),
    /// Alias of `skill-dir`.
    SkillPath(SkillDirArgs),
    /// Diagnostics: who's registered, who's accepting commands, etc.
    Status(StatusArgs),
    /// Read-only inventory of the live canvas surface.
    GetState(GetStateArgs),
    /// Create a sticky note.
    CreateNote(CreateNoteArgs),
    /// Create an empty (or titled) frame.
    CreateFrame(CreateFrameArgs),
    /// Create a geo shape (rectangle / ellipse / triangle / …).
    CreateGeo(CreateGeoArgs),
    /// Draw an arrow from (x1,y1) to (x2,y2).
    CreateArrow(CreateArrowArgs),
    /// Create a freehand draw shape from a list of [x, y] points.
    CreateDraw(CreateDrawArgs),
    /// Select one or more shapes by id.
    Select(SelectArgs),
    /// Clear the current selection.
    ClearSelection(ClearSelectionArgs),
    /// Translate one or more shapes by (dx, dy).
    Move(MoveArgs),
    /// Delete shapes (requires --confirm).
    Delete(DeleteArgs),
    /// Lay out shapes in a horizontal row.
    LayoutRow(LayoutRowArgs),
    /// Lay out shapes in a vertical column.
    LayoutColumn(LayoutColumnArgs),
    /// Lay out shapes in an `--rows × --cols` grid (cap 24×24, 256 ids).
    LayoutGrid(LayoutGridArgs),
    /// Patch an existing shape with an allow-listed set of keys.
    UpdateShape(UpdateShapeArgs),
    /// Adjust the camera (zoom, pan, center on ids).
    Viewport(ViewportArgs),
}

#[derive(Debug, Args, Clone)]
pub struct GlobalArgs {
    /// Override the API base URL. Falls back to ATMOS_API_URL env / ~/.atmos/local/state.json.
    #[arg(long, global = true)]
    pub api_url: Option<String>,
    /// Override the bearer token. Falls back to ATMOS_API_TOKEN env.
    #[arg(long, global = true)]
    pub api_token: Option<String>,
    /// Pin the dispatch to a specific browser tab id (returned by `status`).
    #[arg(long, global = true)]
    pub client_id: Option<String>,
    /// Stable id for the Agent presence within the run.
    #[arg(long, global = true)]
    pub actor_id: Option<String>,
    /// Display name for the Agent presence.
    #[arg(long, global = true)]
    pub actor_name: Option<String>,
    /// CSS color for the Agent presence indicator.
    #[arg(long, global = true)]
    pub actor_color: Option<String>,
    /// Client-side HTTP deadline (ms). Default 45000.
    #[arg(long, global = true)]
    pub timeout_ms: Option<u64>,
}

// ===== Diagnostics =====

#[derive(Debug, Args)]
pub struct SkillDirArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
}

fn skill_dir(_args: SkillDirArgs) -> Result<Value, String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    let dir: PathBuf = home
        .join(".atmos")
        .join("skills")
        .join(".system")
        .join("atmos-canvas-agent");
    let skill_md = dir.join("SKILL.md");
    let blurb = format!(
        "Atmos has a bundled Canvas agent skill installed at:\n  {}\n\nIts SKILL.md is at:\n  {}\n\nRun `atmos canvas status` to confirm the bridge is online, then use\n`atmos canvas <verb>` to drive the open Canvas surface.",
        dir.display(),
        skill_md.display()
    );
    Ok(json!({
        "ok": true,
        "skill_dir": dir,
        "skill_md": skill_md,
        "skill_dir_exists": dir.is_dir(),
        "skill_md_exists": skill_md.is_file(),
        "blurb": blurb,
    }))
}

#[derive(Debug, Args)]
pub struct StatusArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
}

async fn status(args: StatusArgs) -> Result<Value, String> {
    let endpoint = build_url(&args.global, "/api/canvas/agent/status")?;
    let client = http_client(&args.global)?;
    let mut req = client.get(&endpoint);
    if let Some(token) = resolve_token(&args.global) {
        req = req.header(AUTHORIZATION, format!("Bearer {}", token));
    }
    let resp = req
        .send()
        .await
        .map_err(|err| format!("status request failed: {}", err))?;
    let status = resp.status();
    let value = resp
        .json::<Value>()
        .await
        .map_err(|err| format!("failed to parse status response: {}", err))?;
    if !status.is_success() {
        return Err(format!("status returned HTTP {}: {}", status, value));
    }
    Ok(value)
}

// ===== Verbs =====

#[derive(Debug, Args)]
pub struct GetStateArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    #[arg(long)]
    pub page_id: Option<String>,
}

impl GetStateArgs {
    fn body(&self) -> Value {
        let mut body = json!({});
        if let Some(page_id) = &self.page_id {
            body["page_id"] = json!(page_id);
        }
        body
    }
}

#[derive(Debug, Args)]
pub struct CreateNoteArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    #[arg(long)]
    pub text: String,
    #[arg(long)]
    pub x: Option<f64>,
    #[arg(long)]
    pub y: Option<f64>,
    #[arg(long)]
    pub w: Option<f64>,
    #[arg(long)]
    pub h: Option<f64>,
    #[arg(long)]
    pub color: Option<String>,
}

impl CreateNoteArgs {
    fn body(&self) -> Value {
        let mut body = json!({ "text": self.text });
        merge_optional(&mut body, "x", self.x);
        merge_optional(&mut body, "y", self.y);
        merge_optional(&mut body, "w", self.w);
        merge_optional(&mut body, "h", self.h);
        merge_optional_str(&mut body, "color", &self.color);
        body
    }
}

#[derive(Debug, Args)]
pub struct CreateFrameArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    #[arg(long)]
    pub title: Option<String>,
    #[arg(long)]
    pub x: Option<f64>,
    #[arg(long)]
    pub y: Option<f64>,
    #[arg(long, default_value_t = 640.0)]
    pub w: f64,
    #[arg(long, default_value_t = 440.0)]
    pub h: f64,
}

impl CreateFrameArgs {
    fn body(&self) -> Value {
        let mut body = json!({ "w": self.w, "h": self.h });
        merge_optional(&mut body, "x", self.x);
        merge_optional(&mut body, "y", self.y);
        merge_optional_str(&mut body, "title", &self.title);
        body
    }
}

#[derive(Debug, Args)]
pub struct CreateGeoArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    #[arg(long, default_value = "rectangle")]
    pub kind: String,
    #[arg(long, default_value_t = 200.0)]
    pub w: f64,
    #[arg(long, default_value_t = 200.0)]
    pub h: f64,
    #[arg(long)]
    pub x: Option<f64>,
    #[arg(long)]
    pub y: Option<f64>,
    #[arg(long)]
    pub text: Option<String>,
    #[arg(long)]
    pub color: Option<String>,
    #[arg(long)]
    pub fill: Option<String>,
    #[arg(long)]
    pub size: Option<String>,
}

impl CreateGeoArgs {
    fn body(&self) -> Result<Value, String> {
        let mut body = json!({ "kind": self.kind, "w": self.w, "h": self.h });
        merge_optional(&mut body, "x", self.x);
        merge_optional(&mut body, "y", self.y);
        merge_optional_str(&mut body, "text", &self.text);
        merge_optional_str(&mut body, "color", &self.color);
        merge_optional_str(&mut body, "fill", &self.fill);
        merge_optional_str(&mut body, "size", &self.size);
        Ok(body)
    }
}

#[derive(Debug, Args)]
pub struct CreateArrowArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    #[arg(long)]
    pub x1: f64,
    #[arg(long)]
    pub y1: f64,
    #[arg(long)]
    pub x2: f64,
    #[arg(long)]
    pub y2: f64,
    #[arg(long)]
    pub color: Option<String>,
    #[arg(long)]
    pub size: Option<String>,
    #[arg(long)]
    pub text: Option<String>,
}

impl CreateArrowArgs {
    fn body(&self) -> Value {
        let mut body = json!({
            "x1": self.x1,
            "y1": self.y1,
            "x2": self.x2,
            "y2": self.y2,
        });
        merge_optional_str(&mut body, "color", &self.color);
        merge_optional_str(&mut body, "size", &self.size);
        merge_optional_str(&mut body, "text", &self.text);
        body
    }
}

#[derive(Debug, Args)]
pub struct CreateDrawArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    /// Inline JSON array of [x, y] pairs, e.g. `[[0,0],[100,0],[100,100]]`.
    #[arg(long, conflicts_with = "points_file")]
    pub points: Option<String>,
    /// Path to a JSON file containing the same `[[x,y],…]` shape.
    #[arg(long)]
    pub points_file: Option<PathBuf>,
    #[arg(long)]
    pub color: Option<String>,
    #[arg(long)]
    pub size: Option<String>,
    #[arg(long, default_value_t = false)]
    pub closed: bool,
}

impl CreateDrawArgs {
    fn body(&self) -> Result<Value, String> {
        let raw = if let Some(inline) = &self.points {
            inline.clone()
        } else if let Some(path) = &self.points_file {
            std::fs::read_to_string(path)
                .map_err(|err| format!("failed to read {}: {}", path.display(), err))?
        } else {
            return Err("create-draw requires --points or --points-file".into());
        };
        let parsed: Vec<[f64; 2]> = serde_json::from_str(&raw)
            .map_err(|err| format!("points must be JSON [[x,y],…]: {}", err))?;
        let mut body = json!({ "points": parsed, "closed": self.closed });
        merge_optional_str(&mut body, "color", &self.color);
        merge_optional_str(&mut body, "size", &self.size);
        Ok(body)
    }
}

#[derive(Debug, Args)]
pub struct SelectArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    /// Comma-separated shape ids.
    #[arg(long)]
    pub ids: String,
}

impl SelectArgs {
    fn body(&self) -> Value {
        json!({ "ids": split_ids(&self.ids) })
    }
}

#[derive(Debug, Args)]
pub struct ClearSelectionArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
}

#[derive(Debug, Args)]
pub struct MoveArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    #[arg(long)]
    pub ids: String,
    #[arg(long)]
    pub dx: f64,
    #[arg(long)]
    pub dy: f64,
}

impl MoveArgs {
    fn body(&self) -> Value {
        json!({ "ids": split_ids(&self.ids), "dx": self.dx, "dy": self.dy })
    }
}

#[derive(Debug, Args)]
pub struct DeleteArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    #[arg(long)]
    pub ids: String,
    /// Required: passes `confirm: true` to the server.
    #[arg(long, default_value_t = false)]
    pub confirm: bool,
}

impl DeleteArgs {
    fn body(&self) -> Result<Value, String> {
        if !self.confirm {
            return Err(
                "delete is destructive — re-run with --confirm to acknowledge.".to_string()
            );
        }
        Ok(json!({ "ids": split_ids(&self.ids), "confirm": true }))
    }
}

#[derive(Debug, Args)]
pub struct LayoutRowArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    #[arg(long)]
    pub ids: String,
    #[arg(long, default_value_t = 24.0)]
    pub gap: f64,
    #[arg(long)]
    pub y: Option<f64>,
}

impl LayoutRowArgs {
    fn body(&self) -> Value {
        let mut body = json!({ "ids": split_ids(&self.ids), "gap": self.gap });
        merge_optional(&mut body, "y", self.y);
        body
    }
}

#[derive(Debug, Args)]
pub struct LayoutColumnArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    #[arg(long)]
    pub ids: String,
    #[arg(long, default_value_t = 24.0)]
    pub gap: f64,
    #[arg(long)]
    pub x: Option<f64>,
}

impl LayoutColumnArgs {
    fn body(&self) -> Value {
        let mut body = json!({ "ids": split_ids(&self.ids), "gap": self.gap });
        merge_optional(&mut body, "x", self.x);
        body
    }
}

#[derive(Debug, Args)]
pub struct LayoutGridArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    #[arg(long)]
    pub ids: String,
    #[arg(long)]
    pub cols: u32,
    #[arg(long)]
    pub rows: u32,
    #[arg(long, default_value_t = 24.0)]
    pub gap: f64,
}

impl LayoutGridArgs {
    fn body(&self) -> Value {
        json!({
            "ids": split_ids(&self.ids),
            "cols": self.cols,
            "rows": self.rows,
            "gap": self.gap,
        })
    }
}

#[derive(Debug, Args)]
pub struct UpdateShapeArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    #[arg(long)]
    pub id: String,
    /// JSON object. Allow-listed keys only (color, fill, text, size, font, geo, w, h, x, y).
    #[arg(long)]
    pub patch: String,
}

impl UpdateShapeArgs {
    fn body(&self) -> Result<Value, String> {
        let patch: Value = serde_json::from_str(&self.patch)
            .map_err(|err| format!("--patch must be valid JSON: {}", err))?;
        if !patch.is_object() {
            return Err("--patch must be a JSON object".into());
        }
        Ok(json!({ "id": self.id, "patch": patch }))
    }
}

#[derive(Debug, Args)]
pub struct ViewportArgs {
    #[command(flatten)]
    pub global: GlobalArgs,
    #[arg(long)]
    pub zoom: Option<f64>,
    #[arg(long)]
    pub pan_x: Option<f64>,
    #[arg(long)]
    pub pan_y: Option<f64>,
    /// Comma-separated shape ids to center on.
    #[arg(long)]
    pub center_ids: Option<String>,
}

impl ViewportArgs {
    fn body(&self) -> Value {
        let mut body = json!({});
        merge_optional(&mut body, "zoom", self.zoom);
        merge_optional(&mut body, "pan_x", self.pan_x);
        merge_optional(&mut body, "pan_y", self.pan_y);
        if let Some(ids) = &self.center_ids {
            body["center_ids"] = json!(split_ids(ids));
        }
        body
    }
}

// ===== HTTP plumbing =====

#[derive(Debug, Serialize)]
struct InvokePayload<'a> {
    request_id: String,
    command: &'a str,
    args: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    actor: Option<Actor>,
    timeout_ms: u64,
}

#[derive(Debug, Serialize)]
struct Actor {
    actor_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
}

#[derive(Debug, Deserialize)]
struct InvokeResponse {
    ok: bool,
    request_id: String,
    #[serde(default)]
    data: Option<Value>,
    #[serde(default)]
    error: Option<InvokeError>,
}

#[derive(Debug, Deserialize)]
struct InvokeError {
    code: String,
    message: String,
    #[serde(default)]
    recoverable: bool,
}

async fn invoke(global: GlobalArgs, command: &str, args: Value) -> Result<Value, String> {
    let endpoint = build_url(&global, "/api/canvas/agent/invoke")?;
    let client = http_client(&global)?;
    let request_id = new_request_id();
    let payload = InvokePayload {
        request_id: request_id.clone(),
        command,
        args,
        client_id: global.client_id.clone(),
        actor: build_actor(&global),
        timeout_ms: global.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS),
    };
    let mut req = client.post(&endpoint).json(&payload);
    if let Some(token) = resolve_token(&global) {
        req = req.header(AUTHORIZATION, format!("Bearer {}", token));
    }
    let resp = req
        .send()
        .await
        .map_err(|err| format!("invoke request failed: {}", err))?;

    let status = resp.status();
    let body: InvokeResponse = resp
        .json()
        .await
        .map_err(|err| format!("failed to parse invoke response: {}", err))?;

    if body.ok {
        Ok(json!({
            "ok": true,
            "request_id": body.request_id,
            "data": body.data.unwrap_or(Value::Null),
        }))
    } else {
        let err = body.error.unwrap_or(InvokeError {
            code: format!("HTTP_{}", status.as_u16()),
            message: "Empty error payload".into(),
            recoverable: false,
        });
        Err(format!(
            "[{}] {} (recoverable={}, request_id={})",
            err.code, err.message, err.recoverable, body.request_id
        ))
    }
}

fn build_actor(global: &GlobalArgs) -> Option<Actor> {
    let actor_id = global.actor_id.clone()?;
    Some(Actor {
        actor_id,
        name: global.actor_name.clone(),
        color: global.actor_color.clone(),
    })
}

fn build_url(global: &GlobalArgs, path: &str) -> Result<String, String> {
    let base = resolve_base_url(global)?;
    let trimmed = base.trim_end_matches('/');
    Ok(format!("{}{}", trimmed, path))
}

fn resolve_base_url(global: &GlobalArgs) -> Result<String, String> {
    if let Some(explicit) = &global.api_url {
        return Ok(explicit.clone());
    }
    if let Ok(env_url) = std::env::var("ATMOS_API_URL") {
        if !env_url.trim().is_empty() {
            return Ok(env_url);
        }
    }
    if let Ok(Some(state)) = read_state_file() {
        return Ok(state.url);
    }
    Err(
        "API URL not provided — pass --api-url, set ATMOS_API_URL, or start `atmos local start`."
            .into(),
    )
}

fn resolve_token(global: &GlobalArgs) -> Option<String> {
    if let Some(token) = &global.api_token {
        if !token.is_empty() {
            return Some(token.clone());
        }
    }
    std::env::var("ATMOS_API_TOKEN").ok().filter(|v| !v.is_empty())
}

fn http_client(global: &GlobalArgs) -> Result<reqwest::Client, String> {
    let timeout = Duration::from_millis(
        global
            .timeout_ms
            .unwrap_or(DEFAULT_TIMEOUT_MS)
            // Give the HTTP client some headroom over the relay timeout so
            // the server-side timeout (which yields a structured error) wins
            // before the local socket bails.
            .saturating_add(5_000),
    );
    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|err| format!("failed to build http client: {}", err))
}

fn split_ids(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn merge_optional<T: Into<Value>>(body: &mut Value, key: &str, value: Option<T>) {
    if let Some(v) = value {
        body[key] = v.into();
    }
}

fn merge_optional_str(body: &mut Value, key: &str, value: &Option<String>) {
    if let Some(v) = value {
        body[key] = json!(v);
    }
}

fn new_request_id() -> String {
    let now = chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default();
    let rand: u32 = rand_u32();
    format!("cli-{:x}-{:08x}", now, rand)
}

fn rand_u32() -> u32 {
    // Cheap pseudo-random correlation id — only the pair (ts, rand) matters,
    // never used for security.
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let mix = dur.subsec_nanos() ^ (std::process::id());
    mix.wrapping_mul(2654435761)
}
