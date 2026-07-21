# APP-040 · Browser Cookie Sync — BRAINSTORM

> Working notes. Settled decisions move to `PRD.md` / `TECH.md`.

## Problem

Atmos Browser (the Tauri `WebviewWindow` created by `open_preview_browser_window`, plus the
embedded/standalone preview surfaces) starts every session logged out. Users who already have
live sessions in Chrome / Edge / Firefox must re-authenticate inside Atmos to browse, preview
authenticated pages, or let agents act on logged-in sites. This kills the "just use the browser"
value.

Goal: let a user bring their existing browser sessions into Atmos Browser with roughly the
one-click feel of ChatGPT Atlas's "Import from your browser" dialog.

Secondary asks bundled into the same surface (browser toolbar is getting crowded):
- Collapse the tab-bar chrome buttons into a `···` overflow menu; keep only **Favorites** and
  **Hide toolbar** outside.
- Add **Clear Cookies** and **Clear Cache** (one-click wipe of the Atmos Browser store), each
  behind a secondary confirm popover.

## Key research findings (see conversation for sources)

- **App-Bound Encryption (ABE / cookie v20) is Windows-only.** Google's own post: macOS uses
  Keychain, Linux uses a system wallet; the Chrome 127+ app-identity binding that broke every
  extraction tool is on Windows only. So the scary part does **not** apply to a macOS-first MVP.
- **Atlas's "one click" = two mundane things:**
  1. "Close Chrome completely before importing" → sidesteps the SQLite lock; read the cookie DB
     file directly, no WAL-copy tricks or CDP.
  2. A single macOS Keychain "Allow" prompt to read the `Chrome Safe Storage` key (cookies +
     passwords share this key, hence one prompt for both toggles).
- Extraction difficulty by source (macOS):
  - **Firefox** — `cookies.sqlite`, unencrypted → trivial, most reliable.
  - **Chromium (Chrome/Edge/Brave/…)** — SQLite `Cookies`, values AES-128-CBC; key in Keychain
    (`<Browser> Safe Storage`), one prompt. `v10` prefix, PBKDF2(salt=`saltysalt`, iter=1003).
  - **Safari** — sandboxed `Cookies.binarycookies`, needs Full Disk Access (TCC). Out of MVP.
- Injection target is a **WKWebView**, not Chromium. HttpOnly/Secure cookies cannot be set via
  `document.cookie`; must write into the native `WKHTTPCookieStore` of the **default**
  `WKWebsiteDataStore` (Atmos sets no `data_store_identifier`, so the store is global/shared —
  confirmed in code). Inject once → all Atmos Browser tabs/windows see it.
- Reusable Rust extraction libs exist: `rookie`, `cookie-scoop`, `browsercookie-rs`. Reuse rather
  than hand-roll where quality/license allow.

## Options considered

### Extraction approach
1. **File + decrypt (chosen for MVP).** Read SQLite + Keychain key. Simple, no source-browser
   changes. Requires source browser closed and one Keychain prompt. Blocked by ABE on Windows.
2. Browser extension (`chrome.cookies`). Robust, survives ABE, but requires installing an
   extension in every source browser → high friction. Deferred / Windows fallback candidate.
3. CDP remote debugging (`--remote-debugging-port`). Requires relaunching the browser with a flag;
   Chrome 136+ blocks the default profile. Clunky. Rejected.

### Where the code lives
- New capability crate `crates/browser-cookies` for discovery + decryption (pure, unit-testable).
- Injection + data-store clearing stay in `apps/desktop/src-tauri` (needs native WKWebView / data
  store handles via `objc2` + `objc2-web-kit`).
- Transport: **local Tauri commands only.** No WebSocket, no REST, nothing crosses the network.
  Cookies must never reach Atmos Server / relay. Consistent with the "desktop-native, local" rule.

### Sync model
- **One-time, on-demand import** for MVP. Continuous/auto sync (file watching + re-decrypt +
  conflict handling) is much heavier — deferred.

