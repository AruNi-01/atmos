use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use infra::db::entities::automation_run;
use infra::db::repo::{AutomationRepo, UpdateAutomationRunStatusRecord};
use sea_orm::DatabaseConnection;
use serde_json::Value;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::{broadcast, mpsc};
use tracing::warn;

use crate::error::{Result, ServiceError};
use crate::service::notification::NotificationService;

use super::agents::{AutomationAgentInvocation, PromptDelivery, StdoutParser};
use super::{publish_run_update, runner, AutomationEvent, AutomationRunStatus, START_FAILURE_KIND};

struct OutputChunk {
    stream: &'static str,
    bytes: Vec<u8>,
}

pub(super) async fn run_automation_process(
    db: Arc<DatabaseConnection>,
    notification_service: Arc<NotificationService>,
    event_tx: broadcast::Sender<AutomationEvent>,
    run_guid: String,
    invocation: AutomationAgentInvocation,
) {
    if let Err(error) = run_automation_process_inner(
        Arc::clone(&db),
        Arc::clone(&notification_service),
        event_tx.clone(),
        run_guid.clone(),
        invocation,
    )
    .await
    {
        warn!(
            "Automation process runner failed for run {}: {}",
            run_guid, error
        );
        let _ = finish_run(
            &db,
            &notification_service,
            &event_tx,
            &run_guid,
            AutomationRunStatus::Failed.as_str(),
            None,
            Some(START_FAILURE_KIND.to_string()),
            Some(error.to_string()),
        )
        .await;
    }
}

async fn run_automation_process_inner(
    db: Arc<DatabaseConnection>,
    notification_service: Arc<NotificationService>,
    event_tx: broadcast::Sender<AutomationEvent>,
    run_guid: String,
    invocation: AutomationAgentInvocation,
) -> Result<()> {
    let repo = AutomationRepo::new(&db);
    let run = repo
        .find_run_by_guid(&run_guid)
        .await?
        .ok_or_else(|| ServiceError::NotFound(format!("Automation run {run_guid} not found")))?;

    let prompt_content = match invocation.prompt_delivery {
        PromptDelivery::Arg | PromptDelivery::Stdin => Some(
            tokio::fs::read_to_string(&invocation.prompt_path)
                .await
                .map_err(|error| {
                    ServiceError::Validation(format!("Failed to read automation prompt: {error}"))
                })?,
        ),
        PromptDelivery::None => None,
    };

    let mut command = Command::new(&invocation.executable);
    command.args(&invocation.args);
    if let (PromptDelivery::Arg, Some(prompt)) =
        (invocation.prompt_delivery, prompt_content.as_ref())
    {
        command.arg(prompt);
    }
    command
        .current_dir(&run.cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            let message = format!("Failed to spawn automation agent: {error}\n");
            append_text_to_artifacts(&run, &message).await;
            finish_run(
                &db,
                &notification_service,
                &event_tx,
                &run_guid,
                AutomationRunStatus::Failed.as_str(),
                None,
                Some(START_FAILURE_KIND.to_string()),
                Some(error.to_string()),
            )
            .await?;
            return Ok(());
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        if let (PromptDelivery::Stdin, Some(prompt)) =
            (invocation.prompt_delivery, prompt_content.as_ref())
        {
            if let Err(error) = stdin.write_all(prompt.as_bytes()).await {
                warn!("Failed to write automation prompt to stdin: {}", error);
            }
        }
    }

    let (output_tx, output_rx) = mpsc::unbounded_channel();
    let writer_run = run.clone();
    let writer_event_tx = event_tx.clone();
    let writer_task = tokio::spawn(async move {
        write_output_chunks(
            writer_run,
            writer_event_tx,
            invocation.stdout_parser,
            output_rx,
        )
        .await;
    });

    let stdout_task = child.stdout.take().map(|stdout| {
        let tx = output_tx.clone();
        tokio::spawn(async move {
            read_stream(stdout, "stdout", tx).await;
        })
    });
    let stderr_task = child.stderr.take().map(|stderr| {
        let tx = output_tx.clone();
        tokio::spawn(async move {
            read_stream(stderr, "stderr", tx).await;
        })
    });
    drop(output_tx);

    let mut interval = tokio::time::interval(Duration::from_millis(500));
    let mut cancellation_requested = false;
    let exit_status = loop {
        tokio::select! {
            status = child.wait() => break status,
            _ = interval.tick() => {
                if cancellation_requested_for(&db, &run_guid).await.unwrap_or(false) {
                    cancellation_requested = true;
                    let _ = child.start_kill();
                    break child.wait().await;
                }
            }
        }
    };

    if let Some(task) = stdout_task {
        let _ = task.await;
    }
    if let Some(task) = stderr_task {
        let _ = task.await;
    }
    let _ = writer_task.await;

    let status = match exit_status {
        Ok(status) if cancellation_requested => (
            AutomationRunStatus::Cancelled.as_str(),
            Some(status.code().unwrap_or(130)),
            None,
            None,
        ),
        Ok(status) if status.success() => (
            AutomationRunStatus::Completed.as_str(),
            status.code(),
            None,
            None,
        ),
        Ok(status) => (
            AutomationRunStatus::Failed.as_str(),
            status.code(),
            Some("agent_exit".to_string()),
            Some(format!(
                "Automation agent exited with code {}",
                status
                    .code()
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "unknown".to_string())
            )),
        ),
        Err(error) => (
            AutomationRunStatus::Failed.as_str(),
            None,
            Some("agent_wait_failed".to_string()),
            Some(error.to_string()),
        ),
    };

    finish_run(
        &db,
        &notification_service,
        &event_tx,
        &run_guid,
        status.0,
        status.1,
        status.2,
        status.3,
    )
    .await?;

    Ok(())
}

