# TECH · APP-032: Antigravity CLI Support

## 1. Architectural Overview

To support the Antigravity CLI, we will integrate it across the backend engine/services, the routing layers, and the web frontend. We will mirror the existing `gemini_cli` patterns but use the executable `agy` and the configuration directory `~/.gemini/antigravity-cli`.

```mermaid
sequence diagram
  participant CLI as Antigravity CLI (agy)
  participant API as apps/api (axum)
  participant Core as crates/core-service (AgentHooksService)
  participant Frontend as apps/web (Zustand + UI)

  CLI->>API: POST /hooks/antigravity (with SessionStart/BeforeTool payload)
  API->>Core: handle_antigravity_event(payload)
  Core->>Core: update session state (Idle / Running / PermissionRequest)
  Core->>Frontend: Broadcast WebSocket "agent_hook_state_changed"
  Frontend->>Frontend: Update UI hooks state card & status indicators
```

## 2. Proposed Changes

We will group the changes into backend service extensions, API endpoint routing, and frontend components.

---

### Backend Components

#### [MODIFY] [models.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/agent/src/models.rs)
- Add `AntigravityCli` to `AgentId` enum.
- Update `AgentId::as_str()` to return `"antigravity_cli"` for `Self::AntigravityCli`.

#### [MODIFY] [manager/mod.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/agent/src/manager/mod.rs)
- Add the `KnownAgent` definition for `AntigravityCli` inside `list_supported_agents()`:
  ```rust
  KnownAgent {
      id: AgentId::AntigravityCli,
      registry_id: "antigravity".to_string(),
      name: "Antigravity CLI".to_string(),
      description: "Google Antigravity command line agent".to_string(),
      npm_package: "@google/antigravity-cli".to_string(),
      executable: "agy".to_string(),
      auth_paths: vec![".gemini/antigravity-cli".to_string()],
  }
  ```
- Map `"antigravity"` to `(AgentId::AntigravityCli, "GEMINI_API_KEY")` in `get_registry_agent_env_overrides`.

#### [MODIFY] [support.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/apps/api/src/api/ws/router/support.rs)
- In `parse_agent_id`, map `"antigravity_cli"` to `Ok(AgentId::AntigravityCli)`.

#### [MODIFY] [agents.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/core-service/src/service/automation/agents.rs) <!-- updated 2026-07-05: Changed --yolo to --dangerously-skip-permissions because the agy binary does not support --yolo -->
- In `model_flag_for_agent`, add `"antigravity"` to the match arms that return `Some("--model")`.
- In `RESOLVED_PRESETS`, add the preset configuration tuple for `"antigravity"`, utilizing `-p` as the prompt flag:
  ```rust
  (
      "antigravity",
      PromptStrategy::PromptFlag,
      vec!["--dangerously-skip-permissions", "--output-format", "stream-json", "-p"],
      PromptDelivery::Arg,
      StdoutParser::CursorStreamJson,
  )
  ```

#### [MODIFY] [runtime.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/ai-usage/src/runtime.rs)
- Update the `antigravity` `ProviderSpec` definition in `provider_specs()`:
  - Add auth path `"~/.gemini/antigravity-cli/settings.json"`.
  - Add auth env key `"GEMINI_API_KEY"`.
  - Update `setup_hint` to: `"Launch Antigravity, sign in to its CLI (agy), or set GEMINI_API_KEY."`.

#### [MODIFY] [agent_hooks.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/core-service/src/service/agent_hooks.rs)
- Add `Antigravity` to `AgentToolType` enum.
- Add `mod antigravity;` declaration.
- Add `pub fn handle_antigravity_event(&self, payload: &Value, ctx: &AtmosContext)` handler.
- Map `AgentToolType::Antigravity` to `"Antigravity"` in `tool_display_name`.
- Add `AgentToolType::Antigravity => write!(f, "antigravity")` to its `Display` implementation.

