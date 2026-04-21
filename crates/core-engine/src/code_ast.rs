use crate::error::{EngineError, Result};
use ignore::{DirEntry, WalkBuilder};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tree_sitter::{Language, Node, Parser};

const MAX_SOURCE_FILE_BYTES: u64 = 2 * 1024 * 1024;

type AstParseOutput = (Vec<Value>, Vec<Value>, Option<String>);

#[derive(Debug, Clone, Serialize)]
pub struct CodeAstBuildResult {
    pub discovered_files: usize,
    pub indexed_files: usize,
    pub skipped_files: usize,
    pub symbol_count: usize,
    pub relation_count: usize,
    pub commit_hash: Option<String>,
    pub artifact_dir: String,
}

#[derive(Debug)]
struct SourceFile {
    path: PathBuf,
    language: TsLanguageKind,
}

#[derive(Debug, Serialize)]
struct SkippedFile {
    file: String,
    reason: String,
}

pub fn build_code_ast_artifacts(
    project_root: &Path,
    artifact_dir: &Path,
) -> Result<CodeAstBuildResult> {
    let staging_dir = create_staging_artifact_dir(artifact_dir)?;
    let build_result = write_code_ast_artifacts(project_root, artifact_dir, &staging_dir);

    match build_result {
        Ok(result) => {
            publish_artifact_dir(&staging_dir, artifact_dir)?;
            Ok(result)
        }
        Err(error) => {
            if let Err(cleanup_error) = remove_dir_if_exists(&staging_dir) {
                tracing::warn!(
                    "Failed to clean up AST staging dir {} after build error: {}",
                    staging_dir.display(),
                    cleanup_error
                );
            }
            Err(error)
        }
    }
}

fn write_code_ast_artifacts(
    project_root: &Path,
    artifact_dir: &Path,
    output_dir: &Path,
) -> Result<CodeAstBuildResult> {
    let shard_dir = output_dir.join("files");
    fs::create_dir_all(&shard_dir).map_err(map_io)?;

    let mut symbols_file = File::create(output_dir.join("symbols.jsonl")).map_err(map_io)?;
    let mut relations_file = File::create(output_dir.join("relations.jsonl")).map_err(map_io)?;

    let collected = collect_source_files(project_root)?;
    let source_files = collected.source_files;
    let discovered_files = source_files.len() + collected.oversized.len();
    let mut skipped_files: Vec<SkippedFile> = collected
        .oversized
        .iter()
        .map(|p| SkippedFile {
            file: relative_path(project_root, p),
            reason: format!("oversized (>{} bytes)", MAX_SOURCE_FILE_BYTES),
        })
        .collect();
    let mut symbol_count = 0usize;
    let mut relation_count = 0usize;
    let mut indexed_files = 0usize;
    let mut file_index = Vec::new();

    for source_file in &source_files {
        let rel = relative_path(project_root, &source_file.path);

        let content = match fs::read_to_string(&source_file.path) {
            Ok(content) => content,
            Err(error) => {
                skipped_files.push(SkippedFile {
                    file: rel,
                    reason: format!("read failed: {}", error),
                });
                continue;
            }
        };

        let parsed = parse_with_embedded_parser(&content, source_file.language);
        let (symbols, relations, parser_warning) = match parsed {
            Ok(result) => result,
            Err(err) => (Vec::new(), Vec::new(), Some(err)),
        };

        for symbol in &symbols {
            let record = source_scoped_record(symbol, &rel, source_file.language.as_str())?;
            writeln!(
                symbols_file,
                "{}",
                serde_json::to_string(&record).map_err(map_json)?
            )
            .map_err(map_io)?;
            symbol_count += 1;
        }
        for relation in &relations {
            let record = source_scoped_record(relation, &rel, source_file.language.as_str())?;
            writeln!(
                relations_file,
                "{}",
                serde_json::to_string(&record).map_err(map_json)?
            )
            .map_err(map_io)?;
            relation_count += 1;
        }

        let shard_name = format!("{}.json", hash_path(&rel));
        let shard_rel_path = format!("files/{}", shard_name);
        let shard_payload = json!({
            "file": rel,
            "language": source_file.language.as_str(),
            "symbol_count": symbols.len(),
            "relation_count": relations.len(),
            "symbols": symbols,
            "relations": relations,
            "parser_warning": parser_warning,
        });
        fs::write(
            shard_dir.join(shard_name),
            serde_json::to_string_pretty(&shard_payload).map_err(map_json)?,
        )
        .map_err(map_io)?;

        file_index.push(json!({
            "file": shard_payload["file"],
            "language": source_file.language.as_str(),
            "symbol_count": shard_payload["symbol_count"],
            "relation_count": shard_payload["relation_count"],
            "shard": shard_rel_path,
            "parser_warning": parser_warning,
        }));
        indexed_files += 1;
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
        "discovered_files": discovered_files,
        "indexed_files": indexed_files,
        "skipped_files": skipped_files.len(),
        "skipped": skipped_files,
        "symbol_count": symbol_count,
        "relation_count": relation_count,
        "languages": language_count,
        "index_files": {
            "global_symbols": "symbols.jsonl",
            "global_relations": "relations.jsonl",
            "file_index": "index.json",
            "hierarchy": "hierarchy.json"
        },
        "generator": "core_engine.code_ast.tree_sitter_embedded"
    });
    fs::write(
        output_dir.join("_status.json"),
        serde_json::to_string_pretty(&status).map_err(map_json)?,
    )
    .map_err(map_io)?;
    fs::write(
        output_dir.join("index.json"),
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
        }))
        .map_err(map_json)?,
    )
    .map_err(map_io)?;
    fs::write(
        output_dir.join("hierarchy.json"),
        serde_json::to_string_pretty(&hierarchy).map_err(map_json)?,
    )
    .map_err(map_io)?;

    Ok(CodeAstBuildResult {
        discovered_files,
        indexed_files,
        skipped_files: skipped_files.len(),
        symbol_count,
        relation_count,
        commit_hash,
        artifact_dir: artifact_dir.to_string_lossy().to_string(),
    })
}