async fn cancellation_requested_for(db: &Arc<DatabaseConnection>, run_guid: &str) -> Result<bool> {
    let repo = AutomationRepo::new(db);
    Ok(repo
        .find_run_by_guid(run_guid)
        .await?
        .map(|run| {
            run.status == AutomationRunStatus::Running.as_str() && run.cancellation_requested
        })
        .unwrap_or(false))
}

async fn finish_run(
    db: &Arc<DatabaseConnection>,
    notification_service: &Arc<NotificationService>,
    event_tx: &broadcast::Sender<AutomationEvent>,
    run_guid: &str,
    status: &str,
    exit_code: Option<i32>,
    failure_kind: Option<String>,
    error_message: Option<String>,
) -> Result<()> {
    let repo = AutomationRepo::new(db);
    let current = repo
        .find_run_by_guid(run_guid)
        .await?
        .ok_or_else(|| ServiceError::NotFound(format!("Automation run {run_guid} not found")))?;
    if current.status != AutomationRunStatus::Running.as_str() {
        return Ok(());
    }

    let completed_at = Utc::now().naive_utc();
    let updated = repo
        .update_run_status(
            run_guid,
            UpdateAutomationRunStatusRecord {
                status: status.to_string(),
                completed_at: Some(completed_at),
                exit_code,
                failure_kind,
                error_message,
            },
        )
        .await?;
    let status_json = runner::run_json_for_status(&updated, status, Some(completed_at), exit_code);
    let _ = runner::write_run_json(
        PathBuf::from(&updated.run_json_path).as_path(),
        &status_json,
    );
    publish_run_update(db, notification_service, event_tx, updated).await;
    Ok(())
}

async fn read_stream<R>(
    mut reader: R,
    stream: &'static str,
    output_tx: mpsc::UnboundedSender<OutputChunk>,
) where
    R: AsyncRead + Unpin,
{
    let mut buffer = vec![0_u8; 8192];
    loop {
        match reader.read(&mut buffer).await {
            Ok(0) => break,
            Ok(n) => {
                if output_tx
                    .send(OutputChunk {
                        stream,
                        bytes: buffer[..n].to_vec(),
                    })
                    .is_err()
                {
                    break;
                }
            }
            Err(error) => {
                warn!("Failed to read automation {} stream: {}", stream, error);
                break;
            }
        }
    }
}

