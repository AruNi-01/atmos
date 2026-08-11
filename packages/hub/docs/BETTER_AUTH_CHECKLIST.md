# Better Auth checklist (Atmos Hub)

Official refs: [Installation](https://better-auth.com/docs/installation), [Drizzle](https://better-auth.com/docs/adapters/drizzle), [Social Google](https://better-auth.com/docs/authentication/google).

## Env

| Variable | Purpose |
|----------|---------|
| `BETTER_AUTH_SECRET` | ≥32 chars |
| `BETTER_AUTH_URL` | Public Hub URL (`https://hub.atmos.land` / `http://localhost:8787`) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth **Web** client |
| `ALLOWED_ORIGINS` | Browser app origins (comma-separated). **Must include desktop local Server UI**: `http://127.0.0.1:30303` and `http://localhost:30303` (sign-in is CORS + credentials from that origin). |

## Google Cloud Console

**Application type:** Web application

**Authorized JavaScript origins**

- `http://localhost:3000` (web app)
- `https://app.atmos.land`
- `http://localhost:8787` (local Hub)
- `https://hub.atmos.land`

**Authorized redirect URIs** (must include path)

- `http://localhost:8787/api/auth/callback/google`
- `https://hub.atmos.land/api/auth/callback/google`

Wrong (common mistakes):

- Bare origins as redirects (`http://localhost` without `/api/auth/callback/google`)
- `https://api.atmos.land` (API is not Hub)
- Random ports like `:8080` unless you actually serve Hub there

## Client

- `better-auth/client` via `apps/web/src/api/hub-auth-client.ts` — `signIn.social`, `getSession`, `signOut`, `listAccounts`, `listSessions`, `linkSocial` (via Hub start URL), `unlinkAccount`, `revokeSession`
- `NEXT_PUBLIC_ATMOS_HUB_URL` points at Hub; browser uses `credentials: "include"`
- HTTPS Hub uses session cookies with `SameSite=None; Secure` so SPA on `localhost` / other origins can call Hub after OAuth in a new tab
- Web OAuth return path: `{appOrigin}/hub-auth/done` (not bare `/`)
- OAuth **error** path: `{appOrigin}/hub-auth/error?error=…` (never leave users on Hub’s built-in error page)
- **Top-level OAuth start** (avoids `state_mismatch`): `GET /v1/oauth/start?provider=github|google&callback_url=…&mode=sign-in|link`
  - `mode=sign-in` → Better Auth `/api/auth/sign-in/social`
  - `mode=link` → Better Auth `/api/auth/link-social` (requires existing Hub session cookie)
  - Always sets `errorCallbackURL` from `callback_url` origin → `/hub-auth/error`
  - Fallback `onAPIError.errorURL` = `https://app.atmos.land/hub-auth/error` (or `AUTH_ERROR_URL`)

## Security settings (better-auth-ui aligned)

Account → **Linked accounts** + **Active sessions** (see [Security settings](https://better-auth-ui.com/docs/shadcn/components/settings/security/security-settings)).

Data is **bound to `user_id`**. Hub exposes identity-agnostic routes that accept **session cookie or device Bearer** (same as `/v1/me`):

| UI | Hub API (preferred) | Notes |
|----|---------------------|--------|
| List linked providers | `GET /v1/me/accounts` | Reads Better Auth `account` rows for user |
| Link provider | `GET /v1/oauth/start?mode=link&…` | Web: browser cookie. Desktop/phone: `POST /v1/me/link-ticket` then `link_ticket=`. `accountLinking.allowDifferentEmails: true` so GitHub/Google emails need not match. |
| Unlink provider | `POST /v1/me/accounts/unlink` | Body: `{ provider_id, account_id? }` |
| List sessions | `GET /v1/me/sessions` | Active browser sessions for user (prunes expired + over cap) |
| Revoke session | `POST /v1/me/sessions/revoke` | Body: `{ token }` |
| Session cap | max **10** per user | On create (`databaseHooks.session.create`) + list: drop oldest; keep current cookie token when possible. Link `link_ticket` temp sessions are deleted after OAuth start. |
| Delete account | `POST /v1/me/delete` | Hard-delete user (cascade accounts/sessions/devices/…). UI requires typed phrase. `user.deleteUser.enabled` also on Better Auth. |

Phone and Desktop use the same product APIs via **`requireUser`** (session cookie **or** device Bearer → same `user_id`). Clients attach identity through `@atmos/hub-client` (`hubFetch` / `withHubAuth`) and never branch on cookie vs device in feature code.

## Device credential (automatic)

After Hub cookie sign-in, the web/desktop client **auto-mints** a Hub device (`POST /v1/devices`) and syncs `device_credential` to local storage / Computer settings — no “Trust this device” UI. Sign-out clears cookie + local device. Re-login re-mints for the current user so Linear / local API work again. Desktop system-browser OAuth still mints device via `/v1/desktop-auth/complete` (**cookie session only** — that route is the exception that creates the first device).

## Verify

1. `GET $BETTER_AUTH_URL/api/auth/ok` → `{ status: "ok" }`
2. Sign in from `app` → Hub cookie set on Hub origin
3. `GET /v1/me` with credentials include
4. `GET /api/auth/list-accounts` + `GET /api/auth/list-sessions` with credentials
5. `POST /v1/devices` enrolls; Relay receives projection when `RELAY_*` configured
