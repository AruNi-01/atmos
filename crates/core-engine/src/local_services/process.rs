use std::path::PathBuf;
use std::process::Command;

use crate::error::{EngineError, Result};

/// Snapshot of a process used for stop escalation / process-tree UI.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessSnapshot {
    pub pid: u32,
    pub ppid: Option<u32>,
    pub pgid: Option<u32>,
    pub process_name: Option<String>,
    pub command_line: Vec<String>,
    pub cwd: Option<PathBuf>,
    pub user_id: Option<String>,
    /// TTY device name when available (`?` / empty means no controlling TTY).
    pub tty: Option<String>,
}

/// Collect a best-effort process snapshot for `pid`.
pub fn process_snapshot(pid: u32) -> Option<ProcessSnapshot> {
    #[cfg(target_os = "macos")]
    {
        process_snapshot_macos(pid)
    }
    #[cfg(target_os = "linux")]
    {
        process_snapshot_linux(pid)
    }
    #[cfg(target_os = "windows")]
    {
        process_snapshot_windows(pid)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = pid;
        None
    }
}

/// Walk parent chain from `listener_pid` toward init, exclusive of pid 0/1 as nodes
/// beyond the last real user process. Stops at max_depth or when parent is missing.
pub fn ancestor_chain(listener_pid: u32, max_depth: usize) -> Vec<ProcessSnapshot> {
    let mut chain = Vec::new();
    let mut current = listener_pid;
    let mut seen = std::collections::HashSet::new();
    for _ in 0..max_depth {
        if !seen.insert(current) {
            break;
        }
        let Some(snap) = process_snapshot(current) else {
            break;
        };
        let ppid = snap.ppid;
        chain.push(snap);
        match ppid {
            Some(0) | Some(1) | None => break,
            Some(parent) if parent == current => break,
            Some(parent) => current = parent,
        }
    }
    chain
}

/// Orphan-like hints for the given process (and optionally the chain root).
pub fn orphan_hints(snap: &ProcessSnapshot) -> Vec<String> {
    let mut hints = Vec::new();
    if matches!(snap.ppid, Some(0) | Some(1)) {
        hints.push("orphan_ppid".into());
    }
    if let Some(tty) = snap.tty.as_deref() {
        let t = tty.trim();
        if t.is_empty() || t == "?" || t == "??" || t.eq_ignore_ascii_case("notty") {
            hints.push("no_tty".into());
        }
    } else {
        // Missing TTY metadata is common on Windows; only hint when we know it's Unix-like
        // absence of a controlling terminal (macOS/Linux always try to report tty).
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            hints.push("no_tty".into());
        }
    }
    hints
}

/// Graceful terminate of a single PID (SIGTERM / taskkill without /T).
pub fn terminate_process(pid: u32) -> Result<()> {
    if pid <= 1 {
        return Err(EngineError::Processing(
            "refusing to terminate pid <= 1".into(),
        ));
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        run_kill(&["-TERM", &pid.to_string()], pid, "kill -TERM")
    }
    #[cfg(target_os = "windows")]
    {
        run_taskkill(pid, false, false)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = pid;
        Err(EngineError::Processing(
            "process termination is not supported on this platform".into(),
        ))
    }
}

/// Force-kill a single PID (SIGKILL / taskkill /F).
pub fn kill_process(pid: u32) -> Result<()> {
    if pid <= 1 {
        return Err(EngineError::Processing("refusing to kill pid <= 1".into()));
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        run_kill(&["-KILL", &pid.to_string()], pid, "kill -KILL")
    }
    #[cfg(target_os = "windows")]
    {
        run_taskkill(pid, false, true)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = pid;
        Err(EngineError::Processing(
            "process kill is not supported on this platform".into(),
        ))
    }
}

/// Terminate a process tree rooted at `root_pid`.
///
/// Unix: prefer process-group TERM when `root` is the group leader (`pgid == pid`);
/// otherwise enumerate descendants and TERM them (children first). Windows: `taskkill /T`.
pub fn terminate_process_tree(root_pid: u32) -> Result<()> {
    if root_pid <= 1 {
        return Err(EngineError::Processing(
            "refusing to terminate process tree for pid <= 1".into(),
        ));
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        signal_process_tree(root_pid, "TERM")
    }
    #[cfg(target_os = "windows")]
    {
        run_taskkill(root_pid, true, false)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = root_pid;
        Err(EngineError::Processing(
            "process tree termination is not supported on this platform".into(),
        ))
    }
}

