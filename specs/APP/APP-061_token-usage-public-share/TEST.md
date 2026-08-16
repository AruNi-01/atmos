# TEST · APP-061: Token Usage public share

> Test Plan · prove one vanity Token Usage page, slim snapshot, and public shell. References PRD APP-061 and TECH APP-061.

## Test strategy

Hub rules (handle claim, uniqueness, visibility, `k`, allowlist, size) are **Bun tests** in `packages/hub`. Mapper top-N / cost strip / payload size are **Bun tests** in `apps/web`. Local Token Usage regression is existing web tests plus a focused extract smoke. Critical publish → public URL is **Playwright** if Hub can be stubbed; otherwise Hub API tests + agent-browser on a fixture page. Agent-browser checks the public shell (avatar, chips, footer) and that local chrome is absent.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 Local-first | S1, S2 |
| M2 Sign-in to publish | S3, S4 |
| M3 Claim-once handle | S5, S6, S7, S8 |
| M4 One page / overwrite | S9, S10 |
| M5 Visibility public / unlisted / off | S11, S12, S13 |
| M6 Manual refresh | S9, S14 |
| M7 Slim snapshot | S15, S16, S17 |
| M8 Same charts | S18 |
| M9 Public shell | S19, S20 |
| M10 Unpublish | S13 |
| M11 Social usernames | S20, S21 |
| M12 atmos.land host | S22 |
| N1 Rotate secret | S23 (optional) |
| N2 OG | S24 (optional) |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Bun | `bun test` | existing Token Usage page/query tests | no Hub | overview still loads | planned |
| S2 | Bun | `bun test` | PNG share card tests | capture fixture | PNG path unchanged | planned |
| S3 | Bun / Hub | `bun test` `packages/hub` | `PUT /v1/me/usage-page` without auth | no cookie/Bearer | 401 | planned |
| S4 | E2E or agent-browser | Playwright / `agent-browser` | Token Usage publish CTA | signed-out web | Sign in shown; no upload | planned |
| S5 | Bun | `bun test` `packages/hub` | first PUT claims handle | unique slug | row `handle_claimed_at` set | planned |
| S6 | Bun | `bun test` `packages/hub` | second PUT other handle | claimed user | 403 `handle_immutable` | planned |
| S7 | Bun | `bun test` `packages/hub` | two users same handle | parallel PUT | one 409 | planned |
| S8 | Bun | `bun test` `packages/hub` | reserved / short / bad charset | `admin`, `ab`, `A!` | 400 | planned |
| S9 | Bun | `bun test` `packages/hub` | PUT snapshot twice | same user | one row; `generated_at` changes | planned |
| S10 | Bun | `bun test` `packages/hub` | no second share id | two PUTs | public URL still `/tok/@h` | planned |
| S11 | Bun | `bun test` `packages/hub` | GET public no `k` | visibility public | 200 + snapshot | planned |
| S12 | Bun | `bun test` `packages/hub` | GET with/without `k` | unlisted | no k / bad k → 404; good k → 200 | planned |
| S13 | Bun | `bun test` `packages/hub` | DELETE or visibility off | was public | GET 404 | planned |
| S14 | Bun | `bun test` web | mapper not invoked without PUT | local overview refresh | Hub not called | planned |
| S15 | Bun | `bun test` web | mapper top-N | 20 clients | 5 ranks + other; full totals | planned |
| S16 | Bun | `bun test` web / hub | `include_cost=false` | overview with costs | no cost keys in stored/public JSON | planned |
| S17 | Bun | `bun test` hub | oversized / denied keys | fat overview + `prompt` | 413 or stripped; no prompt | planned |
| S18 | Bun | `bun test` web | view accepts payload | payload from mapper | same series helpers / no crash | planned |
| S19 | agent-browser | `agent-browser` | public page | fixture profile | avatar, `@handle`, footer Atmos link | planned |
| S20 | Bun + agent-browser | `bun test` / `agent-browser` | empty vs filled socials | one empty username | empty omitted; filled icon+@user | planned |
| S21 | Bun | `bun test` hub | URL / `@` pasted | `https://x.com/a`, `@a` | stored `a` | planned |
| S22 | Manual / deploy | rewrite check | `https://atmos.land/tok/@fixture` | staging DNS | address bar atmos.land; charts load | planned |
| S23 | Bun | `bun test` hub | rotate secret | old k | old 404; new 200 | planned |
| S24 | agent-browser | `agent-browser` | view-source / meta | public page | og:title contains handle | planned |

## Scenarios

### S1 — Local overview still works signed out

- **Level**: Bun
- **Given**: Hub URL unset or user signed out.
- **When**: Token Usage loads.
- **Then**: Overview charts render from local WS; no publish upload.
- **Signals**: existing query tests green; no `PUT /v1/me/usage-page`.

