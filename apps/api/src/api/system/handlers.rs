use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use infra::utils::debug_logging::DebugLogger;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet, HashSet},
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio_util::io::ReaderStream;
use tracing::{info, warn};
use tree_sitter::{Language, Node, Parser};

use crate::api::dto::ApiResponse;
use crate::error::ApiError;
use crate::{app_state::AppState, error::ApiResult};

use super::diagnostics;
use super::skills;

#[derive(Deserialize)]
pub struct KillTmuxSessionPayload {
    pub session_name: String,
}

#[derive(Deserialize)]
pub struct KillOrphanedProcessesPayload {
    pub pids: Vec<u32>,
}

#[derive(Deserialize)]
pub struct BuildProjectWikiAstPayload {
    pub project_path: String,
}

/// GET /api/system/tmux-status
pub async fn get_tmux_status(State(state): State<AppState>) -> ApiResult<Json<ApiResponse<Value>>> {
    let installed = state.terminal_service.is_tmux_available();

    let version = if installed {
        state
            .terminal_service
            .get_tmux_version()
            .ok()
            .map(|v| v.raw)
    } else {
        None
    };

    Ok(Json(ApiResponse::success(json!({
        "installed": installed,
        "version": version,
    }))))
}

/// GET /api/system/tmux-install-plan
pub async fn get_tmux_install_plan(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let plan = state.terminal_service.get_tmux_install_plan();

    Ok(Json(ApiResponse::success(json!({
        "installed": plan.installed,
        "supported": plan.supported,
        "platform": plan.platform,
        "package_manager": plan.package_manager,
        "package_manager_label": plan.package_manager_label,
        "command": plan.command,
        "requires_sudo": plan.requires_sudo,
        "reason": plan.reason,
    }))))
}

