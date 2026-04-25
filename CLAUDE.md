# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Dependency management uses **uv** (`pyproject.toml` + `uv.lock`), Python 3.13+. The project is a hatchling-built `src`-layout package — `[tool.hatch.build.targets.wheel].packages = ["src/label_printer"]` ships everything under `src/label_printer/` automatically; new modules don't need to be listed.

```bash
uv sync                          # install runtime deps (pillow, pyserial, pyyaml, pandas, streamlit)
uv sync --extra dev              # also install pytest + ruff

# Unified CLI. All subcommands except `ui` take an optional config path
# (default: data/VIAL_TOP_default.yaml). The CSV used at runtime is the
# sibling .csv of the config (e.g. data/VIAL_TOP_default.csv).
uv run label-printer print   [data/<name>.yaml]   # render + send every row of the sibling CSV to the printer
uv run label-printer preview [data/<name>.yaml]   # one-shot render; saves preview_N.png and opens the first
uv run label-printer ui                            # interactive Streamlit preview

# Verbosity: `-v` = INFO, `-vv` = DEBUG. Without it, only warnings show.
uv run label-printer -vv print

# Tests + lint
uv run pytest                                      # bitmap parity tests (tests/test_render_parity.py)
uv run python tests/generate_golden.py             # regenerate golden PNGs (only when fixtures or renderer change intentionally)
uv run ruff check .                                 # lint
uv run ruff format .                                # format

# Sandbox script (ad-hoc printer experiments, not packaged)
uv run python sandbox/main.py
```

The `label-printer` console script is wired via `[project.scripts]` to `label_printer.cli:main`. The printer's serial port lives inside each config file (`printer_port`, default `COM4`).

## Architecture

Two layers that stay deliberately decoupled:

1. **Label rendering** (`label_printer.config` + `label_printer.render` + `label_printer.csv_io`) — pure PIL. Produces a mode `'1'` bitmap. Knows nothing about serial/ESC/POS.
2. **Printer transport** (`label_printer.printer`) — `LabelPrinter` class, ESC/POS over `pyserial`. Knows nothing about fonts, CSVs, or skeleton types.

The CLI (`label_printer.cli`) and Streamlit app (`label_printer.app`) compose the two by passing a PIL Image from layer 1 into `LabelPrinter.print_bitmap`. The shared "open printer → print → close" helper is `printer.print_image_with_config(img, cfg)`; the CLI's batch-print path opens the printer via `with LabelPrinter(...) as p:` (context-manager support is in `LabelPrinter.__enter__/__exit__`).

Configs and data live in `data/`. One "skeleton" = one YAML + matching CSV, named `<TYPE>_<variant>.{yaml,csv}`. `csv_path_for(config_path)` returns the sibling CSV — always pair them this way; don't hardcode either.

### Package layout

```
src/label_printer/
    config.py      # LabelConfig, LineConfig, SkeletonType, csv_path_for, YAML I/O
    render.py      # render_label, _CELL_RENDERERS, _render_lines, font cache
    csv_io.py      # cells_from_csv, pack_cells_to_labels, render_labels_from_csv, save_csv
    printer.py     # LabelPrinter, HAlign/VAlign/DitherMode, Cmd, print_image_with_config, load_png
    cli.py         # argparse entry: print|preview|ui subcommands
    app/
        main.py        # Streamlit entry (streamlit run target)
        sidebar.py     # widget-builder functions
        text_source.py # Manual matrix vs. CSV editor block
        fonts.py       # font scan + selectbox helper
sandbox/main.py    # ad-hoc printer experiments; uses `from label_printer.printer import …`
tests/
    fixtures/      # paired YAML+CSV per renderer scenario
    golden/        # committed mode-'1' PNGs; byte-compared by test_render_parity
```

Tests resolve the package via `pyproject.toml`'s `[tool.pytest.ini_options].pythonpath = ["src"]` — no `sys.path` hack in test files. `tests/generate_golden.py` is invoked as a script and inserts `src/` itself.

### Logging

All modules use the stdlib `logging` module (`log = logging.getLogger(__name__)`). The CLI configures the root logger via `_setup_logging(verbosity)`; the Streamlit app inherits Streamlit's own configuration. **Don't reintroduce module-level `print()`** for diagnostics — it bypasses `-v`/`-vv` and clutters the Streamlit run log.

### Printer layer (`label_printer.printer`)

Target is a **TF P2 Bluetooth thermal label printer** (see `memory/project_printer_hardware.md`): ESC/POS, 8 dots/mm, **384-dot maximum print width** (48 mm).

