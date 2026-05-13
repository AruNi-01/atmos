# Keyboard Shortcuts & Overlay Focus

> **When to load**: Read this when implementing keyboard shortcuts, global hotkeys, or overlay focus management.

---

## Global/Workspace Shortcuts in Terminal

**Every Global/Workspace shortcut must work inside the terminal.** xterm.js uses a hidden `<textarea>` for input, so `react-hotkeys-hook` needs `enableOnFormTags: true` on all `useHotkeys` calls for shortcuts that should fire when the terminal is focused.

### Implementation Pattern

```tsx
useHotkeys(
  "mod+shift+h",
  handleToggleCanvas,
  { enableOnFormTags: true, preventDefault: true },
  [handleToggleCanvas],
);
```

**Key requirements:**
- `enableOnFormTags: true` — Required for terminal compatibility
- `preventDefault: true` — Prevent browser default behavior

---

## Opening Overlays from Terminal — Focus Capture Rule

**When a keyboard shortcut opens an overlay (popover, dialog, menu) while the terminal is focused, you MUST capture `document.activeElement` BEFORE the overlay opens, and restore focus to it on close.** Otherwise, the UI library will return focus to the trigger button — not the terminal input.

### Pattern: `useFocusRestore` hook

```tsx
// apps/web/src/hooks/use-focus-restore.ts
const { onCloseAutoFocusPrevent } = useFocusRestore(isOpen);
```

The hook:
- Captures `document.activeElement` when `open` → `true`
- Restores focus via `requestAnimationFrame` when `open` → `false` (deferred to let the UI library's cleanup run first)
- Returns `onCloseAutoFocusPrevent` to pass to Radix `PopoverContent` / `DialogContent`

### Per-Component Application

| Overlay Library | Pattern |
|----------------|---------|
| **Radix Popover** | Use `useFocusRestore`, pass `onCloseAutoFocusPrevent` to `PopoverContent` |
| **Radix Dialog** | Use `useFocusRestore`, pass `onCloseAutoFocusPrevent` to `DialogContent` |
| **Base UI Menu** | Capture in hotkey handler: `actionMenuFocusRef.current = document.activeElement` BEFORE `setIsOpen(true)`, then pass `finalFocus={actionMenuFocusRef}` to `MenuPanel` |
| **Custom overlay** | Manual: save `document.activeElement` in an effect/ref when overlay opens, restore in close handler |

> **Why Base UI Menu is different:** Its focus management runs synchronously during open, so `document.activeElement` changes before any effect can capture it. Capture must happen in the hotkey handler, before the state setter fires.

### Checklist for new keyboard-shortcut-driven overlays

- [ ] `useHotkeys` has `enableOnFormTags: true`
- [ ] Focus is captured before the overlay opens (not in `onOpenChange` callback)
- [ ] Focus is restored to the captured element on close
- [ ] Verify by opening the overlay from the terminal via keyboard shortcut, then pressing Esc — cursor should return to the terminal input

---

## SettingsModal Shortcut Documentation

**When adding a new global or workspace keyboard shortcut, you MUST update the SettingsModal shortcuts section.** This ensures users can discover all available shortcuts in one place.

### Implementation Steps

1. **Add the shortcut implementation** in the appropriate component (e.g., LeftSidebar.tsx)
2. **Add tooltip to UI element** (if applicable) showing the shortcut keys
3. **Update SettingsModal.tsx** in the shortcuts section under the appropriate group:
   - **Global** shortcuts: Application-wide shortcuts (sidebar toggles, search, etc.)
   - **Workspace** shortcuts: Workspace-related shortcuts (new workspace, kanban, presentation, etc.)
   - **Center Stage Tabs** shortcuts: Tab switching shortcuts
   - **Terminal** shortcuts: Terminal-specific shortcuts
   - **Editor** shortcuts: Editor-specific shortcuts
   - Other specialized groups as needed

### SettingsModal Update Pattern

```tsx
// In apps/web/src/components/dialogs/SettingsModal.tsx
<ShortcutGroup
  title="Workspace"
  shortcuts={[
    { keys: ['⌘', 'N'], description: 'New workspace overlay' },
    { keys: ['⌘', '⇧', 'H'], description: 'Toggle Presentation overlay' }, // New shortcut
    { keys: ['⌘', '⇧', 'K'], description: 'Expand Kanban overlay' },
    { keys: ['⌘', '⇧', '↵'], description: 'Open / create workspace (In new workspace overlay)' },
  ]}
/>
```

### Shortcut Key Format

- Use symbol characters: `⌘` (Command), `⇧` (Shift), `⌥` (Option), `⌃` (Control)
- Order: Modifier keys first, then the main key
- Examples:
  - `['⌘', 'N']` — Command + N
  - `['⌘', '⇧', 'H']` — Command + Shift + H
  - `['⌘', '⌥', 'D']` — Command + Option + D

### Checklist for new shortcuts

- [ ] Shortcut implementation with `enableOnFormTags: true` (if global/workspace)
- [ ] Tooltip added to UI element (if applicable)
- [ ] SettingsModal updated with shortcut entry
- [ ] Shortcut grouped correctly (Global/Workspace/Terminal/etc.)
- [ ] Key format uses proper symbols
- [ ] Description is clear and concise
- [ ] Terminal compatibility verified (for global/workspace shortcuts)
