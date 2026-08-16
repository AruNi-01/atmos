# Component Design

These rules apply primarily to Web/Desktop. Mobile component rules live in `mobile.md`.

## Buttons

Atmos buttons are compact and icon-led.

- Primary: `h-9`, `px-4`, `rounded-md`, `bg-primary`, `text-primary-foreground`, hover `primary/90`.
- Secondary: `bg-secondary`, `text-secondary-foreground`, hover `secondary/80`.
- Outline: border plus `bg-background`, hover `bg-accent`.
- Ghost: transparent base, hover `bg-accent`, muted text by default.
- Destructive: red background only for destructive confirmations.
- Icon button: `size-8` for header and sidebar toolbars, `size-9` for default icon actions, icon around 16px.
- Extra-small icon button: `size-6`, icon around 12px.

Rules:

- Put icons in high-frequency buttons.
- Text buttons are for clear commands, not toolbar primitives.
- Disabled buttons use `opacity-50` and no pointer events.
- Focus uses `ring-ring/50` with a 2-3px ring.

## Inputs And Forms

- Default input height: 36px.
- Border: `border-input`.
- Radius: `rounded-md`.
- Padding: `px-3 py-1`.
- Background: transparent in light mode, `input/30` in dark mode.
- Placeholder: `text-muted-foreground`.
- Error: `border-destructive` plus destructive ring tint.

Rules:

- Labels should be 11-12px and muted.
- Settings forms may breathe more; shell forms stay compact.
- Form rows should align labels and controls tightly, often using two-column rows.

## Cards And Panels

Cards are not the default page layout. They are for bounded objects.

Use cards for:

- repeated items;
- metadata groups;
- PR and action rows;
- dialogs and popovers;
- overview sections;
- empty states that need containment.

Do not use cards for:

- app shell sections;
- terminal, editor, diff, preview, or canvas wrappers;
- marketing-style feature blocks inside product UI;
- nested card-on-card structures.

Operational cards should usually be `rounded-md`, `border`, `bg-background` or `bg-muted/20`, and 12-16px padding.

## Tabs

Tabs are part of the workspace model.

- Center-stage tabs use an underline or flat style, height 40px, and no pill container.
- Active state may use `bg-muted/40` and foreground text.
- File, diff, review, and terminal tabs use small icons and truncated labels.
- Dirty files use a small dot, not a large warning badge.
- Fixed tabs can be icon-only with tooltip and shortcut hints.

Rules:

- Tabs must not resize vertically on hover.
- Tab labels truncate; they never wrap in the tab bar.
- Use color only for meaningful tab kind: diff green, review blue, conflict amber.

## Sidebar Rows

Sidebar rows are dense list controls.

- Height: usually 28-36px.
- Text: 11-13px.
- Icon: 14-16px.
- Active row: subtle background or left/bottom indicator.
- Hover: `bg-sidebar-accent/50` or `bg-accent`.
- Drag overlay: same row geometry with shadow and reduced opacity.

Rules:

- Project and workspace rows should be scannable at volume.
- Status, priority, and labels should appear as small metadata, not large cards.
- Do not use oversized avatars or thumbnail art in the sidebar.
- Hover fill is instant. Do not add `transition-colors` or other color fades to row backgrounds unless a shared primitive already owns the transition or the motion is expand / fade-in actions / layout. Override a delayed primitive hover with `transition-none`.

## Badges And Chips

- Badge radius: full.
- Padding: `2px 8px`.
- Font: 10-12px / 500.
- Use tinted status backgrounds for PR, CI, and diff state.
- Use outline badges for labels and secondary metadata.

Rules:

- Badges should never dominate row text.
- Use a small icon when it improves scanning.
- Avoid all caps unless the label is very short.

## Tooltips

- Background: foreground.
- Text: background.
- Radius: 8px.
- Padding: 6px 12px.
- Font: 12px.
- Include keyboard hints for discoverable global actions.

Rules:

- Every unfamiliar icon-only action needs a tooltip.
- Tooltips explain action, not implementation.

## Dialogs And Modals

- Overlay: `black/50`.
- Surface: `bg-background`, border, `rounded-lg`, soft large shadow.
- Default width follows content; settings may use a large two-column layout.
- Dialog close button is small, top-right, and low emphasis.

Rules:

- Use modals for configuration, destructive confirmation, and focused setup.
- Do not use modals for routine context inspection if the right sidebar can handle it.

## Terminal

Terminal is a first-class surface.

- Background: `#09090b`.
- Font: Hack Nerd Font Mono.
- Mosaic windows: no border, no shadow, no rounded decorative wrapper.
- Split handles: thin and subtle.
- Toolbar height: 34px.
- Inactive panes dim with overlay, not blur or CSS filter.
- Search panel may float with shadow and blur because it is temporary UI.

Rules:

- Terminal should feel native and uninterrupted.
- Terminal panes should not be wrapped in app cards.
- Agent indicators must be visible without stealing terminal focus.

## Canvas

Canvas is a full-surface spatial tool.

- Use tldraw's own visual grammar where possible.
- Atmos app controls live in tldraw slots, not in an external card frame.
- Toolbar buttons are flat, transparent, 32px high, with `foreground/10` hover.
- Save state can animate subtly, but the canvas must remain visually dominant.

Rules:

- Keep canvas chrome minimal.
- Do not add decorative backgrounds behind the board.
- Terminal pins should look like functional embedded tools, not stickers.

## Empty States

Empty states are compact and utilitarian.

- Use muted icon at low opacity.
- Title: 11-13px.
- Description: 10-12px, muted.
- Action: ghost or outline button unless it is the primary next step.
- Use dashed border only for lightweight empty containers.

Rules:

- Tell the user what will appear here.
- Provide the next action when obvious.
- Do not add marketing copy or illustrations.
