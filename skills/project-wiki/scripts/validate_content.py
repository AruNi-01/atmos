#!/usr/bin/env python3
"""
Validate content depth of Project Wiki Markdown files.

Each article MUST meet minimum depth requirements based on its section:
- getting-started: 800+ words, 2+ Mermaid, 4+ H2 sections, 3+ sources, 2+ cross-refs
- deep-dive, specify-wiki: 1500+ words, 3+ Mermaid, 6+ H2 sections, 5+ sources, 4+ cross-refs

Word count excludes: frontmatter, Mermaid blocks, table rows, code blocks.

Usage:
    python3 validate_content.py <wiki-directory>

Exit: 0 if all valid, 1 if any file fails.
"""

import re
import sys
from pathlib import Path

# Thresholds by section
THRESHOLDS = {
    "getting-started": {
        "min_words": 800,
        "min_mermaid": 2,
        "min_h2": 4,
        "min_sources": 3,
        "min_crossrefs": 2,
    },
    "deep-dive": {
        "min_words": 1500,
        "min_mermaid": 3,
        "min_h2": 6,
        "min_sources": 5,
        "min_crossrefs": 4,
    },
    "specify-wiki": {
        "min_words": 1500,
        "min_mermaid": 3,
        "min_h2": 6,
        "min_sources": 5,
        "min_crossrefs": 4,
    },
}

SKIP_FILES = {"_mindmap.md", "index.md"}


def extract_body_and_frontmatter(content: str) -> tuple[dict, str]:
    """Extract frontmatter dict and body. Uses simple parsing."""
    fm = {}
    body = content

    if content.startswith("---"):
        parts = content.split("\n", 1)
        if len(parts) >= 2:
            rest = parts[1]
            match = re.match(r"^(.*?)^---\s*$", rest, re.MULTILINE | re.DOTALL)
            if match:
                yaml_block = match.group(1).strip()
                body = rest[match.end() :].lstrip("\n")

                in_sources = False
                sources = []
                for line in yaml_block.split("\n"):
                    if in_sources:
                        if line.strip().startswith("-"):
                            item = line.strip()[1:].strip().strip("'\"")
                            sources.append(item)
                        else:
                            fm["sources"] = sources
                            in_sources = False
                    colon_idx = line.find(":")
                    if colon_idx > 0 and not line[:colon_idx].strip().startswith("-"):
                        key = line[:colon_idx].strip()
                        val = line[colon_idx + 1 :].strip().strip("'\"")
                        if key == "sources":
                            in_sources = True
                            sources = []
                            if val and val != "[]":
                                for m in re.finditer(r"['\"]?([^,\]\s]+)['\"]?", val):
                                    s = m.group(1).strip("'\"")
                                    if s and s not in ("[", "]"):
                                        sources.append(s)
                        else:
                            fm[key] = val
                if in_sources:
                    fm["sources"] = sources

    return fm, body


def count_content(body: str) -> dict:
    """Count words (excluding code/mermaid/tables), mermaid blocks, H2 headings, cross-ref links."""
    # Strip mermaid blocks for word count
    body_no_mermaid = re.sub(r"```mermaid.*?```", "", body, flags=re.DOTALL)
    # Strip code blocks
    body_no_code = re.sub(r"```[\s\S]*?```", "", body_no_mermaid)
    # Strip HTML tables (markdown tables use |)
    body_no_tables = re.sub(r"\|[^\n]+\|", "", body_no_code)
    # Strip inline code
    body_no_inline = re.sub(r"`[^`]+`", "", body_no_tables)
    # Words: split on whitespace, filter empty
    words = [w for w in re.split(r"\s+", body_no_inline) if w and len(w) > 0]
    word_count = len(words)

    mermaid_count = len(re.findall(r"```mermaid", body))
    h2_count = len(re.findall(r"^##\s+", body, re.MULTILINE))
    crossref_count = len(re.findall(r"\[[^\]]+\]\([^)]+\.md\)", body))

    return {
        "words": word_count,
        "mermaid": mermaid_count,
        "h2": h2_count,
        "crossrefs": crossref_count,
    }


def validate_file(md_path: Path, wiki_dir: Path) -> list[str]:
    """Validate a single file. Returns list of error messages."""
    errors = []
    try:
        content = md_path.read_text(encoding="utf-8")
    except Exception as e:
        return [f"Failed to read: {e}"]

    fm, body = extract_body_and_frontmatter(content)
    section = fm.get("section", "")
    sources = fm.get("sources", [])
    if not isinstance(sources, list):
        sources = []

    if section not in THRESHOLDS:
        return []  # Skip validation for unknown sections (e.g. index without section)

    thresholds = THRESHOLDS[section]
    counts = count_content(body)

    if counts["words"] < thresholds["min_words"]:
        errors.append(
            f"Word count {counts['words']} < {thresholds['min_words']} required"
        )
    if counts["mermaid"] < thresholds["min_mermaid"]:
        errors.append(
            f"Mermaid diagrams {counts['mermaid']} < {thresholds['min_mermaid']} required"
        )
    if counts["h2"] < thresholds["min_h2"]:
        errors.append(
            f"H2 sections {counts['h2']} < {thresholds['min_h2']} required"
        )
    if len(sources) < thresholds["min_sources"]:
        errors.append(
            f"Source files {len(sources)} < {thresholds['min_sources']} required"
        )
    if counts["crossrefs"] < thresholds["min_crossrefs"]:
        errors.append(
            f"Cross-reference links {counts['crossrefs']} < {thresholds['min_crossrefs']} required"
        )

    return errors


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate_content.py <wiki-directory>", file=sys.stderr)
        sys.exit(1)

    wiki_dir = Path(sys.argv[1])
    if not wiki_dir.is_dir():
        print(f"Error: Not a directory: {wiki_dir}", file=sys.stderr)
        sys.exit(1)

    failed: list[tuple[str, list[str]]] = []
    checked = 0

    for md_file in sorted(wiki_dir.rglob("*.md")):
        if md_file.name in SKIP_FILES:
            continue
        if md_file.name.startswith("_"):
            continue

        rel_path = md_file.relative_to(wiki_dir)

        errs = validate_file(md_file, wiki_dir)
        if errs:
            failed.append((str(rel_path), errs))
        checked += 1

    if not failed:
        print("✅ All wiki articles meet content depth requirements!")
        print(f"   Checked {checked} file(s)")
        sys.exit(0)

    print(f"❌ Content depth validation failed ({len(failed)} file(s)):", file=sys.stderr)
    print("", file=sys.stderr)
    for path, errs in failed:
        print(f"  {path}:", file=sys.stderr)
        for e in errs:
            print(f"    - {e}", file=sys.stderr)
        print("", file=sys.stderr)
    print(
        "Expand articles to meet minimum word count, diagrams, sections, sources, and cross-references.",
        file=sys.stderr,
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
