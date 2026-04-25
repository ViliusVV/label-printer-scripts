"""Text-source widgets: Manual matrix vs. CSV editor.

Returns the resulting `label_batches` (list of cell-list-per-label) plus the
manual matrix to persist back into the config in Manual mode.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import streamlit as st

from label_printer.config import LabelConfig, line_display_name
from label_printer.csv_io import cells_from_csv, pack_cells_to_labels, save_csv
from label_printer.render import Cell


def _val(x) -> str:
    return "" if pd.isna(x) else str(x)


def render_text_source(
    cfg: LabelConfig,
    csv_path: Path,
    prefix: str,
    initial_manual: list[list[str]],
) -> tuple[list[list[Cell]], list[list[str]]]:
    """Returns (label_batches, manual_matrix_to_persist).

    In Manual mode the second element is the captured matrix; in CSV mode it
    is `initial_manual` unchanged so switching sources doesn't lose the side
    that wasn't active.
    """
    source = st.radio("Text source", ["Manual", csv_path.name], horizontal=True)
    n_cols = len(cfg.lines)
    col_names = [f"line_{i + 1}" for i in range(n_cols)]
    cells_per_label = cfg.cells_per_label

    if source == "Manual":
        cells = _render_manual(cfg, n_cols, cells_per_label, initial_manual, prefix)
        label_batches = [cells] if cells else []
        return label_batches, cells

    csv_cells = _render_csv_editor(cfg, csv_path, n_cols, col_names, prefix)
    label_batches = pack_cells_to_labels(csv_cells, cells_per_label)
    if not label_batches:
        st.info("CSV has no rows — add some via the table above.")
        st.stop()
    return label_batches, initial_manual


def _render_manual(
    cfg: LabelConfig,
    n_cols: int,
    cells_per_label: int,
    initial_manual: list[list[str]],
    prefix: str,
) -> list[Cell]:
    line_labels = [line_display_name(cfg.lines[j], j) for j in range(n_cols)]

    def saved(i: int, j: int) -> str:
        if i < len(initial_manual) and j < len(initial_manual[i]):
            return str(initial_manual[i][j])
        return ""

    cells: list[Cell] = []
    for i in range(cells_per_label):
        x_idx = i % cfg.count_x
        y_idx = i // cfg.count_x
        st.markdown(f"**Cell ({x_idx + 1}, {y_idx + 1})**")
        cols_in = st.columns(max(1, n_cols))
        row: list[str] = []
        for j in range(n_cols):
            with cols_in[j]:
                row.append(
                    st.text_input(
                        line_labels[j],
                        value=saved(i, j),
                        key=f"{prefix}_manual_{i}_{j}",
                    )
                )
        cells.append(row)
    return cells


def _render_csv_editor(
    cfg: LabelConfig,
    csv_path: Path,
    n_cols: int,
    col_names: list[str],
    prefix: str,
) -> list[Cell]:
    try:
        loaded = cells_from_csv(csv_path)
    except FileNotFoundError:
        loaded = []

    df_in = pd.DataFrame(
        [{col_names[j]: (c[j] if j < len(c) else "") for j in range(n_cols)} for c in loaded],
        columns=col_names,
    )
    df_edited = st.data_editor(
        df_in,
        num_rows="dynamic",
        use_container_width=True,
        key=f"{prefix}_csv_editor_{n_cols}",
        column_config={
            col_names[j]: st.column_config.TextColumn(line_display_name(cfg.lines[j], j))
            for j in range(n_cols)
        },
    )

    csv_cells: list[Cell] = [
        [_val(getattr(r, col_names[j])) for j in range(n_cols)]
        for r in df_edited.itertuples(index=False)
        if any(_val(getattr(r, col_names[j])).strip() for j in range(n_cols))
    ]
    try:
        save_csv(csv_path, csv_cells, n_cols)
        st.caption(f"{len(csv_cells)} row(s) · auto-saved to {csv_path}")
    except OSError as e:
        st.error(f"Couldn't save {csv_path.name}: {e}")
    return csv_cells
