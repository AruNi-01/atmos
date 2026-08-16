# Known debt · Client transport (Web-first → Desktop IPC)

| | |
|--|--|
| **Status** | Partial: terminal ByteStreamPort Phase 0–1 shipped ([ADR-006](../adr/006-terminal-client-byte-stream-port.md)); ControlPort + main↔API UDS still follow-up |
| **Recorded** | 2026-08-05 |
| **Updated** | 2026-08-16 (desktop local terminal stream uses IPC) |
| **Scope** | Web client, Desktop (Electron) shell, local runtime, terminal & other real-time paths |
| **Not a bug** | Current WS/HTTP paths are intentional product choices; this tracks **latency and platform fit**, not correctness of a single feature |

---

## Summary

Atmos started as a **web application**. Real-time and control-plane traffic therefore standardized on **HTTP + WebSocket**, which every browser can use.

**Desktop reuses the same web client** and talks to a local (or remote) runtime largely through those same protocols (often loopback `127.0.0.1`). That maximizes code sharing, but leaves **extra hops and serialization** on the desktop hot path even when renderer and runtime sit on the same machine.

Desktop **can** use Electron IPC / Unix domain sockets for many of those calls; that was not the first architecture, so it remains an optimization opportunity—not an accidental omission of IPC capability.

---

## Current shape (simplified)

```text
Web browser
  → HTTPS / WSS → API or local runtime

Desktop (Electron renderer ≈ apps/web)
  → HTTP / WebSocket (often loopback) → local Server/runtime  (session kernel, control)
  → Electron IPC **binary** for **local terminal ByteStream** (ADR-006)
  → (already) Electron IPC for shell-only concerns (window, AppShot, webview, …)
```

Terminal **pane** bytes still multiplex in the API `PaneIoRegistry`. The desktop renderer no longer opens `/ws/terminal/:id` itself when the target is the loopback sidecar; main bridges that attach. Web, Relay, and remote URLs still use WebSocket. Session kernel `/ws` is unchanged.

---

## Why it is this way (root cause)

1. **Web-first product**: browser has no process IPC; HTTP + WebSocket are the portable baseline.
2. **Shared frontend**: desktop ships the same UI and protocol contracts instead of a second desktop-only API surface.
3. **Remote / tunnel parity**: the same client can attach to a non-local runtime without a fork.

---

## Cost (when it matters)

- **High-frequency, low-latency paths** (e.g. terminal TUI mouse wheel / interactive redraw) pay WS/HTTP framing and scheduling even on localhost.
- Desktop feels “half native, half web”: shell features use IPC; session kernel still looks like a browser client.
- Future optimizations tend to be **protocol-level patches** (batching, coalesce, fast-path writes) rather than a shorter transport.

Related product work (TUI scroll / mouse stability) is orthogonal: mode restore and wheel report scaling fix **correctness and feel within the current transport**. Transport shortening is a separate architecture step.

---

## Recommended design (when we invest)

### Guiding principle

**Abstract shared port semantics, not one god-object “Transport”.**

| Approach | Verdict |
|----------|---------|
| Single `Transport.send(any)` for everything | Avoid — mixes RPC and byte streams; becomes a second protocol dump |
| **Two ports** (`ControlPort` + `ByteStreamPort`) + thin clients | **Preferred** |
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
│ (req / res)    │  │ (duplex bytes)    │
└───────┬────────┘  └────────┬──────────┘
        │                    │
   adapters…            adapters…
   HTTP / WS-RPC        WS binary / UDS / IPC
   Desktop invoke
```

### Port shapes (illustrative)

**Control plane** — config, attach metadata, one-shot ops:

```ts
interface ControlPort {
  request<TReq, TRes>(method: string, body: TReq, opts?: { timeoutMs?: number }): Promise<TRes>
}
```

| Binding | Typical carrier |
|---------|-----------------|
| Web | HTTP or WS request/response frames |
| Desktop → **local** runtime | Electron IPC invoke, or UDS JSON-RPC |
| Desktop → **remote** runtime | Same as web (HTTP / WS) |

**Byte stream** — terminal PTY input/output (must stay binary end-to-end):

```ts
interface ByteStreamPort {
  open(meta: StreamOpenMeta): Promise<StreamHandle>
}

