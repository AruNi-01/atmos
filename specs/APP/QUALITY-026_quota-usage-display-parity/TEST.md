# TEST · QUALITY-026: Quota Usage Display Parity

> Test Plan · how we verify the quota display fixes in [TECH.md](./TECH.md). Quality spec. No PRD. Coverage is keyed to the TECH quality table.

## Test strategy

- **Rust unit**: `cargo test -p quota-usage` for Cursor two-pool percent-only rows, legacy Included dollars, On-Demand dollars, and Grok Account `Period`.
- **Bun unit**: shared billing-period formatter and switch-list sort; web `providerIdentity` / `extraSections` / `ProviderDetail` wiring; mobile row helpers.
- **Bun source-scan**: mobile percent suffix is outside NumberFlow; plan is not repeated under the email; settings sheet pins `All providers` and uses `LinearTransition`.
- **Lint cap**: root `package.json` `lint` stays `oxlint --max-warnings=455`. This change must not raise the warning count over that cap and must not edit the cap.
- **Playwright / agent-browser**: not required. The web popover change is a string and sort change covered by Bun tests. iOS Simulator capture is manual and owned outside CI.
- **Manual-only**: device screenshot of `26% used` and the provider-sheet move. Recorded as a gap, not a CI failure.

## Coverage map

| TECH item                                                                       | Scenario IDs |
| ------------------------------------------------------------------------------- | ------------ |
| Other Models percent-only when allowance cents are saturated                    | S1           |
| Other Models percent-only when cents ratio matches the percent                  | S2           |
| Legacy Included usage keeps dollars; On-Demand keeps dollars                    | S3           |
| Grok emits Account `Period` and no raw Billing period section                   | S4           |
| Client formatter rewrites ISO and leaves Factory / Zed strings                  | S5           |
| Mobile hides the Billing period section and shows the span under the account    | S6           |
| Mobile percent `%` is not a NumberFlow suffix and does not shrink               | S7           |
| Mobile does not repeat the plan under the email                                 | S8           |
| Switch list order matches the web aggregate comparator                          | S9           |
| `All providers` stays fixed; rows use `LinearTransition`; section does not clip | S10          |
| Web shows `periodLabel` for every provider and drops the Zed-only left block    | S11          |
| oxlint cap 455                                                                  | S12          |
| iOS Simulator screenshots                                                       | S13 (manual) |

## Execution map

`Status` stays `planned` until the named command has run. Update this table in the implementation commit.

| Scenario | Level     | Expected tool               | Target command / method                                                          | Fixture / data                                   | Signals                                                                                        | Status  |
| -------- | --------- | --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------- |
| S1       | Rust unit | `cargo test -p quota-usage` | `usage_summary_maps_cursor_and_other_model_pools` plus the 12% saturated fixture | `apiPercentUsed` 12, `used` 40000, `limit` 40000 | value contains `12% used`; value does not contain `$`                                          | planned |
| S2       | Rust unit | `cargo test -p quota-usage` | same module, matching-ratio case                                                 | `used` 4800, `limit` 40000, api 12               | no `$` on Other Models                                                                         | planned |
| S3       | Rust unit | `cargo test -p quota-usage` | `usage_summary_reads_membership_and_plan_buckets` and on-demand assertions       | no auto/api percents; on-demand cents            | Included `$20.00 / $20.00`; On-Demand still has `$`                                            | planned |
| S4       | Rust unit | `cargo test -p quota-usage` | Grok `map_credits_config` fixtures                                               | shared pool and omitted weekly RFC3339           | `Sep 4 - Sep 11`, `Sep 3 - Sep 10`; no section title `Billing period`                          | planned |
| S5       | Bun unit  | `bun test`                  | `packages/shared/src/utils/quota-billing-period.test.ts`                         | ISO range, Factory span, Zed arrow               | ISO becomes month-day; the other two strings are unchanged                                     | planned |
| S6       | Bun unit  | `bun test`                  | `apps/mobile/src/features/quota-usage/quota-rows.test.ts`                        | ISO section Start/End                            | period label `Sep 4 - Sep 11`; extra sections omit Billing period                              | planned |
| S7       | Bun scan  | `bun test`                  | mobile quota source scan                                                         | `QuotaUsageScreen.tsx`                           | `%` sibling text; `flexShrink: 0` on the readout; NumberFlow format has no `%`                 | planned |
| S8       | Bun scan  | `bun test`                  | same scan                                                                        | `QuotaUsageScreen.tsx`                           | one `heading.plan` (subtitle); expanded block has no second plan                               | planned |
| S9       | Bun unit  | `bun test`                  | `packages/shared` provider-order test                                            | enabled, switch, saved order, label              | detected first, enabled switch first, then order, then label                                   | planned |
| S10      | Bun scan  | `bun test`                  | mobile settings source scan                                                      | `QuotaSettingsScreen.tsx`                        | `title="All providers"` before the sorted map; `LinearTransition`; `clip={false}`              | planned |
| S11      | Bun unit  | `bun test`                  | `apps/web/src/app-shell/__tests__/quota-billing-period.test.ts`                  | Grok-like section, Zed period                    | `periodLabel` formatted; extra sections drop the section; detail source has no Zed-only branch | planned |
| S12      | Toolchain | shell                       | `bunx oxlint --max-warnings=455` and `package.json` script text                  | repo root                                        | command exits 0; script still `oxlint --max-warnings=455`                                      | planned |
| S13      | Manual    | iOS Simulator               | local capture by the developer                                                   | signed-in quota screen                           | not executed in this change                                                                    | planned |

## Scenarios

### S1 — Saturated allowance cents are not the Other Models dollars

