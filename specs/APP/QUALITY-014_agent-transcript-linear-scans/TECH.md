# TECH · QUALITY-014: Agent Transcript Linear Path Scans

> Technical Design · HOW. Replace three CodeQL-high polynomial regular expressions in `@atmos/agent-transcript` with linear scans. Port only the `present.ts` fix (and its tests) from PR #317 commit `2b1f66b82`. Not a product feature.

## Scope summary

CodeQL `js/polynomial-redos` reported three high alerts in `packages/agent-transcript/src/present.ts`. The patterns are still on `main`. They normalize filesystem paths and tool headings:

1. Collapse repeated `/` after turning `\` into `/` (`/{2,}`).
2. Strip trailing `/` except the root path (`/+$`).
3. Strip one leading and one trailing `:` / `：` with surrounding whitespace, then collapse runs of two or more whitespace characters (`\s*[:：]\s*` and `\s{2,}`).

This spec ports the linear-scan replacement from #317 `2b1f66b82` and adds unit tests that lock behavior to the old regular expressions. It does **not** take any other #317 files (mobile scroll, capture hooks, APP-081 UI).

Out of scope:

- Other regexes in `present.ts` that CodeQL did not mark high (`READ_LINE_*`, `pathRelativeToCwd`'s `^/+`, tree-entry `/[/\\]+$`).
- Web or mobile presentation UI.
- Raising `oxlint --max-warnings` above 455.

## Quality target

| Item                             | Before                                                                                      | After                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Duplicate slashes                | `.replace(/\/{2,}/g, "/")`                                                                  | One-pass `collapseDuplicateSlashes`                                                        |
| Trailing slashes                 | `.replace(/\/+$/, "")` when value is not `"/"`                                              | `stripTrailingSlashes` by `charCodeAt === 47`                                              |
| Heading edge colons + space runs | `.replace(/\s*[:：]\s*$/g, "").replace(/^\s*[:：]\s*/g, "").replace(/\s{2,}/g, " ").trim()` | `collapseSpaceRuns(stripEdgeColons(value)).trim()`                                         |
| `toolTitleLooksLikePath` prefix  | `/^(?:tool\|…):\s*(.*)$/i` plus `/[:\s/]/` on the previous character                        | Prefix match without a greedy `\s*(.*)$`; previous character is `:`, `/`, or Unicode space |
| Public results                   | `normalizeFsPath`, `stripPathEchoFromToolHeading`, `toolTitleLooksLikePath`                 | Same outputs as the old patterns on the locked fixtures                                    |

## Architecture overview

```
packages/agent-transcript/src/present.ts
        │
        ├── normalizeFsPath          → collapseDuplicateSlashes + stripTrailingSlashes
        ├── stripPathEchoFromToolHeading → stripEdgeColons + collapseSpaceRuns
        └── toolTitleLooksLikePath   → prefix slice + single previous-character test

apps/web, apps/mobile import the same helpers (no UI change).
```

No crate, WebSocket, REST, or schema change.

## Module-by-module design

### `packages/agent-transcript/src/present.ts`

Helpers stay file-private. They are not exported.

```ts
function collapseDuplicateSlashes(value: string): string;
function stripTrailingSlashes(value: string): string;
function isUnicodeSpace(char: string): boolean;
function stripEdgeColons(value: string): string; // one trailing \s*[:：]\s* and one leading \s*[:：]\s*
function collapseSpaceRuns(value: string): string; // a run of length ≥ 2 becomes one ASCII space; a single whitespace char is kept
```

`normalizeFsPath` still trims, strips `file://`, then:

```ts
value = collapseDuplicateSlashes(value.replaceAll("\\", "/"));
if (value !== "/") value = stripTrailingSlashes(value);
return value || null;
```

Root `"/"` is kept. All-slash inputs collapse to `"/"` and stay `"/"`.

`stripPathEchoFromToolHeading` still removes path aliases, then:

```ts
return collapseSpaceRuns(stripEdgeColons(result)).trim();
```

Only one colon is removed from each edge. `":::foo:::"` becomes `"::foo::"`.

`toolTitleLooksLikePath` is in the same #317 hunk because `\s*(.*)$` is another overlapping quantifier. Keep that hunk so this PR's CodeQL surface matches the known-green commit.

### Tests

`packages/agent-transcript/src/present.test.ts` (new). Public APIs only. An independent oracle (repeated `replaceAll("//", "/")` / `trimEnd`+`endsWith` colon strip) plus a fixture table generated from the old regular expressions. Pathological inputs of length 20_000 must finish well under one second.

## Data model

No new types, tables, or wire fields.

## Transport

None. Not WebSocket. Not REST.

## Security & permissions

The scans are display normalization, not access control. Linear time removes a ReDoS vector on attacker-controlled tool titles and paths that already reach the renderer.

## Rollout plan

1. Add this spec and the `specs/README.md` QUALITY-014 row.
2. Replace the three production patterns (and the `toolTitleLooksLikePath` prefix) with the #317 helpers.
3. Add `present.test.ts` equivalence + timeout cases.
4. Draft PR from latest `main`. Do not merge. Do not mark ready. `ios-simulator` stays skipped unless the `ios-parity` label is present.

## Risks & tradeoffs

- **Risk**: a Unicode edge where `char.trim() === ""` and JS `\s` disagree. The fixture table includes tab runs and mixed space/tab. If a new character class appears, add a row rather than bringing the regex back.
- **Tradeoff**: helpers stay unexported. Tests go through `normalizeFsPath` and `stripPathEchoFromToolHeading` so the production wrappers cannot drift.
- **Tradeoff**: `toolTitleLooksLikePath` is a fourth regex cleanup in the same file. It is required to match `2b1f66b82`; it is not a new product rule.
- **If this breaks in production**: revert the file. Call sites already treat `null` and empty headings.

## Dependencies & compatibility

- Depends on: none. QUALITY-010/011/012/013 are other work and must not be reused as this spec id.
- Blocks: none.
- Reference: PR #317, branch `aarynlu/tail-scroll-capture-a689`, commit `2b1f66b82a82d2fceb6fa3a24296eb950c8515d2`.
- Lint cap stays `oxlint --max-warnings=455`.

## Open questions

None. Behavior is locked to the old regular expressions.
