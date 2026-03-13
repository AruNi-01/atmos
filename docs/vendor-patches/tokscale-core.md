# `tokscale-core` Vendor Patch

This repo vendors `tokscale-core` at [vendor/tokscale-core](/Users/lurunrun/own_space/OpenSource/atmos/vendor/tokscale-core).

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

## Current patch surface

The only Atmos-specific API added on top of upstream is:

- `tokscale_core::generate_usage_reports`

It returns all three report shapes from a single local scan/parse pass.

Atmos uses this API from:

- [crates/token-usage/src/service.rs](/Users/lurunrun/own_space/OpenSource/atmos/crates/token-usage/src/service.rs)

## Upgrade guidance

When upgrading `tokscale-core`:

1. Replace/update the vendored upstream code.
2. Reapply only the additive `generate_usage_reports` API if it is not upstream yet.
3. Verify Atmos still builds and run:
   - `cargo test -p token-usage`
   - `bun --filter web typecheck`

If upstream eventually adds an equivalent single-pass reporting API, remove the local patch and switch Atmos to the upstream API.
