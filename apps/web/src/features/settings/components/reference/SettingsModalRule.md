# SettingsModal Rules

Applies only when editing `../SettingsModal.tsx` and settings-specific subviews rendered inside it.

## Scope

- Treat Settings as a dense configuration console, not a marketing page or generic form stack.
- Reuse existing Settings patterns before inventing a new layout.

## Card Structure

- Use rounded cards: `overflow-hidden rounded-2xl border border-border`.
- A card with a title area should use `px-6 py-5` in the header.
- Header copy structure:
  - Title: `text-base font-medium text-foreground`
  - Description: `mt-2 text-sm leading-6 text-muted-foreground`

## Card Header Icons

- All card header icons must be visually consistent:
  - Size: `size-5` (via CSS class)
  - Color: inherit from parent (no `text-muted-foreground`), use bright foreground color
  - Hover: `transition-opacity duration-150 group-hover:opacity-0`
- Icon wrapper pattern: `relative size-5 shrink-0`
- Use semantic icons that represent the card's content (e.g. `Trash2` for deletion, `Package` for built-in, `UserCog` for custom, `Webhook` for webhooks, `Bot` for agents).
- Do not reuse the same icon for different cards within the same section.

## Collapsible Cards

- Cards with potentially long lists (e.g. agents, providers, servers) **must** be collapsible.
- Cards with a fixed, short set of rows (e.g. 4 toggle switches) may be static (non-collapsible).
- Collapsible card structure:
  - `Collapsible` wrapper with `open` / `onOpenChange` state, `className="overflow-hidden rounded-2xl border border-border"`
  - Header: `flex items-start justify-between gap-4 px-6 py-5`
  - Trigger: `CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left"`
  - Icon + chevron container inside trigger: `flex items-start gap-3`
  - Content: `CollapsibleContent` wrapping the row list
- Collapsible card headers should keep the primary icon visible at rest.
- The collapse chevron should only appear on hover/focus of the trigger, replacing the resting icon.
- Recommended pattern:
  - wrapper icon slot: `relative mt-0.5 size-5 shrink-0`
  - resting icon: `absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0`
  - chevron: `absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90`
- Do not leave the chevron always visible in card headers unless there is a deliberate exception.
- For sub-cards inside a collapsible section (e.g. Provider, Routing under AI & Provider), follow the same icon/spacing pattern as top-level collapsible cards.

## Divider Rules

- Only the divider between a card header and its content should span the full card width.
  - Pattern: direct child wrapper like `border-t border-border`.
- Dividers between list rows inside a card must be inset from both sides.
  - Preferred pattern:
    - outer list wrapper: `border-t border-border px-4`
    - each row: `border-b border-border px-2 py-4 last:border-b-0`
- Do not use full-width `divide-y` for settings row lists unless the design explicitly calls for edge-to-edge rows.
- Empty states and expanded detail blocks may use a full-width top divider when they are a single content region, not a multi-row list.

## Row Layout

- Standard settings rows should use a two-column grid:
  - `grid grid-cols-[minmax(0,1fr)_100px] gap-8` for switch rows
  - `grid grid-cols-[minmax(0,1fr)_320px] gap-8` for richer controls
- Keep labels and descriptions left-aligned, controls right-aligned.
- Use `text-sm` for row titles and `text-xs text-muted-foreground` for row descriptions.

## Spacing Consistency

- Between top-level cards in a settings section, use `space-y-4`.
- Inside cards, prefer `gap-8` between text and controls rather than stacking controls too tightly.
- Preserve the existing visual rhythm before introducing tighter or looser spacing.

## Interaction Tone

- Settings actions should feel precise and quiet.
- Avoid surprise motion, oversized hover states, or persistent action chrome.
- Hover-only affordances are acceptable when the resting state remains legible and discoverable.

## Sidebar Icons

- All sidebar item icons must use the same size: pass `size={16}` prop and `className="shrink-0"`.
- Animated icons (from lucide-animated) are preferred — use the `ref={iconRef}` pattern with `onMouseEnter`/`onMouseLeave` for hover animation.
- Do NOT use CSS `size-4` class for sidebar icons — some icon components have inline `width`/`height` attributes that override CSS. Always use the `size` prop.

## When Adding New Settings UI

- Reuse an existing Settings card pattern from `AI & Provider`, `Notify`, or `Code Agent` before inventing a new one.
- Match divider behavior to the content type:
  - single content block: full-width section divider is acceptable
  - repeated rows: inset row dividers
- If a new collapsible card is added, copy the existing hover-to-chevron behavior instead of inventing a new disclosure treatment.
