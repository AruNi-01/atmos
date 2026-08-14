# Permission Access - AGENTS.md

> **Privacy & Security → Permission Access**: product-level gate for whether Atmos Server may touch a sensitive local source.

## Build And Test

- **Build**: `cargo build -p permission-access`
- **Test**: `cargo test -p permission-access`

## Owns

- Resource registry (id, label, install fingerprints)
- Local presence probes
- Persisted user consent (`~/.atmos/data/permission-access/consent.json`)
- `check()` → Allow / SkipNotInstalled / SkipNoConsent

## Does not own

- Cookie decrypt / Keychain I/O (`browser-cookies`)
- Quota / token fetch logic
- Desktop Use TCC (`desktop-use`)
- ACP tool permissions (`agent`)

## ALWAYS

- Call `check` before any browser-cookie / Safe Storage read
- Keep cookie domains and names in the calling crate
