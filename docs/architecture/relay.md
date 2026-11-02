# Atmos Relay architecture

Atmos Relay is the public edge in front of an Atmos Computer. Browsers, Desktop,
and Mobile connect inbound. The Computer (`apps/api`) connects **outbound only**.
Identity stays Hub-issued: device credentials, `register_token`, `server_secret`,
and `client_token`. Relay is not an anonymous path proxy.

This page is the protocol companion to [`specs/APP/APP-016_atmos-computer/TECH.md`](../../specs/APP/APP-016_atmos-computer/TECH.md)
and [`packages/relay/README.md`](../../packages/relay/README.md).

## Topology

```
Client (web / desktop / mobile)
    │  WSS /ws/client  +  HTTPS /v1/computers/:id/proxy/*
    ▼
Relay edge  (packages/relay)
    │  one ServerHub per server_id
    ▼
Atmos Server  (apps/api)  ── outbound WSS /ws/server
```

Invariants:

- The Computer does not need a public inbound port.
- Clients do not open TCP to the Computer except in explicit local loopback mode.
- Relay parses **envelopes only**. Application JSON inside `body` is opaque.
- Prototype Design rooms, GitHub trigger ingress, and Hub device projection keep
  their existing identities. They are not replaced by a memory-only connect code.

## Envelopes

Every Computer-facing WebSocket frame is a JSON envelope:

| Field         | Type      | Meaning                                                         |
| ------------- | --------- | --------------------------------------------------------------- |
| `v`           | `uint`    | Protocol version. Currently `1`.                                |
| `stream`      | `string`  | Logical substream (see below).                                  |
| `kind`        | `string`  | Frame type within that stream.                                  |
| `from` / `to` | `string`  | `server` or `client:<sid>`.                                     |
| `request_id`  | `string?` | Correlation id. HTTP gateway keys in-flight work on this value. |
| `seq`         | `uint?`   | Chunk sequence for HTTP streaming (`0…`).                       |
| `body`        | `string?` | Opaque payload. HTTP chunks store standard-base64 bytes here.   |
| `client_type` | `string?` | `web` / `desktop` / `mobile` on client app frames.              |

Relay does not interpret application actions inside `body`.

## Stream kinds

| `stream`   | Who speaks it                          | `kind` values                                                                                                                                   | Purpose                               |
| ---------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `app`      | Client WS ↔ Computer                   | `frame`, `close`                                                                                                                                | Main application WebSocket.           |
| `terminal` | Terminal client WS ↔ Computer          | `frame`, `close`                                                                                                                                | Terminal I/O multiplex.               |
| `http`     | HTTP gateway ↔ Computer                | `request`, `request_chunk`, `request_end`, `response_start`, `response_chunk`, `response_end`, `ack`, `cancel`, `error`, plus legacy `response` | Proxied HTTPS to loopback `apps/api`. |
| `system`   | Relay → Computer (GitHub, and similar) | `external_event`, `external_event_ack`                                                                                                          | Provider ingress, not end-user HTTP.  |

`close` on `app` / `terminal` tears down the matching virtual session on the Computer. HTTP uses `cancel` instead of `close`.

## Hibernation

ServerHub is idle most of the time. Peer WebSockets are restored from hibernation
tags (`server`, `client`, `client:<sid>`) rather than from process memory. After
hours of silence, a Computer reconnect or a new client still finds the same hub.

Do **not** send application-level `"ping"` / `"pong"` text frames. Those wake the
hibernated hub for no product work.

## Keepalive (WebSocket PING)

The Computer sends a **WebSocket protocol PING** every 25 seconds on the outbound
`/ws/server` socket. The edge answers PONG without waking ServerHub. That keeps
NAT mappings warm and avoids hub CPU on idle Computers.

ServerHub also installs an auto-response pair for leftover app-level `"ping"`
text from old clients (`"pong"`), so those frames still do not wake the hub.

## HTTP streaming

`/v1/computers/:id/proxy/*` used to buffer the whole request and response as
`body_b64` inside one envelope. Large uploads, logs, and artifacts pinned hub
memory and stalled weak links.

