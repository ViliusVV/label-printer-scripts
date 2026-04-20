# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Dependency management uses **uv** (`pyproject.toml` + `uv.lock`), Python 3.13+.

```bash
uv sync                          # install runtime deps (pillow, pyserial)
uv sync --extra preview          # also install streamlit for the interactive preview

uv run python print_labels.py    # render every row of labels.csv and send to the printer
uv run python preview.py         # one-shot render; saves preview_N.png and opens the first
uv run streamlit run preview_app.py   # interactive preview with live config/CSV editing
uv run python main.py            # dev sandbox (esc_hello / print_circles helpers)
```

No tests or linter are configured. The serial port for the printer is hardcoded as `COM4` in `main.py` and `print_labels.py`; the Streamlit app exposes it as a sidebar input.

## Architecture

Two layers that stay deliberately decoupled:

1. **Label rendering** (`labels.py`) — pure PIL. Produces a mode `'1'` bitmap. Knows nothing about serial/ESC/POS.
2. **Printer transport** (`printer.py`) — `LabelPrinter` class, ESC/POS over `pyserial`. Knows nothing about circles, fonts, or CSVs.

All entry points (`print_labels.py`, `preview.py`, `preview_app.py`, `main.py`) compose the two by passing a PIL Image from layer 1 into `LabelPrinter.print_bitmap`.

### Printer layer (`printer.py`)

Target is a **TF P2 Bluetooth thermal label printer** (see `memory/project_printer_hardware.md`): ESC/POS command set, 8 dots/mm, **384-dot maximum print width** (48 mm).

Quirks that must be preserved when editing:

- The print head is **right-aligned on the paper**. `set_label_size` computes `left_margin_dots = MAX_WIDTH_DOTS - width_dots` and issues `GS L` so the origin ends up at the label's left edge. Changing this breaks horizontal alignment for any label narrower than 48 mm.
- `__init__` sends `GS P 203 203` (`GS_P_DOTS`) so motion-unit commands (`GS L`, `GS W`, `GS $`, etc.) take **dot counts** directly at ~203 dpi. Re-sending `GS P` with different values silently rescales every subsequent geometry command.
- `print_bitmap` emits raster via `GS v 0`. Width must be padded up to a byte boundary (`(label_w + 7) & ~7`). The raster is sized to the full label area and the bitmap is placed inside it per `HAlign`/`VAlign`, so input smaller than the label is centred/offset rather than scaled.
- PIL mode `'1'`: `0 = black, 255 = white`. Printer wire format: `1 = black dot`. `_to_bit_grid` does the inversion — keep this in mind when accepting other bitmap types.

### Rendering layer (`labels.py`)

`LabelConfig` (TOML-backed via `from_toml`/`to_toml`) owns the full skeleton spec: label geometry, circle count/diameter/gap, and three `LineConfig`s (top/middle/bottom) with independent font path, size, bold, italic, underline, and `default_text`.

Data flow:

```
labels.csv (one row = one circle, columns top/middle/bottom)
   → circles_from_csv → list[CircleText]
   → pack_circles_to_labels(circles, cfg.circle_count)  [chunks; does NOT pad]
   → render_label(batch, cfg) → PIL Image (mode '1')
```

Key design rules:

- **Short final batches are intentional.** `render_label` loops over the provided circles only; unused slots are left blank (no circle outline, no text). This is how the "don't render a circle if there aren't enough CSV entries" requirement is satisfied.
- Horizontal layout is computed assuming the **full** `cfg.circle_count` slots so a half-empty last label keeps the first circle in the same x-position as a full label.
- Bold is implemented via PIL's `stroke_width=1`. Italic is simulated by rendering the text onto a temp `L` image and applying an affine shear (0.2). See `_render_text_image`. Both paths funnel through `_draw_line`.
- Empty bottom cells render `LineConfig.default_text` (defaults to 8 spaces) underlined — this is the blank-writing-line placeholder.
- Fonts are cached module-level in `_font_cache` keyed by `(path, size_px)`. Call `_load_font` rather than `ImageFont.truetype` directly.

`render_labels_from_csv` is the shared entry point used by both `print_labels.py` and the Streamlit app — changes to the CSV → bitmap pipeline must keep both working.

### Streamlit app (`preview_app.py`)

- **Auto-persists** `config.toml` and `labels.csv` on every rerun (atomic tmp + rename). Sidebar values are loaded into `st.session_state["initial_cfg"]` once per session; subsequent reruns build a fresh `LabelConfig` from widget state and write it back.
- Font picker scans `C:/Windows/Fonts/*.{ttf,otf}` once (`@st.cache_data`) and maps each file's `(family, style)` from `ImageFont.getname()` to its path. A config path not in the scan is prepended as `(custom) filename`.
- Label bitmaps are embedded through `streamlit.components.v1.html` (not `st.image`) to bypass Streamlit's `img { max-width: 100% }` rule — this is what makes the display-scale slider keep working past ~4×. `image-rendering: pixelated` preserves the printer-dot grid.
- Per-label "🖨 Print" button opens a fresh `LabelPrinter` on the sidebar-configured port, prints, and closes — do not try to keep a printer instance alive in session state (Bluetooth serial doesn't survive Streamlit's rerun model cleanly).