Quirks that must be preserved when editing:

- The print head is **right-aligned on the paper**. `set_label_size` computes `left_margin_dots = MAX_WIDTH_DOTS - width_dots` and issues `GS L` so the origin ends up at the label's left edge. Changing this breaks horizontal alignment for any label narrower than 48 mm.
- `__init__` sends `Cmd.SET_MOTION_UNITS_DOTS` (`GS P 203 203`) so motion-unit commands (`GS L`, `GS W`, `GS $`, etc.) take **dot counts** directly at ~203 dpi. Re-sending `GS P` with different values silently rescales every subsequent geometry command.
- `print_bitmap` emits raster via `_GS_V_RASTER_BIT_IMAGE` (`GS v 0`). Width must be padded up to a byte boundary (`(label_w + 7) & ~7`). The raster is sized to the full label area and the bitmap is placed inside it per `HAlign`/`VAlign`, so input smaller than the label is offset rather than scaled.
- PIL mode `'1'`: `0 = black, 255 = white`. Printer wire format: `1 = black dot`. `_to_bit_grid` does the inversion — keep this in mind when accepting other bitmap types.
- `Cmd` enum holds **only** ESC/POS sequences with no embedded operands (`INIT`, `FORM_FEED`, `SET_MOTION_UNITS_DOTS`). Operand-carrying prefixes (`_GS_L_SET_LEFT_MARGIN`, `_GS_W_SET_PRINT_WIDTH`, `_GS_V_RASTER_BIT_IMAGE`) are module-level `bytes` constants because the operand bytes are appended at call time.

### Rendering layer (`label_printer.config` + `label_printer.render`)

`LabelConfig` (YAML-backed via `from_yaml`/`to_yaml`) owns the full skeleton spec. It has four parts:

- **Common**: `type`, label paper (`width_mm`, `height_mm`, `dots_per_mm`), grid (`count_x`, `count_y`, `gap_mm`), `outline_px`, `printer_port`.
- **Lines**: `lines: list[LineConfig]` — N lines placed inside every cell. Each `LineConfig` carries `name` (UI/CSV-column label; falls back to `Line N` via `line_display_name`), `font_path`, `size_px`, `bold`, `italic`, `underline`, `underline_offset_px`, `offset_x_px`, `offset_y_px`, `default_text`.
- **Type-specific**: `circle_diameter_mm` (VIAL_TOP) and `text_width_mm` / `text_height_mm` (TEXT). Unused fields are preserved as-is when another type is active, so switching back doesn't lose state.
- **Manual matrix**: `manual: list[list[str]]` — row-major `cells_per_label × len(lines)` grid of strings persisted from the Streamlit Manual-source UI. Jagged rows and out-of-range indices default to `""`.

`SkeletonType` is a `StrEnum` → `_CELL_RENDERERS` dispatch table (`str → callable`). Adding a new type = add an enum value, write `_render_<name>(img, draw, center, cell_dims, cell_lines, cfg)` in `render.py`, register it. Both existing renderers finish by calling `_render_lines` so the per-line offset/styling logic stays shared.

`LabelConfig.from_yaml` warns (via the module logger) on unknown top-level or per-line keys instead of silently dropping them. If you intentionally remove a field, expect old configs to log a warning until they're rewritten via `to_yaml`.

Data flow:

```
data/X.csv (one row = one cell, columns map positionally onto cfg.lines)
   → cells_from_csv → list[list[str]]
   → pack_cells_to_labels(cells, cfg.cells_per_label)  [chunks; does NOT pad]
   → render_label(batch, cfg) → PIL Image (mode '1')
```

Key design rules:

