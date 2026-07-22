# APP-041 · Browser Cookie Sync — TEST

> Verification contract. Requirements in [`PRD.md`](./PRD.md); design in [`TECH.md`](./TECH.md).
>
> Revised per the APP-041 review: adds the app-state-isolation, dedicated-store, capability
> negative, cookie round-trip, WAL, idempotency/concurrency, persistence, canary, and platform-gate
> scenarios that the first draft lacked.

## 1. Test strategy

| Level | Where | Covers |
|-------|-------|--------|
| Rust unit | `crates/browser-cookies` | discovery, decrypt math, typed SQLite parse, SameSite mapping, `__Host-`/partition safe-skip, error mapping |
| Rust integration | `crates/browser-cookies` (fixtures) | end-to-end extract from synthetic Chromium/Firefox DBs incl. WAL-only rows |
| Native adapter test | `apps/desktop/src-tauri` (macOS 14+ CI/self-host) | dedicated-store isolation, inject+read-back, split clears, app-state sentinel survival |
| Command/caller test | `apps/desktop/src-tauri` | caller-label validation, op-mutex serialization, DTO/error codes, no path/value leakage |
| Manual (macOS 14+) | real browsers + Atmos Browser | Keychain prompt, login persists after reload, restart persistence |
| agent-browser (exploratory) | run-preview | `···` layout, dialog copy/states, confirm popovers, i18n parity |

Deterministic logic is proven in Rust with **synthetic fixtures** — never real user cookies. The
Keychain prompt and full WebKit persistence-across-restart are covered by manual macOS checks.

## 2. Coverage map (PRD Must-Have → scenarios)

| PRD | Scenario ids |
|-----|--------------|
| MH-1 / MH-8..10 menu | S-UI-1, S-UI-4 |
| MH-2 dialog | S-UI-2, S-UI-3, S-UI-6 |
| MH-3 sources | S-EXT-1, S-EXT-2 |
| MH-4 extract+decrypt+inject | S-EXT-3, S-INJ-1, S-INJ-2 |
| MH-5 verified result / skips | S-EXT-4, S-EXT-7, S-INJ-3 |
| MH-6 reload contract | S-INJ-4 |
| MH-7 local pipeline | S-SEC-1, S-SEC-2 |
| MH-11 Clear Cache (keeps login) | S-CLR-1, S-ISO-1 |
| MH-12 Clear Site Data (may logout) | S-CLR-2, S-ISO-1 |
| MH-13 confirm + reload + app isolation | S-CLR-3, S-ISO-1, S-ISO-2 |
| Core §4 dedicated store | S-ISO-2, S-ISO-3 |
| Security §3 capability | S-CAP-1, S-CAP-2 |
| Platform gate | S-PLT-1, S-PLT-2 |

## 3. Execution map

