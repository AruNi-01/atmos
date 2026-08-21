# SettingsModal Rules

Applies only when editing `../SettingsModal.tsx` and settings-specific subviews rendered inside it.

## Scope

- Treat Settings as a dense configuration console, not a marketing page or generic form stack.
- Reuse `SettingsSection`, `SettingsGroup`, `SettingsGroupCard`, `SettingsGroupRow`, and `SettingsToggleRow` before inventing a new layout.

## Page layout

- Do not render a page-level title or subtitle. The sidebar already names the item.
- When a sidebar item contains multiple large groups, split them with `SettingsPageTabs` (same pill tabs as Tasks) at the top-left. That header is tabs only. Do not stack those groups on one page.
- Tab labels reuse `settings.modal.sections.<group>.label`. Deep links keep using `#<group-id>` (`settings-section-<group-id>`).
- In-page section titles sit **outside** the muted group: `text-sm font-medium`, optional `text-xs` help, optional ghost action on the right.
- Related rows belong in `SettingsGroup` (`rounded-2xl bg-muted/40`). Do not put a second title+icon chrome inside the group.
- Stack remaining cards with `SettingsPageStack` (`space-y-8`).
- Do not nest cards inside cards.

## Rows

- Label and description on the left, control on the right.
- Title: `text-sm font-medium`. Description: `text-xs text-muted-foreground`.
- Row padding: `py-3`. Inset dividers (`border-border/60`), not full-bleed `divide-y`.
- Switch rows use `SettingsToggleRow`. Richer controls use `SettingsGroupRow` with `wide`.

## Collapse

- Short groups (a handful of rows) stay open. Long lists (agents, providers, labels, launchpad) may collapse.
- Collapse chrome is a quiet chevron on the section heading, not an icon that swaps on hover.
- Use `SettingsGroupCard` with `open` / `onOpenChange` for collapsible groups.

## Anchors and search

- Nested blocks that other flows deep-link into must set `id` so the DOM id is `settings-section-<anchor>` (via `SettingsSection` / `SettingsGroupCard`).
- Search keywords follow the current UI copy. Do not keep retired tab names as compatibility aliases.

## Sidebar

- Sidebar item icons use `size={16}` and `className="shrink-0"`.
- Animated icons use the `ref={iconRef}` hover pattern.
- Do not use CSS `size-4` for sidebar icons.

## When adding settings UI

- Match Appearance / Interface: heading outside, muted group, compact rows.
- Tool panels (Atmos Computer pairing, label manager, provider CRUD) keep their own controls but sit inside the same heading-plus-group frame.
