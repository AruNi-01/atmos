# TECH · QUALITY-026: Quota Usage Display Parity

> Technical Design · HOW. Aligns the mobile quota usage screen with the web popover, and corrects the Cursor Other Models meter at the source both clients render. No BRAINSTORM or PRD (quality spec).

## Scope summary

The mobile quota usage screen (`apps/mobile`) clips the percent suffix, repeats the subscription plan under the account email, shows a Cursor Other Models row whose percent and dollar amounts contradict each other, prints Grok billing windows as raw RFC3339, and reorders provider switches without the web comparator or a layout animation. Web shares the Cursor row string and the raw Grok section, so those two defects are fixed for both clients. The percent clip and the duplicated plan line are mobile-only.

## Root cause: Cursor Other Models

Fetched data is consistent with Cursor's API. The contradiction is a mapping error in `crates/quota-usage`, not a dropped field and not a swapped `used` / `limit` pair inside serde.

Cursor publishes two different meters on `GET https://cursor.com/api/usage-summary`:

| Field                                  | Meaning                                                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `individualUsage.plan.autoPercentUsed` | Cursor Models pool percent (Settings / Spending).                                                                                                                                                                            |
| `individualUsage.plan.apiPercentUsed`  | Other Models pool percent. This is the value behind "12% used".                                                                                                                                                              |
| `plan.used` / `plan.limit`             | Nominal included-allowance cents. On current two-pool billing this pair often saturates (`used == limit`): Ultra `40000/40000` → `$400.00 / $400.00`, Pro `2000/2000` → `$20.00 / $20.00`, while `apiPercentUsed` stays low. |
| `displayMessage`                       | Tracks the cents meter.                                                                                                                                                                                                      |
| `namedModelSelectedDisplayMessage`     | Tracks the API percent.                                                                                                                                                                                                      |

A public Pro sample shows `used` 1516 / `limit` 2000 (~76%) next to `apiPercentUsed` 0.71 and `autoPercentUsed` 3.3. Cursor staff (forum thread 172012, 2026-09-25) said included-usage dollar amounts are no longer published; Plan & Usage and the Spending tab show percentages. `plan.limit` 40000 is not the Other Models denominator. Deriving dollars as `limit * apiPercent / 100` invents a ceiling that community clients have already rejected.

`build_result_from_summary` currently comments that `plan.used` / `plan.limit` is the Other Models dollar cap, then passes `api_percent_used` together with `cents_to_usd(plan.used)` and `cents_to_usd(plan.limit)` into `format_percent_window`. That prints `"12% used · $400.00 / $400.00"`. The DashboardService fallback (`fetch_cursor_live` / `included_spend`) does the same with `includedSpend` and `limit`. `formatQuotaAmountText` only adds dollars when `usage_summary.unit` is `usd`; `build_percent_usage_summary` sets unit `percent`, so the top summary is not the bug. Web `extractMetricDetail` and mobile `extractDetail` both display the dollar fragment already present in the row string. They do not recompute it.

The existing unit fixture hid the bug by setting `apiPercentUsed: 100` together with `used == limit == 40000`, so both meters agreed.

### Fix

In two-pool mode, Cursor Models and Other Models rows are percent-only. Pass `None, None` for the dollar arguments at both call sites (`build_result_from_summary` and the DashboardService fallback). Do not attach `plan.used` / `plan.limit` or `includedSpend` / `limit` to pool rows, including when the ratio happens to match (100% and `$400.00 / $400.00`). Do not invent dollars from `limit * percent`.

On-demand cents stay on the On-Demand row. The legacy single-pool path (no `autoPercentUsed` / `apiPercentUsed`) still computes percent from `used` / `limit`, so Included usage keeps those dollars.

## Quality target

| Item                          | Before                                                                                          | After                                                                                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile percent readout        | NumberFlow suffix `%` is clipped (`26%` reads as `26`)                                          | Integer animates in NumberFlow; `%` and `used` are sibling `Text` with `flexShrink: 0`. The name ellipsizes.                                                                                                                                                              |
| Plan under the email          | Mobile expanded identity repeats `heading.plan` under `heading.account`                         | Plan stays as the subtitle under the provider name. The line under the email is removed. Web single-view plan (once, under the account) stays.                                                                                                                            |
| Other Models dollars          | `"12% used · $400.00 / $400.00"` from saturated allowance cents                                 | `"12% used"` only, on web and mobile, because both render the Rust row.                                                                                                                                                                                                   |
| On-Demand and legacy Included | Real cents                                                                                      | Unchanged.                                                                                                                                                                                                                                                                |
| Grok billing period           | Section `Billing period` with raw RFC3339 Start / End                                           | Account row `Period` = UTC month-day span (`Sep 4 - Sep 11`). The raw section is not emitted.                                                                                                                                                                             |
| Client leftover ISO           | Web and mobile print the section as returned                                                    | Shared formatter rewrites a string only when it, or both sides of a range, match a full ISO instant. Factory `Sep 4 - Sep 11` and Zed `YYYY-MM-DD → YYYY-MM-DD` stay. A missing offset is UTC. The section is hidden once the span is the period label under the account. |
| Provider switch list          | Mobile uses API order. Web aggregate sorts detected, then switch, then saved order, then label. | Switch-on first, then the shared Computer `provider_order`, then label. `enabled` is not a key. `All providers` stays the first row and is outside the animated list.                                                                                                     |
| Reorder animation             | Hard jump                                                                                       | `LinearTransition` on each provider row. Reduced motion uses duration `1`. The Providers section does not clip overflow.                                                                                                                                                  |

