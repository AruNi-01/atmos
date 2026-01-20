# Contributing to ATMOS

First off, thanks for taking the time to contribute!

## Development Verification

We use [Just](https://github.com/casey/just) to manage development tasks.

```bash
# Run linting
just lint

# Run tests
just test

# Format code
just fmt
```

## Pull Request Process

1.  Ensure all local tests pass.
2.  Update documentation if you change logic.
3.  Add a line to `CHANGELOG.md` describing your changes.

## Code Style

- **Frontend**: TypeScript, strict mode, no `any`. Component names in PascalCase.
- **Backend**: Rust, handle errors explicitly with `Result`.
- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/).

## Monorepo Workflow

- **Shared Packages**: If you modify `packages/*`, ensure dependent apps (`apps/*`) are updated.
- **Rust Crates**: Changes in `crates/*` generally require checking `apps/api` or `apps/cli`.
