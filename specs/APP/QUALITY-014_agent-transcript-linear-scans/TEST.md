# TEST · QUALITY-014: Agent Transcript Linear Path Scans

> Test Plan · how we verify the linear scans match the old path/heading regular expressions and do not time out on long inputs. References TECH QUALITY-014.

## Test strategy

This is a pure-function cleanup. Proof is Bun unit tests on `@atmos/agent-transcript` plus the existing package/regression gates. There is no UI.

- Unit: `packages/agent-transcript/src/present.test.ts` compares public helpers to an independent oracle and to a fixture table taken from the old regular expressions.
- Regression: `bun --filter @atmos/agent-transcript test` and `apps/web` `parse-tool-result.test.ts` (already covers `toolTitleLooksLikePath` / `resolveAgentToolCardHeading`).
- Lint / format / types: `bun lint` (`--max-warnings=455`), `oxfmt` on changed files, `bun --filter @atmos/agent-transcript typecheck`.
- Exploratory agent-browser: omitted. No user-facing surface.

## Coverage map

| Requirement                                                             | Scenario IDs |
| ----------------------------------------------------------------------- | ------------ |
| M1. Duplicate slashes collapse like `/{2,}`                             | S1, S2, S6   |
| M2. Trailing slashes strip like `/+$`, root `"/"` kept                  | S1, S2, S6   |
| M3. Heading edge colons and space runs match the old three replacements | S3, S4, S6   |
| M4. Empty string, all-slash, multi-colon edges                          | S2, S4       |
| M5. Long pathological input does not time out                           | S5           |
| M6. `present.ts` no longer contains the three high patterns             | S7           |
| M7. Lint cap unchanged; package tests green                             | S8           |

## Execution map

| Scenario | Level     | Expected tool | Target command / method                                                      | Fixture / data                                                | Signals                                                         | Status  |
| -------- | --------- | ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- | ------- |
| S1       | Unit      | `bun test`    | `bun --filter @atmos/agent-transcript test src/present.test.ts`              | Path fixture table                                            | Each `normalizeFsPath` body equals the old-regex output         | planned |
| S2       | Unit      | `bun test`    | same                                                                         | `""`, `"/"`, `"////"`, `"foo///"`                             | Empty → `null`; all slashes → `"/"`; trailing slash stripped    | planned |
| S3       | Unit      | `bun test`    | same                                                                         | Heading fixture table                                         | `stripPathEchoFromToolHeading` equals old-regex heading cleanup | planned |
| S4       | Unit      | `bun test`    | same                                                                         | `":"`, `":::foo:::"`, `"  :  : foo"`                          | One colon per edge; leftover inner colons kept                  | planned |
| S5       | Unit      | `bun test`    | same                                                                         | 20_000 `/` and 20_000 spaces around `:`                       | Each scan < 250 ms                                              | planned |
| S6       | Unit      | `bun test`    | same                                                                         | Independent oracle (`replaceAll("//")`, `trimEnd`/`endsWith`) | Oracle and public API agree on the same tables                  | planned |
| S7       | Unit      | `bun test`    | same file reads `present.ts` source                                          | Source text                                                   | No `/{2,}`, `/+$`, or `\s*[:：]\s*` literals                    | planned |
| S8       | Toolchain | shell         | `bun lint`; package `typecheck`; `bun --filter @atmos/agent-transcript test` | Clean tree                                                    | lint exit 0 at cap 455; tests pass                              | planned |

## Scenarios

### S1 — Path fixture table matches the old slash regexes

- **Level**: Unit
- **Given**: the pre-fix body `value.replace(/\\/g, "/").replace(/\/{2,}/g, "/")` then `value.replace(/\/+$/, "")` unless `value === "/"`.
- **When**: `normalizeFsPath` runs on the locked path table (mixed `//`, `\\`, Windows drive, relative `./rel//path/`).
- **Then**: after the public `file://` / trim wrapper, the normalized string equals that body (or `null` when the body is empty).
- **Signals**: assertions in `present.test.ts`.

### S2 — Empty, root, and all-slash paths

