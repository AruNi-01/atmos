#!/usr/bin/env python3
"""
Validate evidence bundle authenticity for each wiki page.

Checks:
1. evidence files[] non-empty and traceable to _ast/hierarchy.json or filesystem
2. evidence symbols[] non-empty (except kind=overview/topic/decision)
3. page frontmatter sources[] ⊆ evidence files[]
4. backtick-quoted CamelCase names and file paths in page body appear in evidence files[] or symbols[]
"""

import json
import re
import sys
from pathlib import Path


SPARSE_KINDS = {"overview", "topic", "decision"}

# Matches likely class names (CamelCase 2+ words) or file paths (contains / or .)
_BACKTICK_RE = re.compile(r"`([^`]+)`")
_CLASS_RE = re.compile(r"^[A-Z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$")
_PATH_RE = re.compile(r"[./]")


def is_code_ref(token: str) -> bool:
    """Return True if the backtick token looks like a class name or file path."""
    if _CLASS_RE.match(token):
        return True
    if _PATH_RE.search(token) and " " not in token:
        return True
    return False


def parse_frontmatter(content: str) -> tuple[dict, str]:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n([\s\S]*)$", content, re.DOTALL)
    if not match:
        return {}, content
    raw, body = match.group(1), match.group(2)
    fm: dict = {}
    cur_key: str | None = None
    for line in raw.splitlines():
        if cur_key and line.strip().startswith("-"):
            fm.setdefault(cur_key, []).append(line.strip()[1:].strip().strip("'\""))
            continue
        cur_key = None
        m = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if key in {"sources", "evidence_refs"} and val == "":
            fm[key] = []
            cur_key = key
            continue
        if val.startswith("[") and val.endswith("]"):
            fm[key] = [p.strip().strip("'\"") for p in val[1:-1].split(",") if p.strip()]
        else:
            fm[key] = val.strip("'\"")
    return fm, body


def load_ast_paths(wiki_dir: Path) -> set[str] | None:
    """Return the set of file paths known to _ast/hierarchy.json, or None if unavailable."""
    hierarchy = wiki_dir / "_ast" / "hierarchy.json"
    if not hierarchy.exists():
        return None
    try:
        data = json.loads(hierarchy.read_text(encoding="utf-8"))
        paths: set[str] = set()
        _collect_paths(data, paths)
        return paths if paths else None
    except Exception:
        return None


def _collect_paths(node: dict, out: set[str]) -> None:
    """Recursively walk the hierarchy tree {path, files, children} and collect full file paths."""
    node_path = node.get("path", ".")
    for f in node.get("files", []):
        out.add(f if node_path == "." else f"{node_path}/{f}")
    for child in node.get("children", []):
        if isinstance(child, dict):
            _collect_paths(child, out)


def validate_page(page_id: str, kind: str, wiki_dir: Path, ast_paths: set[str] | None) -> list[str]:
    errors: list[str] = []

    evidence_path = wiki_dir / "_evidence" / f"{page_id}.json"
    if not evidence_path.exists():
        return [f"Missing evidence bundle: _evidence/{page_id}.json"]

    try:
        ev = json.loads(evidence_path.read_text(encoding="utf-8"))
    except Exception as e:
        return [f"Cannot parse evidence bundle: {e}"]

    ev_files: list[str] = ev.get("files", [])
    ev_symbols: list[str] = ev.get("symbols", [])
    ev_files_set = set(ev_files)
    ev_symbols_set = set(ev_symbols)

    # Check 1: files non-empty and traceable
    if not ev_files:
        errors.append("evidence files[] is empty")
    elif ast_paths is not None:
        untraced = [f for f in ev_files if f not in ast_paths]
        if untraced:
            errors.append(f"evidence files[] contains entries not in _ast/hierarchy.json: {untraced[:3]}")
    else:
        # Fall back to filesystem check
        untraced = [f for f in ev_files if not (wiki_dir.parent.parent / f).exists()]
        if untraced:
            errors.append(f"evidence files[] contains entries not found on filesystem: {untraced[:3]}")

    # Check 2: symbols non-empty (except sparse kinds)
    if kind not in SPARSE_KINDS and not ev_symbols:
        errors.append(f"evidence symbols[] is empty (required for kind={kind})")

    # Load page for checks 3 and 4
    page_path = wiki_dir / "pages" / f"{page_id}.md"
    if not page_path.exists():
        return errors  # page not written yet, skip checks 3/4

    content = page_path.read_text(encoding="utf-8")
    fm, body = parse_frontmatter(content)

    # Check 3: sources ⊆ evidence files
    sources: list[str] = fm.get("sources", [])
    if isinstance(sources, list):
        outside = [s for s in sources if s not in ev_files_set]
        if outside:
            errors.append(f"frontmatter sources[] contains entries not in evidence files[]: {outside[:3]}")

    # Check 4: backtick code refs in body must appear in evidence
    refs = [t for t in _BACKTICK_RE.findall(body) if is_code_ref(t)]
    missing = [r for r in refs if r not in ev_files_set and r not in ev_symbols_set]
    if missing:
        errors.append(f"prose references not found in evidence files[] or symbols[]: {missing[:5]}")

    return errors


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate_evidence.py <wiki-directory>", file=sys.stderr)
        sys.exit(1)

    wiki_dir = Path(sys.argv[1])
    registry_path = wiki_dir / "page_registry.json"
    if not registry_path.exists():
        print("Error: page_registry.json not found", file=sys.stderr)
        sys.exit(1)

    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    pages = registry.get("pages", [])
    ast_paths = load_ast_paths(wiki_dir)

    failures: list[tuple[str, list[str]]] = []
    for page in pages:
        page_id = page.get("id", "")
        kind = page.get("kind", "module")
        if not page_id:
            continue
        errs = validate_page(page_id, kind, wiki_dir, ast_paths)
        if errs:
            failures.append((page_id, errs))

    if failures:
        print(f"❌ Evidence validation failed ({len(failures)} page(s)):", file=sys.stderr)
        for pid, errs in failures:
            print(f"  {pid}:", file=sys.stderr)
            for e in errs:
                print(f"    - {e}", file=sys.stderr)
        sys.exit(1)

    print(f"✅ All evidence bundles passed validation. ({len(pages)} page(s))")


if __name__ == "__main__":
    main()
