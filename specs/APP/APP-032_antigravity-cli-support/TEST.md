# TEST · APP-032: Antigravity CLI Support

## 1. Test Strategy

We will verify this feature using a mix of backend unit/integration tests and manual/exploratory UI smoke tests:
- **Rust Unit Tests**: Verify `AgentId` parsing, preset mappings, and notification label mappings.
- **Frontend Unit Tests / Checks**: Verify the parsing of `builtin_agents.json` and agent vendor routing mapping.
- **Manual verification**: Verify that Antigravity is listed in the Settings dropdown and can be configured. Verify hooks can be installed/uninstalled.

## 2. Scenario Map

| Scenario ID | PRD Req | Description | Level | Tool/Cmd |
|-------------|---------|-------------|-------|----------|
| **SCENARIO-1** | 3.1.1, 3.1.2 | Antigravity CLI is exposed as built-in agent with correct presets | Unit / Integration | `cargo test --package core-service` & `bun test` |
| **SCENARIO-2** | 3.2.1, 3.2.2 | Quota provider detects Antigravity auth paths & env vars | Integration | `cargo test --package ai-usage` |
| **SCENARIO-3** | 3.3.1, 3.3.2 | Antigravity hook can check, install, and uninstall triggers in settings file | Integration | `cargo test --package core-engine` |
| **SCENARIO-4** | 3.3.3, 3.3.4 | Antigravity webhook endpoints correctly process session triggers | Integration | HTTP/API endpoint tests |

## 3. Scenarios

### SCENARIO-1: Built-in agent configurations
- **Given** the application lists built-in agents.
- **When** parsing agent definitions.
- **Then** the list must contain `antigravity` with executable command `agy`, prompting strategy `prompt_flag`, and reasoning mode `none`.

### SCENARIO-2: Quota Provider Auth Detection
- **Given** an environment where `GEMINI_API_KEY` is set.
- **When** running AI quota provider checks.
- **Then** `antigravity` provider status must show `Detected`.

### SCENARIO-3: Hook settings installation
- **Given** an empty `~/.gemini/antigravity-cli/settings.json` file.
- **When** executing Antigravity hook installation.
- **Then** the settings file must exist and contain Atmos webhook hooks.

## 4. Manual/Exploratory Verification Steps

1. Launch Atmos dev server (`just dev-api` & `just dev-web`).
2. Open Settings Modal:
   - Verify that "Antigravity" is listed as a built-in agent.
   - Verify that the startup command is populated as `agy` by default.
   - Check the Agent Hook Status card: verify "Antigravity" is listed and shows install/uninstall status accurately.
3. Open AI Quota / Usage popover:
   - Verify that the Antigravity provider is displayed and shows status based on local presence of `~/.gemini/antigravity-cli/settings.json` or `GEMINI_API_KEY`.