## Decision

Correct the Cursor meters in Rust so both clients stay in sync. Format the Grok span in Rust to match Factory's web period (`format_short_date`: UTC month + day, no year, space-hyphen-space), and keep a client formatter for Computers that still return the old section. Do not reformat Zed's date-only arrow string into month-day.

Share the aggregate switch sort. Leave `sortQuotaProvidersBySwitchAndOrder` (navbar) unchanged: it already sorts switch-on, then saved order, then label.

### Switch-list order

The web aggregate sheet (`AggregateDetail` → `sortQuotaProvidersForSwitchList`) previously sorted `enabled` (detected) first, then `switch_enabled`, then saved `providerOrder`, then label. The navbar comparator does not use `enabled`. The requirement's "turned on" means the switch (`switch_enabled`), not detection. Both the web sheet and mobile settings now use one rule:

1. `switch_enabled` first
2. saved `providerOrder` index (missing ids sort after known ids)
3. `label.localeCompare`

`enabled` is not a sort key. `All providers` stays the first row and is outside the animated list.

`providerOrder` is not browser-local anymore for the shared list. `provider_state.json` stores `provider_order` and `provider_order_revision`. `QuotaOverview` returns both. `quota_set_provider_order` writes the order and increments the revision only when the normalized id list changes. A switch or refresh save keeps the current revision. Web still keeps the previous localStorage order as a one-shot migration: when the Computer order is empty and the browser order is not, web uploads the browser order. A drag writes the same array. Mobile passes `overview.provider_order` into the shared sort. An empty order on both sides leaves label order inside each switch group, so the two clients match without inventing a sequence.

Every load and save of `provider_state.json` in this process takes one mutex for the whole read-modify-write. An order save cannot write back a switch value it read before that switch was saved.

`quota_overview_updated` can arrive after a newer drag. `applyQuotaOverviewUpdated` keeps the cached order when the incoming `provider_order_revision` is lower. While a drag request is in flight, it also keeps the optimistic order, because that order is newer than any revision already in the cache. The highest revision seen during that wait is remembered. When the last in-flight write settles, that revision replaces the cached order only if it is still newer: a failed drag picks up another browser's save, and a successful response that is already newer stays in place. The request response for the latest drag writes the server snapshot, including the new revision, before that settle step. `setProviderOrder` captures `getComputerQueryScope()` and sends with `wsRequestForComputerScope`, so the connect wait cannot deliver the order to a Computer the user switched to. Other quota mutations still use `wsRequest`.

Mobile percent: stop passing `%` through `AnimatedMetric` / `flowParts`. Token-usage NumberFlow stays as it is.

## Module-by-module design

### `crates/quota-usage/src/providers/cursor.rs`

`push_pool_row("Other Models", percent, None, None, reset)` and the same for Cursor Models (already `None, None`). `push_pool_row` still skips a row when percent is `None`. `push_on_demand_row` still receives cents. Legacy Included usage still receives `plan.used` / `plan.limit`.

Update `usage_summary_maps_cursor_and_other_model_pools`: Other Models must not contain `$`. Add a fixture with `apiPercentUsed: 12` and `used == limit == 40000` whose value contains `"12% used"` and does not contain `$400`. A matching-ratio case (`used` 4800, `limit` 40000, api 12) also has no dollars. `usage_summary_reads_membership_and_plan_buckets` (no auto/api percents) still expects Included usage dollars (`$20.00 / $20.00` for 2000/2000 cents).

### `crates/quota-usage/src/support/formatting.rs`

```rust
pub(crate) fn format_utc_month_day(timestamp: u64) -> String
pub(crate) fn format_billing_span(start: Option<u64>, end: Option<u64>) -> Option<String>
```

`Some/Some` → `"{start} - {end}"`. `None/Some` → `"Until {end}"`. `Some/None` → `"Since {start}"`. `None/None` → `None`. Use `OffsetDateTime::from_unix_timestamp` and the same month abbreviations as Factory. Do not refactor Factory's private `format_short_date`.