/// Force-kill a process tree rooted at `root_pid`.
pub fn kill_process_tree(root_pid: u32) -> Result<()> {
    if root_pid <= 1 {
        return Err(EngineError::Processing(
            "refusing to kill process tree for pid <= 1".into(),
        ));
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        signal_process_tree(root_pid, "KILL")
    }
    #[cfg(target_os = "windows")]
    {
        run_taskkill(root_pid, true, true)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = root_pid;
        Err(EngineError::Processing(
            "process tree kill is not supported on this platform".into(),
        ))
    }
}

/// Unix tree signal: process-group when root is leader, else every descendant PID.
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn signal_process_tree(root_pid: u32, signal: &str) -> Result<()> {
    let self_pid = std::process::id();
    if root_pid == self_pid {
        return Err(EngineError::Processing(
            "refusing to signal our own process tree".into(),
        ));
    }

    let signal_flag = format!("-{signal}");
    let snap = process_snapshot(root_pid);
    if let Some(pgid) = snap.as_ref().and_then(|s| s.pgid) {
        // Only signal a process group when the root is the group leader and the
        // group is not the system-critical pgid 1.
        if pgid == root_pid && pgid > 1 {
            let group_arg = format!("-{pgid}");
            let label = format!("kill -{signal} -<pgid>");
            // Group kill may fail if we lack permission for some members; fall back.
            if run_kill(&[&signal_flag, &group_arg], root_pid, &label).is_ok() {
                return Ok(());
            }
        }
    }

    // Root is not a group leader (or group kill failed): walk the process tree
    // and signal every descendant, children before parents.
    // Enumeration failure is fatal — never pretend a root-only stop is a tree stop.
    let targets = descendant_pids(root_pid)?;
    let mut root_ok = false;
    let mut last_err: Option<EngineError> = None;
    for pid in targets {
        if pid <= 1 || pid == self_pid {
            continue;
        }
        let result = if signal == "KILL" {
            kill_process(pid)
        } else {
            terminate_process(pid)
        };
        match result {
            Ok(()) => {
                if pid == root_pid {
                    root_ok = true;
                }
            }
            Err(e) => {
                // Already-exited root counts as success for the tree contract.
                if pid == root_pid && process_snapshot(root_pid).is_none() {
                    root_ok = true;
                } else if pid == root_pid {
                    last_err = Some(e);
                } else {
                    // Descendant signal failures are best-effort; keep trying.
                    last_err = last_err.or(Some(e));
                }
            }
        }
    }
    if root_ok {
        Ok(())
    } else {
        Err(last_err.unwrap_or_else(|| {
            EngineError::Processing(format!(
                "failed to {signal} process tree rooted at {root_pid}"
            ))
        }))
    }
}

/// Collect PIDs in the subtree of `root_pid` (children first, root last).
/// Always includes `root_pid`. Fails if the process listing cannot be obtained.
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn descendant_pids(root_pid: u32) -> Result<Vec<u32>> {
    let children_of = process_children_map()?;
    let mut stack = vec![root_pid];
    let mut seen = std::collections::HashSet::new();
    // Depth-first discovery; reverse so children are signalled before parents.
    let mut visit_order = Vec::new();
    while let Some(pid) = stack.pop() {
        if !seen.insert(pid) {
            continue;
        }
        visit_order.push(pid);
        if let Some(children) = children_of.get(&pid) {
            for child in children {
                if *child > 1 {
                    stack.push(*child);
                }
            }
        }
    }
    let mut ordered = Vec::with_capacity(visit_order.len());
    for pid in visit_order.into_iter().rev() {
        ordered.push(pid);
    }
    if ordered.is_empty() {
        ordered.push(root_pid);
    }
    Ok(ordered)
}

