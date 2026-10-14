# CLI capability audit · APP-080

Audit date: 2026-10-08. Scope is the 17 built-in Terminal Agents in `resources/terminal-agents/builtin_agents.json`. This file records what each CLI can set at launch. It is evidence for a later probe/UX pass, not a requirements source.

Method:

- Installed CLIs: `command --help` (and the launch subcommand help) on this Mac. Versions below are that binary's `--version`.
- Missing installs (`kimi`, `kiro-cli`, `openclaw`): official docs only. No local `--help`.
- Extra enums that `--help` omitted were taken from the vendor doc or, for Grok, from help text embedded in the `grok` 1.0.46 binary. Those rows say so.
- "Atmos today" is `builtin_agents.json` plus `model_flag_for_agent` in `crates/core-service/src/service/automation/agents.rs`. Structured launch args today are only `--model` and the reasoning arg. Permission is a single optional YOLO string. There is no session-mode field and no fast field.

## Gap summary

| id          | Model                                                                   | Reasoning                                                                                                              | Session / permission                                                                   | Fast                                                       | What Atmos misses                                                                  |
| ----------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| claude      | `--model`, no list command                                              | `--effort` `low\|medium\|high\|xhigh\|max`                                                                             | `--permission-mode` `acceptEdits\|auto\|bypassPermissions\|manual\|dontAsk\|plan`      | no `--fast` in this binary                                 | permission modes. In-session `/effort` also has `ultracode` and `auto`             |
| codex       | `--model`, catalog via `codex debug models`                             | no dedicated flag. Config key `model_reasoning_effort`                                                                 | sandbox + approval policy, plus YOLO bypass                                            | none                                                       | reasoning, sandbox, approval policy                                                |
| gemini      | `--model`, no list flag                                                 | no launch thinking flag in 0.62.0                                                                                      | `--approval-mode` `default\|auto_edit\|yolo\|plan`                                     | none                                                       | approval modes. `modelSupport: manual` matches the CLI                             |
| antigravity | `--model`, `agy models`                                                 | `--effort` `low\|medium\|high\|xhigh\|max`                                                                             | `--mode` `accept-edits\|plan`, plus skip-permissions                                   | none                                                       | reasoning marked `none`; execution mode                                            |
| devin       | `--model`, `devin models` subcommand                                    | none in help                                                                                                           | `--permission-mode` `auto\|accept-edits\|smart\|dangerous`                             | none                                                       | permission ladder. Model list exists but support is `manual`                       |
| amp         | no `--model`. `--mode` selects the model                                | `--mode` `low\|medium\|high\|ultra`, not `--effort`                                                                    | `--dangerously-allow-all`                                                              | `--fast` / `--no-fast`                                     | `--effort` in the manifest does not exist. Fast is a real launch flag              |
| droid       | `--model`, catalog from `droid exec --help`                             | `--reasoning-effort`, per model, often `off\|low\|medium\|high\|xhigh\|max`                                            | `--auto` `low\|medium\|high`. YOLO cannot combine with `--auto`                        | fast is a model id suffix (`*-fast`), not a flag           | reasoning is free text. Autonomy ladder is missing                                 |
| opencode    | `--model` `provider/model`, `opencode models`                           | `--variant` (example `high`, `max`, `minimal`). `--thinking` only shows blocks                                         | `--auto`                                                                               | none                                                       | `--variant`                                                                        |
| kimi        | `--model`. Not installed                                                | `--thinking` / `--no-thinking` boolean                                                                                 | `--plan`. `--yolo` / `--yes` / `--auto-approve` / `--afk`. `--print` implies `--afk`   | none                                                       | no YOLO in the manifest. `--plan` and `--no-thinking`                              |
| cursor      | `--model`, `--list-models`. Effort and fast can sit inside the model id | `encoded_in_model` matches, e.g. `name[effort=high,fast=false]`                                                        | `--mode` `plan\|ask`. `--force` / `--yolo`, `--auto-review`, `--sandbox`               | model-id parameter, not its own flag                       | plan/ask and the permission ladder                                                 |
| grok-build  | `--model`, `grok models`                                                | `--reasoning-effort` / `--effort`. Canonical `none\|minimal\|low\|medium\|high\|xhigh\|max`, then the model's own menu | `--permission-mode` `default\|acceptEdits\|auto\|dontAsk\|bypassPermissions\|plan`     | none found                                                 | reasoning is free text. Permission modes                                           |
| kilocode    | same shape as OpenCode                                                  | `--variant`                                                                                                            | `--auto` (`run --auto` is the YOLO form)                                               | none                                                       | `--variant`                                                                        |
| kiro        | `--model` in current docs. Not installed                                | `--effort`. Levels depend on the model and are not enumerated                                                          | `--trust-all-tools`, `--trust-tools=<list>`                                            | none in the headless flag table                            | reasoning marked `none`. `chat --list-models` was not in the 2026-10-05 flag table |
| commandcode | `--model`, `--list-models`                                              | `--effort`, help example `low`, `medium`, `high`, model-dependent                                                      | `--permission-mode` `standard\|plan\|auto-accept`, `--plan`, `--auto-accept`, `--yolo` | none                                                       | reasoning marked `none`. Permission modes                                          |
| pi          | `--model`, `--list-models`                                              | `--thinking` `off\|minimal\|low\|medium\|high\|xhigh\|max`                                                             | `--mode` is output format `text\|json\|rpc`. `--approve` trusts project files. No YOLO | none                                                       | enum stops at `xhigh` and drops `max`                                              |
| openclaw    | `--model` on `agent` and `agent exec`. Not installed                    | `--thinking` `off\|minimal\|low\|medium\|high` plus provider levels `xhigh\|adaptive\|max\|ultra`                      | no YOLO flag on `agent`. Exec has its own headless policy                              | `/fast` is in-session, not a launch flag                   | model and thinking marked `none`                                                   |
| hermes      | `-m` / `--model` on the root and on `chat`                              | no launch flag. `/reasoning` up to `max` / `ultra`                                                                     | `--yolo` on `chat`                                                                     | `/fast` in-session (`normal\|fast\|auto\|cold\|ultrafast`) | model flag exists but `modelSupport` is `none`                                     |

