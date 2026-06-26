use std::io::IsTerminal;

use serde_json::{Map, Value};

use crate::commands::computer::ComputerCommand;
use crate::commands::runtime::RuntimeCommand;
use crate::Commands;

const INSTALL_COMMAND: &str =
    "curl -fsSL https://install.atmos.land/install-local-web-runtime.sh | bash";

#[derive(Debug, Clone, Copy)]
pub enum CommandKind {
    Runtime(RuntimeVerb),
    Computer(ComputerVerb),
    Update(UpdateVerb),
    Json,
}

#[derive(Debug, Clone, Copy)]
pub enum RuntimeVerb {
    Ensure,
    Stop,
    Status,
}

#[derive(Debug, Clone, Copy)]
pub enum ComputerVerb {
    Status,
    Start,
}

#[derive(Debug, Clone, Copy)]
pub enum UpdateVerb {
    Check,
    Install,
}

impl CommandKind {
    pub fn from_command(command: &Commands) -> Self {
        match command {
            Commands::Runtime { command } => Self::Runtime(match command {
                RuntimeCommand::Ensure(_) => RuntimeVerb::Ensure,
                RuntimeCommand::Stop(_) => RuntimeVerb::Stop,
                RuntimeCommand::Status => RuntimeVerb::Status,
            }),
            Commands::Computer { command } => Self::Computer(match command {
                ComputerCommand::Status => ComputerVerb::Status,
                ComputerCommand::Start(_) => ComputerVerb::Start,
            }),
            Commands::Update(args) => Self::Update(if args.check {
                UpdateVerb::Check
            } else {
                UpdateVerb::Install
            }),
            Commands::Canvas { .. } | Commands::Review { .. } => Self::Json,
        }
    }

    pub fn supports_human_output(self) -> bool {
        !matches!(self, Self::Json)
    }
}

pub fn render_output(kind: CommandKind, value: &Value) -> Option<String> {
    match kind {
        CommandKind::Runtime(verb) => Some(render_runtime(
            verb,
            value,
            "atmos runtime ensure",
            "atmos runtime stop",
        )),
        CommandKind::Computer(verb) => Some(render_computer(verb, value)),
        CommandKind::Update(verb) => Some(render_update(verb, value)),
        CommandKind::Json => None,
    }
}

pub fn render_error(message: &str) -> String {
    let mut out = String::new();
    out.push_str(&paint_stderr("Error", Color::Red, true));
    out.push('\n');
    out.push_str(message.trim());
    out
}

fn render_runtime(verb: RuntimeVerb, value: &Value, start_cmd: &str, stop_cmd: &str) -> String {
    let status = status_object(value);
    let action = str_field(value.as_object(), "action");
    let title = match verb {
        RuntimeVerb::Ensure if action == Some("already_running") => {
            "Atmos runtime is already running"
        }
        RuntimeVerb::Ensure => "Atmos runtime started",
        RuntimeVerb::Stop => {
            if bool_field(value.as_object(), "stopped").unwrap_or(false) {
                "Atmos runtime stopped"
            } else {
                "Atmos runtime was not running"
            }
        }
        RuntimeVerb::Status => "Atmos runtime status",
    };

    render_runtime_status(title, status, start_cmd, stop_cmd)
}

fn render_runtime_status(
    title: &str,
    status: Option<&Map<String, Value>>,
    start_cmd: &str,
    stop_cmd: &str,
) -> String {
    let installed = bool_field(status, "installed").unwrap_or(false);
    let running = bool_field(status, "running").unwrap_or(false);
    let healthy = bool_field(status, "healthy").unwrap_or(false);
    let url = str_field(status, "url").unwrap_or("");

    let mut rows = vec![
        ("Status", runtime_state(running, healthy)),
        ("Installed", yes_no(installed)),
    ];
    push_row(
        &mut rows,
        "URL",
        str_field(status, "url").map(str::to_string),
    );
    push_row(
        &mut rows,
        "PID",
        u64_field(status, "pid").map(|v| v.to_string()),
    );
    push_row(
        &mut rows,
        "Version",
        str_field(status, "version").map(str::to_string),
    );
    push_row(
        &mut rows,
        "Runtime",
        str_field(status, "runtime_dir").map(compact_path),
    );
    push_row(
        &mut rows,
        "API binary",
        str_field(status, "api_bin_path").map(compact_path),
    );
    push_row(
        &mut rows,
        "Logs",
        str_field(status, "log_path").map(compact_path),
    );
    push_row(
        &mut rows,
        "Manifest",
        str_field(status, "manifest_path").map(compact_path),
    );

    let mut notes = Vec::new();
    if !installed {
        notes.push("Install:".to_string());
        notes.push(format!("  {INSTALL_COMMAND}"));
        notes.push("Or install/open Atmos Desktop.".to_string());
    } else if running {
        if !url.is_empty() {
            notes.push(format!("Open: {url}"));
        }
        notes.push(format!("Stop: {stop_cmd}"));
    } else {
        notes.push(format!("Start: {start_cmd}"));
    }

    render_block(title, rows, notes)
}