async fn write_output_chunks(
    run: automation_run::Model,
    event_tx: broadcast::Sender<AutomationEvent>,
    stdout_parser: StdoutParser,
    mut output_rx: mpsc::UnboundedReceiver<OutputChunk>,
) {
    let mut final_file = match append_file(&run.result_path).await {
        Ok(file) => file,
        Err(error) => {
            warn!("Failed to open automation final log: {}", error);
            return;
        }
    };
    let mut renderer = OutputRenderer::new(stdout_parser);
    while let Some(chunk) = output_rx.recv().await {
        for rendered in renderer.push(chunk) {
            if rendered.write_to_final {
                if let Err(error) = final_file.write_all(rendered.text.as_bytes()).await {
                    warn!("Failed to write automation final chunk: {}", error);
                }
            }
            publish_rendered_output_event(&run, &event_tx, rendered);
        }
    }

    for rendered in renderer.finish() {
        if rendered.write_to_final {
            if let Err(error) = final_file.write_all(rendered.text.as_bytes()).await {
                warn!("Failed to write automation final chunk: {}", error);
            }
        }
        publish_rendered_output_event(&run, &event_tx, rendered);
    }

    let _ = final_file.flush().await;
}

fn publish_rendered_output_event(
    run: &automation_run::Model,
    event_tx: &broadcast::Sender<AutomationEvent>,
    rendered: RenderedOutput,
) {
    if rendered.text.is_empty() {
        return;
    }

    let ts = Utc::now().to_rfc3339();
    let _ = event_tx.send(AutomationEvent::RunOutput {
        automation_guid: run.automation_guid.clone(),
        run_guid: run.guid.clone(),
        ts,
        stream: rendered.stream.to_string(),
        chunk: rendered.text,
        final_chunk: rendered.write_to_final,
    });
}

struct RenderedOutput {
    stream: &'static str,
    text: String,
    write_to_final: bool,
    separate_before: bool,
}

#[derive(Default)]
struct JsonlParserState {
    line_buffer: String,
    saw_stream_text: bool,
}

#[derive(Default)]
struct FinalOutputState {
    has_content: bool,
    trailing_newlines: usize,
}

impl FinalOutputState {
    fn separator_before(&self, text: &str) -> &'static str {
        if !self.has_content
            || text.is_empty()
            || text.starts_with('\n')
            || text.starts_with("\r\n")
        {
            return "";
        }

        match self.trailing_newlines.min(2) {
            0 => "\n\n",
            1 => "\n",
            _ => "",
        }
    }

    fn record(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }

        self.has_content = true;
        let trailing_newlines = text
            .chars()
            .rev()
            .take_while(|character| *character == '\n')
            .count();
        if trailing_newlines == 0 {
            self.trailing_newlines = 0;
        } else if trailing_newlines == text.chars().count() {
            self.trailing_newlines = (self.trailing_newlines + trailing_newlines).min(2);
        } else {
            self.trailing_newlines = trailing_newlines.min(2);
        }
    }
}

struct OutputRenderer {
    stdout_parser: StdoutParser,
    jsonl_state: JsonlParserState,
    final_state: FinalOutputState,
}

impl OutputRenderer {
    fn new(stdout_parser: StdoutParser) -> Self {
        Self {
            stdout_parser,
            jsonl_state: JsonlParserState::default(),
            final_state: FinalOutputState::default(),
        }
    }

    fn push(&mut self, chunk: OutputChunk) -> Vec<RenderedOutput> {
        if chunk.stream != "stdout" {
            return vec![RenderedOutput {
                stream: chunk.stream,
                text: String::from_utf8_lossy(&chunk.bytes).to_string(),
                write_to_final: false,
                separate_before: false,
            }];
        }

        if self.stdout_parser == StdoutParser::Plain {
            return self.normalize_final_boundaries(vec![RenderedOutput {
                stream: "stdout",
                text: String::from_utf8_lossy(&chunk.bytes).to_string(),
                write_to_final: true,
                separate_before: false,
            }]);
        }

        let rendered = self.push_jsonl_stdout(&chunk.bytes);
        self.normalize_final_boundaries(rendered)
    }

    fn finish(&mut self) -> Vec<RenderedOutput> {
        if self.stdout_parser == StdoutParser::Plain || self.jsonl_state.line_buffer.is_empty() {
            return Vec::new();
        }
        let line = std::mem::take(&mut self.jsonl_state.line_buffer);
        let rendered = self.parse_jsonl_line(&line);
        self.normalize_final_boundaries(rendered)
    }