| Scenario | Level | Tool / command | Fixture | Signals | Status |
|----------|-------|----------------|---------|---------|--------|
| S-EXT-1 discover Chromium profiles | unit | `cargo test -p browser-cookies` | temp dir + `Local State`, `Network/Cookies` present | profiles + display_name; prefers Network/Cookies | planned |
| S-EXT-2 discover Firefox profiles | unit | `cargo test -p browser-cookies` | `profiles.ini` | paths resolved | planned |
| S-EXT-3 decrypt v10/v11 + host-hash strip | unit | `cargo test -p browser-cookies` | synthetic key + blobs | plaintext == expected | planned |
| S-EXT-4 per-row failure accounting | unit | `cargo test -p browser-cookies` | bad + good rows | good imported; `skipped_decrypt==1` | planned |
| S-EXT-5 SameSite four-state mapping | unit | `cargo test -p browser-cookies` | rows -1/0/1/2 | Unspecified≠None; enum exact | planned |
| S-EXT-6 `__Host-`/`__Secure-` + partition safe-skip | unit | `cargo test -p browser-cookies` | illegal `__Host-`, partitioned row | `skipped_unsupported`; never downgraded | planned |
| S-EXT-7 expiry + session/persistent | unit | `cargo test -p browser-cookies` | utc µs, is_persistent 0/1 | unix secs; `has_expires` correct | planned |
| S-EXT-8 WAL-only cookie row | integration | `cargo test -p browser-cookies` | DB + `-wal` holding newest row | newest row read (no `immutable=1`) | planned |
| S-EXT-9 typed read, no subprocess | unit/review | `cargo test` + grep | – | no `sqlite3` process; rusqlite BLOB path | planned |
| S-INJ-1 inject + read-back verify | native | `cargo test` (macOS 14+) | synthetic cookies | only round-tripped counted `imported_verified` | planned |
| S-INJ-2 login persists after reload | manual (macOS 14+) | desktop + real browser | live login cookie | logged-in after auto-reload; one Keychain prompt | planned |
| S-INJ-3 illegal cookie → failed_injection | native | `cargo test` (macOS 14+) | attribute-conflict cookie | not counted imported; `failed_injection>=1` | planned |
| S-INJ-4 reload contract | native+agent-browser | command + UI | – | success only after verify; active tab reload / CTA; no blanket reload | planned |
| S-INJ-5 idempotent re-import | native | `cargo test` (macOS 14+) | same profile twice | no duplicates; stable identity dedupe | planned |
| S-INJ-6 concurrency serialized | command | `cargo test` | two ops | second gets `Busy` or serializes; no race | planned |
| S-ISO-1 app localStorage sentinel survives clear | native | `cargo test` (macOS 14+) | sentinel in default store | sentinel intact after both clears | planned |
| S-ISO-2 dedicated store shared by child+detached | native+manual | adapter test | – | cookie set once visible in both surfaces | planned |
| S-ISO-3 persistence across app restart | manual (macOS 14+) | desktop restart | persistent cookie | present after restart; session cookie lifecycle defined | planned |
| S-CLR-1 Clear Cache keeps cookies+storage | native | `cargo test` (macOS 14+) | cache+cookies+localStorage | caches gone; cookies+storage kept | planned |
| S-CLR-2 Clear Site Data removes storage+cookies | native | `cargo test` (macOS 14+) | same | cookies+storage+caches gone | planned |
| S-CLR-3 confirm gating + reload | agent-browser | run-preview | – | popover required; surfaces refresh; no success toast | planned |
| S-CAP-1 first-party UI can invoke | command | `cargo test` | caller=`main`/`preview-browser` | allowed | planned |
| S-CAP-2 preview/remote webview denied | command | `cargo test` | caller=child/`preview-inspector`/remote | `Forbidden`; no Keychain prompt | planned |
| S-SEC-1 no cookie egress | manual | proxy/devtools during import | – | zero cookie bytes to server/relay/telemetry | planned |
| S-SEC-2 canary not in logs/DTO/console | native+review | `cargo test` + log scan | canary cookie value | canary absent from DTO, tracing, debug log | planned |
| S-PLT-1 macOS <14 gate | native | `cargo test` / manual | – | `UnsupportedPlatform`; no default-store fallback; UI hidden | planned |
| S-PLT-2 non-macOS gate | unit | `cargo test` | – | items hidden / `UnsupportedPlatform` | planned |
| S-UI-1 menu structure | agent-browser | run-preview | – | only Favorites + toolbar-toggle outside | planned |
| S-UI-2 dialog fields | agent-browser | run-preview | – | From, close-hint, Cookies toggle, Cancel/Import | planned |
| S-UI-3 result/skip breakdown copy | manual (macOS) | desktop | – | imported-verified + skip categories shown | planned |
| S-UI-4 desktop/macOS gating | agent-browser | run-preview (web) | – | cookie/clear items hidden on web | planned |
| S-UI-5 i18n parity en/zh | review+agent-browser | messages diff | – | keys parity; zh localized | planned |
| S-UI-6 focus/Escape/double-submit | agent-browser | run-preview | – | dialog focus trap; Esc cancels; Import disabled in flight | planned |

## 4. Key scenarios (Given / When / Then)