/// GET /api/system/tmux-sessions
pub async fn list_tmux_sessions(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let tmux_engine = state.terminal_service.tmux_engine();

    let sessions = tmux_engine
        .list_atmos_sessions()
        .map(|sessions| {
            sessions
                .into_iter()
                .map(|s| {
                    json!({
                        "name": s.name,
                        "windows": s.windows,
                        "created": s.created,
                        "attached": s.attached,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(Json(ApiResponse::success(json!({
        "sessions": sessions
    }))))
}

/// Resolve workspace_id to tmux session name. Tries workspace lookup (for name-based sessions)
/// then falls back to workspace_id-based session name.
async fn resolve_session_name(state: &AppState, workspace_id: &str) -> Option<String> {
    if let Ok(session_name) = state
        .workspace_service
        .resolve_tmux_session_name(workspace_id, &state.terminal_service.tmux_engine())
        .await
    {
        return Some(session_name);
    }

    if let Ok(Some(proj)) = state
        .project_service
        .get_project(workspace_id.to_string())
        .await
    {
        return Some(
            state
                .terminal_service
                .tmux_engine()
                .get_session_name_from_names(&proj.name, "Main"),
        );
    }
    Some(
        state
            .terminal_service
            .tmux_engine()
            .get_session_name(workspace_id),
    )
}

/// GET /api/system/project-wiki-window/:workspace_id
pub async fn check_project_wiki_window(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let session_name = match resolve_session_name(&state, &workspace_id).await {
        Some(s) => s,
        None => return Ok(Json(ApiResponse::success(json!({ "exists": false })))),
    };
    let exists = state
        .terminal_service
        .has_project_wiki_window(&session_name)
        .unwrap_or(false);
    Ok(Json(ApiResponse::success(json!({ "exists": exists }))))
}

/// POST /api/system/project-wiki-window/:workspace_id
pub async fn kill_project_wiki_window(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let session_name = match resolve_session_name(&state, &workspace_id).await {
        Some(s) => s,
        None => {
            return Ok(Json(ApiResponse::success(json!({
                "killed": false,
                "message": "Could not resolve workspace to tmux session"
            }))))
        }
    };
    match state
        .terminal_service
        .kill_project_wiki_window(&session_name)
    {
        Ok(()) => Ok(Json(ApiResponse::success(json!({
            "killed": true,
            "message": "Project Wiki window closed"
        })))),
        Err(e) => Ok(Json(ApiResponse::success(json!({
            "killed": false,
            "message": format!("{}", e)
        })))),
    }
}

/// POST /api/system/project-wiki-ast/:workspace_id
pub async fn build_project_wiki_ast(
    State(_state): State<AppState>,
    axum::extract::Path(_workspace_id): axum::extract::Path<String>,
    Json(payload): Json<BuildProjectWikiAstPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let project_path = PathBuf::from(payload.project_path.trim());
    if !project_path.is_dir() {
        return Err(ApiError::BadRequest(format!(
            "Invalid project path: {}",
            project_path.display()
        )));
    }

    let project_path_for_worker = project_path.clone();
    let result = tokio::task::spawn_blocking(move || build_ast_artifacts(&project_path_for_worker))
        .await
        .map_err(|e| ApiError::InternalError(format!("AST worker join failed: {}", e)))?
        .map_err(|e| ApiError::InternalError(e.to_string()))?;

    let logger = DebugLogger::new("project_wiki");
    logger.log(
        "project_wiki",
        "ast_index_built",
        Some(json!({
            "projectPath": project_path.display().to_string(),
            "indexedFiles": result.indexed_files,
            "symbolCount": result.symbol_count,
            "relationCount": result.relation_count,
            "commitHash": result.commit_hash,
        })),
    );

    Ok(Json(ApiResponse::success(json!({
        "success": true,
        "indexed_files": result.indexed_files,
        "symbol_count": result.symbol_count,
        "relation_count": result.relation_count,
        "ast_dir": ".atmos/wiki/_ast",
        "commit_hash": result.commit_hash,
    }))))
}

#[derive(Debug)]
struct AstBuildResult {
    indexed_files: usize,
    symbol_count: usize,
    relation_count: usize,
    commit_hash: Option<String>,
}

fn build_ast_artifacts(project_root: &Path) -> Result<AstBuildResult, std::io::Error> {
    let wiki_ast_dir = project_root.join(".atmos").join("wiki").join("_ast");
    let shard_dir = wiki_ast_dir.join("files");
    fs::create_dir_all(&wiki_ast_dir)?;
    fs::create_dir_all(&shard_dir)?;

    let mut symbols_file = File::create(wiki_ast_dir.join("symbols.jsonl"))?;
    let mut relations_file = File::create(wiki_ast_dir.join("relations.jsonl"))?;

    let mut source_files = Vec::new();
    collect_source_files(project_root, &mut source_files)?;

    let mut symbol_count = 0usize;
    let mut relation_count = 0usize;
    let mut file_index = Vec::new();

    for file_path in &source_files {
        let rel = file_path
            .strip_prefix(project_root)
            .unwrap_or(file_path)
            .to_string_lossy()
            .replace('\\', "/");

        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let Some(lang_kind) = language_kind_for_file(file_path) else {
            continue;
        };

        let parsed = parse_with_embedded_parser(&content, lang_kind);
        let (symbols, relations, parser_warning) = match parsed {
            Ok(result) => result,
            Err(err) => (Vec::new(), Vec::new(), Some(err)),
        };

        for symbol in &symbols {
            writeln!(symbols_file, "{}", serde_json::to_string(symbol)?)?;
            symbol_count += 1;
        }
        for relation in &relations {
            writeln!(relations_file, "{}", serde_json::to_string(relation)?)?;
            relation_count += 1;
        }

        let shard_name = format!("{}.json", hash_path(&rel));
        let shard_rel_path = format!("files/{}", shard_name);
        let shard_full_path = shard_dir.join(shard_name);
        let shard_payload = json!({
            "file": rel,
            "language": lang_kind.as_str(),
            "symbol_count": symbols.len(),
            "relation_count": relations.len(),
            "symbols": symbols,
            "relations": relations,
            "parser_warning": parser_warning,
        });
        fs::write(
            shard_full_path,
            serde_json::to_string_pretty(&shard_payload)?,
        )?;

        file_index.push(json!({
            "file": rel,
            "language": lang_kind.as_str(),
            "symbol_count": shard_payload["symbol_count"],
            "relation_count": shard_payload["relation_count"],
            "shard": shard_rel_path,
            "parser_warning": parser_warning,
        }));
    }

    let commit_hash = current_git_commit(project_root);
    let now_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default();

    let language_count = count_languages(&source_files);
    let hierarchy = build_hierarchy_index(
        &file_index
            .iter()
            .filter_map(|v| v.get("file").and_then(Value::as_str))
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>(),
    );
    let status = json!({
        "generated_at_unix": now_unix,
        "commit_hash": commit_hash,
        "indexed_files": source_files.len(),
        "symbol_count": symbol_count,
        "relation_count": relation_count,
        "languages": language_count,
        "index_files": {
            "global_symbols": "symbols.jsonl",
            "global_relations": "relations.jsonl",
            "file_index": "index.json",
            "hierarchy": "hierarchy.json"
        },
        "generator": "api.system.build_project_wiki_ast.tree_sitter_embedded"
    });
    fs::write(
        wiki_ast_dir.join("_status.json"),
        serde_json::to_string_pretty(&status)?,
    )?;
    fs::write(
        wiki_ast_dir.join("index.json"),
        serde_json::to_string_pretty(&json!({
            "generated_at_unix": now_unix,
            "commit_hash": commit_hash,
            "files": file_index,
            "progressive_disclosure": {
                "entrypoint": "index.json",
                "first_step": "Read hierarchy.json to select relevant dirs/files",
                "second_step": "Open only needed file shards under _ast/files/*.json",
                "avoid": "Do not load all shard files at once"
            }
        }))?,
    )?;
    fs::write(
        wiki_ast_dir.join("hierarchy.json"),
        serde_json::to_string_pretty(&hierarchy)?,
    )?;

    Ok(AstBuildResult {
        indexed_files: source_files.len(),
        symbol_count,
        relation_count,
        commit_hash,
    })
}

fn collect_source_files(root: &Path, out: &mut Vec<PathBuf>) -> Result<(), std::io::Error> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            let file_name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();

            if entry.file_type()?.is_dir() {
                if should_skip_dir(&file_name) {
                    continue;
                }
                stack.push(path);
                continue;
            }

            if is_source_file(&path) {
                out.push(path);
            }
        }
    }
    Ok(())
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | "dist" | "build" | ".next" | ".turbo" | ".atmos"
    )
}

fn is_source_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|s| s.to_str()),
        Some("rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "java")
    )
}

