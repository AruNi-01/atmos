#!/usr/bin/env python3
"""
Validate _catalog.json structure (Python3 stdlib only, zero dependencies).

Usage:
    python3 validate_catalog.py <path-to-catalog.json>

Example:
    python3 validate_catalog.py .atmos/wiki/_catalog.json
"""

import sys
import json
import re
from pathlib import Path

# --- Patterns from catalog.schema.json ---
ID_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$")
PATH_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$")
FILE_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*\.(md|markdown)$")
VERSION_PATTERN = re.compile(r"^\d+\.\d+$")
ISO8601_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")

# specify-wiki is optional — users who never use Specify Wiki will not have it
VALID_SECTIONS = {"getting-started", "deep-dive", "specify-wiki"}
VALID_LEVELS = {"beginner", "intermediate", "advanced"}
COMMIT_HASH_PATTERN = re.compile(r"^[0-9a-f]{7,40}$")


def validate_catalog_item(item: dict, path_prefix: str, errors: list, warnings: list, seen_ids: set, stats: dict):
    """Recursively validate a single catalog item and its children."""
    item_desc = f"'{item.get('id', '?')}'"

    # Required fields
    for field in ("id", "title", "path", "order", "file", "children"):
        if field not in item:
            errors.append(f"Item at {path_prefix}: missing required field '{field}'")

    item_id = item.get("id", "")
    title = item.get("title", "")
    item_path = item.get("path", "")
    order = item.get("order")
    file = item.get("file", "")
    children = item.get("children")

    # Optional v2.0 fields
    section = item.get("section")
    level = item.get("level")
    reading_time = item.get("reading_time")

    # Type checks
    if not isinstance(title, str) or len(title) == 0:
        errors.append(f"Item {item_desc}: 'title' must be a non-empty string")
    if not isinstance(order, int) or order < 0:
        errors.append(f"Item {item_desc}: 'order' must be a non-negative integer")
    if children is not None and not isinstance(children, list):
        errors.append(f"Item {item_desc}: 'children' must be an array")

    # Pattern checks
    if item_id and not ID_PATTERN.match(item_id):
        errors.append(
            f"Item {item_desc}: invalid id format "
            f"(expected lowercase dot-separated, e.g. 'core.authentication')"
        )
    if item_path and not PATH_PATTERN.match(item_path):
        errors.append(f"Item {item_desc}: invalid path format '{item_path}'")
    if file and not FILE_PATTERN.match(file):
        errors.append(f"Item {item_desc}: invalid file format '{file}' (must end with .md)")

    # Duplicate ID check
    if item_id:
        if item_id in seen_ids:
            errors.append(f"Duplicate catalog item id: {item_desc}")
        seen_ids.add(item_id)

    # Optional field validation (v2.0)
    if section is not None:
        if section not in VALID_SECTIONS:
            errors.append(f"Item {item_desc}: invalid section '{section}' (expected: {', '.join(VALID_SECTIONS)})")
        else:
            stats["sections"].add(section)
    else:
        warnings.append(f"Item {item_desc}: missing optional 'section' field (recommended for v2.0)")

    if level is not None:
        if level not in VALID_LEVELS:
            errors.append(f"Item {item_desc}: invalid level '{level}' (expected: {', '.join(VALID_LEVELS)})")
        else:
            stats["levels"][level] = stats["levels"].get(level, 0) + 1
    else:
        warnings.append(f"Item {item_desc}: missing optional 'level' field (recommended for v2.0)")

    if reading_time is not None:
        if not isinstance(reading_time, int) or reading_time < 1 or reading_time > 30:
            errors.append(f"Item {item_desc}: 'reading_time' must be an integer between 1 and 30")
        else:
            stats["total_reading_time"] += reading_time

    # Recurse into children
    if isinstance(children, list):
        for i, child in enumerate(children):
            if not isinstance(child, dict):
                errors.append(f"Item {item_desc}: child[{i}] must be an object")
                continue
            validate_catalog_item(child, f"{path_prefix} > {child.get('id', '?')}", errors, warnings, seen_ids, stats)