#### [NEW] [antigravity.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/core-service/src/service/agent_hooks/antigravity.rs)
- Create hook event parser for Antigravity, matching the lifecycle events (`SessionStart`, `SessionEnd`, `PreInvocation`, `PostInvocation`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`) and updating state to running/idle/permission-request.

#### [MODIFY] [mod.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/core-engine/src/agent_hooks/mod.rs)
- Declare `mod antigravity;` module.
- Add `antigravity` field of type `AgentHookToolStatus` to `AgentHookInstallReport`.
- Register the check/install/uninstall hooks pathways for `"antigravity"`.

#### [NEW] [antigravity.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/core-engine/src/agent_hooks/antigravity.rs)
- Implement hook manager for Antigravity. Write to global hooks path `~/.gemini/antigravity-cli/hooks.json`.
- The hook JSON is structured under an `"atmos"` namespaced key:
  ```json
  {
    "atmos": {
      "SessionStart": [
        { "type": "command", "command": "<curl command payload to /hooks/antigravity>", "timeout": 5 }
      ],
      "PreInvocation": [
        { "type": "command", "command": "<curl command payload>", "async": true }
      ],
      "PreToolUse": [
        {
          "matcher": "*",
          "hooks": [
            { "type": "command", "command": "<curl command payload>", "async": true }
          ]
        }
      ],
      "PostToolUse": [
        {
          "matcher": "*",
          "hooks": [
            { "type": "command", "command": "<curl command payload>", "async": true }
          ]
        }
      ],
      "Stop": [
        { "type": "command", "command": "<curl command payload>", "async": true }
      ]
    }
  }
  ```
  *(Note that `PreToolUse` and `PostToolUse` wrap the hook command with a `matcher` matcher block, whereas lifecycle events are direct array elements).*


#### [MODIFY] [mod.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/apps/api/src/api/hooks/mod.rs)
- Register route `.route("/antigravity", post(handle_antigravity_hook))` in `routes()`.
- Implement `handle_antigravity_hook` that delegates to `state.agent_hooks_service.handle_antigravity_event(...)`.

---

### Frontend Components

#### [MODIFY] [builtin_agents.json](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/resources/terminal-agents/builtin_agents.json) <!-- updated 2026-07-05: Changed --yolo to --dangerously-skip-permissions because the agy binary does not support --yolo; changed modelSupport to catalog and added modelList mapping -->
- Add `"antigravity"` definition object:
  ```json
  {
    "id": "antigravity",
    "label": "Antigravity",
    "cmd": "agy",
    "params": "--dangerously-skip-permissions --output-format stream-json -p",
    "interactiveParams": "--dangerously-skip-permissions",
    "promptStrategy": "prompt_flag",
    "stdoutParser": "cursor_stream_json",
    "modelSupport": "catalog",
    "reasoningSupport": {
      "mode": "none"
    },
    "modelList": {
      "supported": true,
      "command": [
        "agy",
        "models"
      ],
      "parser": "line_list"
    }
  }
  ```

#### [MODIFY] [agent-api.ts](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/apps/web/src/api/ws/agent-api.ts)
- Add `"antigravity_cli"` to `AgentId` type.

#### [MODIFY] [agent-vendor.ts](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/apps/web/src/features/agent/lib/agent/agent-vendor.ts)
- Add `"antigravity"` to `AgentVendor` union type.
- Map `"antigravity"` and `"antigravity-cli"` in `REGISTRY_VENDOR_MAP`.
- Map `.includes("antigravity")` to return `"antigravity"` in `resolveAgentVendor`.

#### [MODIFY] [index.ts](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/apps/web/src/features/agent/lib/agent/subagent/index.ts)
- Add `antigravity: [fallbackSubAgentAdapter]` to `adaptersByVendor`.

#### [MODIFY] [terminal-agent-run-config.ts](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/apps/web/src/features/agent/lib/terminal-agent-run-config.ts)
- In `modelFlagForAgent`, add `case "antigravity": return "--model"`.

#### [MODIFY] [agent-hooks-store.ts](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/apps/web/src/features/agent/store/agent-hooks-store.ts)
- Add `ANTIGRAVITY: "antigravity"` to `AGENT_TOOL` object.
- Map `[AGENT_TOOL.ANTIGRAVITY]: "Antigravity"` to `AGENT_TOOL_LABELS`.
- Map `[AGENT_TOOL.ANTIGRAVITY]: "antigravity"` to `AGENT_TOOL_ICON_IDS`.

#### [MODIFY] [AgentHookStatusCard.tsx](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/apps/web/src/features/settings/components/AgentHookStatusCard.tsx)
- Add `antigravity: AgentHookToolStatus` to `AgentHookInstallReport` interface.
- Add `{ key: 'antigravity', label: 'Antigravity' }` to `HOOK_TOOL_META` constant array.

#### [MODIFY] [settings-modal-data.ts](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/apps/web/src/features/settings/components/settings-modal-data.ts)
- Add `"antigravity"` to code-agent and settings search keywords lists.

---

## 3. Risks & Mitigations

### Hook Script Conflict
Both Gemini and Antigravity hook installations write shell triggers into setting files. Since they write to separate configuration directories (`~/.gemini/settings.json` vs `~/.gemini/antigravity-cli/settings.json`), there is zero conflict between their physical configuration targets.
The curl endpoint in hook commands (`/hooks/gemini` vs `/hooks/antigravity`) must match correctly. We will verify the shell scripts generate distinct targets.
