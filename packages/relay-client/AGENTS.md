# @atmos/relay-client

> **Relay control-plane REST client** (APP-016 / APP-056). Complements `@atmos/hub-client` (identity) and `@atmos/api-client` (main `/ws`).

## Role

| Package | Channel |
|---------|---------|
| `@atmos/hub-client` | Hub HTTPS — sign-in, device enroll |
| **`@atmos/relay-client`** | Relay HTTPS — computers, register tokens, client sessions |
| `@atmos/api-client` | Computer main WebSocket (local or via Relay session URL) |
| `packages/relay` | **Worker only** — not a client SDK |

## Auth

- Bearer = **Hub-minted device credential** (no `/v1/tenants`, no user Access Token)
- Optional `X-Atmos-Relay-Secret` when the Worker sets `RELAY_SECRET_KEY`

## Bootstrap

```ts
import { createRelayClient, normalizeRelayUrl } from "@atmos/relay-client";

const client = createRelayClient({
  baseUrl: normalizeRelayUrl(relayUrl),
  relaySecretKey, // optional self-hosted gate
  // transport: custom, e.g. desktop loopback proxy
});

const auth = client.withDeviceCredential(deviceCredential);
const computers = await auth.listComputers();
const session = await auth.createClientSession(serverId, {
  clientKind: "mobile", // web | mobile | desktop
});
```

Helpers: `activeComputers` / `onlineComputers`, `buildClientSessionUrls`, `clientWsUrlFromGateway`, `requireDeviceCredential`.

## Client kinds

| Kind | App surface |
|------|-------------|
| `web` | Browser (hosted app.atmos.land or loopback) |
| `desktop` | Electron shell loading apps/web UI (`workbenchRelayClientKind()`) |
| `mobile` | Expo app |

Desktop does **not** ship a separate relay package — same `@atmos/relay-client` + `clientKind: "desktop"`.

## After session (not this package)

```text
createClientSession → gateway_url + client_token
  → GET/POST {gateway_url}/api/system/*   # Computer local API via Relay proxy
  → WSS {ws_url}                          # main /ws (api-client)
```

`apps/web/src/api/relay.ts` owns gateway `/api/system/*` helpers. Keep them out of `@atmos/relay-client`.

## Adding a Relay control-plane route (same PR as `packages/relay`)

1. Worker: `/v1/computers|register_tokens|client_sessions|…` in `packages/relay`.
2. DTO in `src/types.ts`.
3. Method on `createRelayClient()` / `AuthenticatedRelayClient` (not a new package, not `api-types`).
4. After `createClientSession`, Computer `/api/system/*` on `gateway_url` stays **app-owned** (`apps/web/src/api/relay.ts`). Do not absorb it here.

No oRPC / OpenAPI. Relay REST is already a typed client.

## Must not

- Main `/ws` session kernel (`@atmos/api-client`)
- Hub OAuth / device enroll (`@atmos/hub-client`)
- Gateway proxy to Computer REST (`/api/system/*` on gateway_url) — app concern after session
- Import or re-export Worker code from `packages/relay`
