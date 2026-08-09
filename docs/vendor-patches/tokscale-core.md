# `tokscale-core` Vendor Patch

This repo vendors `tokscale-core` at [vendor/tokscale-core](../../vendor/tokscale-core).

**Pinned upstream:** [junhoyeo/tokscale](https://github.com/junhoyeo/tokscale) **`v4.12.0`**
(`crates/tokscale-core`, packaged as a standalone crate under `vendor/tokscale-core`).

## Why this patch exists

Atmos needs a token usage overview that includes:

- graph data
- model aggregates
- monthly aggregates

The upstream public API exposes these as three separate entry points. Calling all three causes the same local session history to be scanned and parsed three times, which makes the token usage page noticeably slow on larger local histories.

## Patch policy

Keep the vendor patch as additive as possible.

- Prefer adding new APIs over changing existing upstream APIs.
- Do not change the behavior of upstream public functions unless there is no alternative.
- Keep Atmos-specific call sites using the additive API only.
- Vendor as a **standalone** `Cargo.toml` (not a workspace member of upstream). Pin dependency versions from the upstream workspace `Cargo.toml` of the release tag.

## Current patch surface

The only Atmos-specific API added on top of upstream is:

- `tokscale_core::UsageReports`
- `tokscale_core::generate_usage_reports`

It returns all three report shapes from a single local scan/parse pass (see the block marked “Atmos-only additive API” near the bottom of `vendor/tokscale-core/src/lib.rs`).

Atmos uses this API from:

- [crates/token-usage/src/service.rs](../../crates/token-usage/src/service.rs)

## Upgrade guidance

When upgrading `tokscale-core`:

1. Check out the desired upstream tag (e.g. `v4.12.0`).
2. Replace `vendor/tokscale-core/src` with `crates/tokscale-core/src` from that tag.
3. Refresh the standalone `vendor/tokscale-core/Cargo.toml` dependency pins from the upstream workspace.
4. Reapply only the additive `generate_usage_reports` / `UsageReports` API if it is not upstream yet.
5. Update `crates/token-usage` for any `ReportOptions` / type field changes.
6. Verify:
   - `cargo test -p token-usage`
   - `cargo check -p token-usage`

If upstream eventually adds an equivalent single-pass reporting API, remove the local patch and switch Atmos to the upstream API.
