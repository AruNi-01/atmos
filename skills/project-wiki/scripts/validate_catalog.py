#!/usr/bin/env python3
"""
Compatibility wrapper for legacy callers.
Delegates to validate_page_registry.py.
"""

import subprocess
import sys
from pathlib import Path


def main() -> int:
    script = Path(__file__).with_name("validate_page_registry.py")
    proc = subprocess.run([sys.executable, str(script), *sys.argv[1:]])
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
