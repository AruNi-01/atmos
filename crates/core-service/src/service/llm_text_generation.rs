use std::path::PathBuf;
use std::process::Stdio;

use llm::{
    GenerateTextRequest, GenerateTextResponse, LlmError, ProviderKind, ResolvedLlmProvider,
    ResponseFormat,
};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::error::ServiceError;

use super::automation::{
    read_stream, resolve_automation_agent, AutomationAgentInvocation, AutomationCommandInput,
    OutputChunk, OutputRenderer, PromptDelivery, StdoutParser,
};

const AGENT_OUTPUT_CHANNEL_SIZE: usize = 32;
const MAX_STDERR_CHARS: usize = 4096;

pub async fn generate_text(
    provider: &ResolvedLlmProvider,
    request: GenerateTextRequest,
) -> llm::Result<GenerateTextResponse> {
    if provider.kind != ProviderKind::AgentCli {
        return llm::generate_text(provider, request).await;
    }

    let mut rx = generate_text_stream(provider, request).await?;
    let mut text = String::new();
    while let Some(chunk) = rx.recv().await {
        text.push_str(&chunk?);
    }

    Ok(GenerateTextResponse {
        text,
        finish_reason: None,
    })
}

pub async fn generate_text_stream(
    provider: &ResolvedLlmProvider,
    request: GenerateTextRequest,
) -> llm::Result<mpsc::Receiver<llm::Result<String>>> {
    if provider.kind != ProviderKind::AgentCli {
        return llm::generate_text_stream(provider, request).await;
    }

    let (tx, rx) = mpsc::channel(AGENT_OUTPUT_CHANNEL_SIZE);
    let provider = provider.clone();
    tokio::spawn(async move {
        if let Err(error) = run_agent_cli_text_stream(provider, request, tx.clone()).await {
            let _ = tx.send(Err(error)).await;
        }
    });

    Ok(rx)
}

async fn run_agent_cli_text_stream(
    provider: ResolvedLlmProvider,
    request: GenerateTextRequest,
    tx: mpsc::Sender<llm::Result<String>>,
) -> llm::Result<()> {
    let agent_id = provider
        .agent_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            LlmError::InvalidConfig(format!(
                "agent-cli provider `{}` has no agent_id",
                provider.id
            ))
        })?;

    let agent_command = resolve_automation_agent(agent_id).map_err(service_error_to_llm)?;
    let prompt = build_agent_cli_prompt(&request);
    let prompt_path = write_prompt_file(&prompt).await?;
    let invocation = agent_command.build_invocation(AutomationCommandInput {
        prompt_path: prompt_path.clone(),
    });

    let result = run_agent_cli_invocation(provider.timeout, invocation, prompt, tx).await;
    let _ = tokio::fs::remove_file(prompt_path).await;
    result
}

fn build_agent_cli_prompt(request: &GenerateTextRequest) -> String {
    let mut sections = Vec::with_capacity(3);
    if let Some(system) = request
        .system
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        sections.push(format!("<system>\n{system}\n</system>"));
    }
    sections.push(format!("<user>\n{}\n</user>", request.prompt));
    if matches!(request.response_format, ResponseFormat::JsonObject) {
        sections.push("Return only a valid JSON object.".to_string());
    }
    sections.join("\n\n")
}

async fn write_prompt_file(prompt: &str) -> llm::Result<PathBuf> {
    let dir = std::env::temp_dir().join("atmos-agent-cli");
    tokio::fs::create_dir_all(&dir).await?;
    let path = dir.join(format!("prompt-{}.md", Uuid::new_v4()));
    tokio::fs::write(&path, prompt).await?;
    Ok(path)
}

async fn run_agent_cli_invocation(
    timeout: std::time::Duration,
    invocation: AutomationAgentInvocation,
    prompt: String,
    tx: mpsc::Sender<llm::Result<String>>,
) -> llm::Result<()> {
    let mut command = Command::new(&invocation.executable);
    command.args(&invocation.args);
    if invocation.prompt_delivery == PromptDelivery::Arg {
        command.arg(&prompt);
    }
    command
        .current_dir(agent_cli_cwd())
        .stdin(if invocation.prompt_delivery == PromptDelivery::Stdin {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
        LlmError::Provider(format!(
            "Failed to spawn local agent CLI `{}`: {error}",
            invocation.executable
        ))
    })?;

    if let Some(mut stdin) = child.stdin.take() {
        if invocation.prompt_delivery == PromptDelivery::Stdin {
            stdin.write_all(prompt.as_bytes()).await?;
        }
    }

    let (output_tx, output_rx) = mpsc::unbounded_channel::<OutputChunk>();
    let renderer_task = tokio::spawn(render_agent_output(invocation.stdout_parser, output_rx, tx));

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

    let exit_status = match tokio::time::timeout(timeout, child.wait()).await {
        Ok(result) => result.map_err(LlmError::Io)?,
        Err(_) => {
            let _ = child.start_kill();
            let _ = child.wait().await;
            if let Some(task) = stdout_task {
                let _ = task.await;
            }
            if let Some(task) = stderr_task {
                let _ = task.await;
            }
            let (_, stderr) = renderer_task.await.unwrap_or_default();
            return Err(LlmError::Provider(format!(
                "Local agent CLI timed out after {} ms{}",
                timeout.as_millis(),
                stderr_suffix(&stderr)
            )));
        }
    };

    if let Some(task) = stdout_task {
        let _ = task.await;
    }
    if let Some(task) = stderr_task {
        let _ = task.await;
    }
    let (_, stderr) = renderer_task.await.unwrap_or_default();

    if exit_status.success() {
        return Ok(());
    }

    Err(LlmError::Provider(format!(
        "Local agent CLI exited with code {}{}",
        exit_status
            .code()
            .map(|code| code.to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        stderr_suffix(&stderr)
    )))
}

async fn render_agent_output(
    stdout_parser: StdoutParser,
    mut output_rx: mpsc::UnboundedReceiver<OutputChunk>,
    tx: mpsc::Sender<llm::Result<String>>,
) -> (String, String) {
    let mut renderer = OutputRenderer::new(stdout_parser);
    let mut full_text = String::new();
    let mut stderr = String::new();

    while let Some(chunk) = output_rx.recv().await {
        if chunk.stream == "stderr" {
            append_limited(&mut stderr, String::from_utf8_lossy(&chunk.bytes).as_ref());
            continue;
        }

        for rendered in renderer.push(chunk) {
            if rendered.write_to_final && !rendered.text.is_empty() {
                full_text.push_str(&rendered.text);
                if tx.send(Ok(rendered.text)).await.is_err() {
                    return (full_text, stderr);
                }
            }
        }
    }

    for rendered in renderer.finish() {
        if rendered.write_to_final && !rendered.text.is_empty() {
            full_text.push_str(&rendered.text);
            if tx.send(Ok(rendered.text)).await.is_err() {
                break;
            }
        }
    }

    (full_text, stderr)
}

fn append_limited(target: &mut String, text: &str) {
    let remaining = MAX_STDERR_CHARS.saturating_sub(target.chars().count());
    if remaining == 0 {
        return;
    }
    target.extend(text.chars().take(remaining));
}

fn stderr_suffix(stderr: &str) -> String {
    let stderr = stderr.trim();
    if stderr.is_empty() {
        String::new()
    } else {
        format!(": {stderr}")
    }
}

fn agent_cli_cwd() -> PathBuf {
    dirs::home_dir().unwrap_or_else(std::env::temp_dir)
}

fn service_error_to_llm(error: ServiceError) -> LlmError {
    LlmError::Provider(error.to_string())
}
