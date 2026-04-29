#!/usr/bin/env python3
"""
Validate evidence-driven wiki page quality without template quotas.
"""

import json
import re
import sys
from pathlib import Path


def parse_frontmatter(content: str) -> tuple[dict, str]:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n([\s\S]*)$", content, re.DOTALL)
    if not match:
        return {}, content

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
            frontmatter[key] = [part.strip().strip("'\"") for part in value[1:-1].split(",") if part.strip()]
        else:
            frontmatter[key] = value.strip("'\"")
    return frontmatter, body


def count_paragraphs(body: str) -> int:
    paragraphs = [block.strip() for block in re.split(r"\n\s*\n", body) if block.strip()]
    return len([p for p in paragraphs if not p.startswith("```") and not p.startswith("|")])


def validate_page(md_path: Path, wiki_dir: Path, registry_pages: set[str]) -> list[str]:
    content = md_path.read_text(encoding="utf-8")
    frontmatter, body = parse_frontmatter(content)
    errors: list[str] = []

    page_id = frontmatter.get("page_id")
    if not page_id:
        return [] if md_path.name == "index.md" else ["Missing 'page_id' in frontmatter"]

    if page_id not in registry_pages:
        errors.append(f"page_id '{page_id}' not found in page_registry.json")

    sources = frontmatter.get("sources", [])
    if not isinstance(sources, list) or not sources:
        errors.append("Frontmatter 'sources' must be a non-empty array")

    evidence_refs = frontmatter.get("evidence_refs", [])
    if not isinstance(evidence_refs, list) or not evidence_refs:
        errors.append("Frontmatter 'evidence_refs' must be a non-empty array")
    else:
        for ref in evidence_refs:
            ref_path = wiki_dir / ref
            if not ref_path.exists():
                errors.append(f"Missing evidence ref file: {ref}")
            else:
                try:
                    ev = json.loads(ref_path.read_text(encoding="utf-8"))
                    if not ev.get("files"):
                        errors.append(f"Evidence bundle {ref} has empty files[] — evidence was not assembled from AST")
                except Exception:
                    pass

    plan_path = wiki_dir / "_plans" / f"{page_id}.json"
    if not plan_path.exists():
        errors.append(f"Missing page plan: _plans/{page_id}.json")

    if count_paragraphs(body) < 2:
        errors.append("Page body is too thin; expected at least 2 non-empty paragraphs")

    if len(body.strip()) < 300:
        errors.append("Page body is too short to be meaningful")

    return errors


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate_page_quality.py <wiki-directory>", file=sys.stderr)
        sys.exit(1)

    wiki_dir = Path(sys.argv[1])
    registry_path = wiki_dir / "page_registry.json"
    if not registry_path.exists():
        print("Error: page_registry.json not found", file=sys.stderr)
        sys.exit(1)

    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    registry_pages = {
        page["id"]
        for page in registry.get("pages", [])
        if isinstance(page, dict) and isinstance(page.get("id"), str)
    }

    failures: list[tuple[str, list[str]]] = []
    checked = 0
    pages_dir = wiki_dir / "pages"
    if not pages_dir.exists():
        print("Error: pages/ directory not found", file=sys.stderr)
        sys.exit(1)

    for md_path in sorted(pages_dir.rglob("*.md")):
        checked += 1
        errors = validate_page(md_path, wiki_dir, registry_pages)
        if errors:
            failures.append((str(md_path.relative_to(wiki_dir)), errors))

    if failures:
        print(f"❌ Page quality validation failed ({len(failures)} file(s)):", file=sys.stderr)
        for path, errors in failures:
            print(f"  {path}:", file=sys.stderr)
            for error in errors:
                print(f"    - {error}", file=sys.stderr)
        sys.exit(1)

    print("✅ All wiki pages passed quality checks.")
    print(f"   Checked {checked} file(s)")


if __name__ == "__main__":
    main()