- **Level**: Rust unit
- **Given**: a usage-summary payload with `apiPercentUsed: 12` and `plan.used == plan.limit == 40000`.
- **When**: `build_result_from_summary` builds the Other Models row.
- **Then**: the row value contains `12% used` and does not contain `$` or `$400`.
- **Signals**: row label `Other Models`, value string.

### S2 — A matching cents ratio still does not print dollars

- **Level**: Rust unit
- **Given**: `used` 4800 cents, `limit` 40000 cents, `apiPercentUsed` 12.
- **When**: the two-pool Other Models row is built.
- **Then**: the value is percent-only.
- **Signals**: absence of `$`.

### S3 — Legacy included usage and On-Demand keep real cents

- **Level**: Rust unit
- **Given**: a summary with no `autoPercentUsed` / `apiPercentUsed`, `used` 2000, `limit` 2000, plus an on-demand bucket with cents.
- **When**: the result is built.
- **Then**: Included usage contains `$20.00 / $20.00`. On-Demand still contains a dollar amount.
- **Signals**: row values.

### S4 — Grok period matches the Factory month-day span

- **Level**: Rust unit
- **Given**: shared-pool start `2026-09-04T22:17:47.739583+00:00` and end `2026-09-11…`, and the omitted weekly window `2026-09-03` … `2026-09-10`.
- **When**: `map_credits_config` runs.
- **Then**: Account `Period` is `Sep 4 - Sep 11` or `Sep 3 - Sep 10`. No section is titled `Billing period`.
- **Signals**: Account row value; section titles.

### S5 — Client formatter is UTC and conservative

- **Level**: Bun unit
- **Given**: `2026-09-04T22:17:47.739583+00:00 → 2026-09-11T22:17:47.739583+00:00`, `Sep 4 - Sep 11`, and `2026-03-16 → 2026-03-30`.
- **When**: `formatQuotaBillingPeriod` runs.
- **Then**: the ISO range becomes `Sep 4 - Sep 11`. The Factory string and the Zed date-only string are unchanged.
- **Signals**: return value.

### S6 — Mobile period label replaces the raw section

- **Level**: Bun unit
- **Given**: a provider whose only period data is a `Billing period` section with ISO Start and End.
- **When**: `billingPeriodLabel` and `extraSections` run.
- **Then**: the label is `Sep 4 - Sep 11` and extra sections do not include that title.
- **Signals**: helper return values.

### S7 — Percent suffix cannot be clipped by NumberFlow

- **Level**: Bun source-scan
- **Given**: `QuotaUsageScreen.tsx`.
- **When**: the scan runs.
- **Then**: the quota format callback does not include `%`; a sibling renders `%`; the readout style sets `flexShrink: 0`.
- **Signals**: source substrings.

### S8 — Plan is not repeated under the email

- **Level**: Bun source-scan
- **Given**: `QuotaUsageScreen.tsx`.
- **When**: the scan runs.
- **Then**: `heading.plan` appears once, as the collapsed subtitle. The expanded identity block does not render it again.
- **Signals**: source substrings.

### S9 — Switch list order

- **Level**: Bun unit
- **Given**: providers that differ by `enabled`, `switch_enabled`, saved order, and label.
- **When**: `sortQuotaProvidersForSwitchList` runs.
- **Then**: detected providers come first, switch-enabled before switch-disabled, then saved-order index, then `localeCompare`. An empty saved order leaves label order inside the group. Sort is stable for equal keys.
- **Signals**: id sequence.

### S10 — All providers stays put and rows animate

- **Level**: Bun source-scan
- **Given**: `QuotaSettingsScreen.tsx`.
- **When**: the scan runs.
- **Then**: `title="All providers"` appears before `sortQuotaProvidersForSwitchList`. The sorted rows sit in `Animated.View` with `LinearTransition`. The Providers section sets `clip={false}`.
- **Signals**: source substrings.

### S11 — Web period is under the account for every provider

- **Level**: Bun unit and source-scan
- **Given**: a provider with a `Billing period` section of ISO Start/End, and `ProviderDetail` source.
- **When**: `providerIdentity` and `extraSections` run, and the detail source is scanned.
- **Then**: `periodLabel` is the month-day span. Extra sections omit `Billing period`. `ProviderDetail` does not branch on `provider.id === "zed"` for the period.
- **Signals**: helper output and source substrings.

### S12 — Lint cap

- **Level**: Toolchain
- **Given**: the repo after this change.
- **When**: `bunx oxlint --max-warnings=455` runs, and `package.json` is read.
- **Then**: oxlint exits 0 and the script text is still `oxlint --max-warnings=455`.
- **Signals**: exit code and script string.

### S13 — Device capture

- **Level**: Manual
- **Given**: a signed-in mobile quota screen.
- **When**: the developer captures the simulator locally.
- **Then**: `26% used` is fully visible, the plan is not repeated under the email, and toggling a provider moves the row.
- **Signals**: screenshots kept outside the repo. Not a CI gate.

## Regression checklist

- Navbar `sortQuotaProvidersBySwitchAndOrder` tests still pass and are not retargeted at the new comparator.
- Cursor On-Demand and legacy Included rows still contain dollars.
- Factory period strings are not rewritten.
- English UI strings stay sentence case. `All providers` is not changed to all caps. Web `All Providers` copy is untouched.

## Acceptance criteria

- S1–S12 are `pass` with the commands in the execution map.
- S13 stays `planned` / manual.
- No force-push, no merge, and no `ios-parity` label are part of the change.

## Non-coverage

- Live Cursor HTTP. Tests use fixtures.
- iOS Simulator pixels (S13).
- Token-usage `NumberFlow` suffix behavior.
- A web client with a non-empty saved provider order versus mobile. Mobile intentionally passes `[]`.

## Coverage Status

Not run. Spec-only commit. The implementation commit fills this section after the commands above succeed.
