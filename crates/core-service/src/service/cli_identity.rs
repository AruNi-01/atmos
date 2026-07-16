//! Resolve contested short CLI names (e.g. bare `agent`) to a product owner
//! using the real binary on the API host PATH.

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime};

use parking_lot::Mutex as ParkingMutex;
use serde::{Deserialize, Serialize};
use tracing::debug;

const SUCCESS_TTL: Duration = Duration::from_secs(60);
const UNKNOWN_TTL: Duration = Duration::from_secs(15);
const PROBE_TIMEOUT_MS: u64 = 800;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ContestedCliOwner {
    GrokBuild,
    Cursor,
    Unknown,
}

impl ContestedCliOwner {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::GrokBuild => "grok-build",
            Self::Cursor => "cursor",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContestedCliIdentity {
    pub owner: ContestedCliOwner,
    pub resolved_path: Option<String>,
}

#[derive(Clone)]
struct CacheEntry {
    owner: ContestedCliOwner,
    resolved_path: Option<String>,
    which_path: Option<String>,
    mtime: Option<SystemTime>,
    expires_at: Instant,
}

fn identity_cache() -> &'static ParkingMutex<HashMap<String, CacheEntry>> {
    static CACHE: OnceLock<ParkingMutex<HashMap<String, CacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| ParkingMutex::new(HashMap::new()))
}

/// Resolve the product owner for a contested command name (M1: only `agent`).
pub fn resolve_command_identity(command: &str) -> ContestedCliIdentity {
    let command = command.trim();
    if command.is_empty() {
        return ContestedCliIdentity {
            owner: ContestedCliOwner::Unknown,
            resolved_path: None,
        };
    }

    // Only bare `agent` is contested in M1; unique names are not probed here.
    if command != "agent" {
        return ContestedCliIdentity {
            owner: ContestedCliOwner::Unknown,
            resolved_path: None,
        };
    }

    let which_path = which_command(command);
    let mtime = which_path
        .as_ref()
        .and_then(|p| std::fs::metadata(p).ok())
        .and_then(|m| m.modified().ok());

    if let Some(cached) = cache_get(command, which_path.as_deref(), mtime) {
        return ContestedCliIdentity {
            owner: cached.owner,
            resolved_path: cached.resolved_path,
        };
    }

    let resolved = which_path
        .as_ref()
        .and_then(|p| std::fs::canonicalize(p).ok())
        .map(|p| p.display().to_string())
        .or_else(|| which_path.clone());

    let owner = classify_agent_binary(resolved.as_deref(), which_path.as_deref());

    cache_put(
        command,
        CacheEntry {
            owner,
            resolved_path: resolved.clone(),
            which_path: which_path.clone(),
            mtime,
            expires_at: Instant::now()
                + if owner == ContestedCliOwner::Unknown {
                    UNKNOWN_TTL
                } else {
                    SUCCESS_TTL
                },
        },
    );

    ContestedCliIdentity {
        owner,
        resolved_path: resolved,
    }
}

fn cache_get(
    command: &str,
    which_path: Option<&str>,
    mtime: Option<SystemTime>,
) -> Option<CacheEntry> {
    let mut guard = identity_cache().lock();
    let entry = guard.get(command)?.clone();
    if Instant::now() >= entry.expires_at {
        guard.remove(command);
        return None;
    }
    if entry.which_path.as_deref() != which_path || entry.mtime != mtime {
        guard.remove(command);
        return None;
    }
    Some(entry)
}

fn cache_put(command: &str, entry: CacheEntry) {
    identity_cache().lock().insert(command.to_string(), entry);
}

fn which_command(command: &str) -> Option<String> {
    which_command_in_path(command, std::env::var_os("PATH").as_deref())
}

