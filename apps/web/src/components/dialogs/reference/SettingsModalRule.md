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

## Collapsible Headers

- Collapsible card headers should keep the primary icon visible at rest.
- The collapse chevron should only appear on hover/focus of the trigger, replacing the resting icon.
- Recommended pattern:
  - wrapper icon slot: `relative size-5`
  - resting icon: `absolute inset-0 transition-opacity duration-150 group-hover:opacity-0`
  - chevron: `absolute inset-0 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90`
- Do not leave the chevron always visible in card headers unless there is a deliberate exception.

## Spacing Consistency

- Between top-level cards in a settings section, use `space-y-4`.
- Inside cards, prefer `gap-8` between text and controls rather than stacking controls too tightly.
- Preserve the existing visual rhythm before introducing tighter or looser spacing.

## Interaction Tone

- Settings actions should feel precise and quiet.
- Avoid surprise motion, oversized hover states, or persistent action chrome.
- Hover-only affordances are acceptable when the resting state remains legible and discoverable.

## When Adding New Settings UI

- Reuse an existing Settings card pattern from `AI & Provider`, `Notify`, or `Code Agent` before inventing a new one.
- Match divider behavior to the content type:
  - single content block: full-width section divider is acceptable
  - repeated rows: inset row dividers
- If a new collapsible card is added, copy the existing hover-to-chevron behavior instead of inventing a new disclosure treatment.