/// Build a map of parent pid → child pids from a process listing.
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn process_children_map() -> Result<std::collections::HashMap<u32, Vec<u32>>> {
    let mut map: std::collections::HashMap<u32, Vec<u32>> = std::collections::HashMap::new();
    let output = Command::new("ps")
        .args(["-axo", "pid=,ppid="])
        .output()
        .map_err(|e| {
            EngineError::Processing(format!("failed to enumerate process tree via ps: {e}"))
        })?;
    if !output.status.success() {
        return Err(EngineError::Processing(format!(
            "ps process listing failed: exit {:?}",
            output.status.code()
        )));
    }
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let mut parts = line.split_whitespace();
        let Some(pid) = parts.next().and_then(|v| v.parse::<u32>().ok()) else {
            continue;
        };
        let Some(ppid) = parts.next().and_then(|v| v.parse::<u32>().ok()) else {
            continue;
        };
        map.entry(ppid).or_default().push(pid);
    }
    Ok(map)
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn run_kill(args: &[&str], pid: u32, label: &str) -> Result<()> {
    let status = Command::new("kill")
        .args(args)
        .status()
        .map_err(|e| EngineError::Processing(format!("failed to run {label}: {e}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(EngineError::Processing(format!(
            "{label} failed for pid {pid}: exit {:?}",
            status.code()
        )))
    }
}

#[cfg(target_os = "windows")]
fn run_taskkill(pid: u32, tree: bool, force: bool) -> Result<()> {
    let mut args = vec!["/PID".to_string(), pid.to_string()];
    if tree {
        args.push("/T".into());
    }
    if force {
        args.push("/F".into());
    }
    let status = Command::new("taskkill")
        .args(&args)
        .status()
        .map_err(|e| EngineError::Processing(format!("failed to run taskkill: {e}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(EngineError::Processing(format!(
            "taskkill failed for pid {pid}: exit {:?}",
            status.code()
        )))
    }
}

#[cfg(target_os = "macos")]
fn process_snapshot_macos(pid: u32) -> Option<ProcessSnapshot> {
    let ps_output = Command::new("ps")
        .args([
            "-p",
            &pid.to_string(),
            "-o",
            "ppid=",
            "-o",
            "pgid=",
            "-o",
            "tty=",
            "-o",
            "user=",
            "-o",
            "command=",
        ])
        .output()
        .ok()?;
    if !ps_output.status.success() {
        return None;
    }
    let ps_text = String::from_utf8_lossy(&ps_output.stdout);
    let line = ps_text.lines().find(|line| !line.trim().is_empty())?.trim();
    // ppid and pgid are numeric; tty may be "?" with no spaces; user has no spaces.
    let mut parts = line.split_whitespace();
    let ppid = parts.next().and_then(|v| v.parse::<u32>().ok());
    let pgid = parts.next().and_then(|v| v.parse::<u32>().ok());
    let tty = parts.next().map(ToOwned::to_owned);
    let user = parts.next().map(ToOwned::to_owned);
    let command_text = parts.collect::<Vec<_>>().join(" ");
    let command_line = shell_words(&command_text);
    let process_name = command_line.first().and_then(|cmd| {
        PathBuf::from(cmd)
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
    });

    let cwd_output = Command::new("lsof")
        .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
        .output()
        .ok();
    let cwd = cwd_output.and_then(|output| {
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .find_map(|line| line.strip_prefix('n').map(PathBuf::from))
    });

    Some(ProcessSnapshot {
        pid,
        ppid,
        pgid,
        process_name,
        command_line,
        cwd,
        user_id: user,
        tty,
    })
}