fn which_command_in_path(command: &str, path: Option<&std::ffi::OsStr>) -> Option<String> {
    let path = path?;
    for directory in std::env::split_paths(path) {
        let candidate = directory.join(command);
        if !candidate.is_file() {
            continue;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let Ok(metadata) = candidate.metadata() else {
                continue;
            };
            if metadata.permissions().mode() & 0o111 == 0 {
                continue;
            }
        }
        return Some(candidate.to_string_lossy().to_string());
    }
    None
}

fn classify_agent_binary(resolved: Option<&str>, which_path: Option<&str>) -> ContestedCliOwner {
    let path_str = resolved.or(which_path).unwrap_or("");
    if path_str.is_empty() {
        return ContestedCliOwner::Unknown;
    }

    let lower = path_str.to_ascii_lowercase();
    let file_name = Path::new(path_str)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if lower.contains("/.grok/") || file_name.starts_with("grok") {
        return ContestedCliOwner::GrokBuild;
    }
    if lower.contains("cursor-agent") || file_name.contains("cursor-agent") {
        return ContestedCliOwner::Cursor;
    }

    // Version / help banner probe with short timeout.
    if let Some(owner) = probe_version_banner(path_str) {
        return owner;
    }

    ContestedCliOwner::Unknown
}

fn probe_version_banner(binary: &str) -> Option<ContestedCliOwner> {
    let deadline = Instant::now() + Duration::from_millis(PROBE_TIMEOUT_MS);
    for args in [&["--version"][..], &["--help"][..]] {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return None;
        }
        let output = run_with_timeout(binary, args, remaining)?;
        let combined = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let lower = combined.to_ascii_lowercase();
        if lower.contains("grok build") || lower.starts_with("grok ") || lower.contains("\ngrok ") {
            debug!("CLI identity: classified as Grok Build via banner");
            return Some(ContestedCliOwner::GrokBuild);
        }
        if lower.contains("start the cursor agent")
            || lower.contains("cursor agent")
            || lower.contains("cursor-agent")
        {
            debug!("CLI identity: classified as Cursor via banner");
            return Some(ContestedCliOwner::Cursor);
        }
    }
    None
}