#[derive(Clone, Copy)]
enum TsLanguageKind {
    Rust,
    JavaScript,
    TypeScript,
    Tsx,
    Python,
    Go,
    Java,
}

impl TsLanguageKind {
    fn as_str(self) -> &'static str {
        match self {
            TsLanguageKind::Rust => "rust",
            TsLanguageKind::JavaScript => "javascript",
            TsLanguageKind::TypeScript => "typescript",
            TsLanguageKind::Tsx => "tsx",
            TsLanguageKind::Python => "python",
            TsLanguageKind::Go => "go",
            TsLanguageKind::Java => "java",
        }
    }
}

fn language_kind_for_file(path: &Path) -> Option<TsLanguageKind> {
    match path.extension().and_then(|s| s.to_str()) {
        Some("rs") => Some(TsLanguageKind::Rust),
        Some("js") | Some("jsx") => Some(TsLanguageKind::JavaScript),
        Some("ts") => Some(TsLanguageKind::TypeScript),
        Some("tsx") => Some(TsLanguageKind::Tsx),
        Some("py") => Some(TsLanguageKind::Python),
        Some("go") => Some(TsLanguageKind::Go),
        Some("java") => Some(TsLanguageKind::Java),
        _ => None,
    }
}

fn language_for(kind: TsLanguageKind) -> Language {
    match kind {
        TsLanguageKind::Rust => tree_sitter_rust::LANGUAGE.into(),
        TsLanguageKind::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
        TsLanguageKind::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        TsLanguageKind::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
        TsLanguageKind::Python => tree_sitter_python::LANGUAGE.into(),
        TsLanguageKind::Go => tree_sitter_go::LANGUAGE.into(),
        TsLanguageKind::Java => tree_sitter_java::LANGUAGE.into(),
    }
}