    fn push_jsonl_stdout(&mut self, bytes: &[u8]) -> Vec<RenderedOutput> {
        self.jsonl_state
            .line_buffer
            .push_str(&String::from_utf8_lossy(bytes));
        let mut rendered = Vec::new();
        while let Some(index) = self.jsonl_state.line_buffer.find('\n') {
            let mut line = self
                .jsonl_state
                .line_buffer
                .drain(..=index)
                .collect::<String>();
            if line.ends_with('\n') {
                line.pop();
                if line.ends_with('\r') {
                    line.pop();
                }
            }
            rendered.extend(self.parse_jsonl_line(&line));
        }
        rendered
    }

    fn parse_jsonl_line(&mut self, line: &str) -> Vec<RenderedOutput> {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return Vec::new();
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            return vec![RenderedOutput {
                stream: "stdout",
                text: format!("{line}\n"),
                write_to_final: self.stdout_parser == StdoutParser::Plain,
                separate_before: false,
            }];
        };

        parse_structured_stdout(self.stdout_parser, &mut self.jsonl_state, &value)
    }

    fn normalize_final_boundaries(&mut self, rendered: Vec<RenderedOutput>) -> Vec<RenderedOutput> {
        rendered
            .into_iter()
            .map(|mut output| {
                if output.write_to_final {
                    if output.separate_before {
                        let separator = self.final_state.separator_before(&output.text);
                        if !separator.is_empty() {
                            output.text = format!("{separator}{}", output.text);
                        }
                    }
                    self.final_state.record(&output.text);
                    output.separate_before = false;
                }
                output
            })
            .collect()
    }
}

fn parse_structured_stdout(
    parser: StdoutParser,
    state: &mut JsonlParserState,
    value: &Value,
) -> Vec<RenderedOutput> {
    match parser {
        StdoutParser::Plain => json_text_delta(value)
            .into_iter()
            .map(final_stdout)
            .collect(),
        StdoutParser::ClaudeStreamJson => parse_claude_like_stream_json(value, state),
        StdoutParser::CursorStreamJson => parse_claude_like_stream_json(value, state),
        StdoutParser::CodexJsonl => parse_codex_jsonl(value),
        StdoutParser::OpencodeJson => parse_opencode_json(value),
    }
}

fn parse_claude_like_stream_json(
    value: &Value,
    state: &mut JsonlParserState,
) -> Vec<RenderedOutput> {
    let mut rendered = Vec::new();
    let event_type = string_at(value, &["type"]).unwrap_or_default();

    if event_type == "stream_event" {
        if string_at(value, &["event", "type"]) == Some("content_block_delta")
            && string_at(value, &["event", "delta", "type"]) == Some("text_delta")
        {
            if let Some(text) = string_at(value, &["event", "delta", "text"]) {
                state.saw_stream_text = true;
                rendered.push(final_stdout(text.to_string()));
            }
        }
        if string_at(value, &["event", "delta", "type"]) == Some("thinking_delta") {
            if let Some(text) = string_at(value, &["event", "delta", "thinking"]) {
                rendered.push(event_stdout(format!("[thinking] {text}\n")));
            }
        }
    }

    if event_type == "assistant" {
        if let Some(content) = value
            .get("message")
            .and_then(|message| message.get("content"))
            .and_then(Value::as_array)
        {
            for block in content {
                if string_at(block, &["type"]) == Some("tool_use") {
                    let name = string_at(block, &["name"]).unwrap_or("tool");
                    rendered.push(event_stdout(format!("[tool] {name}\n")));
                }
            }
            if !state.saw_stream_text {
                let text = content
                    .iter()
                    .filter(|block| string_at(block, &["type"]) == Some("text"))
                    .filter_map(|block| string_at(block, &["text"]))
                    .collect::<String>();
                if !text.is_empty() {
                    rendered.push(final_block(text));
                }
            }
        }
    }

    if event_type == "system" && string_at(value, &["subtype"]) == Some("init") {
        if let Some(model) = string_at(value, &["model"]) {
            rendered.push(event_stdout(format!("[system] model {model}\n")));
        }
        if let Some(cwd) = string_at(value, &["cwd"]) {
            rendered.push(event_stdout(format!("[system] cwd {cwd}\n")));
        }
    }

    if event_type == "result" {
        if let Some(subtype) = string_at(value, &["subtype"]) {
            rendered.push(event_stdout(format!("[result] {subtype}\n")));
        }
    }

    rendered
}