fn run_with_timeout(
    binary: &str,
    args: &[&str],
    timeout: Duration,
) -> Option<std::process::Output> {
    use std::io::Read;
    use std::process::Stdio;
    use std::sync::mpsc;

    let mut command = Command::new(binary);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command.spawn().ok()?;
    let child_id = child.id();
    let stdout = child.stdout.take()?;
    let stderr = child.stderr.take()?;
    let read_pipe = |mut pipe: Box<dyn Read + Send>| {
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            let _ = sender.send(bytes);
        });
        receiver
    };
    let stdout_receiver = read_pipe(Box::new(stdout));
    let stderr_receiver = read_pipe(Box::new(stderr));

    let deadline = Instant::now() + timeout;

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                terminate_probe_process_group(child_id);
                let remaining = deadline.saturating_duration_since(Instant::now());
                let stdout = stdout_receiver.recv_timeout(remaining).ok()?;
                let remaining = deadline.saturating_duration_since(Instant::now());
                let stderr = stderr_receiver.recv_timeout(remaining).ok()?;
                return Some(std::process::Output {
                    status,
                    stdout,
                    stderr,
                });
            }
            Ok(None) => {
                if Instant::now() >= deadline {
                    debug!(
                        "CLI identity probe timed out after {:?} for {} {:?}",
                        timeout, binary, args
                    );
                    terminate_probe_process_group(child_id);
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(error) => {
                debug!(
                    "CLI identity probe wait error for {} {:?}: {}",
                    binary, args, error
                );
                terminate_probe_process_group(child_id);
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

#[cfg(unix)]
fn terminate_probe_process_group(child_id: u32) {
    // SAFETY: the child is spawned into a new process group whose id equals its pid.
    unsafe {
        libc::killpg(child_id as i32, libc::SIGKILL);
    }
}

#[cfg(not(unix))]
fn terminate_probe_process_group(_child_id: u32) {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn empty_command_is_unknown() {
        let result = resolve_command_identity("");
        assert_eq!(result.owner, ContestedCliOwner::Unknown);
    }

    #[test]
    fn non_agent_command_is_unknown_without_probe() {
        let result = resolve_command_identity("grok");
        assert_eq!(result.owner, ContestedCliOwner::Unknown);
    }

    #[test]
    fn path_fingerprint_classifies_grok_and_cursor() {
        assert_eq!(
            classify_agent_binary(Some("/Users/me/.grok/bin/agent"), None),
            ContestedCliOwner::GrokBuild
        );
        assert_eq!(
            classify_agent_binary(
                Some("/Users/me/.local/share/cursor-agent/versions/1.0/agent"),
                None
            ),
            ContestedCliOwner::Cursor
        );
        assert_eq!(
            classify_agent_binary(Some("/usr/local/bin/unknown-agent"), None),
            ContestedCliOwner::Unknown
        );
    }

    #[test]
    fn owner_as_str_matches_api_contract() {
        assert_eq!(ContestedCliOwner::GrokBuild.as_str(), "grok-build");
        assert_eq!(ContestedCliOwner::Cursor.as_str(), "cursor");
        assert_eq!(ContestedCliOwner::Unknown.as_str(), "unknown");
    }

    #[cfg(unix)]
    #[test]
    fn which_path_to_grok_script_classifies_as_grok() {
        let dir = tempfile::tempdir().unwrap();
        let grok_dir = dir.path().join(".grok").join("bin");
        std::fs::create_dir_all(&grok_dir).unwrap();
        let agent = grok_dir.join("agent");
        std::fs::write(&agent, "#!/bin/sh\necho grok 0.0.0\n").unwrap();
        std::fs::set_permissions(&agent, std::fs::Permissions::from_mode(0o755)).unwrap();

        assert_eq!(
            classify_agent_binary(Some(&agent.display().to_string()), None),
            ContestedCliOwner::GrokBuild
        );
    }

    #[cfg(unix)]
    #[test]
    fn hung_version_probe_times_out_and_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("slow-agent");
        std::fs::write(&script, "#!/bin/sh\nsleep 30\n").unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();

        let start = Instant::now();
        let output = run_with_timeout(
            &script.display().to_string(),
            &["--version"],
            Duration::from_millis(PROBE_TIMEOUT_MS),
        );
        assert!(output.is_none(), "hung probe must fail open as None");
        assert!(
            start.elapsed() < Duration::from_secs(3),
            "probe should enforce ~{}ms timeout, elapsed {:?}",
            PROBE_TIMEOUT_MS,
            start.elapsed()
        );
    }

    #[cfg(unix)]
    #[test]
    fn exited_probe_does_not_wait_for_descendant_inherited_pipes() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("background-agent");
        std::fs::write(
            &script,
            "#!/bin/sh\n(sleep 30) &\nprintf 'Grok Build 1.0\\n'\n",
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();

        let start = Instant::now();
        let output = run_with_timeout(
            &script.display().to_string(),
            &["--version"],
            Duration::from_millis(PROBE_TIMEOUT_MS),
        )
        .expect("parent output should be collected before the deadline");

        assert!(String::from_utf8_lossy(&output.stdout).contains("Grok Build"));
        assert!(
            start.elapsed() < Duration::from_secs(3),
            "inherited descendant pipes must not hang output collection"
        );
    }

    #[cfg(unix)]
    #[test]
    fn hung_binary_classifies_as_unknown_without_path_fingerprint() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("agent");
        std::fs::write(&script, "#!/bin/sh\nsleep 30\n").unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();

        let start = Instant::now();
        let owner = classify_agent_binary(Some(&script.display().to_string()), None);
        assert_eq!(owner, ContestedCliOwner::Unknown);
        assert!(
            start.elapsed() < Duration::from_secs(5),
            "classification must not wait on hung --version/--help indefinitely"
        );
    }
}
