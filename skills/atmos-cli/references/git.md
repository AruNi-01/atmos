# Git (via Atmos Server)

```bash
atmos git status --path <repo>
atmos git branches --path <repo>
atmos git log --path <repo> [--limit 20]
atmos git stage --path <repo> --files a.rs --files b.rs
atmos git unstage --path <repo> --files a.rs
atmos git commit --path <repo> --message "msg"
atmos git push|pull|fetch --path <repo>
```