fn parse_codex_jsonl(value: &Value) -> Vec<RenderedOutput> {
    let mut rendered = Vec::new();
    let event_type = string_at(value, &["type"]).unwrap_or_default();

    if event_type == "item.completed" {
        if let Some(item) = value.get("item") {
            let item_type = string_at(item, &["item_type"]).or_else(|| string_at(item, &["type"]));
            if matches!(item_type, Some("assistant_message") | Some("agent_message")) {
                if let Some(text) = string_at(item, &["text"]) {
                    rendered.push(final_block(text.to_string()));
                }
            }
        }
    }

    if event_type == "item.delta" {
        if let Some(text) = string_at(value, &["text"]) {
            rendered.push(final_stdout(text.to_string()));
        }
    }

    if let Some(message) = value.get("msg") {
        if string_at(message, &["type"]) == Some("agent_message") {
            if let Some(text) = string_at(message, &["message"]) {
                rendered.push(final_block(text.to_string()));
            }
        }
    }

    if let Some(command) = string_at(value, &["command"]) {
        rendered.push(event_stdout(format!("[command] {command}\n")));
    }

    if rendered.is_empty() {
        if let Some(label) = string_at(value, &["type"]) {
            if label.contains("tool") || label.contains("exec") {
                rendered.push(event_stdout(format!("[event] {label}\n")));
            }
        }
    }

    rendered
}

fn parse_opencode_json(value: &Value) -> Vec<RenderedOutput> {
    let mut rendered = Vec::new();
    let part = value.get("part");
    for text in [
        part.and_then(|value| string_at(value, &["text"])),
        part.and_then(|value| string_at(value, &["content"])),
        part.and_then(|value| string_at(value, &["message"])),
        string_at(value, &["text"]),
        string_at(value, &["content"]),
        string_at(value, &["message"]),
    ]
    .into_iter()
    .flatten()
    {
        rendered.push(final_block(text.to_string()));
    }

    if let Some(event_type) = string_at(value, &["type"]) {
        if event_type == "step_start" {
            rendered.push(event_stdout("[event] step_start\n".to_string()));
        }
    }

    rendered
}

fn json_text_delta(value: &Value) -> Option<String> {
    string_at(value, &["text"])
        .or_else(|| string_at(value, &["content"]))
        .or_else(|| string_at(value, &["message"]))
        .map(ToString::to_string)
}

fn string_at<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str()
}

fn final_stdout(text: String) -> RenderedOutput {
    RenderedOutput {
        stream: "stdout",
        text,
        write_to_final: true,
        separate_before: false,
    }
}

fn final_block(text: String) -> RenderedOutput {
    RenderedOutput {
        stream: "stdout",
        text,
        write_to_final: true,
        separate_before: true,
    }
}

fn event_stdout(text: String) -> RenderedOutput {
    RenderedOutput {
        stream: "stdout",
        text,
        write_to_final: false,
        separate_before: false,
    }
}

async fn append_file(path: impl AsRef<Path>) -> std::io::Result<tokio::fs::File> {
    tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path.as_ref())
        .await
}

