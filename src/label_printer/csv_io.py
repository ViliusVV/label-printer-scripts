"""CSV I/O for label data.

One CSV row = one cell; columns map positionally onto `LabelConfig.lines`.
`render_labels_from_csv` is the shared pipeline used by every entry point —
changes here must keep the CLI and Streamlit app working.
"""

from __future__ import annotations

import csv
from collections.abc import Iterable, Iterator
from pathlib import Path

from PIL import Image

from label_printer.config import LabelConfig
from label_printer.render import Cell, render_label


def cells_from_csv(path: str | Path, skip_header: bool = True) -> list[Cell]:
    """One CSV row = one cell. Columns map positionally onto cfg.lines."""
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    if skip_header and rows:
        rows = rows[1:]
    return [list(row) for row in rows if any(c.strip() for c in row)]


def pack_cells_to_labels(cells: Iterable[Cell], per_label: int) -> list[list[Cell]]:
    """Chunk a flat list of cells into batches of `per_label`. Does NOT pad."""
    cells = list(cells)
    return [cells[i : i + per_label] for i in range(0, len(cells), per_label)]


def render_labels_from_csv(
    csv_path: str | Path,
    cfg: LabelConfig,
) -> Iterator[Image.Image]:
    """Stream one rendered Image per physical label from a CSV."""
    cells = cells_from_csv(csv_path)
    for batch in pack_cells_to_labels(cells, cfg.cells_per_label):
        yield render_label(batch, cfg)


def save_csv(path: str | Path, cells: list[list[str]], n_columns: int) -> None:
    """Atomically write a header + per-row CSV (used by the Streamlit editor)."""
    path = Path(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([f"line_{i + 1}" for i in range(n_columns)])
        for c in cells:
            padded = list(c) + [""] * max(0, n_columns - len(c))
            w.writerow(padded[:n_columns])
    tmp.replace(path)