### `crates/quota-usage/src/providers/grok.rs`

`map_credits_config` stops pushing the `Billing period` section. It adds an Account `Period` row from `format_billing_span`, after Plan and before Team. Shared-pool fixture `2026-09-04T22:17:47.739583+00:00` … `2026-09-11…` → `"Sep 4 - Sep 11"`. Omitted weekly `2026-09-03` … `2026-09-10` → `"Sep 3 - Sep 10"`. No section titled `Billing period`.

### `packages/shared`

`formatQuotaBillingPeriod` in `packages/shared/src/utils/time.ts`, re-exported from `utils/index.ts`. UTC (`getUTCMonth` / `getUTCDate`). Rewrite a side only when it matches a full ISO instant: date, `T`, time, optional fraction, optional `Z` or numeric offset. Do not use `includes("T")`. A timestamp with no offset is formatted as UTC (`…Z` before `new Date`). Split ranges on `→` / `—` / `–` with `indexOf` (no `\s*` regex), or on `-` only when both sides match that instant. Anything else, including `Thu Sep 4 2026` and `Tokens 1200`, is returned unchanged. `formatQuotaBillingBounds` turns a missing start into `Until {end}` and a missing end into `Since {start}`, matching `format_billing_span`. Mobile `billingPeriodLabel` and web `billingPeriodSectionRange` use it for a Billing period section.

`sortQuotaProvidersForSwitchList` in `packages/shared/src/utils/quota-provider-order.ts` uses the switch-first rule in the decision above. Default `providerOrder` is `[]`. JS `Array#sort` is stable. `AggregateDetail` and `QuotaSettingsScreen` both call it with the Computer order.

### Mobile

`QuotaUsageScreen.tsx`: `QuotaPercent` renders `AnimatedMetric` with `format={(next) => String(Math.round(next))}` and a sibling `Text` `%`. `PercentLabel` gives the name `flexShrink: 1` and the readout (`%` + `used`) `flexShrink: 0`. Expanded identity renders `heading.account` and the billing period, not `heading.plan`. The collapsed subtitle under the provider name stays `heading.plan`.

`quota-rows.ts`: `HIDDEN_EXTRA` includes `"billing period"`. `billingPeriodLabel` reads Account `Period`, else Usage `Billing period`, else a `Billing period` section Start/End pair, then runs `formatQuotaBillingPeriod`.

`QuotaSettingsScreen.tsx`: `All providers` stays the first child of the Providers section and is not inside the animated list. Remaining rows use `sortQuotaProvidersForSwitchList(providers, overview.provider_order)`. Each row is an `Animated.View` keyed by `provider.id` with `layout={LinearTransition.duration(reduced ? 1 : 280)}` and `collapsable={false}`. `useReducedMotion` comes from `react-native-reanimated`. The Providers `Section` gets `clip={false}` so layout animation is not clipped by `overflow: hidden`.

### Web

`AggregateDetail` calls `sortQuotaProvidersForSwitchList(providers, providerOrder)`.

`providerIdentity` wraps the period with `formatQuotaBillingPeriod` and, when no Usage/Account period exists, synthesizes one from a `Billing period` section Start/End.

`extraSections` drops a section whose title is `billing period`. Remaining ISO values still pass through the formatter.

`ProviderDetail` shows `periodLabel` under the account for every provider and removes the Zed-only left-hand period block so Zed is not shown twice. Web aggregate `DetectedProviderDetails` already shows `periodLabel` under the account.

Web percent headings stay plain text (`QuotaMetricUsage`). No width change.

## Verification commands

- `cargo test -p quota-usage`
- `bun test` on the new shared tests, `apps/mobile/src/features/quota-usage`, and `apps/web/src/app-shell/__tests__/quota-billing-period.test.ts` plus the existing quota popover order tests
- `bun --filter @atmos/mobile typecheck`
- `bunx oxlint` on changed TS paths, then root `oxlint --max-warnings=455`

## Risks

- A Computer that still returns the raw Grok section depends on the client formatter. Rust-only tests do not cover that payload; Bun tests do.
- A browser that already saved a drag order uploads it the next time that web client loads an empty Computer order. Until that upload, mobile still sees `[]` and uses label order inside each switch group.
- The provider-state mutex is in-process. Two API processes writing the same file can still interleave. Desktop and the local API run one quota service.
- iOS Simulator screenshots are out of this change. Layout of the percent suffix is covered by a source scan plus the flex rules above, not by a device capture in CI.

## Follow-ups

None in this spec. Do not change token-usage NumberFlow, the navbar sort, or Factory's private date helper.