fn parse_with_embedded_parser(
    content: &str,
    lang_kind: TsLanguageKind,
) -> Result<(Vec<Value>, Vec<Value>, Option<String>), String> {
    let mut parser = Parser::new();
    parser
        .set_language(&language_for(lang_kind))
        .map_err(|e| format!("set_language failed: {}", e))?;

    let tree = parser
        .parse(content, None)
        .ok_or_else(|| "parser returned no tree".to_string())?;

    let mut symbols = Vec::new();
    let mut relations = Vec::new();

    let mut cursor = tree.walk();
    let mut stack = vec![tree.root_node()];

    while let Some(node) = stack.pop() {
        if node.child_count() > 0 {
            for child in node.children(&mut cursor) {
                stack.push(child);
            }
        }

        if !node.is_named() {
            continue;
        }

        let kind = node.kind();
        if is_symbol_node(kind) {
            let name = node
                .child_by_field_name("name")
                .and_then(|n| node_text(content, n))
                .unwrap_or_else(|| short_node_preview(content, node));
            let point = node.start_position();
            symbols.push(json!({
                "kind": kind,
                "name": name,
                "line": point.row + 1,
                "column": point.column + 1
            }));
        }

        if is_relation_node(kind) {
            let point = node.start_position();
            relations.push(json!({
                "kind": kind,
                "line": point.row + 1,
                "column": point.column + 1,
                "snippet": short_node_preview(content, node)
            }));
        }
    }

    // Fallback if grammar did not capture enough meaningful nodes
    if symbols.is_empty() && relations.is_empty() {
        for (line_no, raw_line) in content.lines().enumerate() {
            let line = raw_line.trim();
            if let Some((kind, name)) = parse_symbol_line(line) {
                symbols.push(json!({
                    "kind": kind,
                    "name": name,
                    "line": line_no + 1,
                    "column": 1
                }));
            }
            if let Some(relation) = parse_relation_line(line) {
                relations.push(json!({
                    "kind": relation,
                    "line": line_no + 1,
                    "column": 1,
                    "snippet": line.chars().take(140).collect::<String>()
                }));
            }
        }
    }

    Ok((symbols, relations, None))
}

fn is_symbol_node(kind: &str) -> bool {
    matches!(
        kind,
        "function_item"
            | "function_declaration"
            | "method_definition"
            | "class_definition"
            | "class_declaration"
            | "struct_item"
            | "enum_item"
            | "trait_item"
            | "interface_declaration"
            | "type_alias_declaration"
            | "impl_item"
            | "method_declaration"
            | "type_declaration"
            | "function_definition"
            | "class_specifier"
            | "interface_type"
    )
}

fn is_relation_node(kind: &str) -> bool {
    matches!(
        kind,
        "use_declaration"
            | "import_declaration"
            | "import_statement"
            | "import_from_statement"
            | "mod_item"
            | "extends_clause"
            | "implements_clause"
            | "call_expression"
            | "scoped_identifier"
    )
}

fn node_text(source: &str, node: Node) -> Option<String> {
    source
        .get(node.byte_range())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
}

fn short_node_preview(source: &str, node: Node) -> String {
    node_text(source, node)
        .unwrap_or_default()
        .chars()
        .take(140)
        .collect()
}

fn parse_symbol_line(line: &str) -> Option<(&'static str, String)> {
    let symbol_prefixes = [
        ("pub fn ", "function"),
        ("fn ", "function"),
        ("pub struct ", "struct"),
        ("struct ", "struct"),
        ("pub enum ", "enum"),
        ("enum ", "enum"),
        ("pub trait ", "trait"),
        ("trait ", "trait"),
        ("export function ", "function"),
        ("function ", "function"),
        ("export class ", "class"),
        ("class ", "class"),
        ("interface ", "interface"),
        ("export interface ", "interface"),
        ("type ", "type"),
        ("export type ", "type"),
    ];

    for (prefix, kind) in symbol_prefixes {
        if let Some(rest) = line.strip_prefix(prefix) {
            let name = rest
                .split(['(', '{', '<', ' ', ':', '='])
                .next()
                .unwrap_or_default()
                .trim();
            if !name.is_empty() {
                return Some((kind, name.to_string()));
            }
        }
    }
    None
}

