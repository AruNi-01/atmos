#!/usr/bin/env python3
"""
Validate YAML frontmatter format of Project Wiki Markdown files.

Every .md file MUST:
1. Start with --- on the first line
2. Have a complete YAML block between first --- and second ---
3. Include required keys: title, section, level, reading_time, path, sources, updated_at
4. Have sources as a YAML array (list), not a string
5. NOT contain blockquote-style metadata (> **Reading Time:** etc.) in the body

Usage:
    python3 validate_frontmatter.py <wiki-directory>

Example:
    python3 validate_frontmatter.py .atmos/wiki/

Exit: 0 if all valid, 1 if any file fails.
"""

import re
import sys
from pathlib import Path

REQUIRED_KEYS = ("title", "section", "level", "reading_time", "path", "sources", "updated_at")
VALID_SECTIONS = {"getting-started", "deep-dive", "specify-wiki"}
VALID_LEVELS = {"beginner", "intermediate", "advanced"}

# Patterns that indicate incorrect metadata in body (forbidden)
BODY_METADATA_PATTERNS = [
    (r">\s*\*\*Reading\s+Time", "Blockquote-style Reading Time (use YAML frontmatter)"),
    (r">\s*\*\*Source\s+Files", "Blockquote-style Source Files (use YAML frontmatter)"),
    (r">\s*\*\*Level", "Blockquote-style Level (use YAML frontmatter)"),
    (r"^\s*Reading\s+Time:\s*\d+", "Inline Reading Time (use YAML frontmatter)"),
    (r"^\s*Level\s*:\s*\w+", "Inline Level (use YAML frontmatter)"),
]


def parse_frontmatter(content: str) -> tuple[dict | None, str | None, str]:
    """
    Extract YAML frontmatter and body. Returns (frontmatter_dict, error_msg, body).
    If error_msg is not None, frontmatter_dict may be partial.
    """
    if not content.startswith("---"):
        return None, "File does not start with '---' (YAML frontmatter required)", content

    parts = content.split("\n", 1)
    if len(parts) < 2:
        return None, "Incomplete frontmatter (no content after first ---)", content

    rest = parts[1]
    match = re.match(r"^(.*?)^---\s*$", rest, re.MULTILINE | re.DOTALL)
    if not match:
        return None, "No closing '---' for YAML frontmatter block", rest

    yaml_block = match.group(1).strip()
    body = rest[match.end() :].lstrip("\n")

    # Simple YAML parsing (no PyYAML dependency). Supports:
    # - plain / quoted single-line scalars
    # - folded block scalars: >, >-, >+
    # - literal block scalars: |, |-, |+
    # - sources lists (inline or multi-line)
    frontmatter: dict = {}
    lines = yaml_block.split("\n")
    i = 0
    block_indicators = {">", ">-", ">+", "|", "|-", "|+"}

    while i < len(lines):
        line = lines[i]
        colon_idx = line.find(":")
        if colon_idx <= 0 or line[:colon_idx].strip().startswith("-"):
            i += 1
            continue

        key = line[:colon_idx].strip()
        val = line[colon_idx + 1 :].strip()

        if key == "sources":
            sources: list[str] = []
            if val and val != "[]":
                for m in re.finditer(r"['\"]?([^,\]\s]+)['\"]?", val):
                    s = m.group(1).strip("'\"")
                    if s and s not in ("[", "]"):
                        sources.append(s)
                frontmatter["sources"] = sources
                i += 1
                continue

            # Multi-line list under sources:
            j = i + 1
            while j < len(lines):
                item_line = lines[j]
                stripped = item_line.strip()
                if stripped.startswith("-"):
                    sources.append(stripped[1:].strip().strip("'\""))
                    j += 1
                else:
                    break
            frontmatter["sources"] = sources
            i = j
            continue

        if val in block_indicators:
            folded = val.startswith(">")
            collected: list[str] = []
            j = i + 1
            while j < len(lines):
                cont = lines[j]
                # Block content is indented or blank; next top-level key ends it.
                if cont == "" or cont.startswith(" ") or cont.startswith("\t"):
                    collected.append(cont.strip())
                    j += 1
                else:
                    break
            if folded:
                joined = " ".join(s for s in collected if s)
            else:
                joined = "\n".join(collected).strip()
            if joined:
                frontmatter[key] = joined
            i = j
            continue

        if val.startswith("'") and val.endswith("'"):
            val = val[1:-1]
        elif val.startswith('"') and val.endswith('"'):
            val = val[1:-1]
        frontmatter[key] = val
        i += 1

    return frontmatter, None, body


def validate_frontmatter(fm: dict, body: str, path: str) -> list[str]:
    """Validate frontmatter and body. Returns list of error messages."""
    errors: list[str] = []

    for key in REQUIRED_KEYS:
        if key not in fm:
            errors.append(f"Missing required key: '{key}'")
        elif fm[key] is None or fm[key] == "":
            errors.append(f"Empty value for required key: '{key}'")

    if "section" in fm and fm["section"] not in VALID_SECTIONS:
        errors.append(f"Invalid section: '{fm['section']}' (expected: getting-started, deep-dive, specify-wiki)")

    if "level" in fm and fm["level"] not in VALID_LEVELS:
        errors.append(
            f"Invalid level: '{fm['level']}' (expected: beginner, intermediate, advanced)"
        )

    if "sources" in fm:
        if not isinstance(fm["sources"], list):
            errors.append(f"'sources' must be a YAML array (hyphen-prefixed list), got: {type(fm['sources'])}")

    if "reading_time" in fm:
        try:
            n = int(fm["reading_time"])
            if n < 1 or n > 60:
                errors.append(f"'reading_time' must be 1-60, got: {n}")
        except (TypeError, ValueError):
            errors.append(f"'reading_time' must be an integer, got: {fm['reading_time']!r}")

    # Check body for forbidden metadata patterns
    for pattern, desc in BODY_METADATA_PATTERNS:
        if re.search(pattern, body, re.IGNORECASE):
            errors.append(f"Forbidden in body: {desc}")

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
        # Skip _mindmap.md — it has no frontmatter requirement (plain Mermaid content)
        if md_file.name == "_mindmap.md":
            continue

        rel_path = md_file.relative_to(wiki_dir)
        checked += 1

        try:
            content = md_file.read_text(encoding="utf-8")
        except Exception as e:
            failed.append((str(rel_path), [f"Failed to read file: {e}"]))
            continue

        frontmatter, parse_err, body = parse_frontmatter(content)

        if parse_err:
            failed.append((str(rel_path), [parse_err]))
            continue

        assert frontmatter is not None
        errs = validate_frontmatter(frontmatter, body, str(rel_path))
        if errs:
            failed.append((str(rel_path), errs))

    if not failed:
        print("✅ All wiki Markdown files have valid YAML frontmatter!")
        print(f"   Checked {checked} file(s)")
        sys.exit(0)

    print(f"❌ Frontmatter validation failed ({len(failed)} file(s)):", file=sys.stderr)
    print("", file=sys.stderr)
    for path, errs in failed:
        print(f"  {path}:", file=sys.stderr)
        for e in errs:
            print(f"    - {e}", file=sys.stderr)
        print("", file=sys.stderr)
    print(
        "Fix by using strict YAML frontmatter. File must start with ---, valid YAML block, then ---.",
        file=sys.stderr,
    )
    print("See examples/sample_document.md for correct format.", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
