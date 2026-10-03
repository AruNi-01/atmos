# SettingsModal Rules

Applies only when editing `../SettingsModal.tsx` and settings-specific subviews rendered inside it.

## Scope

- Treat Settings as a dense configuration console, not a marketing page or generic form stack.
- Reuse `SettingsSection`, `SettingsGroup`, `SettingsGroupCard`, `SettingsGroupRow`, and `SettingsToggleRow` before inventing a new layout.

## Page layout

- Do not render a page-level title or subtitle. The sidebar already names the item.
- When a sidebar item contains multiple large groups, split them with `SettingsPageTabs` (same pill tabs as Tasks) at the top-left. That header is tabs only. Do not stack those groups on one page. General is the exception: Appearance, About, and Experiments stay on one page as non-collapsible groups. Canvas is its own sidebar item directly under Editor, not an Editor tab. Integrations, Browser, and Desktop Use are separate sidebar items. There is no Apps item.
- Tab labels reuse `settings.modal.sections.<group>.label`. Deep links keep using `#<group-id>` (`settings-section-<group-id>`).
- In-page section titles sit **outside** the muted group: `text-sm font-medium text-foreground`, optional ghost action on the right. Do not render a description under the title.
- Related rows belong in `SettingsGroup` (`rounded-2xl bg-muted/40`). Do not put a second title+icon chrome inside the group.
- Stack remaining cards with `SettingsPageStack` (`space-y-8`).
- Do not nest cards inside cards.
- The sidebar list and the settings body each scroll in `@workspace/ui` `ScrollArea` with `scrollFade`. Keep the back button, search field, and group tabs outside those scroll areas.

## Rows

- Label and description on the left, control on the right.
- Title: `text-sm font-medium`. Description: `text-xs text-muted-foreground`.
- Row padding: `py-3`. Inset dividers (`border-border/60`), not full-bleed `divide-y`.
- Switch rows use `SettingsToggleRow`. Richer controls use `SettingsGroupRow` with `wide`.

## Collapse

- Short groups (a handful of rows) stay open. Long lists (agents, providers, labels, launchpad) may collapse.
- Collapsible headings show the title only. Do not render the description under that title.
- A collapsed title stays `text-muted-foreground` and turns foreground on hover. An expanded title uses the same `text-foreground` as a static group title.
- The collapse chevron sits on the far left, immediately before the title. It stays visible; it does not swap on hover.
- Use `SettingsGroupCard` with `open` / `onOpenChange` for collapsible groups. Nested collapsible rows use the same chevron-then-title order and omit the subtitle.

## Anchors and search

- Nested blocks that other flows deep-link into must set `id` so the DOM id is `settings-section-<anchor>` (via `SettingsSection` / `SettingsGroupCard`).
- Search keywords follow the current UI copy. Do not keep retired tab names as compatibility aliases.

## Sidebar

- Sidebar item icons use `size={16}` and `className="shrink-0"`.
- Animated icons use the `ref={iconRef}` hover pattern.
- Do not use CSS `size-4` for sidebar icons.

## Privacy (macOS permissions)

- Settings → Privacy lists **every OS permission Atmos uses**, as separate identities: Atmos.app (host shortcuts, AppShot fallback) and Atmos Desktop Use (capture / control / dual-shift host).
- Grant is the drag-to-list overlay that opens System Settings — not the boot-time Accessibility lock dialog. Do not add `isTrustedAccessibilityClient(true)` from Settings or from first-use flows.

## When adding settings UI

- Match Appearance / Interface: heading outside, muted group, compact rows.
- Tool panels (Atmos Computer pairing, label manager, provider CRUD) keep their own controls but sit inside the same heading-plus-group frame.
