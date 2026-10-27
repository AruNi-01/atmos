---
name: atmos-agent-bridge
version: "1.0.0"
description: >
  Address other Atmos agents on the connected Computer via
  `atmos agent-bridge` (list / send / request / reply / status). No MCP.
  Use when the user wants agents to collaborate, hand off work, or share a
  context bag. Do not use for Relay tunnels (`atmos computer`), Canvas tab
  dispatch (`atmos canvas`), or PT Design board tools.
---

# Atmos Agent Bridge

Session directory + bus for **agent↔agent** messages on the **connected Computer**.
**No MCP.** Not a Settings page. Not Relay.

Details: [`references/cli.md`](references/cli.md).

## Naming

| Word                        | Meaning                                   |
| --------------------------- | ----------------------------------------- |
| **Bridge**                  | this bus (`atmos agent-bridge`)           |
| **Relay**                   | remote Computer tunnel (`atmos computer`) |
| Canvas / PT Design “bridge” | tab dispatch CLIs — **different product** |

## Prerequisites

1. `atmos` on `PATH`, talking to an Atmos Server (`atmos runtime ensure` or an existing Computer session).
2. Cross-Computer: reuse the **existing** client session (`--api-url`, `~/.atmos/client-session.json`, or runtime manifest). Then run the **same verbs**. Do not invent a second protocol. Relay never lists agents.

## Decision tree

1. `atmos agent-bridge list` — calls `agent_session_status_list` (sessions, counts, enabled `agents`). Not a Bridge action and not an install dump.
2. `--provider` / `--agent` set `provider_ids`. `--workspace` sets `context_id`. Page with `--limit` / `--cursor`.
3. Several live chats for one provider → pass `--to-chat`. Do not guess.
4. Send a short body. Default busy policy is **queue**. Override `--busy wait|fail_fast` only when asked.
5. Need a structured slice (goals / paths / PR refs / artifacts / danger)? Pass `--bag '{...}'`. Never put secrets, transcripts, or chain-of-thought in a bag.
6. Remote `context_ref` → connect to **that** Computer and `atmos agent-bridge status --context-ref <ref>`. The peer **does not push**.

| Intent              | Command                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| Session directory   | `atmos agent-bridge list [--provider <id>] [--workspace <id>] [--limit N] [--cursor …]` |
| Send                | `atmos agent-bridge send --to-provider <id> --body ...`                                 |
| Request             | `atmos agent-bridge request --to-provider <id> --body ...`                              |
| Reply               | `atmos agent-bridge reply --to-provider <id> --correlation-id <id> --body ...`          |
| Presence / bag pull | `atmos agent-bridge status` / `--context-ref` / `--message-id`                          |
| Skill path          | `atmos agent-bridge skill-dir`                                                          |
| Another Computer    | point CLI at it, then the same verbs                                                    |
| MCP                 | **do not** — Atmos has no MCP for Bridge                                                |

## Critical rules

1. Keep injected bodies short. Delivery starts a Chat turn on the idle target.
2. Foreign `server_id` without connecting first → `CROSS_MACHINE_CONNECT`. Connect, then retry.
3. MVP broadcast = repeat `--to-provider` / `--to` on the **same** Computer. No topics.
4. `list` is read-only. `status` may flush queued mail to a now-idle chat.
5. Do not open a Bridge web panel (there is none). Do not call Canvas `canvas_agent_relay`.
