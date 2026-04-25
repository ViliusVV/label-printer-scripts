"""Bitmap parity test for the label renderer.

For each fixture in `tests/fixtures/`, re-renders all physical labels via
`render_labels_from_csv` and byte-compares against the committed
`tests/golden/<name>_<i>.png`.

Why bytes (not perceptual diff): output is mode '1' and PIL's PNG round-trip
is lossless for 1-bit images, so any single-pixel shift in the renderer
flips at least one byte. That's exactly the regression signal we want
when refactoring the rendering path.

On mismatch the test writes a 3-panel diff (golden | live | red overlay)
to `tests/_diffs/` so the failure is debuggable without re-running.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from labels import LabelConfig, csv_path_for, render_labels_from_csv  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
GOLDEN = Path(__file__).resolve().parent / "golden"
DIFFS = Path(__file__).resolve().parent / "_diffs"


def _fixture_names() -> list[str]:
    return sorted(p.stem for p in FIXTURES.glob("*.toml"))


def _render(toml_path: Path) -> list[Image.Image]:
    cfg = LabelConfig.from_toml(toml_path)
    return list(render_labels_from_csv(csv_path_for(toml_path), cfg))


def _write_diff(name: str, idx: int, live: Image.Image, ref: Image.Image) -> Path:
    DIFFS.mkdir(exist_ok=True)
    # Match canvases for the side-by-side; if sizes mismatch we still want
    # to see both, so pad the smaller one.
    w = max(live.width, ref.width)
    h = max(live.height, ref.height)
    ref_rgb = Image.new("RGB", (w, h), (255, 255, 255))
    ref_rgb.paste(ref.convert("RGB"), (0, 0))
    live_rgb = Image.new("RGB", (w, h), (255, 255, 255))
    live_rgb.paste(live.convert("RGB"), (0, 0))

    # Red-overlay diff: any pixel that differs in the (resized) bit grids
    # turns red on top of the live render.
    overlay = live_rgb.copy()
    if live.size == ref.size:
        diff = ImageChops.difference(live.convert("L"), ref.convert("L"))
        mask = diff.point(lambda p: 255 if p else 0, mode="L")
        red = Image.new("RGB", (w, h), (255, 0, 0))
        overlay.paste(red, (0, 0), mask)

    gap = 8
    panel = Image.new("RGB", (w * 3 + gap * 2, h), (200, 200, 200))
    panel.paste(ref_rgb, (0, 0))
    panel.paste(live_rgb, (w + gap, 0))
    panel.paste(overlay, (2 * (w + gap), 0))
    out = DIFFS / f"{name}_{idx}.png"
    panel.save(out)
    return out


@pytest.mark.parametrize("name", _fixture_names())
def test_render_parity(name: str) -> None:
    toml_path = FIXTURES / f"{name}.toml"
    images = _render(toml_path)
    assert images, f"{name}: renderer produced no labels (csv empty?)"

    expected_goldens = sorted(GOLDEN.glob(f"{name}_*.png"))
    assert len(images) == len(expected_goldens), (
        f"{name}: rendered {len(images)} label(s) but found "
        f"{len(expected_goldens)} golden(s); regenerate via "
        f"`uv run python tests/generate_golden.py` if fixtures changed"
    )

    for i, live in enumerate(images, 1):
        golden_path = GOLDEN / f"{name}_{i}.png"
        ref = Image.open(golden_path)

        assert live.mode == "1", f"{name}#{i}: expected mode '1', got {live.mode!r}"
        assert live.size == ref.size, (
            f"{name}#{i}: size mismatch live={live.size} golden={ref.size}"
        )
        if live.tobytes() != ref.tobytes():
            diff_path = _write_diff(name, i, live, ref)
            pytest.fail(
                f"{name}#{i}: pixel mismatch vs {golden_path.name}; "
                f"diff written to {diff_path}"
            )