### S2 — PNG share unchanged

- **Level**: Bun
- **Given**: Token Usage with totals.
- **When**: PNG share popover runs.
- **Then**: Card capture still works; no account required.
- **Signals**: `token-usage-share-card` tests.

### S3 — Publish API rejects anonymous

- **Level**: Hub Bun
- **Given**: No session cookie or device Bearer.
- **When**: `PUT /v1/me/usage-page`.
- **Then**: 401.

### S4 — Publish UI asks for sign-in

- **Level**: E2E or agent-browser
- **Given**: Signed-out Token Usage.
- **When**: User opens publish.
- **Then**: Sign-in CTA; handle not claimed.

### S5 — First handle claim

- **Level**: Hub Bun
- **Given**: Profile with `handle_claimed_at` null (auto slug may exist).
- **When**: Authenticated PUT `{ handle: "builder" }` (available).
- **Then**: `handle=builder`, `handle_claimed_at` set; public route can resolve after publish.

### S6 — Handle immutable

- **Level**: Hub Bun
- **Given**: Claimed `alice`.
- **When**: PUT `{ handle: "bob" }`.
- **Then**: 403 `handle_immutable`; row still `alice`.

### S7 — Unique handle

- **Level**: Hub Bun
- **Given**: User A claimed `alice`.
- **When**: User B PUTs `alice`.
- **Then**: 409 `username_taken`. Concurrent A+B same slug: one success, one 409 (UNIQUE, not a pre-check).

### S8 — Handle validation

- **Level**: Hub Bun
- **Given**: Authenticated user, unclaimed.
- **When**: PUT reserved `admin`, length `ab`, charset `Alice!`.
- **Then**: 400 each; nothing claimed.

### S9 — Update overwrites the same page

- **Level**: Hub Bun
- **Given**: Public page with snapshot `generated_at=T1`.
- **When**: PUT a new snapshot `T2`.
- **Then**: Still one profile row; public GET `generated_at=T2`; URL unchanged.

### S10 — No second product URL

- **Level**: Hub Bun
- **Given**: User already published.
- **When**: PUT again.
- **Then**: Response `url` is still `https://atmos.land/tok/@{handle}`; no new `share_id`.

### S11 — Public without secret

- **Level**: Hub Bun
- **Given**: `usage_visibility=public`, snapshot present, claimed handle.
- **When**: `GET /v1/public/tok/alice` with no `k`.
- **Then**: 200, snapshot body, `Cache-Control` contains `no-store`.

### S12 — Unlisted requires `k`

- **Level**: Hub Bun
- **Given**: Unlisted page with known secret.
- **When**: GET no `k`; GET wrong `k`; GET correct `k`.
- **Then**: First two 404; third 200. Same 404 shape for unknown handle.

### S13 — Unpublish

- **Level**: Hub Bun
- **Given**: Public page.
- **When**: DELETE or PUT `visibility=off`.
- **Then**: Public GET 404; snapshot not returned.

### S14 — Local refresh does not upload

- **Level**: Bun (web)
- **Given**: Sharing on.
- **When**: Token Usage remount refreshes overview via WS.
- **Then**: No Hub PUT unless the user clicks Update.

### S15 — Top 5 + other

- **Level**: Bun (web mapper)
- **Given**: Overview with 20 clients / 20 models and daily cross-product rows.
- **When**: `mapOverviewToSharePayload`.
- **Then**: `by_client`/`by_model` length 5; each day `agents`/`models` only those keys + `other`; `summary.total_tokens` equals full overview; `client_count`/`model_count` are full counts; payload ≤ 256 KiB.

### S16 — Cost omitted by default

- **Level**: Bun
- **Given**: Overview with `total_cost_usd`.
- **When**: Map/publish with `include_cost=false`; public GET.
- **Then**: No `cost` / `total_cost_usd` keys in stored or public JSON.

### S17 — Allowlist and size

- **Level**: Hub Bun
- **Given**: Snapshot with `prompt` / `path` and/or body > 256 KiB.
- **When**: PUT.
- **Then**: Denied keys absent on GET; oversized → 413 (or 400).

### S18 — View consumes payload

- **Level**: Bun (web)
- **Given**: Payload from the mapper.
- **When**: `TokenUsageOverviewView` renders (unit / render test).
- **Then**: Year list, heatmap, mix, and top-5 bars can be derived; no dependency on cookie/`query` fields.

### S19 — Public shell

- **Level**: agent-browser
- **Given**: Public fixture with avatar URL and handle `alice`.
- **When**: Open `/tok/@alice`.
- **Then**: Top-left avatar + `@alice` (not links). Bottom-right contains Generated date and an Atmos link to `https://atmos.land`. No cookie banner, no PNG share, no Update.