fn parse_relation_line(line: &str) -> Option<&'static str> {
    if line.starts_with("use ")
        || line.starts_with("pub use ")
        || line.starts_with("import ")
        || line.starts_with("from ")
    {
        return Some("import");
    }
    if line.starts_with("impl ") || line.contains(" implements ") {
        return Some("implementation");
    }
    if line.starts_with("mod ") || line.starts_with("pub mod ") {
        return Some("module");
    }
    if line.contains('(') && line.contains(')') && line.ends_with(';') {
        return Some("call");
    }
    None
}

fn count_languages(files: &[PathBuf]) -> Vec<String> {
    let mut set = BTreeSet::new();
    for file in files {
        if let Some(ext) = file.extension().and_then(|s| s.to_str()) {
            set.insert(ext.to_string());
        }
    }
    set.into_iter().collect()
}

fn hash_path(path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn build_hierarchy_index(files: &[String]) -> Value {
    #[derive(Default)]
    struct DirNode {
        files: Vec<String>,
        children: BTreeMap<String, DirNode>,
    }

    fn insert_path(root: &mut DirNode, path: &str) {
        let mut parts = path.split('/').collect::<Vec<_>>();
        let file_name = parts.pop().unwrap_or_default().to_string();
        let mut node = root;
        for seg in parts {
            node = node.children.entry(seg.to_string()).or_default();
        }
        node.files.push(file_name);
    }

    fn to_json(path: &str, node: &DirNode) -> Value {
        let children = node
            .children
            .iter()
            .map(|(name, child)| {
                let next_path = if path.is_empty() {
                    name.to_string()
                } else {
                    format!("{}/{}", path, name)
                };
                to_json(&next_path, child)
            })
            .collect::<Vec<_>>();
        json!({
            "path": if path.is_empty() { "." } else { path },
            "files": node.files,
            "children": children
        })
    }

    let mut root = DirNode::default();
    for file in files {
        insert_path(&mut root, file);
    }
    to_json("", &root)
}

fn current_git_commit(project_root: &Path) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(project_root)
        .arg("rev-parse")
        .arg("HEAD")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let commit = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if commit.is_empty() {
        None
    } else {
        Some(commit)
    }
}

/// GET /api/system/code-review-window/:workspace_id
pub async fn check_code_review_window(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let session_name = match resolve_session_name(&state, &workspace_id).await {
        Some(s) => s,
        None => return Ok(Json(ApiResponse::success(json!({ "exists": false })))),
    };
    let exists = state
        .terminal_service
        .has_code_review_window(&session_name)
        .unwrap_or(false);
    Ok(Json(ApiResponse::success(json!({ "exists": exists }))))
}

/// POST /api/system/code-review-window/:workspace_id
pub async fn kill_code_review_window(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let session_name = match resolve_session_name(&state, &workspace_id).await {
        Some(s) => s,
        None => {
            return Ok(Json(ApiResponse::success(json!({
                "killed": false,
                "message": "Could not resolve workspace to tmux session"
            }))))
        }
    };
    match state
        .terminal_service
        .kill_code_review_window(&session_name)
    {
        Ok(()) => Ok(Json(ApiResponse::success(json!({
            "killed": true,
            "message": "Code Review window closed"
        })))),
        Err(e) => Ok(Json(ApiResponse::success(json!({
            "killed": false,
            "message": format!("{}", e)
        })))),
    }
}

/// GET /api/system/tmux-windows/:workspace_id
pub async fn list_tmux_windows(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let session_name = resolve_session_name(&state, &workspace_id).await;
    let windows = session_name
        .as_deref()
        .map(|session_name| {
            state
                .terminal_service
                .tmux_engine()
                .list_windows(session_name)
                .map(|windows| {
                    windows
                        .into_iter()
                        .map(|w| {
                            json!({
                                "index": w.index,
                                "name": w.name,
                            })
                        })
                        .collect::<Vec<_>>()
                })
        })
        .transpose()
        .unwrap_or_default()
        .unwrap_or_default();

    Ok(Json(ApiResponse::success(json!({
        "windows": windows
    }))))
}

