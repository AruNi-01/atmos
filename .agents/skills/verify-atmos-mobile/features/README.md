# Atmos mobile feature map

| Feature | Route | Test | Status |
| --- | --- | --- | --- |
| [Pairing / sign-in](pairing.md) | `/sign-in`, unpaired `/` | `tests/smoke.e2e.ts` | tested (unpaired screen only) |
| [Workspace list](workspaces.md) | `/` → `/workspace/<id>` | `tests/workspace.e2e.ts` | tested |
| [Agent chat](agent-chat.md) | `/workspace/<id>/chat/new` | `tests/agent-chat.e2e.ts` | tested |
| [Terminal](terminal.md) | `/workspace/<id>/terminal` | `tests/terminal.e2e.ts` | tested |
| Settings / computers / relay | `/settings/*` | — | untested |
| Create workspace | `/create-workspace` | — | untested |
| Token / quota usage | `/(home)/token-usage`, `/quota-settings` | — | untested |