fn create_staging_artifact_dir(artifact_dir: &Path) -> Result<PathBuf> {
    let parent = artifact_dir.parent().ok_or_else(|| {
        EngineError::FileSystem(format!(
            "Artifact dir {} has no parent",
            artifact_dir.display()
        ))
    })?;
    fs::create_dir_all(parent).map_err(map_io)?;

    let file_name = artifact_dir.file_name().ok_or_else(|| {
        EngineError::FileSystem(format!(
            "Artifact dir {} has no terminal component",
            artifact_dir.display()
        ))
    })?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let staging_name = format!(
        ".{}.tmp-{}-{}",
        file_name.to_string_lossy(),
        std::process::id(),
        nonce
    );
    let staging_dir = parent.join(staging_name);
    remove_dir_if_exists(&staging_dir)?;
    fs::create_dir_all(&staging_dir).map_err(map_io)?;
    Ok(staging_dir)
}

fn publish_artifact_dir(staging_dir: &Path, artifact_dir: &Path) -> Result<()> {
    let backup_dir = artifact_dir.with_file_name(format!(
        ".{}.backup-{}-{}",
        artifact_dir
            .file_name()
            .unwrap_or_default()
            .to_string_lossy(),
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default()
    ));

    let had_existing_dir = artifact_dir.exists();
    if had_existing_dir {
        fs::rename(artifact_dir, &backup_dir).map_err(map_io)?;
    }

    if let Err(error) = fs::rename(staging_dir, artifact_dir) {
        if had_existing_dir {
            let _ = fs::rename(&backup_dir, artifact_dir);
        }
        let _ = remove_dir_if_exists(staging_dir);
        return Err(map_io(error));
    }

    if had_existing_dir {
        if let Err(e) = remove_dir_if_exists(&backup_dir) {
            tracing::warn!("Failed to remove AST backup dir {}: {}", backup_dir.display(), e);
        }
    }

    Ok(())
}

fn remove_dir_if_exists(path: &Path) -> Result<()> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(map_io(error)),
    }
}

struct CollectedFiles {
    source_files: Vec<SourceFile>,
    oversized: Vec<PathBuf>,
}