The current hop is chunked, with an unacked window:

1. The edge Worker forwards the client HTTP request as a length-prefixed JSON
   prelude plus the raw body stream. It does not assemble `body_b64`.
2. ServerHub sends `stream: "http"` frames on the Computer WebSocket.
3. The Computer executes against loopback `apps/api` and streams the response
   back the same way.
4. Each data chunk carries `seq`. The receiver must `ack` that `seq` before the
   sender may have more than **8** unacked chunks in flight (~32 KiB each).
5. If the client disconnects, ServerHub sends `kind: "cancel"` for that
   `request_id`. The Computer aborts the in-flight loopback HTTP call.

### Frame conventions

**Start (headers only)**

```json
{
  "v": 1,
  "stream": "http",
  "kind": "request",
  "request_id": "<uuid>",
  "body": "{\"method\":\"PUT\",\"path\":\"/api/system/file\",\"headers\":[[\"content-type\",\"application/octet-stream\"]],\"streaming\":true}"
}
```

`streaming: true` means body bytes follow as chunks. A Computer that still
speaks the old whole-body `body_b64` request (no `streaming` flag) is treated as
a single-shot body and does not wait for chunks.

**Body chunk / end**

```json
{ "v": 1, "stream": "http", "kind": "request_chunk", "request_id": "<uuid>", "seq": 0, "body": "<base64>" }
{ "v": 1, "stream": "http", "kind": "request_end", "request_id": "<uuid>" }
```

Response uses `response_start` (`status` + `headers`), `response_chunk` + `seq`,
then `response_end`. `ack` uses the same `request_id` and the chunk `seq`.
`cancel` has no body. `error` body is `{"status":502,"code":"upstream_unreachable"}`.
A single-shot legacy reply uses `kind: "response"` with JSON
(`status`, `headers`, optional `body_b64`) instead of the start/chunk/end
sequence. ServerHub still accepts it.

Idle timeout is 120 seconds without a frame in either direction. There is no
short overall cap: a multi-megabyte artifact on a weak link may run as long as
chunks or acks keep moving.

Worker → ServerHub uses a 4-byte big-endian prelude length, then JSON metadata,
then raw request bytes. That hop is not the Computer envelope.

## Optional ServerHub placement hint

Set `RELAY_HUB_LOCATION_HINT` on the Worker (`wnam`, `enam`, `sam`, `weur`,
`eeur`, `apac`, `oc`, `afr`, `me`) to bias **first create** of a ServerHub toward
a region. Existing hubs ignore the hint. A non-empty unknown token is ignored
(Worker logs a warning) and placement stays at the platform default. Use it only
when cross-region RTT to the Computer is a measured problem; it does not migrate
a hub that already exists.

## Self-host (minimal)

Run the **existing** `packages/relay` Worker. Do not build a second control plane,
a second Hub, or an anonymous tunnel face.

1. From `packages/relay`, create the relay D1 database and apply `migrations/`.
2. Optional private gate: `wrangler secret put RELAY_SECRET_KEY`. Clients then
   send `X-Atmos-Relay-Secret` (CLI/API: `ATMOS_RELAY_SECRET_KEY`).
3. Hub device projection still uses `RELAY_HUB_SYNC_SECRET` from Hub. Identity
   remains Hub device credentials + Computer `server_secret` / `client_token`.
4. `bunx wrangler dev` for a local origin, or `scripts/relay/deploy.sh` /
   `bunx wrangler deploy` for a public origin.
5. Point `ATMOS_RELAY_URL` / `NEXT_PUBLIC_ATMOS_RELAY_URL` at that origin.
   Register a Computer with a Hub-minted `register_token` as today.

That is enough to have a runnable relay. A second Node/Docker reverse proxy that
mirrors Hub/D1 is out of scope.

## Follow-up (not this protocol)

Full business-tunnel encryption on top of envelopes (APP-016 M5) is a separate
slice. Streaming and cancel do not implement that layer.
