# PRD · APP-032: Antigravity CLI Support

## 1. Purpose & User Value

With Google migrating `gemini-cli` to `antigravity-cli` (`agy` command), Atmos users need support for the new CLI agent. By adding Antigravity support, we allow users to:
1. Launch and configure Antigravity CLI as a built-in code agent directly from the Atmos UI.
2. Monitor hook integration status (idle/running/permission request) for Antigravity CLI sessions.
3. Track and view token quota usage for Antigravity through local auth detection (config files and environment variables).

All this must be done *without* removing or breaking the existing Gemini CLI support.

## 2. User Stories

- **As a Developer**, I want to see "Antigravity" listed under my built-in Code Agents in Settings so that I can configure its execution parameters.
- **As a Developer**, I want Atmos to automatically detect if I have signed in to `agy` locally (via `~/.gemini/antigravity-cli/settings.json`) or set my credentials, and reflect this in the AI Quota Usage panel.
- **As a Developer**, I want the agent hook status indicator for Antigravity to show whether it is idle, running, or waiting for permission, so I can debug command runs.

## 3. Features & Requirements

### 3.1 Settings & Built-in Agent Preset
- **Requirement 3.1.1**: Add "Antigravity" as a built-in code agent.
- **Requirement 3.1.2**: Provide default preset values for Antigravity:
  - Command: `agy`
  - Parameters: `--yolo --output-format stream-json --prompt`
  - Interactive parameters: `--yolo`
  - Prompt strategy: `prompt_flag`
  - Parser: `cursor_stream_json`
- **Requirement 3.1.3**: Do not modify existing Gemini CLI settings.

### 3.2 AI Quota / Usage Detection
- **Requirement 3.2.1**: Update the existing `antigravity` AI usage provider to support CLI credential detection.
- **Requirement 3.2.2**: The provider should detect authentication if:
  - Environment variable `GEMINI_API_KEY` is present.
  - Or local configuration file `~/.gemini/antigravity-cli/settings.json` exists.
- **Requirement 3.2.3**: Update setup hints to guide the user to sign in to Antigravity CLI or set `GEMINI_API_KEY`.

### 3.3 Agent Hook & Status Management
- **Requirement 3.3.1**: Implement hook installation/uninstallation for Antigravity.
- **Requirement 3.3.2**: Hook actions should read and modify the CLI settings file at `~/.gemini/antigravity-cli/settings.json`.
- **Requirement 3.3.3**: Support lifecycle event routing (`SessionStart`, `BeforeAgent`, `AfterAgent`, `BeforeTool`, etc.) from `agy` execution to the Atmos API hooks service.
- **Requirement 3.3.4**: Expose Antigravity CLI hook status card in the Settings panel.

## 4. Scope

### Must Have
- Built-in Agent preset configuration for `agy` (in `builtin_agents.json`).
- Backend enum registration of `AntigravityCli` and `Antigravity` tool/agent types.
- Backend routing and processing of Antigravity hook posts.
- Backend check/install/uninstall modules for Antigravity CLI hook.
- Frontend store, icons, and components displaying Antigravity status alongside Gemini CLI.
- Extended auth-path and setup hint checking for the `antigravity` AI usage provider.

### Nice to Have
- Auto-installing hooks during startup if Antigravity is detected.

### Out of Scope
- Removal or deprecation of the existing Gemini CLI integration or hooks.
- Modifying other agent integration pathways (e.g. Claude Code, Codex).
