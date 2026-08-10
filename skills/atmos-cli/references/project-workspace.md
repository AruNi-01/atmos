# Project / workspace / group / context

```bash
atmos context get|set|clear
atmos project list
atmos project validate-path --path <git-root>
atmos project create --name <name> --path <git-root>
atmos project update --id <guid> [--name …]
atmos project delete --id <guid> --yes
atmos project check-can-delete --id <guid>

atmos workspace list --project <guid>
atmos workspace create --project <guid> --name <name> --branch <branch>
atmos workspace update-name --id <guid> --name <name>
atmos workspace delete --id <guid> --yes
atmos workspace archive|unarchive|pin|unpin --id <guid>

atmos group list
atmos group create --name <name>
atmos group update --id <guid> --name <name>
atmos group delete --id <guid> --yes
```

`--project` / `--workspace` flags and env `ATMOS_PROJECT` / `ATMOS_WORKSPACE` override sticky context.
