"""Entry point for `uv run print_ui` — launches the Streamlit preview app.

Wired via `[project.scripts]` in pyproject.toml. Forwards any extra args
to `streamlit run` (e.g. `uv run print_ui -- --server.port 8502`).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent / "preview_app.py"


def main() -> None:
    sys.exit(
        subprocess.call(
            [sys.executable, "-m", "streamlit", "run", str(APP), *sys.argv[1:]]
        )
    )


if __name__ == "__main__":
    main()