def validate(catalog: dict) -> tuple:
    """Validate a catalog dict. Returns (errors, warnings, stats)."""
    errors = []
    warnings = []
    seen_ids = set()
    stats = {
        "sections": set(),
        "levels": {},
        "total_reading_time": 0,
    }

    # Top-level required fields
    for field in ("version", "generated_at", "project", "catalog", "commit_hash"):
        if field not in catalog:
            errors.append(f"Missing required top-level field: '{field}'")

    # version
    version = catalog.get("version", "")
    if version and not VERSION_PATTERN.match(str(version)):
        errors.append(f"Invalid version format: '{version}' (expected X.Y, e.g. '2.0')")

    # generated_at
    generated_at = catalog.get("generated_at", "")
    if generated_at and not ISO8601_PATTERN.match(str(generated_at)):
        errors.append(f"Invalid generated_at format: '{generated_at}' (expected ISO 8601)")

    # commit_hash (required for incremental updates)
    commit_hash = catalog.get("commit_hash", "")
    if not commit_hash:
        errors.append("Missing required 'commit_hash' field (run 'git rev-parse HEAD' at generation time)")
    elif not isinstance(commit_hash, str) or not COMMIT_HASH_PATTERN.match(commit_hash):
        errors.append(
            f"Invalid commit_hash: '{commit_hash}' (expected git SHA, 7-40 hex chars)"
        )

    # project
    project = catalog.get("project")
    if isinstance(project, dict):
        for field in ("name", "description"):
            val = project.get(field)
            if not isinstance(val, str) or len(val) == 0:
                errors.append(f"Missing or empty project field: '{field}'")
        repo = project.get("repository")
        if repo is not None and (not isinstance(repo, str) or not repo.startswith("http")):
            errors.append(f"Invalid project.repository: '{repo}' (expected a URL)")
    elif project is not None:
        errors.append("'project' must be an object")

    # catalog
    catalog_items = catalog.get("catalog")
    if isinstance(catalog_items, list):
        if len(catalog_items) == 0:
            errors.append("Catalog array must contain at least 1 item")
        for i, item in enumerate(catalog_items):
            if not isinstance(item, dict):
                errors.append(f"catalog[{i}] must be an object")
                continue
            validate_catalog_item(item, f"catalog[{i}]", errors, warnings, seen_ids, stats)

        # v2.0: Check for two-part structure. specify-wiki is optional — never required.
        top_level_sections = {item.get("section") for item in catalog_items if isinstance(item, dict)}
        if "getting-started" not in top_level_sections or "deep-dive" not in top_level_sections:
            warnings.append(
                "Catalog does not have both 'getting-started' and 'deep-dive' top-level sections "
                "(recommended for v2.0). 'specify-wiki' is optional and never required for validation."
            )
    elif catalog_items is not None:
        errors.append("'catalog' must be an array")

    return errors, warnings, stats


def count_items(items: list) -> int:
    """Recursively count all catalog items."""
    total = len(items)
    for item in items:
        total += count_items(item.get("children", []))
    return total


def main():
    if len(sys.argv) < 2:
        print("Error: Missing catalog file path", file=sys.stderr)
        print("Usage: python3 validate_catalog.py <path-to-catalog.json>", file=sys.stderr)
        sys.exit(1)

    catalog_path = Path(sys.argv[1])
    if not catalog_path.exists():
        print(f"Error: File not found: {catalog_path}", file=sys.stderr)
        sys.exit(1)

    try:
        with open(catalog_path, "r", encoding="utf-8") as f:
            catalog = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    errors, warnings, stats = validate(catalog)

    if not errors:
        total = count_items(catalog.get("catalog", []))
        print("✅ Catalog is valid!")
        print(f"   Version: {catalog.get('version', '?')}")
        print(f"   Project: {catalog.get('project', {}).get('name', '?')}")
        print(f"   Total items: {total}")

        # v2.0 enhanced stats
        if stats["sections"]:
            print(f"   Sections: {', '.join(sorted(stats['sections']))}")
        if stats["levels"]:
            level_summary = ", ".join(f"{k}: {v}" for k, v in sorted(stats["levels"].items()))
            print(f"   Levels: {level_summary}")
        if stats["total_reading_time"]:
            print(f"   Total reading time: ~{stats['total_reading_time']} minutes")

        if warnings:
            print(f"\n⚠️  {len(warnings)} warning(s):")
            for i, w in enumerate(warnings, 1):
                print(f"  {i}. {w}")

        sys.exit(0)
    else:
        print(f"❌ Catalog validation failed ({len(errors)} errors):", file=sys.stderr)
        print("", file=sys.stderr)
        for i, error in enumerate(errors, 1):
            print(f"  {i}. {error}", file=sys.stderr)
        print("", file=sys.stderr)

        if warnings:
            print(f"⚠️  Also found {len(warnings)} warning(s):", file=sys.stderr)
            for i, w in enumerate(warnings, 1):
                print(f"  {i}. {w}", file=sys.stderr)
            print("", file=sys.stderr)

        sys.exit(1)


if __name__ == "__main__":
    main()