#[cfg(target_os = "linux")]
fn process_snapshot_linux(pid: u32) -> Option<ProcessSnapshot> {
    let base = PathBuf::from("/proc").join(pid.to_string());
    if !base.exists() {
        return None;
    }
    let command_line = std::fs::read(base.join("cmdline"))
        .ok()
        .map(|bytes| {
            bytes
                .split(|b| *b == 0)
                .filter(|part| !part.is_empty())
                .map(|part| String::from_utf8_lossy(part).to_string())
                .collect::<Vec<_>>()
        })
        .filter(|parts| !parts.is_empty())
        .unwrap_or_default();
    let process_name = command_line.first().and_then(|cmd| {
        PathBuf::from(cmd)
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
    });
    let cwd = std::fs::read_link(base.join("cwd")).ok();
    let stat = std::fs::read_to_string(base.join("stat")).ok()?;
    // format: pid (comm) state ppid pgrp session tty_nr ...
    let after_name = stat.rsplit_once(") ")?.1;
    let mut fields = after_name.split_whitespace();
    let _state = fields.next()?;
    let ppid = fields.next().and_then(|v| v.parse::<u32>().ok());
    let pgid = fields.next().and_then(|v| v.parse::<u32>().ok());
    let _session = fields.next();
    let tty_nr = fields.next().and_then(|v| v.parse::<i32>().ok());
    let tty = match tty_nr {
        Some(0) | None => Some("?".into()),
        Some(_) => Some("tty".into()), // presence only; exact device name not required
    };
    let user = std::fs::metadata(&base).ok().map(|meta| {
        use std::os::unix::fs::MetadataExt;
        meta.uid().to_string()
    });

    Some(ProcessSnapshot {
        pid,
        ppid,
        pgid,
        process_name,
        command_line,
        cwd,
        user_id: user,
        tty,
    })
}

#[cfg(target_os = "windows")]
fn process_snapshot_windows(pid: u32) -> Option<ProcessSnapshot> {
    let script = format!(
        r#"
$p = Get-CimInstance Win32_Process -Filter "ProcessId={pid}" -ErrorAction SilentlyContinue
if ($null -eq $p) {{ exit 1 }}
$parent = $p.ParentProcessId
$cmd = if ($p.CommandLine) {{ $p.CommandLine }} else {{ "" }}
$name = if ($p.Name) {{ $p.Name }} else {{ "" }}
$owner = ""
try {{
  $o = Invoke-CimMethod -InputObject $p -MethodName GetOwner -ErrorAction SilentlyContinue
  if ($null -ne $o -and $o.User) {{ $owner = [string]$o.User }}
}} catch {{ }}
Write-Output "$parent`t$name`t$owner`t$cmd"
"#
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let line = String::from_utf8_lossy(&output.stdout);
    let line = line.lines().find(|l| !l.trim().is_empty())?.trim();
    let columns: Vec<&str> = line.splitn(4, '\t').collect();
    if columns.len() < 4 {
        return None;
    }
    let ppid = columns[0].parse::<u32>().ok();
    let process_name = (!columns[1].is_empty()).then(|| columns[1].to_string());
    let user_id = (!columns[2].is_empty()).then(|| columns[2].to_string());
    let command_line = shell_words(columns[3]);
    Some(ProcessSnapshot {
        pid,
        ppid,
        pgid: None,
        process_name,
        command_line,
        cwd: None,
        user_id,
        tty: None,
    })
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn shell_words(command: &str) -> Vec<String> {
    command
        .split_whitespace()
        .take(80)
        .map(|part| part.trim_matches('"').to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        ancestor_chain, orphan_hints, process_snapshot, terminate_process, ProcessSnapshot,
    };

    #[test]
    fn refuses_to_terminate_pid_one() {
        let err = terminate_process(1).expect_err("must refuse pid 1");
        assert!(err.to_string().contains("pid <= 1"));
    }

    #[test]
    fn orphan_hints_detect_ppid_one() {
        let snap = ProcessSnapshot {
            pid: 42,
            ppid: Some(1),
            pgid: Some(42),
            process_name: Some("node".into()),
            command_line: vec!["node".into()],
            cwd: None,
            user_id: None,
            tty: Some("??".into()),
        };
        let hints = orphan_hints(&snap);
        assert!(hints.iter().any(|h| h == "orphan_ppid"));
        assert!(hints.iter().any(|h| h == "no_tty"));
    }

    #[test]
    fn ancestor_chain_for_self_includes_current() {
        let self_pid = std::process::id();
        let chain = ancestor_chain(self_pid, 8);
        assert!(!chain.is_empty());
        assert_eq!(chain[0].pid, self_pid);
        // process_snapshot should work for the current process on supported platforms
        assert!(process_snapshot(self_pid).is_some());
    }
}
