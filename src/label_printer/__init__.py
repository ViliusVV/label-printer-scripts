"""Label rendering and ESC/POS printing for the TF P2 thermal label printer.

Two layers that stay deliberately decoupled:

- Rendering (`render`, `config`, `csv_io`) — pure PIL. Produces mode '1' bitmaps.
- Transport (`printer`) — ESC/POS over pyserial. Knows nothing about fonts or CSVs.

The CLI (`label_printer.cli`) and Streamlit app (`label_printer.app`) compose the two.
"""

from label_printer.config import (
    LabelConfig,
    LineConfig,
    SkeletonType,
    csv_path_for,
    line_display_name,
)
from label_printer.csv_io import (
    cells_from_csv,
    pack_cells_to_labels,
    render_labels_from_csv,
    save_csv,
)
from label_printer.render import render_label

__all__ = [
    "LabelConfig",
    "LineConfig",
    "SkeletonType",
    "cells_from_csv",
    "csv_path_for",
    "line_display_name",
    "pack_cells_to_labels",
    "render_label",
    "render_labels_from_csv",
    "save_csv",
]