fn render_computer(verb: ComputerVerb, value: &Value) -> String {
    let root = value.as_object();
    match verb {
        ComputerVerb::Status => {
            let local_api = object_field(root, "local_api");
            let identity = object_field(root, "identity");
            let registered = bool_field(root, "registered").unwrap_or(identity.is_some());
            let mut rows = vec![("Registered", yes_no(registered))];
            push_row(
                &mut rows,
                "Identity",
                str_field(root, "identity_path").map(compact_path),
            );
            push_row(
                &mut rows,
                "Server ID",
                str_field(identity, "server_id").map(str::to_string),
            );
            push_row(
                &mut rows,
                "Relay",
                str_field(identity, "relay_url").map(str::to_string),
            );
            if local_api.is_some() {
                let running = bool_field(local_api, "running").unwrap_or(false);
                let healthy = bool_field(local_api, "healthy").unwrap_or(false);
                push_row(
                    &mut rows,
                    "Local API",
                    Some(runtime_state(running, healthy)),
                );
                push_row(
                    &mut rows,
                    "URL",
                    str_field(local_api, "url").map(str::to_string),
                );
            }
            let notes = str_field(root, "hint")
                .map(|s| vec![s.to_string()])
                .unwrap_or_default();
            render_block("Atmos Computer status", rows, notes)
        }
        ComputerVerb::Start => {
            let runtime = object_field(root, "runtime");
            let register = object_field(root, "register");
            let action = str_field(root, "action");
            let title = if register.is_some() {
                "Atmos Computer registered and running"
            } else if action == Some("already_running") {
                "Atmos Computer is already running"
            } else {
                "Atmos Computer started"
            };
            let mut rows = Vec::new();
            push_row(
                &mut rows,
                "Relay",
                str_field(root, "relay_url").map(str::to_string),
            );
            push_row(
                &mut rows,
                "Server ID",
                str_field(register, "server_id").map(str::to_string),
            );
            push_row(
                &mut rows,
                "Relay link",
                bool_field(root, "relay_connected").map(yes_no),
            );
            push_row(&mut rows, "Daemon", bool_field(root, "daemon").map(yes_no));
            if runtime.is_some() {
                let running = bool_field(runtime, "running").unwrap_or(false);
                let healthy = bool_field(runtime, "healthy").unwrap_or(false);
                push_row(&mut rows, "Runtime", Some(runtime_state(running, healthy)));
                push_row(
                    &mut rows,
                    "URL",
                    str_field(runtime, "url").map(str::to_string),
                );
                push_row(
                    &mut rows,
                    "PID",
                    u64_field(runtime, "pid").map(|v| v.to_string()),
                );
                push_row(
                    &mut rows,
                    "Logs",
                    str_field(runtime, "log_path").map(compact_path),
                );
            }
            let notes = str_field(root, "hint")
                .map(|s| vec![s.to_string()])
                .unwrap_or_default();
            render_block(title, rows, notes)
        }
    }
}

fn render_update(verb: UpdateVerb, value: &Value) -> String {
    let root = value.as_object();
    let title = match (verb, str_field(root, "action")) {
        (UpdateVerb::Check, _) => "Atmos CLI update check",
        (_, Some("updated")) => "Atmos CLI updated",
        _ => "Atmos CLI is up to date",
    };

    let mut rows = Vec::new();
    push_row(
        &mut rows,
        "Current",
        str_field(root, "current_version")
            .or_else(|| str_field(root, "from_version"))
            .map(str::to_string),
    );
    push_row(
        &mut rows,
        "Latest",
        str_field(root, "latest_version")
            .or_else(|| str_field(root, "to_version"))
            .map(str::to_string),
    );
    push_row(
        &mut rows,
        "Tag",
        str_field(root, "latest_tag").map(str::to_string),
    );
    push_row(
        &mut rows,
        "Available",
        bool_field(root, "update_available").map(yes_no),
    );
    push_row(
        &mut rows,
        "Installed",
        str_field(root, "installed_path").map(compact_path),
    );
    push_row(
        &mut rows,
        "Method",
        str_field(root, "install_method").map(str::to_string),
    );
    push_row(
        &mut rows,
        "Release",
        str_field(root, "release_url").map(str::to_string),
    );

    let mut notes = Vec::new();
    if bool_field(root, "update_available").unwrap_or(false) {
        notes.push("Run: atmos update".to_string());
    }
    render_block(title, rows, notes)
}

