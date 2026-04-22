#!/usr/bin/env python3
"""
Validate that phase gate files exist and are well-formed for every wiki page.

Required per page:
  _phase_done/<page-id>.plan.json
  _phase_done/<page-id>.evidence.json
  _phase_done/<page-id>.write.json

Each file must contain: page_id, phase, completed_at, outputs (array).
completed_at must be non-decreasing: plan ≤ evidence ≤ write.
"""

import json
import sys
from pathlib import Path

PHASES = ("plan", "evidence", "write")
REQUIRED_FIELDS = ("page_id", "phase", "completed_at", "outputs")


def validate_gate_file(path: Path, expected_page_id: str, expected_phase: str) -> list[str]:
    errors: list[str] = []
    if not path.exists():
        return [f"Missing: {path.name}"]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return [f"{path.name}: invalid JSON: {e}"]
    for field in REQUIRED_FIELDS:
        if field not in data:
            errors.append(f"{path.name}: missing field '{field}'")
    if data.get("page_id") != expected_page_id:
        errors.append(f"{path.name}: page_id mismatch (expected '{expected_page_id}')")
    if data.get("phase") != expected_phase:
        errors.append(f"{path.name}: phase mismatch (expected '{expected_phase}')")
    if not isinstance(data.get("outputs"), list):
        errors.append(f"{path.name}: 'outputs' must be an array")
    return errors


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate_phase_gate.py <wiki-directory>", file=sys.stderr)
        sys.exit(1)

    wiki_dir = Path(sys.argv[1])
    registry_path = wiki_dir / "page_registry.json"
    if not registry_path.exists():
        print("Error: page_registry.json not found", file=sys.stderr)
        sys.exit(1)

    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    pages = [p["id"] for p in registry.get("pages", []) if isinstance(p, dict) and p.get("id")]
    phase_dir = wiki_dir / "_phase_done"

    failures: list[tuple[str, list[str]]] = []
    for page_id in pages:
        errs: list[str] = []
        timestamps: list[str] = []
        for phase in PHASES:
            gate_path = phase_dir / f"{page_id}.{phase}.json"
            phase_errs = validate_gate_file(gate_path, page_id, phase)
            errs.extend(phase_errs)
            if not phase_errs and gate_path.exists():
                try:
                    data = json.loads(gate_path.read_text(encoding="utf-8"))
                    timestamps.append(data.get("completed_at", ""))
                except Exception:
                    pass

        # Check non-decreasing timestamps
        if len(timestamps) == 3 and all(timestamps):
            if not (timestamps[0] <= timestamps[1] <= timestamps[2]):
                errs.append(f"completed_at timestamps are not non-decreasing: {timestamps}")

        if errs:
            failures.append((page_id, errs))

    if failures:
        print(f"❌ Phase gate validation failed ({len(failures)} page(s)):", file=sys.stderr)
        for pid, errs in failures:
            print(f"  {pid}:", file=sys.stderr)
            for e in errs:
                print(f"    - {e}", file=sys.stderr)
        sys.exit(1)

    print(f"✅ All phase gates valid. ({len(pages)} page(s), {len(pages) * 3} gate files)")


if __name__ == "__main__":
    main()
