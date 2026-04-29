#!/usr/bin/env python3
"""
Validate wiki Markdown frontmatter.

Accept modern evidence-driven pages and legacy pages for compatibility, but prefer modern fields.
"""

import re
import sys
from pathlib import Path

MODERN_REQUIRED = ("page_id", "title", "kind", "audience", "sources", "evidence_refs", "updated_at")
LEGACY_REQUIRED = ("title", "section", "level", "path", "sources", "updated_at")
BODY_METADATA_PATTERNS = [
    (r">\s*\*\*Reading\s+Time", "Blockquote-style Reading Time"),
    (r">\s*\*\*Source\s+Files", "Blockquote-style Source Files"),
]


def parse_frontmatter(content: str) -> tuple[dict | None, str | None, str]:
    if not content.startswith("---"):
        return None, "File does not start with '---' (YAML frontmatter required)", content

    match = re.match(r"^---\s*\n(.*?)\n---\s*\n([\s\S]*)$", content, re.DOTALL)
    if not match:
        return None, "No complete YAML frontmatter block found", content

    raw = match.group(1)
    body = match.group(2)
    frontmatter: dict = {}
    current_array_key: str | None = None

    for line in raw.splitlines():
        if current_array_key and line.strip().startswith("-"):
            frontmatter.setdefault(current_array_key, []).append(line.strip()[1:].strip().strip("'\""))
            continue
        current_array_key = None
        key_match = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if not key_match:
            continue
        key, value = key_match.group(1), key_match.group(2).strip()
        if key in {"sources", "evidence_refs"} and value == "":
            frontmatter[key] = []
            current_array_key = key
            continue
        if value.startswith("[") and value.endswith("]"):
            items = [part.strip().strip("'\"") for part in value[1:-1].split(",") if part.strip()]
            frontmatter[key] = items
        else:
            frontmatter[key] = value.strip("'\"")

    return frontmatter, None, body


def validate_frontmatter(frontmatter: dict, body: str) -> list[str]:
    errors: list[str] = []
    is_modern = "page_id" in frontmatter or "evidence_refs" in frontmatter
    required = MODERN_REQUIRED if is_modern else LEGACY_REQUIRED

    for key in required:
        if key not in frontmatter or frontmatter[key] in ("", None):
            errors.append(f"Missing required key: '{key}'")

    for array_key in ("sources", "evidence_refs"):
        if array_key in frontmatter and not isinstance(frontmatter[array_key], list):
            errors.append(f"'{array_key}' must be a YAML array")

    for pattern, description in BODY_METADATA_PATTERNS:
        if re.search(pattern, body, re.IGNORECASE):
            errors.append(f"Forbidden in body: {description}")

    return errors


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate_frontmatter.py <wiki-directory>", file=sys.stderr)
        sys.exit(1)

    wiki_dir = Path(sys.argv[1])
    if not wiki_dir.is_dir():
        print(f"Error: Not a directory: {wiki_dir}", file=sys.stderr)
        sys.exit(1)

    failed: list[tuple[str, list[str]]] = []
    checked = 0

    for md_file in sorted(wiki_dir.rglob("*.md")):
        if md_file.name.startswith("_"):
            continue
        checked += 1
        content = md_file.read_text(encoding="utf-8")
        frontmatter, parse_error, body = parse_frontmatter(content)
        if parse_error:
            failed.append((str(md_file.relative_to(wiki_dir)), [parse_error]))
            continue
        assert frontmatter is not None
        errors = validate_frontmatter(frontmatter, body)
        if errors:
            failed.append((str(md_file.relative_to(wiki_dir)), errors))

    if not failed:
        print("✅ All wiki Markdown files have valid frontmatter.")
        print(f"   Checked {checked} file(s)")
        sys.exit(0)

    print(f"❌ Frontmatter validation failed ({len(failed)} file(s)):", file=sys.stderr)
    for path, errors in failed:
        print(f"  {path}:", file=sys.stderr)
        for error in errors:
            print(f"    - {error}", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