fn collect_source_files(root: &Path) -> Result<CollectedFiles> {
    let walker = WalkBuilder::new(root)
        .standard_filters(true)
        .filter_entry(|entry| {
            entry
                .file_name()
                .to_str()
                .is_none_or(|name| !should_skip_dir(name))
        })
        .build();

    let mut source_files = Vec::new();
    let mut oversized = Vec::new();
    for entry in walker {
        let entry = entry.map_err(|error| EngineError::FileSystem(error.to_string()))?;
        if !is_regular_source_file(&entry) {
            continue;
        }
        let path = entry.into_path();
        if is_oversized_file(&path)? {
            oversized.push(path);
            continue;
        }
        if let Some(language) = language_kind_for_file(&path) {
            source_files.push(SourceFile { path, language });
        }
    }
    source_files.sort_by(|a, b| a.path.cmp(&b.path));
    oversized.sort();
    Ok(CollectedFiles {
        source_files,
        oversized,
    })
}

fn is_regular_source_file(entry: &DirEntry) -> bool {
    entry
        .file_type()
        .is_some_and(|file_type| file_type.is_file())
        && language_kind_for_file(entry.path()).is_some()
}

fn is_oversized_file(path: &Path) -> Result<bool> {
    let metadata = fs::metadata(path).map_err(map_io)?;
    Ok(metadata.len() > MAX_SOURCE_FILE_BYTES)
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | "target"
            | "dist"
            | "build"
            | ".next"
            | ".turbo"
            | ".atmos"
            | "vendor"
            | "venv"
            | ".venv"
            | "__pycache__"
    )
}

#[derive(Clone, Copy, Debug)]
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
) -> std::result::Result<AstParseOutput, String> {
    let mut parser = Parser::new();
    parser
        .set_language(&language_for(lang_kind))
        .map_err(|e| format!("set_language failed: {}", e))?;

    let tree = parser
        .parse(content, None)
        .ok_or_else(|| "parser returned no tree".to_string())?;
    let parser_warning = tree
        .root_node()
        .has_error()
        .then(|| "tree-sitter reported syntax errors".to_string());

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
            let target = extract_relation_target(content, node);
            relations.push(json!({
                "kind": kind,
                "line": point.row + 1,
                "column": point.column + 1,
                "target": target,
                "snippet": short_node_preview(content, node)
            }));
        }
    }

    if symbols.is_empty() && relations.is_empty() {
        parse_line_fallback(content, &mut symbols, &mut relations);
    }

    Ok((symbols, relations, parser_warning))
}

fn source_scoped_record(record: &Value, file: &str, language: &str) -> Result<Value> {
    let mut record = serde_json::to_value(record).map_err(map_json)?;
    match &mut record {
        Value::Object(map) => {
            map.insert("file".to_string(), Value::String(file.to_string()));
            map.insert("language".to_string(), Value::String(language.to_string()));
            Ok(record)
        }
        _ => Ok(json!({
            "file": file,
            "language": language,
            "value": record
        })),
    }
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

/// Try to extract a stable, machine-readable target identifier from a relation
/// node.  Falls back to `None` when no recognisable child field is found.
fn extract_relation_target(source: &str, node: Node) -> Option<String> {
    // Field names vary across grammars.  Try the most common ones in priority
    // order so we get the most specific identifier available.
    const CANDIDATE_FIELDS: &[&str] = &[
        "source",       // Rust use_declaration
        "module_name",  // Python import_from_statement
        "path",         // Go import_declaration
        "name",         // generic
        "argument",     // Rust use_declaration argument
        "function",     // call_expression
        "trait",        // Rust impl_item
        "type",         // extends_clause / implements_clause
    ];

    for field in CANDIDATE_FIELDS {
        if let Some(child) = node.child_by_field_name(field) {
            if let Some(text) = node_text(source, child) {
                return Some(text);
            }
        }
    }
    None
}

fn parse_line_fallback(content: &str, symbols: &mut Vec<Value>, relations: &mut Vec<Value>) {
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

fn count_languages(files: &[SourceFile]) -> Vec<String> {
    let mut set = BTreeSet::new();
    for file in files {
        set.insert(file.language.as_str().to_string());
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

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn map_io(error: io::Error) -> EngineError {
    EngineError::FileSystem(error.to_string())
}

fn map_json(error: serde_json::Error) -> EngineError {
    EngineError::Processing(error.to_string())
}
