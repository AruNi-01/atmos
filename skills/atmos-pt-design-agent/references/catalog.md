# Catalog (on-demand)

Which wireframes exist and which props actually draw. Always call `pt_catalog_list` for `defaultBBox` / `propKeys` / `variants` / `defaultVariant` — this file is a reading aid, not a substitute.

Unknown keys are dropped (`PROP_IGNORED` on place).

---

## Place one instance

Omit `variant` → one instance. Overlay types use `trigger` (or `bar` / `collapsed`). Human catalog clicks may dump every variant; Agent `mode: "showcase"` does the same — do not use that on a page.

Overlay variants: `dialog`, `alert-dialog`, `sheet`, `drawer`, `popover`, `hover-card`, `tooltip`, `dropdown-menu`, `context-menu`, `navigation-menu`, `select`, `native-select`, `combobox`, `date-picker`, `command` → `trigger` \| `open`. `menubar` → `bar` \| `open`. `accordion` / `collapsible` → `collapsed` \| `expanded`.

Button: `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`. Badge: `default`, `secondary`, `outline`, `destructive`.

---

## Props that draw

| Type | Keys | Notes |
|------|------|--------|
| `button`, `badge`, `kbd`, `label` | `label` | Width grows with text (CJK counted wider than Latin) |
| `input`, `textarea` | `placeholder` | |
| `checkbox`, `switch` | `label`, `checked` | |
| `card` | `title`, `description`, `action` | defaultBBox 280×168 |
| `alert` | `title`, `description` | |
| `typography` | `title`, `description` | `size`: `xs`/`sm` compact, default, `lg`/`xl` hero |
| `accordion`, `collapsible` | `title`, `description` | Question + body. Do not expect hardcoded “Is it accessible?” |
| `tabs` | `title`, `description` | Comma-separated `title` → tab labels; `description` → panel |
| `breadcrumb` | `title` | Trail string |
| `sidebar` | `title` | Optional header; default items stay Home/Inbox/… |
| overlay (`dialog`, `sheet`, …) | `title`, `description`, `label` | `label` is the trigger |
| `avatar` | `fallback` | |
| `toggle` | `pressed` | |
| `attachment` | `label`, `description` | variants `image` / `uploading` / `file` |
| `bubble` | `label` | `received` / `sent` |
| `message` | `title`, `description` | `user` / `assistant` |
| `block.auth-form` | `title` | |
| `block.empty-state` | `title`, `description`, `action` | |
| `block.nav-content` | `title`, `description` | Hero heading + subtitle |
| `block.settings-shell` | `title` | |

Types not listed still place; they often only honor generic `label` / `title` / `description` if those keys are in `propKeys`. Check catalog.

---

## Typography

Hero titles need `size: "lg"` or `"xl"`. Default typography is a small 360×100 block — too small for a landing headline.

---

## CJK

Button/badge/kbd width uses a wider estimate for CJK / fullwidth glyphs. Long Chinese labels still clip on **fixed-width** cards; `pt_lint` reports `TEXT_CLIP`.

---

## Blocks

`block.auth-form`, `block.settings-shell`, `block.empty-state`, `block.nav-content` are starters, not live apps. Prefer them when the user asks for those shells; otherwise compose basics.
