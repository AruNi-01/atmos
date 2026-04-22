#!/usr/bin/env python3
"""
Validate _todo.md for Project Wiki generation.
"""

import re
import sys
from pathlib import Path

REQUIRED_ITEMS = [
    "Git metadata collected",
    "AST artifacts loaded/verified",
    "Repository index created",
    "Concept graph created",
    "Page registry created",
    "Page plans created",
    "Evidence bundles created",
    "Coverage map created",
    "Final Markdown pages generated",
    "validate_page_registry passes",
    "validate_frontmatter passes",
    "validate_page_quality passes",
    "validate_todo passes",
    "Final verification complete",
]

CHECKED_PATTERN = re.compile(r"^-\s+\[[xX]\]\s+(.+)$")
UNCHECKED_PATTERN = re.compile(r"^-\s+\[\s*\]\s+(.+)$")


def validate(todo_path: Path) -> tuple[list[str], list[str]]:
    errors = []
    warnings = []

    if not todo_path.exists():
        errors.append(f"File not found: {todo_path}")
        return errors, warnings

    content = todo_path.read_text(encoding="utf-8")
    found_items: dict[str, bool] = {}

    for line in content.splitlines():
        m = CHECKED_PATTERN.match(line) or UNCHECKED_PATTERN.match(line)
        if m:
            found_items[m.group(1).strip()] = bool(CHECKED_PATTERN.match(line))

    alternate_items = {
        "AST artifacts loaded/verified": ["AST unavailable, degraded mode acknowledged"],
    }

    for item in REQUIRED_ITEMS:
        matched = False
        checked = False
        for found_text, is_checked in found_items.items():
            candidates = [item] + alternate_items.get(item, [])
            if any(candidate.lower() in found_text.lower() or found_text in candidate for candidate in candidates):
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
        return 1

    errors, warnings = validate(Path(sys.argv[1]))
    if not errors:
        print("✅ _todo.md is valid! All items checked.")
        for warning in warnings:
            print(f"  ⚠️  {warning}")
        return 0

    print(f"❌ _todo.md validation failed ({len(errors)} errors):", file=sys.stderr)
    for index, error in enumerate(errors, 1):
        print(f"  {index}. {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
