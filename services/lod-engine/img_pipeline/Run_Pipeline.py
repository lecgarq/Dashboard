"""
DEPRECATED orchestrator shim.

Use Run_Pipeline_Optimized.py directly. This file is retained for
backward-compatibility and forwards all CLI args unchanged.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    optimized = script_dir / "Run_Pipeline_Optimized.py"
    print(
        "[DEPRECATED] Run_Pipeline.py is deprecated. Forwarding to "
        "Run_Pipeline_Optimized.py."
    )
    return subprocess.call([sys.executable, str(optimized), *sys.argv[1:]], cwd=str(script_dir))


if __name__ == "__main__":
    raise SystemExit(main())