async fn append_text_to_artifacts(run: &automation_run::Model, text: &str) {
    if let Ok(mut final_file) = append_file(&run.result_path).await {
        let _ = final_file.write_all(text.as_bytes()).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_run(run_dir: &Path, result_path: &Path) -> automation_run::Model {
        let now = Utc::now().naive_utc();
        automation_run::Model {
            guid: "run-123".to_string(),
            created_at: now,
            updated_at: now,
            is_deleted: false,
            automation_guid: "automation-123".to_string(),
            agent_id: Some("codex".to_string()),
            agent_label: Some("Codex".to_string()),
            trigger_kind: "manual".to_string(),
            trigger_source_json: None,
            status: "running".to_string(),
            failure_kind: None,
            error_message: None,
            target_kind: "standalone".to_string(),
            project_guid: None,
            workspace_guid: None,
            created_workspace_guid: None,
            cwd: run_dir.to_string_lossy().to_string(),
            run_dir: run_dir.to_string_lossy().to_string(),
            prompt_path: run_dir
                .join(runner::PROMPT_FILE)
                .to_string_lossy()
                .to_string(),
            result_path: result_path.to_string_lossy().to_string(),
            run_json_path: run_dir
                .join(runner::RUN_JSON_FILE)
                .to_string_lossy()
                .to_string(),
            terminal_display_name: "Automations".to_string(),
            tmux_session_name: None,
            tmux_window_name: None,
            tmux_window_index: None,
            started_at: now,
            completed_at: None,
            exit_code: None,
            cancellation_requested: false,
        }
    }

    #[tokio::test]
    async fn output_writer_keeps_final_stdout_only_and_streams_all_chunks() {
        let dir = tempfile::tempdir().unwrap();
        let result_path = dir.path().join(runner::FINAL_FILE);
        let run = test_run(dir.path(), &result_path);
        let (output_tx, output_rx) = mpsc::unbounded_channel();
        let (event_tx, mut event_rx) = broadcast::channel(8);

        output_tx
            .send(OutputChunk {
                stream: "stderr",
                bytes: b"progress\n".to_vec(),
            })
            .unwrap();
        output_tx
            .send(OutputChunk {
                stream: "stdout",
                bytes: b"answer\n".to_vec(),
            })
            .unwrap();
        drop(output_tx);

        write_output_chunks(run, event_tx, StdoutParser::Plain, output_rx).await;

        let final_content = tokio::fs::read_to_string(&result_path).await.unwrap();
        assert_eq!(final_content, "answer\n");

        let first = event_rx.recv().await.unwrap();
        let second = event_rx.recv().await.unwrap();
        match first {
            AutomationEvent::RunOutput {
                stream,
                chunk,
                final_chunk,
                ..
            } => {
                assert_eq!(stream, "stderr");
                assert_eq!(chunk, "progress\n");
                assert!(!final_chunk);
            }
            other => panic!("unexpected event {other:?}"),
        }
        match second {
            AutomationEvent::RunOutput {
                stream,
                chunk,
                final_chunk,
                ..
            } => {
                assert_eq!(stream, "stdout");
                assert_eq!(chunk, "answer\n");
                assert!(final_chunk);
            }
            other => panic!("unexpected event {other:?}"),
        }
        assert!(!dir.path().join("events.jsonl").exists());
    }

    #[test]
    fn claude_stream_json_extracts_partial_text_without_duplicate_final_message() {
        let mut renderer = OutputRenderer::new(StdoutParser::ClaudeStreamJson);
        let rendered = renderer.push(OutputChunk {
            stream: "stdout",
            bytes: concat!(
                r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"hello "}}}"#,
                "\n",
                r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hello world"}]}}"#,
                "\n",
                r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"world"}}}"#,
                "\n"
            )
            .as_bytes()
            .to_vec(),
        });

        let final_text = rendered
            .iter()
            .filter(|chunk| chunk.write_to_final)
            .map(|chunk| chunk.text.as_str())
            .collect::<String>();
        assert_eq!(final_text, "hello world");
    }

    #[test]
    fn codex_jsonl_parser_buffers_partial_lines_and_extracts_deltas() {
        let mut renderer = OutputRenderer::new(StdoutParser::CodexJsonl);

        assert!(renderer
            .push(OutputChunk {
                stream: "stdout",
                bytes: br#"{"type":"item.delta","text":"hel"#.to_vec(),
            })
            .is_empty());
        let rendered = renderer.push(OutputChunk {
            stream: "stdout",
            bytes: b"lo\"}\n".to_vec(),
        });

        assert_eq!(rendered.len(), 1);
        assert_eq!(rendered[0].stream, "stdout");
        assert_eq!(rendered[0].text, "hello");
        assert!(rendered[0].write_to_final);
    }

    #[test]
    fn codex_jsonl_parser_separates_completed_agent_messages() {
        let mut renderer = OutputRenderer::new(StdoutParser::CodexJsonl);
        let rendered = renderer.push(OutputChunk {
            stream: "stdout",
            bytes: concat!(
                r#"{"type":"item.completed","item":{"type":"agent_message","text":"first status"}}"#,
                "\n",
                r#"{"type":"item.completed","item":{"type":"agent_message","text":"second status"}}"#,
                "\n"
            )
            .as_bytes()
            .to_vec(),
        });

        let final_text = rendered
            .iter()
            .filter(|chunk| chunk.write_to_final)
            .map(|chunk| chunk.text.as_str())
            .collect::<String>();
        assert_eq!(final_text, "first status\n\nsecond status");
        assert_eq!(rendered[1].text, "\n\nsecond status");
    }
}