**S-ISO-1 — App state survives browser clears (blocker regression)**
- Given the Atmos app has written a localStorage sentinel (default store) and the dedicated browsing
  store holds cookies + cache.
- When Clear Cache, then Clear Site Data & Cache run.
- Then the app sentinel is unchanged both times; only the dedicated store is affected.
- **Signals:** sentinel read equals original; dedicated store emptied per §5.2.

**S-CAP-2 — Sensitive commands not reachable from preview content**
- Given the caller is the target-site child webview / `preview-inspector*` / remote-origin content.
- When it invokes `import_browser_cookies` / `clear_browser_site_data`.
- Then the call is rejected (`Forbidden`) and **no Keychain prompt appears**.
- **Signals:** error `code == Forbidden`; no `security`/Keychain interaction.

**S-INJ-1 — Read-back verification gates the count**
- Given synthetic cookies including one WebKit will reject.
- When import runs against the dedicated store.
- Then only identity-round-tripped cookies are `imported_verified`; the rejected one is
  `failed_injection`. **Signals:** counts; `getAllCookies` matched by `CookieIdentity`.

**S-EXT-8 — WAL-only newest cookie**
- Given a DB whose newest cookie exists only in `-wal`.
- When `extract` reads a consistent snapshot.
- Then the newest cookie is returned (proves no `immutable=1`). **Signals:** row present.

**S-SEC-2 — Canary never leaks**
- Given a cookie with a unique canary value.
- When import runs and logs/DTOs are captured.
- Then the canary appears in neither the DTO, console, tracing, nor debug logs. **Signals:** scans
  empty.

**S-PLT-1 — macOS < 14 gate**
- Given macOS < 14 (or the identified-store API unavailable).
- When the feature is invoked.
- Then it returns `UnsupportedPlatform`, never falls back to the default store, and UI entries are
  hidden. **Signals:** error code; no default-store access.

## 5. Exploratory agent-browser checks

- `···` menu: only Favorites + Hide/Show toolbar outside; all else inside; items gated to
  desktop + macOS 14+; surface-specific items appear only when applicable.
- Import dialog copy matches PRD (title, From, "Close <Browser> completely before importing",
  Cookies toggle, Cancel/Import); loading, verified-result, skip-breakdown, and error states clear;
  en + zh parity; focus trap; Esc cancels; Import disabled in flight.
- Clear actions require the confirm popover; Site-Data warns about sign-out; surfaces refresh after;
  no success toast.

## 6. Regression checklist

- [ ] Relocated toolbar actions (open-in-window, return-to-embedded, move-to-center, maximize) work
      from the `···` menu.
- [ ] Favorites and toolbar toggle still work as direct buttons.
- [ ] Web/mobile run-preview unaffected (cookie/clear items hidden).
- [ ] `ai-usage` cookie-header providers still work after refactor onto `crates/browser-cookies`.
- [ ] `just typecheck`, `just lint`, `cargo test -p browser-cookies`, and the desktop
      adapter/command tests are green.

## 7. Acceptance criteria

- All `S-EXT-*`, `S-INJ-1/3/5/6`, `S-ISO-1/2`, `S-CAP-1/2`, `S-CLR-1/2`, `S-PLT-*`, `S-SEC-2` pass in
  CI (native tests on a macOS 14+ runner).
- S-INJ-2, S-ISO-3, S-SEC-1 verified manually on macOS 14+ with at least Chrome + Firefox.
- **S-ISO-1 is a hard gate:** clearing browser data must never disturb Atmos app state.
- Toolbar/menu match MH-8..10; clears match MH-11..13; privacy wording matches PRD §8.

## 8. Non-coverage (MVP)

- Windows / Linux extraction and Safari source.
- macOS < 14.
- Automated coverage of the live Keychain prompt (manual only — no headless harness).
- Continuous sync, password import, per-domain selection, partitioned-cookie fidelity.

## 9. Coverage Status

_To be appended after implementation / `atmos-specs-test-run` with exact commands and gaps._
