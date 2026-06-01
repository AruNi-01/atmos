use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use infra::db::entities::automation_run;
use infra::db::repo::{AutomationRepo, UpdateAutomationRunStatusRecord};
use sea_orm::DatabaseConnection;
use serde_json::json;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::{broadcast, mpsc};
use tracing::warn;

use crate::error::{Result, ServiceError};
use crate::service::notification::NotificationService;

use super::agents::{AutomationAgentInvocation, PromptDelivery};
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
        write_output_chunks(writer_run, writer_event_tx, output_rx).await;
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
    mut output_rx: mpsc::UnboundedReceiver<OutputChunk>,
) {
    let mut output_file = match append_file(&run.output_path).await {
        Ok(file) => file,
        Err(error) => {
            warn!("Failed to open automation output log: {}", error);
            return;
        }
    };
    let mut final_file = match append_file(&run.result_path).await {
        Ok(file) => file,
        Err(error) => {
            warn!("Failed to open automation final log: {}", error);
            return;
        }
    };
    let events_path = PathBuf::from(&run.run_dir).join(runner::EVENTS_FILE);
    let mut events_file = match append_file(&events_path).await {
        Ok(file) => Some(file),
        Err(error) => {
            warn!("Failed to open automation events log: {}", error);
            None
        }
    };

    while let Some(chunk) = output_rx.recv().await {
        if let Err(error) = output_file.write_all(&chunk.bytes).await {
            warn!("Failed to write automation output chunk: {}", error);
        }
        if let Err(error) = final_file.write_all(&chunk.bytes).await {
            warn!("Failed to write automation final chunk: {}", error);
        }

        let text = String::from_utf8_lossy(&chunk.bytes).to_string();
        if let Some(file) = events_file.as_mut() {
            let line = json!({
                "ts": Utc::now().to_rfc3339(),
                "type": "output",
                "stream": chunk.stream,
                "chunk": text,
            })
            .to_string();
            let _ = file.write_all(line.as_bytes()).await;
            let _ = file.write_all(b"\n").await;
        }
        let _ = event_tx.send(AutomationEvent::RunOutput {
            automation_guid: run.automation_guid.clone(),
            run_guid: run.guid.clone(),
            stream: chunk.stream.to_string(),
            chunk: text,
        });
    }

    let _ = output_file.flush().await;
    let _ = final_file.flush().await;
    if let Some(file) = events_file.as_mut() {
        let _ = file.flush().await;
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
    if let Ok(mut output) = append_file(&run.output_path).await {
        let _ = output.write_all(text.as_bytes()).await;
    }
    if let Ok(mut final_file) = append_file(&run.result_path).await {
        let _ = final_file.write_all(text.as_bytes()).await;
    }
}
