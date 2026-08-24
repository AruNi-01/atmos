# @atmos/hub-client

> **Hub control-plane HTTP client** (APP-056). Complements `@atmos/api-client` (main `/ws`).

## Role

| Package | Channel |
|---------|---------|
| `@atmos/api-client` | Local / Computer main WebSocket |
| **`@atmos/hub-client`** | `hub.atmos.land` (or local Hub) HTTPS — auth, devices, integrations |

## Unified identity (cookie + device)

Atmos product identity is always Hub **`user_id`**. The client does **not** expose two auth APIs to call sites.

| Runtime adapter | Bootstrap |
|-----------------|-----------|
| Device store | `setDeviceCredentialStore(...)` |
| Session cookie (optional) | `setHubSessionCookieProvider(...)` |

| API | Use |
|-----|-----|
| `getHubAuthMaterial()` | Read resolved material (tests / diagnostics) |
| `getStoredDeviceCredential()` / `getStoredDeviceRecord()` | Read device store |
| `hubRevokeDevice(deviceId)` | Revoke a device on Hub (sign-out this install) |
| `hubFetch` | Hub HTTPS — attaches device Bearer + `credentials: "include"` |
| `withHubAuth(body)` / `hubAuthWire()` | Computer local API / WS payload — single attach |
| `hasHubAuthMaterial()` | Gate UI that needs Hub identity |

**Do not** branch on cookie vs device in feature code. Hub server uses `requireUser` for product routes (cookie **or** device Bearer).

## Exports

| Import | Use |
|--------|-----|
| `@atmos/hub-client` | config, auth material, `hubFetch`, me/devices/linear, device store |
| `@atmos/hub-client/auth/browser` | Better Auth social login (web / desktop webview) |
| `@atmos/hub-client/auth/native` | Mobile OAuth start URL + code exchange (apps open system browser) |
| `@atmos/hub-client/device-storage/browser` | `localStorage` device credential + `hubCookieFromDocument` |
| `@atmos/hub-client/types` | Shared DTOs |

## Bootstrap (apps)

```ts
import {
  configureHubClient,
  setDeviceCredentialStore,
  setHubSessionCookieProvider,
} from "@atmos/hub-client";
import {
  createBrowserDeviceCredentialStore,
  hubCookieFromDocument,
} from "@atmos/hub-client/device-storage/browser";

configureHubClient({ baseUrl: process.env.NEXT_PUBLIC_ATMOS_HUB_URL! });
setDeviceCredentialStore(createBrowserDeviceCredentialStore());
setHubSessionCookieProvider(hubCookieFromDocument);
```

Mobile: SecureStore device store via app bootstrap; omit cookie provider (device-only). Pair without login: `hubCreateMobilePair` / `hubClaimMobilePair`.

## Adding a Hub HTTP route (same PR as `packages/hub`)

1. Worker: route under `packages/hub/src/` (`requireUser` unless TECH says otherwise).
2. DTO in `src/types.ts` (JSON wire, same field names as the Worker body).
3. Function next to the existing ones (`me.ts`, `devices.ts`, `integrations/…`) that `hubFetch`s and returns that DTO. Call sites never pass cookie vs device.
4. No `WsContract`, no oRPC, no OpenAPI. Hub is already a typed HTTPS client.

## Must not

- Main `/ws` session kernel (that is `@atmos/api-client`)
- Better Auth **server** (that is `packages/hub`)
- UI components
- Feature code that inspects `hub_cookie` / `device_credential` separately
- Computer `/api/system/*` or Relay computers/sessions (wrong plane)
