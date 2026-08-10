# Terminal / run

```bash
atmos terminal list [--workspace <guid>]
atmos terminal create --workspace <guid> [--name …] [--cwd …]
atmos terminal close --session <session-id>
atmos terminal destroy --session <session-id> --yes
atmos terminal candidates --workspace <guid>

atmos run start --project-root <path> --window-name <name> [--command …]
atmos run resolve-latest --project-root <path>
atmos run logs --project-root <path>
atmos run status --project-root <path>
```

Create is **headless** (no browser). Interactive PTY attach is not the primary CLI path.