- **Short final batches are intentional.** `render_label` loops only over the cells provided; unused grid slots draw nothing (no outline, no text). This is how "don't render a circle if there aren't enough CSV entries" is satisfied — and it generalises to 2-D grids.
- **Grid uses the type-specific cell bounding box, NOT an even slice of the label.** `_cell_box_dots(cfg)` returns `(circle_diameter, circle_diameter)` for VIAL_TOP and `(text_width, text_height)` for TEXT. The full `count_x × count_y` block is centred in the label. `gap_mm` (between cells) may be **negative** so that adjacent outlines overlap into a single shared line (e.g. `gap_mm = -0.125` on an 8 dpmm printer shares a 1-px edge between rectangles — use this to avoid doubled borders). Cells are filled **row-major** (left-to-right, top-to-bottom).
- **Lines are positioned, not stacked.** `_render_lines` draws each line at `(cell_cx + lc.offset_x_px, cell_cy + lc.offset_y_px)`. `_draw_line` uses PIL anchor `"mm"` (middle-middle), so the offset point is the text's visual centre; underline y becomes `cy + size_px/2 + underline_offset_px`. There is no auto gap/stacking — explicit offsets only.
- Bold → PIL `stroke_width=1`. Italic → render text to a temp `L` image, apply affine shear (0.2), paste through a mask. Both paths funnel through `_draw_line`; see `_render_text_image`.
- Empty cells on a line with a non-empty `default_text` render the default (with its underline, if any) — this is the blank-writing-line placeholder for vial bottom rows.
- Fonts are cached module-level in `_font_cache` keyed by `(path, size_px)`. Call `_load_font` rather than `ImageFont.truetype` directly.
- **Config I/O is YAML.** `from_yaml` uses `yaml.safe_load`; `to_yaml` uses `yaml.safe_dump(asdict(self), sort_keys=False)` so the field order in `LabelConfig` is the file's key order. There's no per-section comment any more — saved files are pure data.

`render_labels_from_csv` (in `csv_io.py`) is the shared entry point used by the CLI's `print` and `preview` subcommands and the Streamlit app — changes to the CSV → bitmap pipeline must keep all three working. The parity test (`tests/test_render_parity.py`) byte-compares its output against committed goldens, so any pixel-level renderer change requires running `tests/generate_golden.py` deliberately.

### Streamlit app (`label_printer.app`)

The entry module is `app/main.py`; the CLI's `ui` subcommand spawns `streamlit run` against it. Sidebar widgets live in `app/sidebar.py`, the text-source block in `app/text_source.py`, and the font scan in `app/fonts.py`.

- **Config picker** lists `data/*.yaml`. All widget keys are prefixed with the config's file stem (`f"{prefix}_..."`), so switching configs gives the new file a fresh widget-state namespace and its values are loaded as defaults.
- **Auto-persist order matters.** `app/main.py::main` saves YAML **after** `render_text_source` returns the captured manual matrix, so Manual-mode edits survive the rerun. Keep this order when refactoring — saving earlier will drop manual-matrix edits. CSV saves (via `save_csv` in `csv_io.py`) go to the sibling `.csv`; both writes use tmp + atomic rename.
- **Dynamic lines**: a "Number of lines" input controls how many `LineConfig` editors appear; the CSV editor's column set follows suit (`line_1`, `line_2`, …). Changing line count changes the data-editor key so its schema resets cleanly.
- **Per-line X/Y offset sliders** are bounded to ±(cell bounding box / 2), computed from the *current* sidebar values (`circle_diameter_mm` for VIAL_TOP, `text_width/height_mm` for TEXT). Saved offsets outside the new range are clamped with `_clamp(...)` in `app/sidebar.py` before being passed to `st.slider` — otherwise Streamlit raises on an out-of-range `value=`.
- **Manual source** pre-fills each `text_input` from `initial.manual[i][j]` (out-of-range defaults to `""`), then captures the current widget values into `cfg.manual` before the save. CSV mode preserves `cfg.manual = initial.manual` untouched, so switching sources doesn't lose either side.
- **Type-specific UI** lives in `_type_specific_section` (sidebar.py): when `type = VIAL_TOP`, a "Circle diameter" input appears; when `type = TEXT`, a "Text box width/height" pair appears. Add new types' extras there, not at the top.
- Font picker scans `C:/Windows/Fonts/*.{ttf,otf}` once (`@st.cache_data` in `app/fonts.py`) and maps each file's `(family, style)` from `ImageFont.getname()` to its path. A config path not in the scan is prepended as `(custom) filename`. The scan catches `OSError` only — broader exceptions are intentionally not swallowed.
- Label bitmaps are embedded through `streamlit.components.v1.html` (not `st.image`) to bypass Streamlit's `img { max-width: 100% }` rule — this is what makes the display-scale slider keep working past ~4×. `image-rendering: pixelated` preserves the printer-dot grid.
- Per-label "🖨 Print" button calls `printer.print_image_with_config(img, cfg)` which opens a fresh `LabelPrinter` (using its context-manager interface), prints, and closes. Bluetooth serial doesn't survive Streamlit's rerun model cleanly, so don't keep a printer instance alive in session state.

## Lint / format

Ruff is configured under `[tool.ruff]` in `pyproject.toml`. Selected rules: `E/F/W`, `I`, `UP`, `B`, `SIM`, `RUF`. Line length is 100, but `E501` is ignored (we read source off-screen). The Streamlit app entry needs `E402` ignored because `streamlit run` requires a top-level `set_page_config` import-time call.
