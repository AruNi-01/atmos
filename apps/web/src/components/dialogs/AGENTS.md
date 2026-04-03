# Dialogs - AGENTS.md

This file is a routing index for dialog-specific guidance in this directory.

## Usage

- Do not load every dialog rule file by default.
- When editing a specific dialog, read only the matching rule file from `reference/` if it exists.
- If no matching rule file exists, follow the nearest parent instructions such as `../../AGENTS.md`.

## Rule Files

- `./SettingsModal.tsx`
  - Read `./reference/SettingsModalRule.md`

## Authoring Rule Files

- Keep `AGENTS.md` short and index-only.
- Put dialog-specific layout and interaction rules in `./reference/<DialogName>Rule.md`.
- Add a new entry here only when a dialog has enough UI or behavioral conventions to justify dedicated guidance.
