# @atmos/hub-client

> **Hub control-plane HTTP client** (APP-056). Complements `@atmos/api-client` (main `/ws`).

## Role

| Package | Channel |
|---------|---------|
| `@atmos/api-client` | Local / Computer main WebSocket |
| **`@atmos/hub-client`** | `hub.atmos.land` (or local Hub) HTTPS — auth, devices, integrations |

## Exports

| Import | Use |
|--------|-----|
| `@atmos/hub-client` | config, `hubFetch`, me/devices/linear, device store registry |
| `@atmos/hub-client/auth/browser` | Better Auth social login (web / desktop webview) |
| `@atmos/hub-client/auth/native` | Stub for Expo/RN — implement deep-link OAuth later |
| `@atmos/hub-client/device-storage/browser` | `localStorage` device credential |
| `@atmos/hub-client/types` | Shared DTOs |

## Bootstrap (apps)

```ts
import { configureHubClient } from "@atmos/hub-client";
import { createBrowserDeviceCredentialStore } from "@atmos/hub-client/device-storage/browser";
import { setDeviceCredentialStore } from "@atmos/hub-client";

configureHubClient({
  baseUrl: process.env.NEXT_PUBLIC_ATMOS_HUB_URL!,
});
setDeviceCredentialStore(createBrowserDeviceCredentialStore());
```

Mobile later: custom store (SecureStore) + `auth/native` implementation; same REST helpers.

## Must not

- Main `/ws` session kernel (that is `@atmos/api-client`)
- Better Auth **server** (that is `packages/hub`)
- UI components
