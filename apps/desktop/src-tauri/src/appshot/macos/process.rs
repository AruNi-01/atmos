use std::io::Read;
use std::process::{Command, ExitStatus, Stdio};
use std::thread;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

const PROCESS_POLL_INTERVAL_MS: u64 = 20;

#[derive(Debug)]
pub(super) struct CommandOutput {
    pub(super) status: ExitStatus,
    pub(super) stdout: Vec<u8>,
    pub(super) stderr: Vec<u8>,
}

pub(super) fn run_osascript(
    script: &str,
    timeout: Duration,
    label: &str,
) -> Result<String, String> {
    let mut command = Command::new("osascript");
    command.arg("-e").arg(script);
    let output = run_command_output(command, timeout, label)?;
    if output.status.success() {
        return String::from_utf8(output.stdout)
            .map(|text| text.trim_end().to_string())
            .map_err(|error| format!("osascript returned invalid utf8: {error}"));
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("osascript exited with status {}", output.status))
    } else {
        Err(stderr)
    }
}

pub(super) fn run_command_output(
    mut command: Command,
    timeout: Duration,
    label: &str,
) -> Result<CommandOutput, String> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start {label}: {error}"))?;
    let stdout_reader = spawn_child_pipe_reader(child.stdout.take(), label, "stdout");
    let stderr_reader = spawn_child_pipe_reader(child.stderr.take(), label, "stderr");
    let started_at = Instant::now();

    loop {
        match child
            .try_wait()
            .map_err(|error| format!("failed to wait for {label}: {error}"))?
        {
            Some(status) => {
                let stdout = join_child_pipe_reader(stdout_reader, label, "stdout")?;
                let stderr = join_child_pipe_reader(stderr_reader, label, "stderr")?;
                return Ok(CommandOutput {
                    status,
                    stdout,
                    stderr,
                });
            }
            None if started_at.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(format!(
                    "{label} timed out after {} ms",
                    timeout.as_millis()
                ));
            }
            None => thread::sleep(Duration::from_millis(PROCESS_POLL_INTERVAL_MS)),
        }
    }
}

pub(super) fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub(super) fn truncate_bytes(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_string();
    }
    let mut end = 0;
    for (idx, ch) in text.char_indices() {
        if idx + ch.len_utf8() > limit {
            break;
        }
        end = idx + ch.len_utf8();
    }
    format!("{}...", &text[..end])
}

fn spawn_child_pipe_reader<R>(
    pipe: Option<R>,
    label: &str,
    stream_name: &'static str,
) -> JoinHandle<Result<Vec<u8>, String>>
where
    R: Read + Send + 'static,
{
    let label = label.to_string();
    thread::spawn(move || read_child_pipe(pipe, &label, stream_name))
}

fn join_child_pipe_reader(
    reader: JoinHandle<Result<Vec<u8>, String>>,
    label: &str,
    stream_name: &str,
) -> Result<Vec<u8>, String> {
    reader
        .join()
        .map_err(|_| format!("failed to join {label} {stream_name} reader"))?
}

fn read_child_pipe<R: Read>(
    pipe: Option<R>,
    label: &str,
    stream_name: &str,
) -> Result<Vec<u8>, String> {
    let Some(mut pipe) = pipe else {
        return Ok(Vec::new());
    };
    let mut bytes = Vec::new();
    pipe.read_to_end(&mut bytes)
        .map_err(|error| format!("failed to read {label} {stream_name}: {error}"))?;
    Ok(bytes)
}
