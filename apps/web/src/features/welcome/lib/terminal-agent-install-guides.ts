/**
 * Official install commands for built-in terminal agents.
 * Hardcoded from vendor docs (Native installer / npm / Homebrew / WinGet / …).
 * Prefer official installers first; keep alternate types for users who need them.
 */

export type InstallOs = "macos" | "linux" | "windows";

export type AgentInstallMethod = {
  /** Distinguishes install flavors in the type tabs (Native, npm, Homebrew, …). */
  type: string;
  label: string;
  command?: string;
  notes?: string;
  link?: string;
};

export type AgentInstallGuide = Record<InstallOs, AgentInstallMethod[]>;

const unixNative = (command: string, notes?: string): AgentInstallMethod => ({
  type: "Native",
  label: "Native",
  command,
  notes,
});

const winNative = (command: string, notes?: string): AgentInstallMethod => ({
  type: "Native",
  label: "Native (PowerShell)",
  command,
  notes,
});

const npmGlobal = (pkg: string, extraFlags = ""): AgentInstallMethod => ({
  type: "npm",
  label: "npm",
  command: `npm install -g ${pkg}${extraFlags ? ` ${extraFlags}` : ""}`.trim(),
});

const brewFormula = (formula: string, cask = false): AgentInstallMethod => ({
  type: "Homebrew",
  label: "Homebrew",
  command: cask ? `brew install --cask ${formula}` : `brew install ${formula}`,
});

const winget = (id: string): AgentInstallMethod => ({
  type: "WinGet",
  label: "WinGet",
  command: `winget install ${id}`,
});

const docsLink = (url: string, notes?: string): AgentInstallMethod => ({
  type: "Docs",
  label: "Docs",
  link: url,
  notes: notes ?? "Open the official install docs.",
});

/**
 * Keys match `resources/terminal-agents/builtin_agents.json` ids
 * (and onboarding detection `agent_id`).
 */
