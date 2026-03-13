use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::warn;

/// Gather system-level PTY usage information.
/// Works on macOS (sysctl + /dev/ttys*) and Linux (/dev/pts/*).
pub fn get_system_pty_info() -> Value {
    let os = std::env::consts::OS;

    let pty_max: Option<u64> = if os == "macos" {
        std::process::Command::new("sysctl")
            .args(["-n", "kern.tty.ptmx_max"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.trim().parse().ok())
    } else {
        std::fs::read_to_string("/proc/sys/kernel/pty/max")
            .ok()
            .and_then(|s| s.trim().parse().ok())
    };

    let pty_current: Option<u64> = if os == "macos" {
        std::fs::read_dir("/dev").ok().map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.file_name().to_string_lossy().starts_with("ttys"))
                .count() as u64
        })
    } else {
        std::fs::read_to_string("/proc/sys/kernel/pty/nr")
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .or_else(|| {
                std::fs::read_dir("/dev/pts")
                    .ok()
                    .map(|entries| entries.filter_map(|e| e.ok()).count() as u64)
            })
    };

    let usage_percent: Option<f64> = match (pty_current, pty_max) {
        (Some(cur), Some(max)) if max > 0 => Some((cur as f64 / max as f64) * 100.0),
        _ => None,
    };

    let health = match usage_percent {
        Some(p) if p >= 90.0 => "critical",
        Some(p) if p >= 70.0 => "warning",
        Some(_) => "healthy",
        None => "unknown",
    };

    let top_processes = get_pty_process_summary();

    json!({
        "os": os,
        "pty_max": pty_max,
        "pty_current": pty_current,
        "usage_percent": usage_percent.map(|p| (p * 10.0).round() / 10.0),
        "health": health,
        "top_processes": top_processes,
    })
}

/// Get a summary of which commands are using the most PTY devices.
/// Counts unique PTY devices per process, not file descriptors. Top 10.
pub fn get_pty_process_summary() -> Vec<Value> {
    let os = std::env::consts::OS;

    let output = if os == "macos" {
        std::process::Command::new("sh")
            .args(["-c", "lsof /dev/ttys* 2>/dev/null"])
            .output()
    } else {
        std::process::Command::new("sh")
            .args(["-c", "lsof /dev/pts/* 2>/dev/null"])
            .output()
    };

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let mut device_counts: HashMap<String, HashSet<String>> = HashMap::new();

            for line in stdout.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 9 {
                    let command = parts[0].to_string();
                    let device_name = parts[parts.len() - 1].trim().to_string();
                    device_counts
                        .entry(command)
                        .or_default()
                        .insert(device_name);
                }
            }

            let mut sorted: Vec<(String, u32)> = device_counts
                .into_iter()
                .map(|(cmd, devices)| (cmd, devices.len() as u32))
                .collect();
            sorted.sort_by(|a, b| b.1.cmp(&a.1));
            sorted.truncate(10);

            sorted
                .into_iter()
                .map(|(cmd, count)| json!({ "command": cmd, "count": count }))
                .collect()
        }
        Err(e) => {
            warn!("Failed to get PTY process summary: {}", e);
            vec![]
        }
    }
}

/// Detect orphaned shell processes (PPID=1) that may be holding PTY devices.
pub fn get_orphaned_processes() -> Vec<Value> {
    let output = std::process::Command::new("sh")
        .args(["-c", "ps -eo pid,ppid,etime,command 2>/dev/null"])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let shell_names = ["zsh", "bash", "sh", "fish", "tcsh", "csh", "ksh", "dash"];

            let mut orphans: Vec<Value> = stdout
                .lines()
                .skip(1)
                .filter_map(|line| {
                    let mut parts = line.split_whitespace();
                    let pid_str = parts.next()?;
                    let ppid_str = parts.next()?;
                    let elapsed = parts.next()?.to_string();
                    let command: String = parts.collect::<Vec<&str>>().join(" ");

                    let pid: u32 = pid_str.trim().parse().ok()?;
                    let ppid: u32 = ppid_str.trim().parse().ok()?;

                    let first_word = command.split_whitespace().next().unwrap_or("");
                    let basename = first_word.rsplit('/').next().unwrap_or(first_word);
                    let basename_lower = basename.to_lowercase();
                    if ppid == 1 && shell_names.iter().any(|s| basename_lower == *s) {
                        Some(json!({
                            "pid": pid,
                            "command": command,
                            "elapsed": elapsed,
                        }))
                    } else {
                        None
                    }
                })
                .collect();

            orphans.sort_by_key(|v| v["pid"].as_u64().unwrap_or(0));
            orphans
        }
        Err(e) => {
            warn!("Failed to detect orphaned processes: {}", e);
            vec![]
        }
    }
}

