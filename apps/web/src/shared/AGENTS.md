# Web Shared Code

This directory is for cross-feature web code only.

## Boundaries

- `components/` contains reusable rendering components that do not own business
  workflows.
- `hooks/` contains hooks that are not tied to one feature domain.
- `lib/` contains platform helpers and pure utilities. Avoid importing feature
  components or writing feature stores from here.
- `stores/` contains cross-feature preferences or state that truly spans the app.
- `types/` contains domain types shared by multiple features.

When a helper starts depending on one feature's API, store, or UI assumptions,
move it back under that feature instead of growing `shared/`.
