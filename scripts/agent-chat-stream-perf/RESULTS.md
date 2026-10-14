# Agent Chat Chromium stream bench (2026-10-13)

Run: `bun scripts/agent-chat-stream-perf/run.ts`

JSON lands in `scripts/agent-chat-stream-perf/tmp/` (gitignored). Override with `ATMOS_STREAM_PERF_OUTDIR`.

This directory is outside `apps/web`, so Next typecheck / production build never see it.

## Method

- Browser: Playwright Chromium (or `$ATMOS_STREAM_PERF_CHROME`). Recorded UA `HeadlessChrome/148.0.0.0`
- Fixture: 500 turns × 8 completed Read tools × 40 tokens on the last answer
- Renderer: product-shaped `@tanstack/react-virtual` list (overscan 8, `measureElement`, row estimates 88/240). Not the full Next `AgentChatMessageView` (no next-intl / Streamdown / tool chrome)
- Scroll FPS: rAF timestamps while scrolling the list from top to bottom over 2000ms
- Per-token: `React.Profiler` `onRender` `actualDuration` while appending 40 tokens
  - **main (unbatched)**: one React state update / Profiler sample per token. This is **not** production `main`, which already 150ms-batches client commits. The column isolates snapshot cadence against an unbatched token loop.
  - **this branch**: 56ms snapshot flush + `useSmoothStreamText` on the last open text
- Raw frame deltas and every Profiler commit: `scripts/agent-chat-stream-perf/tmp/agent-chat-chromium-stream-perf.json` (or `$ATMOS_STREAM_PERF_OUTDIR`)

## Results (real, this VM)

|                                       | unbatched per-token (`main` mode) | 56ms snapshots (`branch` mode) |
| ------------------------------------- | --------------------------------: | -----------------------------: |
| Scroll FPS                            |                            55.043 |                         55.003 |
| Frames                                |                               111 |                            110 |
| Frames > 16.67ms                      |                                72 |                             70 |
| Scroll duration                       |                         2008.9 ms |                      2003.8 ms |
| Scroll height                         |                         174204 px |                      174359 px |
| Profiler commits (40 tokens)          |                                81 |                             55 |
| Total `actualDuration`                |                           71.8 ms |                        43.7 ms |
| Mean commit                           |                          0.886 ms |                       0.795 ms |
| p50 commit                            |                            0.7 ms |                         0.6 ms |
| p95 commit                            |                            1.3 ms |                         2.5 ms |
| Per-token `actualDuration` (total/40) |                          1.795 ms |                       1.092 ms |

Scroll FPS is the same within noise (virtual list already exists on main). Token streaming cost dropped because this branch commits less often (81 → 55) and spends less total Profiler time (71.8 ms → 43.7 ms).