fn render_block(title: &str, rows: Vec<(&'static str, String)>, notes: Vec<String>) -> String {
    let mut out = String::new();
    out.push_str(&paint_stdout(title, Color::Cyan, true));
    out.push('\n');

    let label_width = rows.iter().map(|(label, _)| label.len()).max().unwrap_or(0);
    for (label, value) in rows {
        out.push_str("  ");
        out.push_str(&paint_stdout(
            &format!("{label:<label_width$}"),
            Color::Dim,
            false,
        ));
        out.push_str("  ");
        out.push_str(&value);
        out.push('\n');
    }

    if !notes.is_empty() {
        out.push('\n');
        for note in notes {
            out.push_str("  ");
            out.push_str(&note);
            out.push('\n');
        }
    }

    out.trim_end().to_string()
}

fn runtime_state(running: bool, healthy: bool) -> String {
    match (running, healthy) {
        (true, true) => paint_stdout("running, healthy", Color::Green, false),
        (true, false) => paint_stdout("running, unhealthy", Color::Yellow, false),
        (false, _) => paint_stdout("stopped", Color::Dim, false),
    }
}

fn yes_no(value: bool) -> String {
    if value {
        paint_stdout("yes", Color::Green, false)
    } else {
        paint_stdout("no", Color::Dim, false)
    }
}

fn push_row(rows: &mut Vec<(&'static str, String)>, label: &'static str, value: Option<String>) {
    if let Some(value) = value.filter(|v| !v.trim().is_empty()) {
        rows.push((label, value));
    }
}

fn status_object(value: &Value) -> Option<&Map<String, Value>> {
    value
        .as_object()
        .and_then(|root| object_field(Some(root), "status"))
        .or_else(|| value.as_object())
}

fn object_field<'a>(
    object: Option<&'a Map<String, Value>>,
    key: &str,
) -> Option<&'a Map<String, Value>> {
    object?.get(key)?.as_object()
}

fn str_field<'a>(object: Option<&'a Map<String, Value>>, key: &str) -> Option<&'a str> {
    object?.get(key)?.as_str()
}

fn bool_field(object: Option<&Map<String, Value>>, key: &str) -> Option<bool> {
    object?.get(key)?.as_bool()
}

fn u64_field(object: Option<&Map<String, Value>>, key: &str) -> Option<u64> {
    object?.get(key)?.as_u64()
}

fn compact_path(path: &str) -> String {
    let Ok(home) = std::env::var("HOME") else {
        return path.to_string();
    };
    if path == home {
        "~".to_string()
    } else if let Some(rest) = path.strip_prefix(&(home + "/")) {
        format!("~/{rest}")
    } else {
        path.to_string()
    }
}

#[derive(Debug, Clone, Copy)]
enum Color {
    Cyan,
    Dim,
    Green,
    Red,
    Yellow,
}

fn paint_stdout(text: &str, color: Color, bold: bool) -> String {
    paint(text, color, bold, std::io::stdout().is_terminal())
}

fn paint_stderr(text: &str, color: Color, bold: bool) -> String {
    paint(text, color, bold, std::io::stderr().is_terminal())
}

fn paint(text: &str, color: Color, bold: bool, stream_is_terminal: bool) -> String {
    if !stream_is_terminal || std::env::var_os("NO_COLOR").is_some() {
        return text.to_string();
    }

    let color_code = match color {
        Color::Cyan => "36",
        Color::Dim => "2",
        Color::Green => "32",
        Color::Red => "31",
        Color::Yellow => "33",
    };
    let prefix = if bold {
        format!("\x1b[1;{color_code}m")
    } else {
        format!("\x1b[{color_code}m")
    };
    format!("{prefix}{text}\x1b[0m")
}
