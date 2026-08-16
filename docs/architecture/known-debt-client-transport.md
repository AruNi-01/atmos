# Known debt · Client transport (Web-first → Desktop IPC)

| | |
|--|--|
| **Status** | Terminal ports shipped: ByteStreamPort + logical ControlPort + desktop main↔API UDS ([ADR-006](../adr/006-terminal-client-byte-stream-port.md)) |
| **Recorded** | 2026-08-05 |
| **Updated** | 2026-08-16 (UDS sidecar, binary PTY input, N2 idle tear) |
| **Scope** | Web client, Desktop (Electron) shell, local runtime, terminal & other real-time paths |
| **Not a bug** | Current WS/HTTP paths are intentional product choices; this tracks **latency and platform fit**, not correctness of a single feature |

---

## Summary

Atmos started as a **web application**. Real-time and control-plane traffic therefore standardized on **HTTP + WebSocket**, which every browser can use.

**Desktop reuses the same web client** and talks to a local (or remote) runtime largely through those same protocols (often loopback `127.0.0.1`). That maximizes code sharing, but leaves **extra hops and serialization** on the desktop hot path even when renderer and runtime sit on the same machine.

Desktop **can** use Electron IPC / Unix domain sockets for many of those calls; terminal live I/O now does. Session kernel `/ws` is still HTTP+WS.

---

## Current shape (simplified)

```text
Web browser
  → HTTPS / WSS → API or local runtime

Desktop (Electron renderer ≈ apps/web)
  → HTTP / WebSocket (often loopback) → local Server/runtime  (session kernel)
  → Electron IPC **binary** for **local terminal** (ADR-006)
      main → Unix domain WS to `/ws/terminal/:id` (loopback WS fallback)
  → (already) Electron IPC for shell-only concerns (window, AppShot, webview, …)
```

Terminal **pane** bytes still multiplex in the API `PaneIoRegistry`. The desktop renderer does not open `/ws/terminal/:id` itself when the target is the loopback sidecar. Web, Relay, and remote URLs still use WebSocket. Session kernel `/ws` is unchanged.

---

## Why it is this way (root cause)

1. **Web-first product**: browser has no process IPC; HTTP + WebSocket are the portable baseline.
2. **Shared frontend**: desktop ships the same UI and protocol contracts instead of a second desktop-only API surface.
3. **Remote / tunnel parity**: the same client can attach to a non-local runtime without a fork.

---

## Cost (when it matters)

- Session kernel `/ws` still pays WS/HTTP framing on localhost.
- Desktop feels mixed: terminal stream is native-ish; chat/session kernel still looks like a browser client.

Related product work (TUI scroll / mouse stability) is orthogonal: mode restore and wheel report scaling fix **correctness and feel within the current transport**. Remaining transport shortening is the session kernel, not the terminal pane path.

---

## Recommended design (when we invest)

### Guiding principle

**Abstract shared port semantics, not one god-object “Transport”.**

| Approach | Verdict |
|----------|---------|
| Single `Transport.send(any)` for everything | Avoid — mixes RPC and byte streams; becomes a second protocol dump |
| **Two ports** (`ControlPort` + `ByteStreamPort`) + thin clients | **Preferred** — shipped for terminal |
| Per-feature desktop `if (isDesktop)` forks | Avoid — permanent web/desktop split |
| Fully native desktop terminal, abandon shared web client | Highest cost; not first choice |

Business features must not import `WebSocket` or `ipcRenderer` directly. They talk to **logical** session/terminal clients; the **carrier** (WS / HTTP / IPC / UDS) is chosen by runtime binding.

### Layering

```text
┌─────────────────────────────────────────┐
│  Features (Terminal, Session, Settings) │  no WebSocket / ipc imports
└─────────────────┬───────────────────────┘
                  │  logical API
┌─────────────────▼───────────────────────┐
│  TerminalClient / RuntimeClient         │  attach, write, onData, resize…
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
┌───────▼────────┐  ┌────────▼──────────┐
│ ControlPort    │  │ ByteStreamPort    │
│ (JSON frames)  │  │ (duplex bytes)    │
└───────┬────────┘  └────────┬──────────┘
        │                    │
   adapters…            adapters…
   WS text / IPC text   WS binary / UDS / IPC
```

