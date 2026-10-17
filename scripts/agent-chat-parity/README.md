# Agent chat parity compare

Structural gate for the committed parity fixtures. No network, no Computer, and no browser.

```bash
bun scripts/agent-chat-parity/compare.ts
```

The script loads `packages/agent-transcript/fixtures/parity/F*.json`, builds `projectParityTree` with default expand, and diffs `expected/<id>.tree.json`. Exit 0 when every tree matches. Exit 1 prints a path diff.

`compareFixtures()` is the same check without exiting, for `bun test`.
