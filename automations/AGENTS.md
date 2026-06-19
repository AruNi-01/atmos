# Automations Agent Guide

This directory contains repository-owned automation instructions and automation run artifacts. Agents should treat each leaf directory as one automation workflow.

## Layout

```text
automations/
├── review/
│   ├── quality/
│   │   ├── INSTRUCTION.md
│   │   ├── HUMAN.md
│   │   ├── references/
│   │   └── result/YYYY-MM/
│   └── comment-fix/
│       ├── INSTRUCTION.md
│       ├── HUMAN.md
│       ├── references/
│       └── result/YYYY-MM-DD/
```

## Rules

- Read the workflow-specific `INSTRUCTION.md` before running or editing an automation.
- Keep automation instructions in `INSTRUCTION.md`; the directory name identifies the automation.
- Treat `HUMAN.md` as operator setup documentation, not runtime instructions, unless the user asks about configuration.
- Treat `references/` files as progressive-disclosure instructions. Load only the reference files named by `INSTRUCTION.md` for the current phase or condition.
- Write run reports only to that workflow's `result/` tree, following the path and filename rules from the loaded `INSTRUCTION.md` and `references/` files.
- Do not rewrite historical result files unless the user explicitly asks for history migration or correction.
- Do not create broad category folders such as `code/` when a narrower workflow domain exists.

## Review Automations

- `review/quality/INSTRUCTION.md` runs the daily main-branch code quality review and writes daily reports under `review/quality/result/YYYY-MM/`.
- `review/comment-fix/INSTRUCTION.md` responds to trusted GitHub review-agent comments and writes event-driven reports under `review/comment-fix/result/YYYY-MM-DD/`.

When configuring Atmos App automations, point the automation instructions at the workflow-specific `INSTRUCTION.md`, not this guide.
