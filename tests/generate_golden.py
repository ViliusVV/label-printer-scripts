"""Regenerate golden bitmaps for the parity tests.

Run:  uv run python tests/generate_golden.py

For every `tests/fixtures/<name>.toml` (with sibling `<name>.csv`),
re-renders all physical labels via the current `labels.render_labels_from_csv`
pipeline and saves them as `tests/golden/<name>_<i>.png` (mode '1').

The committed goldens are the parity baseline: the test harness
(`test_render_parity.py`) byte-compares the live renderer against them,
so re-run this script ONLY when fixtures change or the renderer's
output is intentionally being updated — never to "make tests pass".
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from labels import LabelConfig, csv_path_for, render_labels_from_csv  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
GOLDEN = Path(__file__).resolve().parent / "golden"


def render_fixture(toml_path: Path):
    cfg = LabelConfig.from_toml(toml_path)
    csv = csv_path_for(toml_path)
    return cfg, list(render_labels_from_csv(csv, cfg))


def main() -> int:
    GOLDEN.mkdir(exist_ok=True)
    fixtures = sorted(FIXTURES.glob("*.toml"))
    if not fixtures:
        print(f"No fixtures in {FIXTURES}")
        return 1

    total = 0
    for toml_path in fixtures:
        cfg, images = render_fixture(toml_path)
        if not images:
            print(f"  {toml_path.name}: no labels (csv empty?)")
            continue
        for i, img in enumerate(images, 1):
            out = GOLDEN / f"{toml_path.stem}_{i}.png"
            img.save(out)
        total += len(images)
        print(
            f"  {toml_path.stem}: {cfg.type} "
            f"{cfg.width_dots}x{cfg.height_dots} -> {len(images)} label(s)"
        )
    print(f"Wrote {total} golden(s) to {GOLDEN}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