### Scope selection
- MVP imports **all** cookies for the chosen browser+profile. Per-domain / allowlist selection is
  a future enhancement (nice for privacy, not required to prove value).

## Open questions

- [ ] Reuse `rookie` vs hand-roll extraction? Lean `rookie` behind our own trait; re-evaluate on
      license + Firefox/Chrome coverage on current macOS builds.
- [ ] Import dialog toggles: Atlas shows Passwords + Cookies. Atmos WebView cannot meaningfully use
      Chrome passwords → MVP is **Cookies only**; hide Passwords toggle (note as non-goal).
- [ ] Profile picker granularity: list all profiles per browser, or default profile only? Lean:
      list detected profiles (Chrome "用户1" etc.), default to the last-used.
- [ ] Clear Cache exact scope: caches only, or caches + web storage (localStorage/IndexedDB/SW)?
      Proposed: Clear Cookies = cookies only; Clear Cache = disk/memory/fetch cache + web storage,
      excluding cookies. Confirm wording.
- [ ] Partial failures: some cookies fail to decrypt (format drift, Arc/Dia Apple-Passwords v10).
      Show imported/failed counts inline; don't fail the whole import.

## Non-goals (MVP)

- Windows (ABE) and Linux extraction; Safari source.
- Continuous / background sync.
- Password / bookmark / history import.
- Per-domain selective import.


---

## Review resolution (post architecture review)

The first-draft TECH was assessed as **Go for spikes / spec revision, No-Go for production
implementation**. Findings verified against code and folded into PRD/TECH/TEST:

- **Blocker — default WebKit store.** Confirmed: `preview_bridge` external child + detached window +
  `main` set no `data_store_identifier` → shared default store; clearing it would wipe app state.
  Resolved: dedicated `PREVIEW_DATA_STORE_ID` for target-site webviews only; macOS 14+ gate; no
  fallback to default. (TECH §2.)
- **Blocker — capability exposure.** Confirmed: `desktop-app-commands` targets windows + allows
  localhost / `*.atmos.land` remote origins. Resolved: dedicated `browser-cookie-commands`
  capability, webviews-scoped, no `remote.urls`, plus Rust caller-label validation. (TECH §3.)
- **High — cookie fidelity.** Resolved: four-state SameSite (Unspecified≠None), host-only/domain,
  `has_expires`, `__Host-`/`__Secure-` enforcement, partitioned safe-skip, read-back verification.
- **High — SQLite/WAL.** Resolved: prefer `Network/Cookies`; require-closed + read-only rusqlite
  (no `immutable=1`, `BUSY`≠running alone); typed BLOB, no `sqlite3` subprocess. Snapshot-copy mode
  deferred to Phase 2.
- **Clear semantics.** Resolved: split into **Clear Cache** (caches only, login kept) and
  **Clear Site Data & Cache** (storage + cookies, warns sign-out).
- **Reload contract & privacy wording.** Resolved: success only after inject+verify; reload active
  tab / CTA; privacy statement scoped to non-cookie-scope endpoints (TECH §8, PRD §8).
- **Reuse.** Confirmed `ai-usage/src/support/browser.rs` has discovery/decrypt/Keychain (header-
  oriented, subprocess sqlite). Resolved: sink primitives into `crates/browser-cookies`; `ai-usage`
  depends on it. (TECH §7.)
- **IPC types.** Resolved: opaque `profile_handle`, typed `code` errors, no path/value to frontend.
- **Library choice.** Un-locked: MVP uses `rusqlite` + Security.framework + existing crypto (not
  `rookie`), pending the four spikes (TECH §11) before finalizing crate internals.

### Resolved open questions
- Reuse vs `rookie` → reuse/refactor `ai-usage` primitives into `crates/browser-cookies`.
- Passwords toggle → omitted (Cookies only).
- Clear Cache scope → split Cache vs Site Data.
- Partial failures → typed `skipped_*` + `failed_injection`, verified counts only.