export const TERMINAL_AGENT_INSTALL_GUIDES: Record<string, AgentInstallGuide> = {
  claude: {
    macos: [
      unixNative("curl -fsSL https://claude.ai/install.sh | bash"),
      brewFormula("claude-code", true),
      npmGlobal("@anthropic-ai/claude-code"),
    ],
    linux: [
      unixNative("curl -fsSL https://claude.ai/install.sh | bash"),
      npmGlobal("@anthropic-ai/claude-code"),
    ],
    windows: [
      winNative("irm https://claude.ai/install.ps1 | iex"),
      winget("Anthropic.ClaudeCode"),
      npmGlobal("@anthropic-ai/claude-code"),
    ],
  },
  codex: {
    macos: [
      unixNative("curl -fsSL https://chatgpt.com/codex/install.sh | sh"),
      brewFormula("codex", true),
      npmGlobal("@openai/codex"),
    ],
    linux: [
      unixNative("curl -fsSL https://chatgpt.com/codex/install.sh | sh"),
      npmGlobal("@openai/codex"),
    ],
    windows: [
      winNative(
        'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
      ),
      npmGlobal("@openai/codex"),
    ],
  },
  gemini: {
    macos: [
      npmGlobal("@google/gemini-cli"),
      brewFormula("gemini-cli"),
      {
        type: "npx",
        label: "npx",
        command: "npx @google/gemini-cli",
        notes: "Runs without a permanent install.",
      },
    ],
    linux: [
      npmGlobal("@google/gemini-cli"),
      {
        type: "npx",
        label: "npx",
        command: "npx @google/gemini-cli",
        notes: "Runs without a permanent install.",
      },
    ],
    windows: [
      npmGlobal("@google/gemini-cli"),
      {
        type: "npx",
        label: "npx",
        command: "npx @google/gemini-cli",
        notes: "Runs without a permanent install.",
      },
    ],
  },
  cursor: {
    macos: [
      unixNative("curl https://cursor.com/install -fsS | bash", "Installs the Cursor CLI (`agent` / `cursor-agent`)."),
    ],
    linux: [
      unixNative("curl https://cursor.com/install -fsS | bash", "Installs the Cursor CLI (`agent` / `cursor-agent`)."),
    ],
    windows: [
      winNative("irm 'https://cursor.com/install?win32=true' | iex"),
    ],
  },
  "grok-build": {
    macos: [unixNative("curl -fsSL https://x.ai/cli/install.sh | bash")],
    linux: [unixNative("curl -fsSL https://x.ai/cli/install.sh | bash")],
    windows: [winNative("irm https://x.ai/cli/install.ps1 | iex")],
  },
  opencode: {
    macos: [
      unixNative("curl -fsSL https://opencode.ai/install | bash"),
      brewFormula("anomalyco/tap/opencode"),
      npmGlobal("opencode-ai"),
    ],
    linux: [
      unixNative("curl -fsSL https://opencode.ai/install | bash"),
      brewFormula("anomalyco/tap/opencode"),
      npmGlobal("opencode-ai"),
    ],
    windows: [
      unixNative("curl -fsSL https://opencode.ai/install | bash", "Prefer WSL2; native Windows binary also available from releases."),
      npmGlobal("opencode-ai"),
      docsLink("https://opencode.ai", "Download a Windows binary from the official site / releases if needed."),
    ],
  },
  pi: {
    macos: [
      unixNative("curl -fsSL https://pi.dev/install.sh | sh"),
      npmGlobal("@earendil-works/pi-coding-agent", "--ignore-scripts"),
    ],
    linux: [
      unixNative("curl -fsSL https://pi.dev/install.sh | sh"),
      npmGlobal("@earendil-works/pi-coding-agent", "--ignore-scripts"),
    ],
    windows: [
      npmGlobal("@earendil-works/pi-coding-agent", "--ignore-scripts"),
      docsLink("https://pi.dev/docs/latest/quickstart", "Windows: use npm, or run the curl installer from WSL."),
    ],
  },
  antigravity: {
    macos: [unixNative("curl -fsSL https://antigravity.google/cli/install.sh | bash")],
    linux: [unixNative("curl -fsSL https://antigravity.google/cli/install.sh | bash")],
    windows: [
      winNative("irm https://antigravity.google/cli/install.ps1 | iex"),
      {
        type: "CMD",
        label: "CMD",
        command:
          "curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd",
      },
    ],
  },
  droid: {
    macos: [
      unixNative("curl -fsSL https://app.factory.ai/cli | sh"),
      brewFormula("droid", true),
      npmGlobal("droid"),
    ],
    linux: [
      unixNative("curl -fsSL https://app.factory.ai/cli | sh"),
      npmGlobal("droid"),
    ],
    windows: [
      winNative("irm https://app.factory.ai/cli/windows | iex"),
      npmGlobal("droid"),
    ],
  },
  amp: {
    macos: [
      unixNative("curl -fsSL https://ampcode.com/install.sh | bash"),
      npmGlobal("@ampcode/cli"),
    ],
    linux: [
      unixNative("curl -fsSL https://ampcode.com/install.sh | bash"),
      npmGlobal("@ampcode/cli"),
    ],
    windows: [
      npmGlobal("@ampcode/cli"),
      docsLink("https://ampcode.com/manual", "See Amp docs for Windows install options."),
    ],
  },
  kimi: {
    macos: [
      unixNative("curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash"),
      npmGlobal("@moonshot-ai/kimi-code"),
    ],
    linux: [
      unixNative("curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash"),
      npmGlobal("@moonshot-ai/kimi-code"),
    ],
    windows: [
      winNative("irm https://code.kimi.com/kimi-code/install.ps1 | iex"),
      npmGlobal("@moonshot-ai/kimi-code"),
    ],
  },
  kilocode: {
    macos: [npmGlobal("@kilocode/cli")],
    linux: [npmGlobal("@kilocode/cli")],
    windows: [npmGlobal("@kilocode/cli")],
  },
  kiro: {
    macos: [unixNative("curl -fsSL https://cli.kiro.dev/install | bash")],
    linux: [unixNative("curl -fsSL https://cli.kiro.dev/install | bash")],
    windows: [
      docsLink("https://kiro.dev/docs/cli", "Install Kiro CLI from the official docs for Windows."),
    ],
  },
  openclaw: {
    macos: [
      unixNative("curl -fsSL https://openclaw.ai/install.sh | bash"),
      npmGlobal("openclaw@latest", "--allow-scripts=openclaw"),
    ],
    linux: [
      unixNative("curl -fsSL https://openclaw.ai/install.sh | bash"),
      npmGlobal("openclaw@latest", "--allow-scripts=openclaw"),
    ],
    windows: [
      winNative("irm https://openclaw.ai/install.ps1 | iex"),
      npmGlobal("openclaw@latest", "--allow-scripts=openclaw"),
    ],
  },
  hermes: {
    macos: [unixNative("curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash")],
    linux: [unixNative("curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash")],
    windows: [winNative("iex (irm https://hermes-agent.nousresearch.com/install.ps1)")],
  },
  // Less standardized / docs-first when official one-liners are unclear.
  commandcode: {
    macos: [docsLink("https://commandcode.ai", "Install CommandCode (`cmd`) from the official site.")],
    linux: [docsLink("https://commandcode.ai", "Install CommandCode (`cmd`) from the official site.")],
    windows: [docsLink("https://commandcode.ai", "Install CommandCode (`cmd`) from the official site.")],
  },
  devin: {
    macos: [docsLink("https://devin.ai", "Install the Devin CLI from Cognition / Devin docs.")],
    linux: [docsLink("https://devin.ai", "Install the Devin CLI from Cognition / Devin docs.")],
    windows: [docsLink("https://devin.ai", "Install the Devin CLI from Cognition / Devin docs.")],
  },
};

export function hasTerminalAgentInstallGuide(agentId: string): boolean {
  return Boolean(TERMINAL_AGENT_INSTALL_GUIDES[agentId]);
}

export function detectInstallOs(): InstallOs {
  if (typeof navigator === "undefined") return "macos";
  const platform = navigator.platform?.toLowerCase() ?? "";
  const ua = navigator.userAgent?.toLowerCase() ?? "";
  if (platform.includes("win") || ua.includes("windows")) return "windows";
  if (platform.includes("linux") || ua.includes("linux")) return "linux";
  return "macos";
}

/** Preferred auto-run command for the host OS (first method with a command). */
export function preferredAgentInstallCommand(
  agentId: string,
  os: InstallOs = detectInstallOs(),
): string | null {
  const guide = TERMINAL_AGENT_INSTALL_GUIDES[agentId];
  if (!guide) return null;
  const method = guide[os].find((item) => Boolean(item.command?.trim()));
  return method?.command?.trim() || null;
}
