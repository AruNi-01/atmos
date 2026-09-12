# atmos automation CLI

Thin invoke client. JSON envelope only. Requires a running Atmos Server.

```text
atmos automation paths --run <run_guid>
atmos automation status --run <run_guid>
atmos automation complete --run <run_guid>
atmos automation complete --run <run_guid> --failed --message "<short reason>"
atmos automation run --id <automation_guid>
```

Wire actions: `automation_run_paths`, `automation_run_get`, `automation_run_complete`, `automation_run_now`.

`complete` without `--failed` requires a non-empty `final.md` at `result_path`.
`--failed` does not require `final.md`.
`complete` / `paths` never kill the live Terminal or Chat tab.
