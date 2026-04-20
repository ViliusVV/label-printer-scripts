# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Dependency management uses **uv** (`pyproject.toml` + `uv.lock`), Python 3.13+.

```bash
uv sync                          # install runtime deps (pillow, pyserial)
uv sync --extra preview          # also install streamlit for the interactive preview

# All entry points take a config path; default is data/VIAL_TOP_default.toml.
# The CSV used at runtime is the sibling .csv of the config (e.g. data/VIAL_TOP_default.csv).
uv run python print_labels.py [data/<name>.toml]   # render + send every row of the sibling CSV to the printer
uv run python preview.py       [data/<name>.toml]  # one-shot render; saves preview_N.png and opens the first
uv run streamlit run preview_app.py                # interactive preview; picks the config from a dropdown
uv run python main.py                              # dev sandbox (esc_hello / print_circles helpers)
```

No tests or linter are configured. The printer's serial port lives inside each config file (`printer_port`, default `COM4`).

## Architecture

Two layers that stay deliberately decoupled:

1. **Label rendering** (`labels.py`) — pure PIL. Produces a mode `'1'` bitmap. Knows nothing about serial/ESC/POS.
2. **Printer transport** (`printer.py`) — `LabelPrinter` class, ESC/POS over `pyserial`. Knows nothing about fonts, CSVs, or skeleton types.

All entry points compose the two by passing a PIL Image from layer 1 into `LabelPrinter.print_bitmap`.

Configs and data live in `data/`. One "skeleton" = one TOML + matching CSV, named `<TYPE>_<variant>.{toml,csv}`. `csv_path_for(toml_path)` returns the sibling CSV — always pair them this way; don't hardcode either.

### Printer layer (`printer.py`)

Target is a **TF P2 Bluetooth thermal label printer** (see `memory/project_printer_hardware.md`): ESC/POS, 8 dots/mm, **384-dot maximum print width** (48 mm).

Quirks that must be preserved when editing:

- The print head is **right-aligned on the paper**. `set_label_size` computes `left_margin_dots = MAX_WIDTH_DOTS - width_dots` and issues `GS L` so the origin ends up at the label's left edge. Changing this breaks horizontal alignment for any label narrower than 48 mm.
- `__init__` sends `GS P 203 203` (`GS_P_DOTS`) so motion-unit commands (`GS L`, `GS W`, `GS $`, etc.) take **dot counts** directly at ~203 dpi. Re-sending `GS P` with different values silently rescales every subsequent geometry command.
- `print_bitmap` emits raster via `GS v 0`. Width must be padded up to a byte boundary (`(label_w + 7) & ~7`). The raster is sized to the full label area and the bitmap is placed inside it per `HAlign`/`VAlign`, so input smaller than the label is offset rather than scaled.
- PIL mode `'1'`: `0 = black, 255 = white`. Printer wire format: `1 = black dot`. `_to_bit_grid` does the inversion — keep this in mind when accepting other bitmap types.

### Rendering layer (`labels.py`)

`LabelConfig` (TOML-backed via `from_toml`/`to_toml`) owns the full skeleton spec. It has three parts:

- **Common**: `type`, label paper (`width_mm`, `height_mm`, `dots_per_mm`), grid (`count_x`, `count_y`, `gap_mm`), `outline_px`, `line_gap_px`, `printer_port`.
- **Lines**: `lines: list[LineConfig]` — N lines stacked vertically inside every cell. Each `LineConfig` carries `font_path`, `size_px`, `bold`, `italic`, `underline`, `underline_offset_px`, `default_text`.
- **Type-specific**: currently only `circle_diameter_mm` (used by VIAL_TOP; preserved but ignored for other types).

`SkeletonType` (enum) → `_CELL_RENDERERS` dispatch table (`str → callable`). Adding a new type = add an enum value, write `_render_<name>(img, draw, center, cell_dims, cell_lines, cfg)`, register it. Both existing renderers finish by calling `_render_lines` so the N-line stacking logic stays shared.

Data flow:

```
data/X.csv (one row = one cell, columns map positionally onto cfg.lines)
   → cells_from_csv → list[list[str]]
   → pack_cells_to_labels(cells, cfg.cells_per_label)  [chunks; does NOT pad]
   → render_label(batch, cfg) → PIL Image (mode '1')
```

Key design rules:

- **Short final batches are intentional.** `render_label` loops only over the cells provided; unused grid slots draw nothing (no outline, no text). This is how "don't render a circle if there aren't enough CSV entries" is satisfied — and it generalises to 2-D grids.
- Grid geometry divides the full label evenly (`cell_w = (W − gap*(count_x−1)) / count_x`, same for `cell_h`). Cells are filled **row-major** (left-to-right, top-to-bottom). A half-empty last label keeps earlier cells at their full-label positions.
- `_render_lines` stacks lines vertically and centres the stack on the cell's midpoint. For N=3 with sizes 28/56/28 this is equivalent to the older "middle line anchored at centre" behaviour, but it generalises to any N.
- Bold → PIL `stroke_width=1`. Italic → render text to a temp `L` image, apply affine shear (0.2), paste through a mask. Both paths funnel through `_draw_line`; see `_render_text_image`.
- Empty cells on a line with a non-empty `default_text` render the default (with its underline, if any) — this is the blank-writing-line placeholder for vial bottom rows.
- Fonts are cached module-level in `_font_cache` keyed by `(path, size_px)`. Call `_load_font` rather than `ImageFont.truetype` directly.

`render_labels_from_csv` is the shared entry point used by `print_labels.py`, `preview.py`, and the Streamlit app — changes to the CSV → bitmap pipeline must keep all three working.

### Streamlit app (`preview_app.py`)

- **Config picker** lists `data/*.toml`. All widget keys are prefixed with the config's file stem (`f"{prefix}_..."`), so switching configs gives the new file a fresh widget-state namespace and its values are loaded as defaults.
- **Auto-persists** both the config TOML and its sibling CSV on every rerun (atomic tmp + rename). Sidebar values rebuild a fresh `LabelConfig`; the CSV data editor's current state is written back.
- **Dynamic lines**: a "Number of lines" input controls how many `LineConfig` editors appear; the CSV editor's column set follows suit (`line_1`, `line_2`, …). Changing line count changes the data-editor key so its schema resets cleanly.
- **Type-specific UI**: when `type = VIAL_TOP`, a "Circle diameter" input appears. Other types' extras live behind similar type-conditional expanders — add new ones there, not at the top.
- Font picker scans `C:/Windows/Fonts/*.{ttf,otf}` once (`@st.cache_data`) and maps each file's `(family, style)` from `ImageFont.getname()` to its path. A config path not in the scan is prepended as `(custom) filename`.
- Label bitmaps are embedded through `streamlit.components.v1.html` (not `st.image`) to bypass Streamlit's `img { max-width: 100% }` rule — this is what makes the display-scale slider keep working past ~4×. `image-rendering: pixelated` preserves the printer-dot grid.
- Per-label "🖨 Print" button opens a fresh `LabelPrinter` on the config's `printer_port`, prints, and closes — do not try to keep a printer instance alive in session state (Bluetooth serial doesn't survive Streamlit's rerun model cleanly).
