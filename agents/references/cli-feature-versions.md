# CLI × Feature Version Compatibility

**When to load:** Shipping or changing any Desktop (or other host) feature that **depends on the Atmos CLI** (`atmos …` subcommands); packaging Desktop; Settings install/update gates for CLI-backed features; debugging “feature says install CLI” vs “About says CLI update available”.

---

## Core model

| Concept | Rule |
|---------|------|
| **Canonical CLI install** | One product path only: `~/.atmos/bin/atmos` (Windows: `%USERPROFILE%\.atmos\bin\atmos.exe`). ADR-005. |
| **Do not bundle the CLI binary** into Desktop / Local Runtime. Features **spawn** the canonical install. |
| **Release channel “latest CLI”** | Used by **About**, install scripts, API startup self-heal, `atmos update`. Optional user upgrade path. |
| **Feature-required CLI floor** | Used by **feature surfaces** (e.g. Desktop Use Settings, readiness). Pin **minimum** CLI version that this **app/package build** needs for that feature. |

**Do not** gate a feature on “there is a newer CLI on R2/GitHub”. That couples unrelated CLI releases to every feature entry.

**Do** gate a feature on:

1. CLI **not installed** → prompt **Install CLI**
2. CLI **installed but below package min** → prompt **Update CLI**
3. CLI **meets min** → allow the feature (even if channel latest is higher)

Product UI: use the term **Atmos CLI / CLI**. Do **not** show install paths (`~/.atmos/bin/…`) in C-end copy.

---

## Package pin (Desktop)

Authoritative pin for **this Desktop build**:

```text
App Resources/desktop-use/cli-requirement.json
```

Shape:

```json
{
  "schema_version": 1,
  "min_cli_version": "2026.8.7"
}
```

| Stage | Location |
|-------|----------|
| Monorepo source / default | `crates/desktop-use/manifest/cli-requirement.json` |
| Tracked Desktop fallback | `apps/desktop-electron/resources/desktop-use/cli-requirement.json` (committed; **packaging must not overwrite**) |
| Package time | `apps/desktop-electron/scripts/prepare-package.ts` writes pin from **`apps/cli/Cargo.toml` `version`** into gitignored `resources/desktop-use-stage/cli-requirement.json`. electron-builder `extraResources` copies that file to packaged `desktop-use/cli-requirement.json` and **excludes** the tracked pin from the `resources/desktop-use` copy (extraResources copies run in parallel) |
| Runtime resolve | `apps/desktop-electron/src/desktop-use/client.ts` → `resolveCliRequirementPath` / `readCliRequirement` / `enrichCliStatusWithRequirement` |

Engine pin remains separate: `desktop-use/engine-manifest.json` (control engine version, not CLI).

### When to bump the floor

Bump **min CLI** (and ship a new Desktop that embeds the new pin) when **any** of these change and the feature cannot work safely on older CLI:

- New or breaking `atmos <feature>` wire format / flags
- Desktop Use / Browser Use protocol that only exists in newer CLI
- Security or correctness fixes required before enabling the surface

If the CLI change is **unrelated** to that feature, **do not** raise the feature’s min (and do not force Settings prompts). Channel “latest” still surfaces in **About** only.

Today Desktop packaging derives min from `apps/cli/Cargo.toml` at package time so the shipped Desktop expects at least the monorepo CLI version at build. If you need a **lower** floor than the monorepo CLI version (rare), document it in the feature TECH and adjust prepare logic deliberately—default is “package-time CLI version”.

---

## Feature checklist (every new CLI-backed surface)

When adding or changing a feature that shells out to `atmos …` (or assumes CLI-side state):

1. **Document** the dependency in the feature TECH (min CLI semantics, not “always latest”).
2. **Pin** a package-level `min_cli_version` (reuse `cli-requirement.json` for Desktop-wide floor, or a feature-specific pin file under App Resources if floors diverge later).
3. **Probe before use** (no network for the gate):
   - installed?
   - `version >= min_cli_version`?
4. **UX when blocked**
   - Not installed → Install CLI (same install path as Settings: API `POST /api/system/cli-install` / install scripts).
   - Below min → Update CLI (same install installs channel latest, which should satisfy min).
   - Disable or soft-fail feature actions until OK; no raw `ENOENT` / spawn path spam in product UI.
5. **Do not** use `/api/system/cli-version-check` `update_available` (channel latest) as the **feature** gate. That API remains correct for **About** / optional updates.
6. **Copy**: product name **Atmos CLI**; no filesystem paths in user-facing strings.

### Reference implementation (Desktop Use)

| Concern | Where |
|---------|--------|
| Canonical path + probe + min floor | `apps/desktop-electron/src/desktop-use/client.ts` |
| IPC probe (includes `meets_requirement` / `update_required`) | `atmos_cli_probe` |
| Settings gate | `apps/web/.../DesktopUseSettingsSection.tsx` |
| Readiness reasons | `cli_not_installed`, `cli_update_required` in desktop-use readiness |
| Stage pin | `prepare-package.ts` → gitignored `resources/desktop-use-stage/cli-requirement.json` (extraResources copy; tracked pin excluded) |

---

## Two update prompts (do not merge)

```text
About
  → optional: channel latest > installed
  → user can stay on older CLI if all features still meet their mins

Feature settings / readiness (e.g. Desktop Use)
  → required: installed && version >= package min_cli_version
  → independent of whether channel has an even newer CLI
```

---

## Non-Desktop consumers

Same product rules apply if another host (Local Web Runtime UI, future shells) depends on CLI:

- Single install location: `~/.atmos/bin/atmos`
- Feature-owned **minimum** pin for that host build
- Gate: missing / too old → install or update before enable
- Optional global “latest” only in product About / `atmos update`

Install / self-heal remain centralized: `crates/runtime-manager` (`cli_update.rs`), `install-desktop.sh`, `install-local-web-runtime.sh`, API startup ensure.

---

## Anti-patterns

| Don’t | Do |
|-------|-----|
| Bundle `atmos` into App Resources as the feature runner | Canonical `~/.atmos/bin/atmos` only |
| Gate Desktop Use on R2 `cli/latest.json` | Gate on package `min_cli_version` |
| Show `~/.atmos/bin/...` in Settings errors | “Atmos CLI is not installed” / “needs a newer Atmos CLI” |
| Raise min on every monorepo CLI commit without product need | Bump min when the **feature** requires it (package pin reflects that) |
| Silent spawn ENOENT | Soft status + Install/Update CTA |

---

## Related

- ADR-005: [docs/adr/005-release-download-installation-architecture.md](../../docs/adr/005-release-download-installation-architecture.md)
- CLI crate: [apps/cli/AGENTS.md](../../apps/cli/AGENTS.md)
- Desktop packaging: [apps/desktop-electron/AGENTS.md](../../apps/desktop-electron/AGENTS.md)
- Runtime manager (install/update): [crates/runtime-manager/AGENTS.md](../../crates/runtime-manager/AGENTS.md)
- Desktop Use TECH: [specs/APP/APP-052_desktop-use/TECH.md](../../specs/APP/APP-052_desktop-use/TECH.md)