### S20 — Social chips

- **Level**: Bun + agent-browser
- **Given**: `x_username=alice`, empty GitHub.
- **When**: Public page.
- **Then**: One X chip ` @alice` → `https://x.com/alice`. No GitHub chip.

### S21 — Username normalize

- **Level**: Hub Bun
- **Given**: PUT `x_username="https://x.com/@Alice/"` or `"@Alice"`.
- **When**: Saved.
- **Then**: Stored `alice` (or documented case rule; X/GitHub compare case-insensitively). Invalid charset rejected.

### S22 — atmos.land host

- **Level**: Manual / staging
- **Given**: Rewrite deployed.
- **When**: Open `https://atmos.land/tok/@fixture`.
- **Then**: Address bar stays `atmos.land`; CSS/JS load; not `hub.atmos.land`.

### S23 — Rotate unlisted secret (N1)

- **Level**: Hub Bun
- **Given**: Unlisted with `k1`.
- **When**: Mint/rotate → `k2`.
- **Then**: `k1` 404; `k2` 200.

### S24 — OG (N2)

- **Level**: agent-browser
- **Given**: Public page.
- **When**: Inspect metadata.
- **Then**: Title/description mention handle or Token Usage; canonical has no `k`.

## Performance & load budgets

- Snapshot persist reject above **256 KiB**.
- Typical mapped payload target: **< 80 KiB** for one year of daily totals + top-5 dims.
- Public GET is origin `no-store`; do not CDN-cache snapshots.

## Regression checklist

- [ ] Signed-out local Token Usage still loads (M1).
- [ ] PNG share still works without Hub.
- [ ] `/v1/me` still works with cookie **and** device Bearer; now includes `image`.
- [ ] Auto-derived APP-056 handle is not publicly readable until claimed.
- [ ] Unpublish is not served from a cached 200.
- [ ] English UI is not ALL CAPS; Atmos is the only link in the footer phrase.
- [ ] No new package under `packages/`.
- [ ] No usage-share routes added to `packages/relay`.

## Exploratory agent-browser checks

Load Agent Browser instructions first (`agent-browser` skill or `agent-browser skills get core --full`).

1. Local Token Usage: signed-out charts; signed-in publish form; claim handle; copy public URL.
2. Public page desktop + narrow viewport: header/footer not clipped; charts scroll; social chips wrap cleanly.
3. Unlisted: open without `k`, then with `k`; copy is understandable.
4. Turn off sharing; reload public URL — gone.
5. Console/network: no failed Hub calls leaking `k`; footer click opens atmos.land.

## Acceptance criteria

- [ ] Every Must Have has at least one passing scenario at its declared level.
- [ ] Handle claim-once + unique + validation covered by Hub tests.
- [ ] Unlisted without `k` and unpublish return 404.
- [ ] Mapper stores top 5 + `other` and full summary totals.
- [ ] Public page uses the extracted view and the specified shell.
- [ ] User-facing URL is `atmos.land/tok/@handle` (or rewrite follow-up is explicit in Coverage Status).
- [ ] `just lint` / scoped `bun test` for hub + web token-usage pass after implementation.
- [ ] Coverage Status filled by `atmos-specs-test-run`.

## Manual verification steps

1. Sign in with GitHub or Google on Desktop or web; open Token Usage; publish public; open the link in a private window.
2. Repeat as unlisted; confirm a second private window without `k` sees nothing.
3. After rewrite: paste `https://atmos.land/tok/@…` (not app/hub) and confirm assets load.

## Non-coverage

- Multi-computer live merge.
- Handle rename / 301 aliases.
- Agent session share pages.
- Real social-network OG crawlers (N2 is metadata only).
- Load testing Hub D1 beyond the size cap.

## Coverage Status

Implementation pass (2026-08-15):

- Hub: `bun test packages/hub/test/usage-page.test.ts` — claim/immutable/unique/reserved, public vs unlisted `k`, unpublish 404, allowlist/size, cost strip, other residual (S5–S13, S15–S17, S23).
- Web mapper + wiring: `bun test apps/web/src/features/token-usage/__tests__` plus existing Token Usage PNG/cookie/model-icon tests (S1, S2, S15, S16, M1/M8 static).
- S22 atmos.land rewrite: landing Pages Function (`functions/_lib/tok-app-proxy.test.ts`) reverse-proxies `/tok*` without a 302; `_redirects` no longer sends `/tok/*` to `app.atmos.land`. Live host still needs a landing Pages deploy.
- Not automated here: S4 sign-in E2E, S18 render, S19–S20 agent-browser.
- Review: functional CLEAN (M1–M12); quality CLEAN after static-export / unlisted-copy fixes.
