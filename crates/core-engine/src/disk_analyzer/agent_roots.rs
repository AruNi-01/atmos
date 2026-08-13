//! Mainstream code-agent session / transcript roots (existing dirs only).

use std::collections::HashSet;
use std::path::{Path, PathBuf};

fn env_home_dir(var: &str, fallback: PathBuf) -> PathBuf {
    std::env::var(var)
        .ok()
        .map(|s| PathBuf::from(s.trim()))
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(fallback)
}

fn extra_env_dir(var: &str) -> Option<PathBuf> {
    std::env::var(var)
        .ok()
        .map(|s| PathBuf::from(s.trim()))
        .filter(|p| !p.as_os_str().is_empty())
}

/// Home-relative XDG layout plus an env override when it points somewhere else.
fn xdg_dir_candidates(home: &Path, env_var: &str, relative: &[&str]) -> Vec<PathBuf> {
    let mut dir = home.to_path_buf();
    for part in relative {
        dir.push(part);
    }
    let mut dirs = vec![dir];
    if let Some(p) = extra_env_dir(env_var) {
        if !dirs.iter().any(|d| d == &p) {
            dirs.push(p);
        }
    }
    dirs
}

/// Session / transcript directories for mainstream code agents (existing only).
///
/// Does **not** include the whole agent home (`~/.cursor`, `~/.claude`, …) or
/// IDE Application Support trees. Linked git worktrees (`~/.cursor/worktrees`,
/// `$CODEX_HOME/worktrees`, `$GROK_HOME/worktrees`, leftover `git worktree add`
/// checkouts) are discovered separately.
///
/// Skill scan (`AGENT_SKILL_DIRS`) looks at **in-repo** `.agent/skills` folders.
/// Session stores are almost always under the user home / XDG data dir — that is
/// what this list covers. Agents with no confirmed home session root are omitted
/// rather than guessed (Aider per-repo history, VS Code extension task DBs,
/// Replit cloud, etc.).
pub fn agent_data_roots(home: &Path) -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let xdg_data_dirs = xdg_dir_candidates(home, "XDG_DATA_HOME", &[".local", "share"]);
    let xdg_config_dirs = xdg_dir_candidates(home, "XDG_CONFIG_HOME", &[".config"]);
    // First field is a stable i18n key (`DiskAnalyzer.agentSessionNames.*`), not a path.
    let mut push = |key: &str, path: PathBuf| {
        if path.is_dir() && seen.insert(path.clone()) {
            out.push((key.to_string(), path));
        }
    };

    // Claude Code: ~/.claude/projects/<encoded-cwd>/*.jsonl
    let claude_home = env_home_dir("CLAUDE_CONFIG_DIR", home.join(".claude"));
    push("claude", claude_home.join("projects"));

    // Cursor: agent transcripts + composer chat DBs. Worktrees are not sessions.
    push("cursor", home.join(".cursor").join("projects"));
    push("cursorChats", home.join(".cursor").join("chats"));

    // Codex CLI / app: $CODEX_HOME/sessions (+ archived / headless). Worktrees separate.
    let codex_home = env_home_dir("CODEX_HOME", home.join(".codex"));
    push("codex", codex_home.join("sessions"));
    push("codexArchived", codex_home.join("archived_sessions"));
    push("codexHeadless", codex_home.join("headless"));

    // GitHub Copilot CLI: ~/.copilot/session-state/<id>/
    let copilot_home = env_home_dir("COPILOT_HOME", home.join(".copilot"));
    push("copilot", copilot_home.join("session-state"));
    push("copilotHistory", copilot_home.join("history-session-state"));

    // Gemini CLI: ~/.gemini/tmp/<project-hash>/chats/
    push("gemini", home.join(".gemini").join("tmp"));
    // Antigravity CLI (agy) conversations sit next to Gemini, not in ~/.gemini/tmp.
    push(
        "antigravity",
        home.join(".gemini")
            .join("antigravity-cli")
            .join("conversations"),
    );

    // Continue: ~/.continue/sessions/<uuid>.json
    push("continue", home.join(".continue").join("sessions"));

    // Grok Build: $GROK_HOME/sessions (default ~/.grok/sessions). Worktrees separate.
    let grok_home = env_home_dir("GROK_HOME", home.join(".grok"));
    push("grok", grok_home.join("sessions"));

    // OpenCode: XDG data SQLite (`opencode.db`); macOS also uses Application Support.
    // Do not scan ~/.opencode — that is the in-repo / config skills tree.
    for data in &xdg_data_dirs {
        push("opencode", data.join("opencode"));
    }
    push(
        "opencode",
        home.join("Library")
            .join("Application Support")
            .join("opencode"),
    );

    // Devin CLI: ~/.local/share/devin/cli (`sessions.db`). Desktop ACP events are separate.
    // ~/.devin/plans are plan files, not the session store — skip the whole ~/.devin home.
    for data in &xdg_data_dirs {
        push("devin", data.join("devin").join("cli"));
    }
    push(
        "devinAcp",
        home.join("Library")
            .join("Application Support")
            .join("Devin")
            .join("User")
            .join("acp-events"),
    );
    for config in &xdg_config_dirs {
        push(
            "devinAcp",
            config.join("Devin").join("User").join("acp-events"),
        );
    }

    // Amp: ~/.local/share/amp/threads
    for data in &xdg_data_dirs {
        push("amp", data.join("amp").join("threads"));
    }

    // Factory Droid: ~/.factory/sessions
    push("droid", home.join(".factory").join("sessions"));

    // Pi / Oh My Pi
    let pi_home = env_home_dir("PI_CODING_AGENT_DIR", home.join(".pi").join("agent"));
    push("pi", pi_home.join("sessions"));
    push("omp", home.join(".omp").join("agent").join("sessions"));

    // Kimi CLI + Kimi Code
    let kimi_share = env_home_dir("KIMI_SHARE_DIR", home.join(".kimi"));
    push("kimi", kimi_share.join("sessions"));
    let kimi_code = env_home_dir("KIMI_CODE_HOME", home.join(".kimi-code"));
    push("kimiCode", kimi_code.join("sessions"));

    // Qwen CLI (Gemini-like tmp + optional projects transcripts)
    push("qwen", home.join(".qwen").join("tmp"));
    push("qwenProjects", home.join(".qwen").join("projects"));

    // Cline CLI: $CLINE_SESSION_DATA_DIR or ~/.cline/data/sessions
    let cline_dir = env_home_dir("CLINE_DIR", home.join(".cline"));
    let cline_data = env_home_dir("CLINE_DATA_DIR", cline_dir.join("data"));
    let cline_sessions = env_home_dir("CLINE_SESSION_DATA_DIR", cline_data.join("sessions"));
    push("cline", cline_sessions);

    // Goose
    for config in &xdg_config_dirs {
        push("goose", config.join("goose").join("sessions"));
    }
    for data in &xdg_data_dirs {
        push("goose", data.join("goose").join("sessions"));
    }
    if let Some(root) = extra_env_dir("GOOSE_PATH_ROOT") {
        push("goose", root.join("sessions"));
    }

    // Crush: crush.db lives in ~/.crush or XDG data (not in-repo .crush/skills).
    // Only measure the home when the session DB is present; otherwise sessions/.
    let crush_home = home.join(".crush");
    if crush_home.join("crush.db").is_file() {
        push("crush", crush_home);
    } else {
        push("crush", crush_home.join("sessions"));
    }
    for data in &xdg_data_dirs {
        let crush_xdg = data.join("crush");
        if crush_xdg.join("crush.db").is_file() {
            push("crush", crush_xdg);
        } else {
            push("crush", crush_xdg.join("sessions"));
        }
    }

    // Hermes: measure sessions/ only — ~/.hermes also holds skills/config.
    let hermes_home = env_home_dir("HERMES_HOME", home.join(".hermes"));
    push("hermes", hermes_home.join("sessions"));

    // OpenClaw / OpenHands / Mux / Junie / Command Code / CodeBuddy / Augment / Vibe / Kiro
    push("openclaw", home.join(".openclaw").join("agents"));
    push("openhands", home.join(".openhands").join("conversations"));
    push("mux", home.join(".mux").join("sessions"));
    push("junie", home.join(".junie").join("sessions"));
    push("commandcode", home.join(".commandcode").join("projects"));
    push("codebuddy", home.join(".codebuddy").join("projects"));
    push("augment", home.join(".augment").join("sessions"));
    push("vibe", home.join(".vibe").join("logs").join("session"));
    push("kiro", home.join(".kiro").join("sessions"));
    for data in &xdg_data_dirs {
        push("kiroCli", data.join("kiro-cli"));
    }

    // Windsurf Cascade transcripts (not the whole ~/.codeium or IDE Application Support).
    push(
        "windsurf",
        home.join(".codeium").join("windsurf").join("cascade"),
    );

    out
}
