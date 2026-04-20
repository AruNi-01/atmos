#!/usr/bin/env python3
"""
Validate _todo.md for Project Wiki generation.

Checks:
1. File exists
2. All required checklist items are present
3. All items are checked [x] (not [ ])

Usage:
    python3 validate_todo.py <path-to-_todo.md>
    python3 validate_todo.py .atmos/wiki/_todo.md

Exit: 0 if valid, 1 if invalid.
"""

import re
import sys
from pathlib import Path

REQUIRED_ITEMS = [
    "Git metadata collected",
    "AST artifacts loaded/verified",
    "Deep codebase research done",
    "Core concepts extracted",
    "_catalog.json created (schema-compliant)",
    "validate_catalog passes",
    "_mindmap.md created",
    "Research briefings generated",
    "All Markdown articles generated",
    "validate_frontmatter passes",
    "validate_content passes",
    "validate_todo passes",
    "Final verification complete",
]

CHECKED_PATTERN = re.compile(r"^-\s+\[[xX]\]\s+(.+)$")
UNCHECKED_PATTERN = re.compile(r"^-\s+\[\s*\]\s+(.+)$")


def validate(todo_path: Path) -> tuple[list[str], list[str]]:
    """Returns (errors, warnings)."""
    errors = []
    warnings = []

    if not todo_path.exists():
        errors.append(f"File not found: {todo_path}")
        return errors, warnings

    content = todo_path.read_text(encoding="utf-8")
    lines = content.splitlines()

    found_items: dict[str, bool] = {}
    for line in lines:
        m = CHECKED_PATTERN.match(line) or UNCHECKED_PATTERN.match(line)
        if m:
            text = m.group(1).strip()
            found_items[text] = bool(CHECKED_PATTERN.match(line))

    for item in REQUIRED_ITEMS:
        matched = False
        checked = False
        for found_text, is_checked in found_items.items():
            if item.lower() in found_text.lower() or found_text in item:
                matched = True
                checked = is_checked
                break
        if not matched:
            errors.append(f"Missing checklist item: {item}")
        elif not checked:
            errors.append(f"Item not checked: {item}")

    return errors, warnings


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python3 validate_todo.py <path-to-_todo.md>", file=sys.stderr)
        print("Example: python3 validate_todo.py .atmos/wiki/_todo.md", file=sys.stderr)
        return 1

    todo_path = Path(sys.argv[1])
    errors, warnings = validate(todo_path)

    if not errors:
        print("✅ _todo.md is valid! All items checked.")
        if warnings:
            for w in warnings:
                print(f"  ⚠️  {w}")
        return 0

    print(f"❌ _todo.md validation failed ({len(errors)} errors):", file=sys.stderr)
    for i, e in enumerate(errors, 1):
        print(f"  {i}. {e}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