interface StreamHandle {
  write(bytes: Uint8Array): void
  onData(cb: (bytes: Uint8Array) => void): () => void
  resize?(cols: number, rows: number): void
  close(): void
}
```

| Binding | Typical carrier |
|---------|-----------------|
| Web / remote | WebSocket **binary** frames (current model) |
| Desktop → local | UDS binary, or main↔renderer binary channel — **not** JSON+base64 |

Do **not** force terminal bytes through a string RPC envelope; that erases the latency win of IPC/UDS.

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
| **0** | Introduce ports; adapters with **existing** WS/HTTP | None (refactor) | **Done for terminal stream** (`ByteStreamPort` + WS adapter) |
| **1** | Desktop **local**: switch **ByteStreamPort** only | Lower local TUI / stream latency | **Done** (renderer IPC; main still WS to sidecar) |
| **2** | Desktop **local**: switch **ControlPort** | Faster session setup; unified errors | Open |
| **3** | Remote downgrade + `carrier` metrics; main↔API UDS | Safe remote; measurable wins | Open |

Do not flip the whole app to IPC on day one. Terminal stream alone has the highest payback and the smallest blast radius.

### Constraints to lock when implementing

1. **Binary all the way** on local stream adapters (no base64-in-JSON as the primary path).
2. **Stable semantics, swappable carrier** — session ids, terminal message shapes, tmux control-mode model (ADR-004) stay; only delivery changes.
3. **One logical connection per browser/desktop attach** — do not merge multi-tab streams into one global pipe without a multiplexing design.
4. **Auth on local IPC/UDS** — still require runtime token / same-user checks so arbitrary local processes cannot drive panes.
5. **Observability** — tag paths with `carrier` for latency comparison.
6. **Tests** — in-memory fake ports for features; adapter unit tests per carrier; keep one E2E smoke on the primary path.

### Explicit non-goals (first cut)

- Replacing tmux control mode or the terminal **byte protocol** to the pane.
- Forcing remote sessions over IPC (impossible off-box).
- Merging all existing shell `invoke` APIs into one mega-bus without a migration plan.
- Rewriting Desktop UI off the shared web client solely for latency.

### One-line target

> **Shared `ControlPort` + `ByteStreamPort`; web carriers = HTTP/WS; desktop local carriers = IPC/UDS; remote stays network. Features never choose the socket type.**

Terminal ByteStreamPort binding is [ADR-006](../adr/006-terminal-client-byte-stream-port.md). ControlPort and main↔API UDS stay on this note until they ship.

---

## Suggested entry points

| Area | Notes |
|------|--------|
| `packages/shared/src/terminal/byte-stream-port.ts` | Carrier enum + loopback binding |
| `apps/web` `bind-terminal-byte-stream-port.ts` / `use-terminal-websocket.ts` | Feature uses port, not raw `WebSocket` |
| `apps/desktop-electron` `terminal/stream-hub.ts` + preload `terminalStream` | Renderer↔main binary; main bridges sidecar WS |
| Local runtime / API entry | Still `/ws/terminal/:id`; UDS is Phase 3 |

---

## Related docs

- [ADR-006 terminal ByteStreamPort](../adr/006-terminal-client-byte-stream-port.md) — browser↔runtime **carrier**
- [ADR-004 terminal tmux control mode](../adr/004-terminal-tmux-control-mode.md) — terminal **pane** transport (tmux), not browser↔runtime carrier
- [WebSocket architecture](./websocket_architecture.md)
- [Desktop AGENTS](../../apps/desktop-electron/AGENTS.md)
- APP-054 terminal TUI scroll stability — in-band feel/correctness under current WS path
