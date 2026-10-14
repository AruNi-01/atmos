# Selection Popover Design

> Add selection popover to Monaco Editor and DiffViewer for copying structured code context to AI Agent

## Overview

When users select text in the editor or diff viewer, a tooltip appears after mouse release. Clicking it expands a popover that copies structured Markdown (with file path and line numbers) to clipboard.

---

## Architecture

```
apps/web/src/
├── hooks/
│   └── use-selection-popover.ts    ← 核心 Hook
├── components/
│   └── selection/
│       └── SelectionPopover.tsx    ← UI 组件 (Tooltip + Popover)
├── components/editor/
│   └── MonacoEditor.tsx            ← 集成点
└── components/diff/
    └── DiffViewer.tsx              ← 集成点
```

---

## Data Structures

```ts
interface SelectionInfo {
  filePath: string;
  startLine: number;
  endLine: number;
  selectedText: string;
  // DiffViewer 专用
  changeType?: "addition" | "deletion" | "context";
  oldContent?: string;
  newContent?: string;
  oldLineRange?: { start: number; end: number };
  newLineRange?: { start: number; end: number };
}
```

---

## Hook Design

```ts
// hooks/use-selection-popover.ts

type GetSelectionInfoFn = () => SelectionInfo | null;

interface UseSelectionPopoverOptions {
  getSelectionInfo: GetSelectionInfoFn;
  containerRef: RefObject<HTMLElement>;
}

interface UseSelectionPopoverReturn {
  isVisible: boolean;
  position: { x: number; y: number };
  selectionInfo: SelectionInfo | null;
  isExpanded: boolean;
  setIsExpanded: (v: boolean) => void;
  copyToClipboard: (userMessage?: string) => void;
  dismiss: () => void;
}
```

### Core Logic

1. Listen to `mouseup` event → detect if there's a selection
2. Call `getSelectionInfo()` to get file path + line numbers
3. Calculate tooltip position (near the end of selection)
4. Click outside or press Esc → `dismiss()`
5. `copyToClipboard()` → format as Markdown and write to clipboard

### Monaco vs DiffViewer Differences

|               | Monaco                                | DiffViewer                                     |
| ------------- | ------------------------------------- | ---------------------------------------------- |
| Get Selection | `editor.getSelection()`               | `window.getSelection()` + traverse `data-line` |
| Get Text      | `editor.getModel().getValueInRange()` | `selection.toString()`                         |
| File Path     | `file.path` prop                      | `filePath` prop                                |

---

## UI Component Design

```tsx
interface SelectionPopoverProps {
  isVisible: boolean;
  position: { x: number; y: number };
  selectionInfo: SelectionInfo | null;
  isExpanded: boolean;
  onExpand: () => void;
  onCopy: (message?: string) => void;
  onDismiss: () => void;
}
```

### Two-Phase UI

```
Phase 1: Tooltip (default)      Phase 2: Popover (expanded)
┌──────┐                        ┌─────────────────────────┐
│  📋  │  ← click to expand     │ 📍 file.tsx:L25-L29     │
└──────┘                        ├─────────────────────────┤
                                │ [optional note...]       │
                                ├─────────────────────────┤
                                │ [✅ Copy for AI]         │
                                └─────────────────────────┘
```

### Interaction Details

- Click 📋 on tooltip → quick copy (no note)
- Click expand icon → show full popover
- Enter note in popover → copy with note
- Click outside / Esc → close

### UI Components Used

- `@workspace/ui`: Popover, PopoverContent, Button, Textarea

---

## Output Templates

### Monaco Editor Template

````markdown
## Code Snippet

- **File**: `src/pages/landing.tsx`
- **Lines**: L25-L29

```tsx
const t = useTranslations("landing");
const router = useRouter();
```
````

## Note

User input content...

````

### DiffViewer Template

```markdown
## Code Change
- **File**: `src/pages/landing.tsx`
- **Lines**: L25-L29

### Before
```tsx
const t = useTranslations("landing");
<div className="min-h-screen transition-colors">
````

### After

```tsx
<div className="min-h-screen">
```

## Note

User input content...

````

---

## DiffViewer Line Number Extraction

`@pierre/diffs` exposes line number information in its Shadow DOM:

```html
<div data-line="25" data-line-type="change-deletion" data-line-index="25,25">
  <span data-column-number=""><span data-line-number-content="">25</span></span>
  <span data-column-content="">...code content...</span>
</div>
````

**Key Attributes:**

| Attribute         | Meaning                                             |
| ----------------- | --------------------------------------------------- |
| `data-line`       | Original line number                                |
| `data-alt-line`   | Alternate side line number (only for context lines) |
| `data-line-type`  | `context` / `change-deletion` / `change-addition`   |
| `data-line-index` | Internal index `old,new`                            |

**Extraction Logic:**

1. Get selection via `window.getSelection()`
2. Traverse DOM nodes within the selection
3. Find parent elements with `data-line` attribute
4. Extract line numbers and change types

---

## Implementation Steps

1. **Create Hook**: `hooks/use-selection-popover.ts`
2. **Create UI Component**: `components/selection/SelectionPopover.tsx`
3. **Create Formatter**: `lib/format-selection-for-ai.ts`
4. **Integrate MonacoEditor**: Add `getSelectionInfo` callback
5. **Integrate DiffViewer**: Implement Shadow DOM line number parsing
6. **Testing**: Verify copy output for both scenarios

---

## Technical Decisions

| Decision                            | Choice                                 | Reason                                                          |
| ----------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| Line Number Extraction (DiffViewer) | Precise approach (data-line attribute) | @pierre/diffs exposes line numbers, enabling precise extraction |
| Output Format                       | Markdown                               | AI Agent friendly, human readable                               |
| Trigger Method                      | Tooltip → Popover                      | Simplicity first, expand on demand                              |
| Code Reuse                          | Shared Hook + UI                       | Monaco and DiffViewer share identical UI logic                  |
