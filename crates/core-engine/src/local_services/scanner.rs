#[cfg(target_os = "linux")]
use std::collections::HashMap;
use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Command;

use crate::error::{EngineError, Result};

use super::LocalTcpListener;

pub fn scan_listeners() -> Result<Vec<LocalTcpListener>> {
    #[cfg(target_os = "macos")]
    {
        scan_macos()
    }

    #[cfg(target_os = "linux")]
    {
        scan_linux()
    }

    #[cfg(target_os = "windows")]
    {
        scan_windows()
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err(EngineError::Processing(
            "local service scanning is not supported on this platform".into(),
        ))
    }
}

pub fn terminate_process(pid: u32) -> Result<()> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let status = Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .status()
            .map_err(|e| EngineError::Processing(format!("failed to run kill: {e}")))?;
        if status.success() {
            Ok(())
        } else {
            Err(EngineError::Processing(format!(
                "kill -TERM failed for pid {pid}: exit {:?}",
                status.code()
            )))
        }
    }

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string()])
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

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err(EngineError::Processing(
            "process termination is not supported on this platform".into(),
        ))
    }
}

#[cfg(target_os = "macos")]
fn scan_macos() -> Result<Vec<LocalTcpListener>> {
    let output = Command::new("lsof")
        .args(["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"])
        .output()
        .map_err(|e| EngineError::Processing(format!("failed to run lsof: {e}")))?;

    if !output.status.success() {
        return Err(EngineError::Processing(format!(
            "lsof listener scan failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut records = Vec::new();
    let mut pid: Option<u32> = None;
    let mut command: Option<String> = None;

    for line in text.lines() {
        let Some((tag, value)) = line.split_at_checked(1) else {
            continue;
        };
        match tag {
            "p" => {
                pid = value.parse::<u32>().ok();
                command = None;
            }
            "c" => command = Some(value.to_string()),
            "n" => {
                let Some(port) = parse_port_from_socket_name(value) else {
                    continue;
                };
                let local_addr = parse_addr_from_socket_name(value);
                let meta = pid.and_then(process_metadata_macos);
                records.push(LocalTcpListener {
                    pid,
                    process_name: command
                        .clone()
                        .or_else(|| meta.as_ref().and_then(|m| m.name.clone())),
                    local_addr,
                    port,
                    cwd: meta.as_ref().and_then(|m| m.cwd.clone()),
                    exe: None,
                    command_line: meta
                        .as_ref()
                        .and_then(|m| m.command_line.clone())
                        .unwrap_or_default(),
                    parent_pids: meta
                        .as_ref()
                        .and_then(|m| m.parent_pid)
                        .map(|pid| vec![pid])
                        .unwrap_or_default(),
                    user_id: meta.and_then(|m| m.user),
                });
            }
            _ => {}
        }
    }

    Ok(dedupe(records))
}

#[cfg(target_os = "macos")]
#[derive(Debug, Clone)]
struct ProcessMetadata {
    name: Option<String>,
    cwd: Option<PathBuf>,
    command_line: Option<Vec<String>>,
    parent_pid: Option<u32>,
    user: Option<String>,
}

#[cfg(target_os = "macos")]
fn process_metadata_macos(pid: u32) -> Option<ProcessMetadata> {
    let ps_output = Command::new("ps")
        .args([
            "-p",
            &pid.to_string(),
            "-o",
            "ppid=",
            "-o",
            "user=",
            "-o",
            "command=",
        ])
        .output()
        .ok()?;
    let ps_text = String::from_utf8_lossy(&ps_output.stdout);
    let line = ps_text.lines().find(|line| !line.trim().is_empty())?.trim();
    let mut parts = line.split_whitespace();
    let parent_pid = parts.next().and_then(|value| value.parse::<u32>().ok());
    let user = parts.next().map(ToOwned::to_owned);
    let command_text = parts.collect::<Vec<_>>().join(" ");
    let command_line = shell_words(&command_text);
    let name = command_line.first().and_then(|cmd| {
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

    Some(ProcessMetadata {
        name,
        cwd,
        command_line: Some(command_line),
        parent_pid,
        user,
    })
}

#[cfg(target_os = "linux")]
fn scan_linux() -> Result<Vec<LocalTcpListener>> {
    let sockets = linux_listening_sockets()?;
    let inode_to_socket: HashMap<String, (String, u16)> = sockets
        .into_iter()
        .map(|socket| (socket.inode, (socket.addr, socket.port)))
        .collect();
    let mut records = Vec::new();

    let proc_entries = std::fs::read_dir("/proc")
        .map_err(|e| EngineError::Processing(format!("failed to read /proc: {e}")))?;
    for entry in proc_entries.flatten() {
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|value| value.parse::<u32>().ok())
        else {
            continue;
        };
        let fd_dir = entry.path().join("fd");
        let Ok(fd_entries) = std::fs::read_dir(fd_dir) else {
            continue;
        };
        let meta = process_metadata_linux(pid);
        for fd in fd_entries.flatten() {
            let Ok(target) = std::fs::read_link(fd.path()) else {
                continue;
            };
            let Some(inode) = socket_inode_from_link(&target.to_string_lossy()) else {
                continue;
            };
            if let Some((addr, port)) = inode_to_socket.get(&inode) {
                records.push(LocalTcpListener {
                    pid: Some(pid),
                    process_name: meta.name.clone(),
                    local_addr: addr.clone(),
                    port: *port,
                    cwd: meta.cwd.clone(),
                    exe: meta.exe.clone(),
                    command_line: meta.command_line.clone().unwrap_or_default(),
                    parent_pids: meta.parent_pid.map(|pid| vec![pid]).unwrap_or_default(),
                    user_id: meta.user.clone(),
                });
            }
        }
    }

    Ok(dedupe(records))
}

#[cfg(target_os = "linux")]
#[derive(Debug, Clone)]
struct LinuxSocket {
    addr: String,
    port: u16,
    inode: String,
}

#[cfg(target_os = "linux")]
fn linux_listening_sockets() -> Result<Vec<LinuxSocket>> {
    let mut sockets = Vec::new();
    parse_proc_net_tcp("/proc/net/tcp", false, &mut sockets)?;
    parse_proc_net_tcp("/proc/net/tcp6", true, &mut sockets)?;
    Ok(sockets)
}

#[cfg(target_os = "linux")]
fn parse_proc_net_tcp(path: &str, ipv6: bool, out: &mut Vec<LinuxSocket>) -> Result<()> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return Ok(());
    };
    for line in text.lines().skip(1) {
        let columns: Vec<&str> = line.split_whitespace().collect();
        if columns.len() < 10 || columns[3] != "0A" {
            continue;
        }
        let Some((addr_hex, port_hex)) = columns[1].split_once(':') else {
            continue;
        };
        let Ok(port) = u16::from_str_radix(port_hex, 16) else {
            continue;
        };
        let addr = if ipv6 {
            parse_linux_ipv6(addr_hex)
        } else {
            parse_linux_ipv4(addr_hex)
        };
        out.push(LinuxSocket {
            addr,
            port,
            inode: columns[9].to_string(),
        });
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn process_metadata_linux(pid: u32) -> ProcessMetadataLinux {
    let base = PathBuf::from("/proc").join(pid.to_string());
    let command_line = std::fs::read(base.join("cmdline"))
        .ok()
        .map(|bytes| {
            bytes
                .split(|b| *b == 0)
                .filter(|part| !part.is_empty())
                .map(|part| String::from_utf8_lossy(part).to_string())
                .collect::<Vec<_>>()
        })
        .filter(|parts| !parts.is_empty());
    let name = command_line.as_ref().and_then(|parts| {
        parts.first().and_then(|cmd| {
            PathBuf::from(cmd)
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
        })
    });
    let cwd = std::fs::read_link(base.join("cwd")).ok();
    let exe = std::fs::read_link(base.join("exe")).ok();
    let stat = std::fs::read_to_string(base.join("stat")).ok();
    let parent_pid = stat.and_then(|stat| {
        let after_name = stat.rsplit_once(") ")?.1;
        after_name
            .split_whitespace()
            .nth(1)
            .and_then(|value| value.parse::<u32>().ok())
    });
    let user = std::fs::metadata(base)
        .ok()
        .map(|meta| {
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                meta.uid().to_string()
            }
            #[cfg(not(unix))]
            {
                String::new()
            }
        })
        .filter(|value| !value.is_empty());

    ProcessMetadataLinux {
        name,
        cwd,
        exe,
        command_line,
        parent_pid,
        user,
    }
}

#[cfg(target_os = "linux")]
#[derive(Debug, Clone)]
struct ProcessMetadataLinux {
    name: Option<String>,
    cwd: Option<PathBuf>,
    exe: Option<PathBuf>,
    command_line: Option<Vec<String>>,
    parent_pid: Option<u32>,
    user: Option<String>,
}

#[cfg(target_os = "linux")]
fn socket_inode_from_link(value: &str) -> Option<String> {
    value
        .strip_prefix("socket:[")
        .and_then(|rest| rest.strip_suffix(']'))
        .map(ToOwned::to_owned)
}

#[cfg(target_os = "linux")]
fn parse_linux_ipv4(hex: &str) -> String {
    if hex.len() != 8 {
        return "0.0.0.0".into();
    }
    let bytes = (0..4)
        .filter_map(|idx| u8::from_str_radix(&hex[idx * 2..idx * 2 + 2], 16).ok())
        .collect::<Vec<_>>();
    if bytes.len() != 4 {
        return "0.0.0.0".into();
    }
    format!("{}.{}.{}.{}", bytes[3], bytes[2], bytes[1], bytes[0])
}

#[cfg(target_os = "linux")]
fn parse_linux_ipv6(hex: &str) -> String {
    if hex == "00000000000000000000000000000000" {
        return "::".into();
    }
    if hex == "00000000000000000000000001000000" {
        return "::1".into();
    }
    "::".into()
}

#[cfg(target_os = "windows")]
fn scan_windows() -> Result<Vec<LocalTcpListener>> {
    let script = r#"
$connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue
foreach ($c in $connections) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue
  $name = if ($p) { $p.Name } else { "" }
  $cmd = if ($p) { $p.CommandLine } else { "" }
  "$($c.OwningProcess)`t$name`t$($c.LocalAddress)`t$($c.LocalPort)`t$cmd"
}
"#;
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| EngineError::Processing(format!("failed to run PowerShell: {e}")))?;
    if !output.status.success() {
        return Err(EngineError::Processing(format!(
            "PowerShell listener scan failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    let mut records = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let columns: Vec<&str> = line.split('\t').collect();
        if columns.len() < 5 {
            continue;
        }
        let Some(pid) = columns[0].parse::<u32>().ok() else {
            continue;
        };
        let Some(port) = columns[3].parse::<u16>().ok() else {
            continue;
        };
        records.push(LocalTcpListener {
            pid: Some(pid),
            process_name: (!columns[1].is_empty()).then(|| columns[1].to_string()),
            local_addr: columns[2].to_string(),
            port,
            cwd: None,
            exe: None,
            command_line: shell_words(columns[4]),
            parent_pids: Vec::new(),
            user_id: None,
        });
    }
    Ok(dedupe(records))
}

#[cfg(any(target_os = "macos", test))]
fn parse_port_from_socket_name(name: &str) -> Option<u16> {
    let endpoint = name.split("->").next().unwrap_or(name);
    let endpoint = endpoint
        .trim()
        .strip_prefix("TCP ")
        .unwrap_or(endpoint.trim())
        .split_whitespace()
        .next()?;
    endpoint
        .rsplit_once(':')
        .and_then(|(_, port)| port.trim_end_matches(')').parse::<u16>().ok())
}

#[cfg(any(target_os = "macos", test))]
fn parse_addr_from_socket_name(name: &str) -> String {
    let endpoint = name.split("->").next().unwrap_or(name);
    let endpoint = endpoint
        .trim()
        .strip_prefix("TCP ")
        .unwrap_or(endpoint.trim())
        .split_whitespace()
        .next()
        .unwrap_or("*");
    endpoint
        .rsplit_once(':')
        .map(|(addr, _)| addr.trim_matches(['[', ']']).to_string())
        .filter(|addr| !addr.is_empty())
        .unwrap_or_else(|| "*".into())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn shell_words(command: &str) -> Vec<String> {
    command
        .split_whitespace()
        .take(80)
        .map(|part| part.trim_matches('"').to_string())
        .collect()
}

fn dedupe(records: Vec<LocalTcpListener>) -> Vec<LocalTcpListener> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for record in records {
        let key = (record.pid, record.port, record.local_addr.clone());
        if seen.insert(key) {
            out.push(record);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{parse_addr_from_socket_name, parse_port_from_socket_name};

    #[test]
    fn parses_lsof_socket_names() {
        assert_eq!(
            parse_port_from_socket_name("TCP *:3030 (LISTEN)"),
            Some(3030)
        );
        assert_eq!(
            parse_port_from_socket_name("TCP 127.0.0.1:5173 (LISTEN)"),
            Some(5173)
        );
        assert_eq!(parse_addr_from_socket_name("TCP *:3030 (LISTEN)"), "*");
        assert_eq!(
            parse_addr_from_socket_name("TCP [::1]:3000 (LISTEN)"),
            "::1"
        );
    }
}