Terminal ControlPort is **logical**: JSON on the same connection as PTY bytes (WS text / IPC `kind: text`). It is not a second socket, REST, or per-call invoke.

### Runtime binding selection

```text
resolveRuntimeBinding():
  browser                         → webHttp + webWs
  desktop && target is local      → desktopIpcControl + desktopLocalStream   // optimization
  desktop && target is remote     → network control + network stream         // same family as web
```

“Local” means same-machine, same-user runtime (embedded Server / loopback runtime), not merely “URL looks like localhost.” Remote / tunnel always stays on the network adapters.

**Goal is not “Desktop kills WebSocket.”** Goal is: **one business API, carrier chosen per binding.**

### Migration order (cost / benefit)

| Phase | Work | User-visible | Status |
|-------|------|----------------|--------|
| **0** | Introduce ports; adapters with **existing** WS/HTTP | None (refactor) | **Done** |
| **1** | Desktop **local**: switch **ByteStreamPort** only | Lower local TUI / stream latency | **Done** (renderer IPC) |
| **2** | Desktop **local**: logical **ControlPort** (JSON vs bytes) | Binary PTY input; control stays JSON | **Done** (multiplexed, not extra invoke) |
| **3** | main↔API UDS + `carrier`/`sidecar` metrics | Shorter local hop; measurable | **Done** (UDS first, WS fallback) |

Session kernel `/ws` is **not** in this table. Do not flip the whole app to IPC.

### Constraints to lock when implementing

1. **Binary all the way** on local stream adapters (no base64-in-JSON as the primary path).
2. **Stable semantics, swappable carrier** — session ids, terminal message shapes, tmux pane model stay; only delivery changes.
3. **One logical connection per browser/desktop attach** — do not merge multi-tab streams into one global pipe without a multiplexing design.
4. **Auth on local IPC/UDS** — Unix socket is same-user (dir 0700, sock 0600); origin/Host guards still apply on TCP. UDS peers skip DNS-rebinding Host checks.
5. **Observability** — tag paths with `carrier` and desktop `sidecar`.
6. **Tests** — in-memory fake ports for features; adapter unit tests per carrier; keep one E2E smoke on the primary path.

### Explicit non-goals (first cut)

- Replacing tmux or the terminal **byte protocol** to the pane.
- Forcing remote sessions over IPC (impossible off-box).
- Merging all existing shell `invoke` APIs into one mega-bus without a migration plan.
- Rewriting Desktop UI off the shared web client solely for latency.
- Moving session kernel `/ws` onto IPC in the same change as terminal.

### One-line target

> **Shared `ControlPort` + `ByteStreamPort`; web carriers = HTTP/WS; desktop local carriers = IPC/UDS; remote stays network. Features never choose the socket type.**

Terminal binding is [ADR-006](../adr/006-terminal-client-byte-stream-port.md).

---

## Suggested entry points

| Area | Notes |
|------|--------|
| `packages/shared/src/terminal/byte-stream-port.ts` | Carrier enum, Control vs bytes handles, sidecar log |
| `apps/web` `bind-terminal-byte-stream-port.ts` / `use-terminal-websocket.ts` | Feature uses port, not raw `WebSocket` |
| `apps/desktop-electron` `terminal/stream-hub.ts` + preload `terminalStream` | Renderer↔main binary; main prefers UDS |
| Local runtime / API entry | TCP + `~/.atmos/state/api.sock` same Router |

---

## Related docs

- [ADR-006 terminal ByteStreamPort](../adr/006-terminal-client-byte-stream-port.md) — browser↔runtime **carrier**
- [ADR-004 terminal tmux control mode](../adr/004-terminal-tmux-control-mode.md) — terminal **pane** transport (tmux), not browser↔runtime carrier
- [WebSocket architecture](./websocket_architecture.md)
- [Desktop AGENTS](../../apps/desktop-electron/AGENTS.md)
- APP-054 terminal TUI scroll stability — in-band feel/correctness under current WS path
- APP-062 N2 idle pipe tear — 15m without observers, window stays