- **Level**: Unit
- **Given**: `""`, `"   "`, `"/"`, `"//"`, `"////"`, `"foo/"`, `"foo///"`.
- **When**: `normalizeFsPath` runs.
- **Then**: blanks are `null`; `"/"`, `"//"`, `"////"` are `"/"`; `"foo/"` and `"foo///"` are `"foo"`.
- **Signals**: same file.

### S3 — Heading fixture table matches the old colon/space regexes

- **Level**: Unit
- **Given**: a heading that does not contain the dummy path, so only the edge-colon and space-run cleanup runs.
- **When**: `stripPathEchoFromToolHeading(heading, "__no_match__")` runs on the locked heading table.
- **Then**: the result equals `.replace(/\s*[:：]\s*$/g, "").replace(/^\s*[:：]\s*/g, "").replace(/\s{2,}/g, " ").trim()`.
- **Signals**: same file. The old patterns live only in the spec text, not in production or in the committed test source.

### S4 — Multiple colons and mixed whitespace

- **Level**: Unit
- **Given**: `":"`, `"::"`, `":::foo:::"`, `"  :  : foo"`, `"  ::  title  ::  "`, `"a\t\tb"`, `"Write：  "`.
- **When**: the heading cleanup runs.
- **Then**: one edge colon per side; `":::foo:::"` → `"::foo::"`; tab runs of length ≥ 2 become one space; fullwidth `：` counts.
- **Signals**: same file.

### S5 — Pathological input finishes quickly

- **Level**: Unit
- **Given**: `"/" × 20_000` and `" " × 20_000 + ":" + " " × 20_000`.
- **When**: `normalizeFsPath` and `stripPathEchoFromToolHeading` run.
- **Then**: each call returns (all slashes → `"/"`; spaces+colon → `""`) in under 250 ms.
- **Signals**: `performance.now()` budget in the same file.

### S6 — Independent oracle agrees

- **Level**: Unit
- **Given**: a second implementation that collapses slashes with `while (includes("//")) replaceAll("//")` and strips edge colons with `trimEnd`/`endsWith`.
- **When**: both the oracle and the public API run on the same tables.
- **Then**: every row matches.
- **Signals**: same file.

### S7 — Production source dropped the high patterns

- **Level**: Unit
- **Given**: `packages/agent-transcript/src/present.ts` as text.
- **When**: the test searches for the three CodeQL-high literals.
- **Then**: none of `/{2,}`, `/\\/+$/`, `\s*[:：]\s*` appear.
- **Signals**: source-text assertion.

### S8 — Lint cap and package tests

- **Level**: Toolchain
- **Given**: this branch on latest `main`.
- **When**: `bun lint`, package typecheck, and `bun --filter @atmos/agent-transcript test` run.
- **Then**: lint exits 0 with `--max-warnings=455` unchanged; tests pass.
- **Signals**: command exit codes.

## Performance & load budgets

- Each 20_000-character scan < 250 ms on the CI Linux runner class.

## Regression checklist

- [ ] `normalizeFsPath("/")` stays `"/"`.
- [ ] `file://` decoding still happens before slash collapse.
- [ ] `stripPathEchoFromToolHeading` still removes path aliases before colon cleanup (`resolveAgentToolCardHeading` omit-path cases).
- [ ] `toolTitleLooksLikePath("Tool: /abs/path", path)` stays true.
- [ ] `package.json` `lint` script remains `oxlint --max-warnings=455`.

## Exploratory agent-browser checks

Omitted. No browser surface.

## Acceptance criteria

- [ ] S1–S7 pass in `present.test.ts`.
- [ ] S8 `bun lint` does not raise the 455 cap.
- [ ] Draft PR CI is green except `ios-simulator` (skipped without `ios-parity`).
- [ ] CodeQL `Analyze (javascript-typescript)` is green.
- [ ] No #317 files other than this `present.ts` port and its tests.

## Manual verification steps

None. Simulator is not required.

## Non-coverage

- Visual Agent Chat rendering of the normalized strings (unchanged contract).
- CodeQL alerts outside `present.ts`.

## Coverage Status

> Filled after implementation by the test-run pass.