## Per agent

### claude · Claude Code · installed 2.1.280

Source: `claude --help`. Binary also contains in-session `/effort` copy.

Atmos today: `modelSupport: manual`, reasoning enum `--effort` = `low medium high xhigh max`, YOLO `--dangerously-skip-permissions`. No model list. `model_flag_for_agent` is `--model`.

Launch controls in this version:

- `--model <model>`
- `--effort <level>` choices printed by help: `low`, `medium`, `high`, `xhigh`, `max`
- `--permission-mode <mode>` choices: `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan`
- `--dangerously-skip-permissions` bypasses permission checks
- No `--fast` string in the 2.1.280 binary

In-session only: `/effort` also documents `ultracode` (xhigh plus dynamic workflow orchestration, this session only) and `auto` (the model's default). Help does not list either as a `--effort` choice, so they are not confirmed launch values.

### codex · Codex · installed 0.160.0

Source: `codex --help`, `codex exec --help`, and the config reference at `https://developers.openai.com/codex/config-reference`.

Atmos today: `modelSupport: catalog` via `codex debug models`, `reasoningSupport.mode: none`, YOLO `exec --json --dangerously-bypass-approvals-and-sandbox`. `--model` is appended by the run-config builder.

Launch controls:

- `--model <MODEL>` on the root and on `exec`
- Reasoning is not a dedicated flag. Docs set it with `--config model_reasoning_effort="high"`. Documented values: `minimal`, `low`, `medium`, `high`, `xhigh`. The installed help text does not mention this key
- `--sandbox`: `read-only`, `workspace-write`, `danger-full-access`
- `--ask-for-approval`: installed help lists `on-request` and `never`. The docs page also lists `untrusted` and `on-failure`
- `--approve-for-me` routes approvals through automatic review under `workspace-write`
- `--dangerously-bypass-approvals-and-sandbox` (docs also alias `--yolo`)
- No fast launch flag

### gemini · Gemini · installed 0.62.0

Source: `gemini --help`. Matches the configuration page at `https://geminicli.com/docs/reference/configuration/`.

Atmos today: `modelSupport: manual`, reasoning `none`, interactive `--skip-trust`, YOLO `--yolo`.

Launch controls:

- `--model`
- `--approval-mode`: `default`, `auto_edit`, `yolo`, `plan`. Docs say `plan` needs experimental planning and cannot be combined with `--yolo`
- `--yolo` auto-approves every tool call
- `--skip-trust` trusts the workspace for this session
- No `--thinking`, `--effort`, or `--fast` in this help, and the 0.62.0 shim contains none of those strings. API `thinking_level` is not a CLI flag here
- No `--list-models`. `modelSupport: manual` matches the CLI

### antigravity · Antigravity · installed 1.3.1 (`agy`)

Source: `agy --help`.

Atmos today: `modelSupport: catalog` via `agy models`, reasoning `none`, YOLO `--dangerously-skip-permissions`.

Launch controls the help does print:

- `--model`
- `--effort` `low|medium|high|xhigh|max`
- `--mode` `accept-edits|plan`
- `--dangerously-skip-permissions`
- No fast flag

### devin · Devin · installed 3000.11.3

Source: `devin --help`.

Atmos today: `modelSupport: manual`, reasoning `none`, YOLO `--permission-mode dangerous`.

Launch controls:

- `--model <MODEL>` (env `DEVIN_MODEL`)
- `models` subcommand: "List the models available to your account". The manifest does not point `modelList` at it
- `--permission-mode`: `auto` (default, read-only tools), `accept-edits`, `smart` (a fast model judges the rest), `dangerous` (every tool)
- `--respect-workspace-trust true|false`. Print mode fails in an untrusted directory unless this is `false`
- No reasoning flag and no fast flag

### amp · Amp · installed 0.0.1785025152-g56c26c

Source: `amp --help`.

Atmos today: `modelSupport: none`, reasoning `manual` with arg `--effort` and placeholder "e.g. high", YOLO `--dangerously-allow-all`.

Launch controls:

- There is no `--model` and no `--effort` in this help
- `-m, --mode`: `low`, `medium`, `high`, `ultra`. The help says this chooses the model, system prompt, and tool selection
- `--fast` / `--no-fast` override `agent.speed`. Fast is billed at a premium
- `--dangerously-allow-all` is the permission bypass (`amp.dangerouslyAllowAll`)
- `--stream-json-thinking` includes thinking blocks in output. It does not set a thinking level

The manifest's `--effort` does not match this CLI.

### droid · Droid · installed 0.216.0

Source: `droid exec --help`.

Atmos today: `modelSupport: catalog` parsed from `droid exec --help`, reasoning `manual` `--reasoning-effort`, YOLO `exec --skip-permissions-unsafe`. Interactive YOLO params are empty.

Launch controls on `exec`:

- `-m, --model <id>`
- `-r, --reasoning-effort <level>`. The same help lists per-model sets. Several models advertise `off, low, medium, high, xhigh, max`
- `--auto <level>`: `low`, `medium`, `high`. Default with no flag is read-only. Cannot be combined with `--skip-permissions-unsafe`
- `--skip-permissions-unsafe` bypasses all checks
- `--use-spec` starts spec mode. `--mission` is a separate multi-agent mode and requires `--auto high` or the unsafe skip
- Fast is not a flag. The model catalog includes ids such as `claude-opus-5-fast` and `gpt-5.6-sol-fast`

JSON-RPC mode ignores `-m`, `--auto`, and `-r`.

### opencode · OpenCode · installed 1.18.3

Source: `opencode --help`, `opencode run --help`.

Atmos today: `modelSupport: catalog` via `opencode models`, reasoning `none`, YOLO `run --format json --dangerously-skip-permissions`.

`opencode run` help on 1.18.3 does not list `--dangerously-skip-permissions`. It lists `--auto` ("auto-approve permissions that are not explicitly denied"). The root command also has `--auto`.

Other launch controls:

- `-m, --model` as `provider/model`
- `--variant`: "model variant (provider-specific reasoning effort, e.g., high, max, minimal)"
- `--thinking` is a boolean that shows thinking blocks. It is not a level
- No fast flag

### kimi · Kimi · not installed

Source: Kimi Code CLI command reference, `https://moonshotai.github.io/kimi-cli/en/reference/kimi-command.html` (page updated in the index on 2026-09-22). No local binary, so this row is docs-only.

Atmos today: `modelSupport: catalog` via `kimi provider list --json`, reasoning `--thinking` with `valueStyle: flag_only` and the only option `thinking`. No `yoloParams`.

Documented launch controls:

- `--model` / `-m`
- `--thinking` and `--no-thinking`. Boolean, model must support it
- `--plan` starts in plan mode
- `--yolo` / `-y`, aliases `--yes` and `--auto-approve`. `--afk` also dismisses questions. `--print` implies `--afk`
- No fast flag
- The `kimi provider list --json` model probe was not re-run here

### cursor · Cursor Agent · installed 2026.09.15-d2fe57e

Source: `cursor-agent --help`.

Atmos today: `modelSupport: catalog` via `cursor-agent --list-models`, `reasoningSupport.mode: encoded_in_model`, interactive `--trust`, YOLO `--force` plus `--trust`.

Launch controls:

- `--model`. Help example: `'claude-opus-4-8[context=1m,effort=high,fast=false]'`. Effort and fast are parameters of the model id
- `--list-models`
- `--mode`: `plan` or `ask` (both read-only). `--plan` is shorthand for `--mode=plan`
- `-f, --force` and `--yolo` (alias of `--force`)
- `--auto-review` classifies tool calls and prompts for the rest
- `--sandbox enabled|disabled`
- `--trust` skips the workspace trust prompt
- No standalone `--effort` or `--fast`

`encoded_in_model` matches this CLI. Plan/ask and the permission ladder are not in the manifest.

### grok-build · Grok Build · installed 1.0.46 (`grok`)

Source: `grok --help`, plus the help table embedded in the 1.0.46 binary (the CLI help does not print the effort enum).

Atmos today: `modelSupport: catalog` via `grok models`, reasoning `manual` `--reasoning-effort`, YOLO `--always-approve`.

Launch controls:

- `-m, --model`
- `--reasoning-effort` / `--effort`. Embedded docs: canonical levels `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. A model only accepts the levels its menu advertises, including extra menu ids such as `deep`. Unknown levels are rejected. The flag is ignored when the model has no reasoning effort
- `--permission-mode`: help values `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`. `bypassPermissions` is the always-approve mode. `--always-approve` is the separate YOLO flag
- `--sandbox <PROFILE>`
- `--allow` / `--deny`
- No fast launch flag found

`grok models` is the right place for the per-model effort menu. A free-text reasoning field does not match the canonical list.

### kilocode · Kilo Code · installed 7.4.22 (`kilo`)

Source: `kilo --help`, `kilo run --help`.

Atmos today: `modelSupport: catalog` via `kilo models`, reasoning `none`, YOLO `run --auto --format json`.

Same control shape as OpenCode 1.18.3:

- `-m, --model` as `provider/model`
- `run --variant` for provider-specific reasoning effort
- `run --thinking` shows thinking blocks
- `--auto` on the root and on `run`
- No fast flag

### kiro · Kiro · not installed

Source: headless reference `https://kiro.dev/docs/cli/headless/`, page updated 2026-10-05. No local `kiro-cli`.

Atmos today: `modelSupport: catalog` via `kiro-cli chat --list-models --format json`, reasoning `none`, YOLO `chat --agent atmos --trust-all-tools`.

Documented headless flags:

- `--model <id>`
- `--effort <level>`. "Supported levels depend on the selected model." The page does not list them
- `--trust-all-tools` and `--trust-tools=<list>`
- `--no-interactive` for print-style runs
- No fast flag in that table

`chat --list-models` is what Atmos probes with, and it is absent from this flag table. Treat the probe command as unverified until a local binary is installed.

### commandcode · Command Code · installed 1.47.0 (`cmd`)

Source: `cmd --help`.

Atmos today: `modelSupport: catalog` via `cmd --list-models`, reasoning `none`, YOLO `--trust --yolo --skip-onboarding`.

Launch controls:

- `-m, --model`
- `--list-models`
- `--effort <level>`. Help says "e.g. low, medium, high" and "depends on the model". It does not print a closed enum. In-session `/effort` sets the same thing
- `--permission-mode`: `standard`, `plan`, `auto-accept`
- `--plan`, `--auto-accept`
- `--yolo` is an alias of `--dangerously-skip-permissions`
- `-t, --trust` skips the initial permission prompt
- Slash `/mode` copy in the same help says `default|auto-accept|plan`, while the flag says `standard` rather than `default`
- No fast flag

### pi · Pi · installed 1.0.1

Source: `pi --help`.

Atmos today: `modelSupport: catalog` via `pi --list-models`, reasoning `--thinking` = `off minimal low medium high xhigh`, interactive `--approve`. No YOLO.

Launch controls:

- `--model`, including an optional `:<thinking>` suffix. `--provider` is required with some patterns
- `--list-models`
- `--thinking`: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`
- `--mode`: output format `text`, `json`, or `rpc`. Not a session mode
- `--approve` / `--no-approve` trust or ignore project-local files for this run
- No YOLO flag and no fast flag

The manifest enum drops `max`.

### openclaw · OpenClaw · not installed

Source: `https://github.com/openclaw/openclaw/blob/main/docs/cli/agent.md` fetched 2026-10-08, plus the slash-command page in the same repo. No local binary.

Atmos today: `modelSupport: none`, reasoning `none`, no YOLO. Launch shape is `agent --agent main --local`.

Documented `openclaw agent` flags:

- `--model <id>` (`provider/model` or a model id)
- `--thinking`: `off`, `minimal`, `low`, `medium`, `high`, plus provider levels such as `xhigh`, `adaptive`, `max`, or `ultra`
- `--local` runs the embedded agent
- No YOLO flag and no fast flag on this command

`openclaw agent exec` repeats `--model` and `--thinking` for a headless one-shot. Fast is the in-session `/fast` command (`status|auto|on|off|ultrafast|default` in the slash-command doc), not a launch flag. `openclaw models list` exists for a catalog. Atmos currently exposes none of this.

### hermes · Hermes Agent · installed 0.17.0

Source: `hermes --help`, `hermes chat --help`, and the current slash-command / configuration docs at `https://hermes-agent.nousresearch.com/docs/reference/slash-commands` and `https://hermes-agent.nousresearch.com/docs/user-guide/configuration` (fetched 2026-10-08).

Atmos today: `modelSupport: none`, reasoning `none`, YOLO `chat --yolo`. `model_flag_for_agent` returns nothing for `hermes`.

Launch controls on this install:

- `-m` / `--model` on the root (applies to `--oneshot` and `--tui`) and on `hermes chat`
- `--yolo` on the root and on `chat`
- No `--reasoning`, `--effort`, or `--fast` in either help

In-session only, from current docs:

- `/reasoning` levels include `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`. An older third-party mirror stopped at `xhigh`. The installed 0.17.0 help does not print the list
- `/fast` values in the current configuration doc: `normal`, `fast`, `ultrafast`, `auto`, `cold`
- `/model` can take `--reasoning <level>` in the same slash step

A launch-time model flag exists. Reasoning and fast do not, on this version.