/// Gather tmux server information (socket, PID, uptime, total sessions/windows).
pub fn get_tmux_server_info(tmux_engine: &core_engine::TmuxEngine) -> Value {
    let socket_path = tmux_engine.socket_file_path();
    let server_pid = tmux_engine.get_server_pid();

    let uptime_secs: Option<u64> = tmux_engine.get_server_start_time().and_then(|start| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .map(|now| now.as_secs().saturating_sub(start))
    });

    let (total_sessions, total_windows) = tmux_engine
        .list_sessions()
        .map(|sessions| {
            let ws: u32 = sessions.iter().map(|s| s.windows).sum();
            (sessions.len() as u32, ws)
        })
        .unwrap_or((0, 0));

    json!({
        "socket_path": socket_path,
        "server_pid": server_pid,
        "uptime_secs": uptime_secs,
        "total_sessions": total_sessions,
        "total_windows": total_windows,
        "running": server_pid.is_some(),
    })
}

/// Gather shell environment information.
pub fn get_shell_env_info() -> Value {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "unknown".to_string());
    let term = std::env::var("TERM").unwrap_or_else(|_| "unknown".to_string());
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .unwrap_or_else(|_| "unknown".to_string());
    let home = std::env::var("HOME").unwrap_or_else(|_| "unknown".to_string());
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    let os_version: Option<String> = if os == "macos" {
        std::process::Command::new("sw_vers")
            .args(["-productVersion"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
    } else {
        std::fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|content| {
                content
                    .lines()
                    .find(|l| l.starts_with("PRETTY_NAME="))
                    .map(|l| {
                        l.trim_start_matches("PRETTY_NAME=")
                            .trim_matches('"')
                            .to_string()
                    })
            })
    };

    let hostname: Option<String> = std::process::Command::new("hostname")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string());

    json!({
        "shell": shell,
        "term": term,
        "user": user,
        "home": home,
        "os": os,
        "arch": arch,
        "os_version": os_version,
        "hostname": hostname,
    })
}

/// Get detailed PTY device list with per-device process information.
pub fn get_pty_device_details() -> Vec<Value> {
    let os = std::env::consts::OS;

    let output = if os == "macos" {
        std::process::Command::new("sh")
            .args(["-c", "lsof /dev/ttys* 2>/dev/null"])
            .output()
    } else {
        std::process::Command::new("sh")
            .args(["-c", "lsof /dev/pts/* 2>/dev/null"])
            .output()
    };

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let mut device_map: HashMap<String, Vec<Value>> = HashMap::new();

            for line in stdout.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 9 {
                    let command = parts[0].to_string();
                    let pid = parts[1].to_string();
                    let user = parts[2].to_string();
                    let fd = parts[3].to_string();
                    let device_name = parts[parts.len() - 1].to_string();

                    device_map.entry(device_name).or_default().push(json!({
                        "command": command,
                        "pid": pid,
                        "user": user,
                        "fd": fd,
                    }));
                }
            }

            let mut devices: Vec<Value> = device_map
                .into_iter()
                .map(|(device, processes)| {
                    let mut seen_pids = HashSet::new();
                    let unique_processes: Vec<Value> = processes
                        .into_iter()
                        .filter(|p| {
                            let pid = p["pid"].as_str().unwrap_or("").to_string();
                            seen_pids.insert(pid)
                        })
                        .collect();

                    json!({
                        "device": device,
                        "process_count": unique_processes.len(),
                        "processes": unique_processes,
                    })
                })
                .collect();

            devices.sort_by(|a, b| {
                let da = a["device"].as_str().unwrap_or("");
                let db = b["device"].as_str().unwrap_or("");
                da.cmp(db)
            });

            devices.truncate(100);
            devices
        }
        Err(e) => {
            warn!("Failed to get PTY device details: {}", e);
            vec![]
        }
    }
}
