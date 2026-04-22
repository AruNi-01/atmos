#!/usr/bin/env python3
"""
Validate page_registry.json for the evidence-driven wiki format.
"""

import json
import re
import sys
from pathlib import Path

VERSION_PATTERN = re.compile(r"^\d+\.\d+$")
COMMIT_HASH_PATTERN = re.compile(r"^[0-9a-f]{7,40}$")


def validate_navigation_item(item: dict, pages: dict[str, dict], errors: list[str], seen_nav_ids: set[str], path: str) -> None:
    item_id = item.get("id")
    if not item_id or not isinstance(item_id, str):
        errors.append(f"{path}: missing string id")
        return
    if item_id in seen_nav_ids:
        errors.append(f"{path}: duplicate navigation id '{item_id}'")
    seen_nav_ids.add(item_id)

    if not isinstance(item.get("title"), str) or not item["title"].strip():
        errors.append(f"{path}: missing title")
    if not isinstance(item.get("order"), int) or item["order"] < 0:
        errors.append(f"{path}: 'order' must be a non-negative integer")
    if "children" not in item or not isinstance(item["children"], list):
        errors.append(f"{path}: 'children' must be an array")
        return

    page_id = item.get("page_id")
    if page_id is not None and page_id not in pages:
        errors.append(f"{path}: references unknown page_id '{page_id}'")

    if not item["children"] and not item.get("page_id") and not item.get("file"):
        errors.append(f"{path}: leaf navigation item must reference a page via 'page_id' or 'file'")

    for index, child in enumerate(item["children"]):
        if not isinstance(child, dict):
            errors.append(f"{path}.children[{index}]: must be an object")
            continue
        validate_navigation_item(child, pages, errors, seen_nav_ids, f"{path}.children[{index}]")


def validate_registry(path: Path) -> tuple[list[str], list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    errors: list[str] = []
    warnings: list[str] = []

    required = ("version", "generated_at", "commit_hash", "project", "navigation", "pages")
    for key in required:
        if key not in data:
            errors.append(f"Missing required top-level field: '{key}'")

    version = data.get("version")
    if version is not None and (not isinstance(version, str) or not VERSION_PATTERN.match(version)):
        errors.append(f"Invalid version '{version}'")

    commit_hash = data.get("commit_hash")
    if commit_hash is not None and (not isinstance(commit_hash, str) or not COMMIT_HASH_PATTERN.match(commit_hash)):
        errors.append(f"Invalid commit_hash '{commit_hash}'")

    project = data.get("project")
    if not isinstance(project, dict):
        errors.append("'project' must be an object")
    else:
        for key in ("name", "description"):
            if not isinstance(project.get(key), str) or not project[key].strip():
                errors.append(f"project.{key} must be a non-empty string")

    pages_raw = data.get("pages")
    pages: dict[str, dict] = {}
    if not isinstance(pages_raw, list) or not pages_raw:
        errors.append("'pages' must be a non-empty array")
    else:
        for index, page in enumerate(pages_raw):
            if not isinstance(page, dict):
                errors.append(f"pages[{index}] must be an object")
                continue
            page_id = page.get("id")
            if not isinstance(page_id, str) or not page_id:
                errors.append(f"pages[{index}] missing string 'id'")
                continue
            if page_id in pages:
                errors.append(f"Duplicate page id '{page_id}'")
            pages[page_id] = page

            for key in ("title", "file", "kind", "audience", "updated_at"):
                if not isinstance(page.get(key), str) or not page[key].strip():
                    errors.append(f"pages[{index}].{key} must be a non-empty string")

            for array_key in ("sources", "evidence_refs"):
                if not isinstance(page.get(array_key), list) or not page[array_key]:
                    errors.append(f"pages[{index}].{array_key} must be a non-empty array")

    navigation = data.get("navigation")
    if not isinstance(navigation, list) or not navigation:
        errors.append("'navigation' must be a non-empty array")
    else:
        seen_nav_ids: set[str] = set()
        for index, item in enumerate(navigation):
            if not isinstance(item, dict):
                errors.append(f"navigation[{index}] must be an object")
                continue
            validate_navigation_item(item, pages, errors, seen_nav_ids, f"navigation[{index}]")

    for page in pages.values():
        for evidence_ref in page.get("evidence_refs", []):
            if isinstance(evidence_ref, str) and not evidence_ref.startswith("_evidence/"):
                warnings.append(f"Page '{page['id']}' has non-standard evidence ref '{evidence_ref}'")

    # Soft warning: ≥8 pages but navigation has no grouping
    if isinstance(navigation, list) and len(pages) >= 8:
        has_group = any(
            isinstance(item, dict) and item.get("children")
            for item in navigation
        )
        if not has_group:
            warnings.append(
                f"{len(pages)} pages found but navigation has no grouping (all top-level). "
                "Consider organizing into groups using navigationItem.children."
            )

    return errors, warnings


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate_page_registry.py <page_registry.json>", file=sys.stderr)
        sys.exit(1)

    registry_path = Path(sys.argv[1])
    if not registry_path.is_file():
        print(f"Error: File not found: {registry_path}", file=sys.stderr)
        sys.exit(1)

    try:
        errors, warnings = validate_registry(registry_path)
    except json.JSONDecodeError as error:
        print(f"Error: invalid JSON: {error}", file=sys.stderr)
        sys.exit(1)

    if errors:
        print(f"❌ Page registry validation failed ({len(errors)} errors):", file=sys.stderr)
        for index, error in enumerate(errors, 1):
            print(f"  {index}. {error}", file=sys.stderr)
        if warnings:
            print("", file=sys.stderr)
            print(f"⚠️  Also found {len(warnings)} warning(s):", file=sys.stderr)
            for index, warning in enumerate(warnings, 1):
                print(f"  {index}. {warning}", file=sys.stderr)
        sys.exit(1)

    print("✅ Page registry is valid!")
    if warnings:
        print(f"⚠️  {len(warnings)} warning(s)")
        for warning in warnings:
            print(f"  - {warning}")


if __name__ == "__main__":
    main()
