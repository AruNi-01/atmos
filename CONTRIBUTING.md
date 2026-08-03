# Contributing to ATMOS

First off, thanks for taking the time to contribute!

## Development Verification

[Just](https://github.com/casey/just) is an optional task runner. Prefer `bun` / `cargo` when documenting commands that must work without Just:

```bash
# Lint
bun lint
cargo clippy --workspace

# Test
bun test
cargo test --workspace

# Format
cargo fmt --all
```

## Git Hooks (Husky)

After `bun install`, [Husky](https://typicode.github.io/husky/) installs local Git hooks under `.husky/`. Hooks stay **light** (not full CI, no `just`):

| Hook | What it does |
|------|----------------|
| `pre-commit` | `lint-staged`: `cargo fmt` on staged `*.rs`; package-boundary check when `packages/shared` TS changes |
| `commit-msg` | Require a [Conventional Commits](https://www.conventionalcommits.org/) subject line |

Examples:

```text
feat(web): add github issues sidebar
fix(hooks): defer lead idle until child agents finish
chore: bump desktop electron version
```

Emergency skip (sparingly): `git commit --no-verify`.

Full lint / typecheck / test still run in CI (`bun lint`, `bun run typecheck`, `cargo test`, etc.).

## Pull Request Process

1. Ensure all local tests pass.
2. Update documentation if you change logic.
3. Add a line to `CHANGELOG.md` describing your changes.
4. Use the PR template and include validation commands/results.

## Code Style

- **Frontend**: TypeScript, strict mode, no `any`. Component names in PascalCase.
- **Backend**: Rust, handle errors explicitly with `Result`.
- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/). Enforced by the `commit-msg` hook.

## Monorepo Workflow

- **Shared Packages**: If you modify `packages/*`, ensure dependent apps (`apps/*`) are updated.
- **Rust Crates**: Changes in `crates/*` generally require checking `apps/api` or `apps/cli`.

## Community Standards

By participating, you agree to follow:

- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)

## Finding Work to Contribute

Look for issues labeled:

- `good first issue`: beginner-friendly tasks
- `help wanted`: community support requested
- `needs-triage`: new reports awaiting maintainer review
