# Better Auth checklist (Atmos Hub)

Official refs: [Installation](https://better-auth.com/docs/installation), [Drizzle](https://better-auth.com/docs/adapters/drizzle), [Social Google](https://better-auth.com/docs/authentication/google).

## Env

| Variable | Purpose |
|----------|---------|
| `BETTER_AUTH_SECRET` | ≥32 chars |
| `BETTER_AUTH_URL` | Public Hub URL (`https://hub.atmos.land` / `http://localhost:8787`) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth **Web** client |
| `ALLOWED_ORIGINS` | Browser app origins (comma-separated) |

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

- `better-auth/client` via `apps/web/src/api/hub-auth-client.ts` — `signIn.social`, `getSession`, `signOut`
- `NEXT_PUBLIC_ATMOS_HUB_URL` points at Hub; browser uses `credentials: "include"`

## Device enroll

After sign-in, Settings → Account → **Trust this device** mints `device_credential` (shown once). Local API and Relay use it as Bearer; Linear secret pull accepts device Bearer on Hub.

## Verify

1. `GET $BETTER_AUTH_URL/api/auth/ok` → `{ status: "ok" }`
2. Sign in from `app` → Hub cookie set on Hub origin
3. `GET /v1/me` with credentials include
4. `POST /v1/devices` enrolls; Relay receives projection when `RELAY_*` configured