/// GET /api/system/terminal-overview
pub async fn get_terminal_overview(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let terminal_service = &state.terminal_service;
    let tmux_engine = terminal_service.tmux_engine();

    let active_sessions = terminal_service.list_session_details().await;
    let active_sessions_json: Vec<Value> = active_sessions
        .iter()
        .map(|s| {
            json!({
                "session_id": s.session_id,
                "workspace_id": s.workspace_id,
                "session_type": s.session_type,
                "project_name": s.project_name,
                "workspace_name": s.workspace_name,
                "terminal_name": s.terminal_name,
                "tmux_session": s.tmux_session,
                "tmux_window_index": s.tmux_window_index,
                "cwd": s.cwd,
                "uptime_secs": s.uptime_secs,
            })
        })
        .collect();

    let tmux_installed = terminal_service.is_tmux_available();
    let tmux_version = if tmux_installed {
        terminal_service.get_tmux_version().ok().map(|v| v.raw)
    } else {
        None
    };

    let tmux_sessions: Vec<Value> = if tmux_installed {
        tmux_engine
            .list_atmos_sessions()
            .map(|sessions| {
                sessions
                    .into_iter()
                    .filter(|s| !s.name.starts_with("atmos_client_"))
                    .map(|s| {
                        let windows: Vec<Value> = tmux_engine
                            .list_windows(&s.name)
                            .map(|ws| {
                                ws.into_iter()
                                    .map(|w| {
                                        json!({
                                            "index": w.index,
                                            "name": w.name,
                                            "active": w.active,
                                        })
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();

                        json!({
                            "name": s.name,
                            "windows": s.windows,
                            "window_list": windows,
                            "created": s.created,
                            "attached": s.attached,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        vec![]
    };

    let stale_client_count: usize = if tmux_installed {
        tmux_engine
            .list_sessions()
            .map(|sessions| {
                sessions
                    .iter()
                    .filter(|s| s.name.starts_with("atmos_client_"))
                    .count()
            })
            .unwrap_or(0)
    } else {
        0
    };

    let system_pty = diagnostics::get_system_pty_info();
    let orphaned_processes = diagnostics::get_orphaned_processes();

    let tmux_server = if tmux_installed {
        diagnostics::get_tmux_server_info(&tmux_engine)
    } else {
        json!({"running": false})
    };

    let ws_connection_count = state.ws_service.connection_count().await;
    let shell_env = diagnostics::get_shell_env_info();
    let pty_devices = diagnostics::get_pty_device_details();

    Ok(Json(ApiResponse::success(json!({
        "active_sessions": active_sessions_json,
        "active_session_count": active_sessions.len(),
        "tmux": {
            "installed": tmux_installed,
            "version": tmux_version,
            "sessions": tmux_sessions,
            "session_count": tmux_sessions.len(),
            "stale_client_sessions": stale_client_count,
        },
        "tmux_server": tmux_server,
        "system_pty": system_pty,
        "orphaned_processes": orphaned_processes,
        "orphaned_process_count": orphaned_processes.len(),
        "ws_connection_count": ws_connection_count,
        "shell_env": shell_env,
        "pty_devices": pty_devices,
    }))))
}

/// POST /api/system/terminal-cleanup
pub async fn cleanup_terminals(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let terminal_service = &state.terminal_service;
    let tmux_engine = terminal_service.tmux_engine();

    let before_count = tmux_engine
        .list_sessions()
        .map(|sessions| {
            sessions
                .iter()
                .filter(|s| s.name.starts_with("atmos_client_"))
                .count()
        })
        .unwrap_or(0);

    terminal_service.cleanup_stale_client_sessions();

    let after_count = tmux_engine
        .list_sessions()
        .map(|sessions| {
            sessions
                .iter()
                .filter(|s| s.name.starts_with("atmos_client_"))
                .count()
        })
        .unwrap_or(0);

    let cleaned = before_count.saturating_sub(after_count);

    info!(
        "Terminal cleanup complete: {} stale client sessions removed",
        cleaned
    );

    Ok(Json(ApiResponse::success(json!({
        "cleaned_client_sessions": cleaned,
        "remaining_client_sessions": after_count,
    }))))
}

/// POST /api/system/tmux-kill-server
pub async fn kill_tmux_server(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let tmux_engine = state.terminal_service.tmux_engine();

    state.terminal_service.shutdown().await;

    tmux_engine
        .kill_server()
        .map_err(|e| {
            warn!("Failed to kill tmux server: {}", e);
        })
        .ok();

    info!("Tmux server killed via Terminal Manager");

    Ok(Json(ApiResponse::success(json!({
        "killed": true,
    }))))
}

/// POST /api/system/tmux-kill-session
pub async fn kill_tmux_session(
    State(state): State<AppState>,
    Json(payload): Json<KillTmuxSessionPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    if payload.session_name.trim().is_empty() {
        return Err(crate::error::ApiError::BadRequest(
            "session_name is required".to_string(),
        ));
    }

    let tmux_engine = state.terminal_service.tmux_engine();

    match tmux_engine.kill_session(&payload.session_name) {
        Ok(_) => {
            info!(
                "Killed tmux session '{}' via Terminal Manager",
                payload.session_name
            );
            Ok(Json(ApiResponse::success(json!({
                "killed": true,
                "session_name": payload.session_name,
            }))))
        }
        Err(e) => {
            warn!(
                "Failed to kill tmux session '{}': {}",
                payload.session_name, e
            );
            Ok(Json(ApiResponse::success(json!({
                "killed": false,
                "error": format!("{}", e),
            }))))
        }
    }
}

/// POST /api/system/kill-orphaned-processes
pub async fn kill_orphaned_processes(
    Json(payload): Json<KillOrphanedProcessesPayload>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    if payload.pids.is_empty() {
        return Err(crate::error::ApiError::BadRequest(
            "pids array must not be empty".to_string(),
        ));
    }

    let verified_orphans: HashSet<u32> = diagnostics::get_orphaned_processes()
        .iter()
        .filter_map(|v| v["pid"].as_u64().map(|n| n as u32))
        .collect();

    let total = payload.pids.len();
    let mut killed_count = 0;
    let mut failed_pids = Vec::new();
    let mut skipped_pids = Vec::new();

    for pid in &payload.pids {
        if !verified_orphans.contains(pid) {
            skipped_pids.push(*pid);
            warn!("Skipping PID {} — not a verified orphaned process", pid);
            continue;
        }

        let result = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();

        match result {
            Ok(output) if output.status.success() => {
                killed_count += 1;
                info!("Killed orphaned process {} via Terminal Manager", pid);
            }
            _ => {
                failed_pids.push(*pid);
                warn!("Failed to kill orphaned process {}", pid);
            }
        }
    }

    Ok(Json(ApiResponse::success(json!({
        "killed": killed_count,
        "total": total,
        "failed_pids": failed_pids,
        "skipped_pids": skipped_pids,
    }))))
}

/// GET /api/system/ws-connections
pub async fn list_ws_connections(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<Value>>> {
    let connections = state.ws_service.manager().list_connections().await;
    let items: Vec<Value> = connections
        .into_iter()
        .map(|c| {
            json!({ "id": c.id, "client_type": c.client_type, "idle_secs": c.connected_seconds })
        })
        .collect();
    Ok(Json(ApiResponse::success(json!({
        "connections": items,
        "count": items.len(),
    }))))
}

/// GET /api/system/review-skills
pub async fn list_review_skills() -> ApiResult<Json<ApiResponse<Value>>> {
    let skills = skills::scan_review_skills().await;
    Ok(Json(ApiResponse::success(json!({ "skills": skills }))))
}

/// POST /api/system/sync-skills
pub async fn sync_skills() -> ApiResult<Json<ApiResponse<Value>>> {
    let report = tokio::task::spawn_blocking(|| {
        infra::utils::system_skill_sync::sync_system_skills_with_report()
    })
    .await
    .map_err(|e| ApiError::InternalError(format!("Task join error: {}", e)))?;

    let completed = report.missing_skills.is_empty();
    let message = if completed {
        "System skill sync completed"
    } else {
        "System skill sync completed with missing skills"
    };

    tracing::info!(
        "System skill sync result: completed={}, versions={:?}, missing={:?}",
        completed,
        report.versions,
        report.missing_skills
    );

    Ok(Json(ApiResponse {
        success: completed,
        data: Some(json!({
            "initiated": true,
            "completed": completed,
            "message": message,
            "versions": report.versions,
            "missingSkills": report.missing_skills
        })),
        error: if completed {
            None
        } else {
            Some("One or more system skills could not be synced".to_string())
        },
    }))
}

// ===== File serving for binary preview =====

#[derive(Deserialize)]
pub struct ServeFileQuery {
    pub path: String,
}

/// Map file extension to MIME type for browser-previewable formats.
fn mime_type_for_ext(ext: &str) -> &'static str {
    match ext {
        // Images
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        // Video
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ogg" => "video/ogg",
        "mov" => "video/quicktime",
        // Audio
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        // Documents
        "pdf" => "application/pdf",
        // Fallback
        _ => "application/octet-stream",
    }
}

/// GET /api/system/file?path=<absolute_path>
///
/// Streams a local file with the appropriate Content-Type header so the
/// browser can render previews of images, videos, PDFs, etc.
/// This replaces the old Next.js API route that was removed during the
/// desktop static-export migration.
pub async fn serve_file(Query(query): Query<ServeFileQuery>) -> Result<Response, Response> {
    let file_path = std::path::Path::new(&query.path);

    if !file_path.exists() {
        return Err((StatusCode::NOT_FOUND, "File not found").into_response());
    }

    if !file_path.is_file() {
        return Err((StatusCode::BAD_REQUEST, "Not a file").into_response());
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let content_type = mime_type_for_ext(&ext);

    let metadata = tokio::fs::metadata(file_path).await.map_err(|e| {
        warn!("Failed to read file metadata: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file").into_response()
    })?;

    let file = tokio::fs::File::open(file_path).await.map_err(|e| {
        warn!("Failed to open file: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "Failed to open file").into_response()
    })?;

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, metadata.len())
        .body(body)
        .unwrap()
        .into_response())
}

// ── Frontend debug log ingestion ─────────────────────────────────────────────

#[derive(serde::Deserialize)]
pub struct FrontendLogEntry {
    pub ts: String,
    pub cat: String,
    pub msg: String,
    pub data: Option<Value>,
}

#[derive(serde::Deserialize)]
pub struct FrontendLogPayload {
    /// Logger prefix, e.g. "terminal" → writes to frontend-terminal-YYYY-MM-DD.log
    pub prefix: String,
    pub entries: Vec<FrontendLogEntry>,
}

/// POST /api/system/debug-log
///
/// Receives batched log entries from the frontend and appends them to
/// `./logs/debug/frontend-<prefix>-YYYY-MM-DD.log` on the server.
pub async fn ingest_frontend_debug_log(
    Json(payload): Json<FrontendLogPayload>,
) -> impl IntoResponse {
    // Sanitize the caller-supplied prefix before embedding it in a file path.
    // Allow only alphanumeric, hyphen, and underscore — strip everything else
    // (including '/', '..', and other path-traversal sequences) so the resolved
    // path can never escape ./logs/debug/.
    let safe_prefix: String = payload
        .prefix
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if safe_prefix.is_empty() {
        return StatusCode::BAD_REQUEST;
    }
    let logger = DebugLogger::new(&format!("frontend-{}", safe_prefix));
    for entry in &payload.entries {
        let extra = entry.data.clone();
        // Prefix the frontend timestamp into the message so it's visible in the log line
        let msg = format!("[fe:{}] {}", entry.ts, entry.msg);
        logger.log(&entry.cat, &msg, extra);
    }
    StatusCode::NO_CONTENT
}
