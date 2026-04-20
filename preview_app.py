"""Interactive Streamlit preview for label skeletons.

Config files live in `data/`. Pick one in the sidebar; every widget
auto-saves to it. Changes to the CSV editor auto-save the sibling .csv.
Use the same config via `python print_labels.py data/<name>.toml`
to print exactly what you see.

Run:  uv run streamlit run preview_app.py
"""
from __future__ import annotations

import base64
import csv as csv_mod
import io
from pathlib import Path

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components
from PIL import Image, ImageFont

from labels import (
    LabelConfig,
    LineConfig,
    SkeletonType,
    cells_from_csv,
    csv_path_for,
    pack_cells_to_labels,
    render_label,
)
from printer import HAlign, LabelPrinter, VAlign

DATA_DIR = Path("data")
FONTS_DIR = Path("C:/Windows/Fonts")

st.set_page_config(page_title="Label Preview", layout="wide")
st.title("Label skeleton preview")


# --- Helpers ------------------------------------------------------------------

def _val(x) -> str:
    return "" if pd.isna(x) else str(x)


def _save_csv(path: Path, cells: list[list[str]], n_columns: int) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv_mod.writer(f)
        w.writerow([f"line_{i + 1}" for i in range(n_columns)])
        for c in cells:
            padded = list(c) + [""] * max(0, n_columns - len(c))
            w.writerow(padded[:n_columns])
    tmp.replace(path)


def _print_image(img: Image.Image, port: str, cfg: LabelConfig) -> None:
    p = LabelPrinter(
        port, label_width_mm=cfg.width_mm, label_height_mm=cfg.height_mm
    )
    try:
        p.print_bitmap(img, halign=HAlign.LEFT, valign=VAlign.TOP)
        p.next_label()
    finally:
        p.close()


@st.cache_data(show_spinner="Scanning fonts…")
def available_fonts() -> list[tuple[str, str]]:
    if not FONTS_DIR.exists():
        return []
    seen: dict[str, str] = {}
    for path in sorted(list(FONTS_DIR.glob("*.ttf")) + list(FONTS_DIR.glob("*.otf"))):
        try:
            family, style = ImageFont.truetype(str(path), 16).getname()
            display = f"{family} {style}".strip() or path.stem
        except Exception:
            display = path.stem
        p_str = str(path).replace("\\", "/")
        seen.setdefault(display, p_str)
    return sorted(seen.items(), key=lambda kv: kv[0].lower())


def _font_selectbox(label: str, current_path: str, key: str) -> str:
    fonts = available_fonts()
    paths = [p for _, p in fonts]
    display_by_path = {p: d for d, p in fonts}
    if current_path and current_path not in paths:
        paths.insert(0, current_path)
        display_by_path[current_path] = f"(custom) {Path(current_path).name}"
    if not paths:
        return st.text_input(label, current_path, key=key)
    return st.selectbox(
        label,
        paths,
        index=paths.index(current_path) if current_path in paths else 0,
        format_func=lambda p: display_by_path.get(p, p),
        key=key,
    )


# --- Config file picker -------------------------------------------------------

DATA_DIR.mkdir(exist_ok=True)
config_files = sorted(p.name for p in DATA_DIR.glob("*.toml"))
if not config_files:
    st.error(f"No .toml configs in {DATA_DIR}/")
    st.stop()

with st.sidebar.expander("Config file", expanded=True):
    selected_name = st.selectbox(
        "File", config_files,
        index=0 if "VIAL_TOP_default.toml" not in config_files
        else config_files.index("VIAL_TOP_default.toml"),
        key="config_file",
    )

CONFIG_PATH = DATA_DIR / selected_name
CSV_PATH = csv_path_for(CONFIG_PATH)
prefix = CONFIG_PATH.stem  # widget keys are prefixed so switching files loads defaults

# Re-read initial config every rerun. Widgets with session-state values win;
# fresh widgets (after file switch -> new prefix) see the new defaults.
try:
    initial = LabelConfig.from_toml(CONFIG_PATH)
except Exception as e:
    st.error(f"Failed to load {CONFIG_PATH}: {e}")
    st.stop()


# --- Sidebar: label + grid + type-specific -----------------------------------

with st.sidebar.expander("Type & layout", expanded=True):
    type_options = [t.value for t in SkeletonType]
    type_idx = type_options.index(initial.type) if initial.type in type_options else 0
    cfg_type = st.selectbox("Skeleton type", type_options, index=type_idx, key=f"{prefix}_type")

with st.sidebar.expander("Label paper", expanded=False):
    width_mm = st.number_input(
        "Width (mm)", 5.0, 100.0,
        value=float(initial.width_mm), step=0.5, key=f"{prefix}_width_mm",
    )
    height_mm = st.number_input(
        "Height (mm)", 5.0, 100.0,
        value=float(initial.height_mm), step=0.5, key=f"{prefix}_height_mm",
    )
    dots_per_mm = st.number_input(
        "Dots / mm", 4, 16, value=int(initial.dots_per_mm), key=f"{prefix}_dots_per_mm"
    )

with st.sidebar.expander("Grid", expanded=True):
    count_x = st.number_input(
        "Count X", 1, 10, value=int(initial.count_x), key=f"{prefix}_count_x"
    )
    count_y = st.number_input(
        "Count Y", 1, 10, value=int(initial.count_y), key=f"{prefix}_count_y"
    )
    gap_mm = st.number_input(
        "Gap between cells (mm, negative = overlap / shared outline)",
        -10.0, 20.0,
        value=float(initial.gap_mm), step=0.125, key=f"{prefix}_gap_mm",
    )

with st.sidebar.expander("Common styling", expanded=False):
    outline_px = st.number_input(
        "Outline thickness (px, 0 = none)", 0, 10,
        value=int(initial.outline_px), key=f"{prefix}_outline_px",
    )
    line_gap_px = st.slider(
        "Line gap (px)", 0, 20,
        value=int(initial.line_gap_px), key=f"{prefix}_line_gap_px",
    )

# Type-specific knobs. Each renderer reads its own cell bounding box
# (circle diameter for VIAL_TOP, width/height for TEXT); the grid is
# built from that box, not from evenly dividing the label.
if cfg_type == SkeletonType.VIAL_TOP.value:
    with st.sidebar.expander("VIAL_TOP", expanded=False):
        circle_diameter_mm = st.number_input(
            "Circle diameter (mm)", 1.0, 50.0,
            value=float(initial.circle_diameter_mm), step=0.5,
            key=f"{prefix}_circle_diameter_mm",
        )
    text_width_mm = initial.text_width_mm
    text_height_mm = initial.text_height_mm
elif cfg_type == SkeletonType.TEXT.value:
    circle_diameter_mm = initial.circle_diameter_mm
    with st.sidebar.expander("TEXT", expanded=False):
        text_width_mm = st.number_input(
            "Text box width (mm)", 1.0, 100.0,
            value=float(initial.text_width_mm), step=0.5,
            key=f"{prefix}_text_width_mm",
        )
        text_height_mm = st.number_input(
            "Text box height (mm)", 1.0, 100.0,
            value=float(initial.text_height_mm), step=0.5,
            key=f"{prefix}_text_height_mm",
        )
else:
    circle_diameter_mm = initial.circle_diameter_mm
    text_width_mm = initial.text_width_mm
    text_height_mm = initial.text_height_mm

with st.sidebar.expander("Printer", expanded=False):
    printer_port = st.text_input(
        "Serial port", value=initial.printer_port, key=f"{prefix}_printer_port"
    )


# --- Sidebar: lines -----------------------------------------------------------

with st.sidebar.expander("Lines", expanded=True):
    n_lines = st.number_input(
        "Number of lines", 1, 10,
        value=max(1, len(initial.lines)), key=f"{prefix}_n_lines",
    )


def _line_controls(idx: int, defaults: LineConfig) -> LineConfig:
    k = f"{prefix}_line{idx}"
    with st.sidebar.expander(f"Line {idx + 1}", expanded=False):
        font_path = _font_selectbox("Font", defaults.font_path, key=f"{k}_font")
        size_px = st.slider(
            "Size (px)", 6, 120, value=defaults.size_px, key=f"{k}_size"
        )
        c1, c2, c3 = st.columns(3)
        bold = c1.checkbox("Bold", value=defaults.bold, key=f"{k}_bold")
        italic = c2.checkbox("Italic", value=defaults.italic, key=f"{k}_italic")
        underline = c3.checkbox(
            "Underline", value=defaults.underline, key=f"{k}_underline"
        )
        underline_offset_px = st.slider(
            "Underline offset (px)", -10, 30,
            value=int(defaults.underline_offset_px), key=f"{k}_ul_offset",
        )
        default_text = st.text_input(
            "Default when empty", value=defaults.default_text, key=f"{k}_default"
        )
    return LineConfig(
        font_path=font_path,
        size_px=int(size_px),
        bold=bold,
        italic=italic,
        underline=underline,
        underline_offset_px=int(underline_offset_px),
        default_text=default_text,
    )


lines = [
    _line_controls(i, initial.lines[i] if i < len(initial.lines) else LineConfig())
    for i in range(int(n_lines))
]

cfg = LabelConfig(
    type=cfg_type,
    width_mm=width_mm,
    height_mm=height_mm,
    dots_per_mm=int(dots_per_mm),
    count_x=int(count_x),
    count_y=int(count_y),
    gap_mm=gap_mm,
    outline_px=int(outline_px),
    line_gap_px=int(line_gap_px),
    circle_diameter_mm=circle_diameter_mm,
    text_width_mm=text_width_mm,
    text_height_mm=text_height_mm,
    printer_port=printer_port,
    lines=lines,
)

# Auto-save the config
try:
    cfg.to_toml(CONFIG_PATH)
    st.sidebar.caption(f"Auto-saved to {CONFIG_PATH}")
except OSError as e:
    st.sidebar.error(f"Couldn't save {CONFIG_PATH.name}: {e}")


# --- Text source --------------------------------------------------------------

source = st.radio("Text source", ["Manual", CSV_PATH.name], horizontal=True)
n_cols = len(cfg.lines)
col_names = [f"line_{i + 1}" for i in range(n_cols)]
cells_per_label = cfg.cells_per_label

if source == "Manual":
    cells: list[list[str]] = []
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
                        f"Line {j + 1}", "",
                        key=f"{prefix}_manual_{i}_{j}",
                    )
                )
        cells.append(row)
    label_batches = [cells] if cells else []
else:
    try:
        loaded = cells_from_csv(CSV_PATH)
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
            name: st.column_config.TextColumn(name.replace("_", " ").title())
            for name in col_names
        },
    )

    csv_cells = [
        [_val(getattr(r, col_names[j])) for j in range(n_cols)]
        for r in df_edited.itertuples(index=False)
        if any(_val(getattr(r, col_names[j])).strip() for j in range(n_cols))
    ]
    try:
        _save_csv(CSV_PATH, csv_cells, n_cols)
        st.caption(f"{len(csv_cells)} row(s) · auto-saved to {CSV_PATH}")
    except OSError as e:
        st.error(f"Couldn't save {CSV_PATH.name}: {e}")

    label_batches = pack_cells_to_labels(csv_cells, cells_per_label)
    if not label_batches:
        st.info("CSV has no rows — add some via the table above.")
        st.stop()


# --- Render + per-label actions ----------------------------------------------

scale = st.slider("Display scale", 1, 12, 6, key="scale")

st.caption(
    f"{cfg.type} · {cfg.width_dots}×{cfg.height_dots} dots "
    f"({cfg.width_mm:g}×{cfg.height_mm:g} mm) · "
    f"grid {cfg.count_x}×{cfg.count_y} · {len(label_batches)} label(s)"
)

for i, batch in enumerate(label_batches, 1):
    try:
        img = render_label(batch, cfg)
    except Exception as e:
        st.error(f"Label {i}: {e}")
        continue

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()
    b64 = base64.b64encode(png_bytes).decode()
    display_w = img.width * scale
    display_h = img.height * scale

    st.markdown(
        f"<div style='text-align:center'><b>Label {i}/{len(label_batches)}</b> "
        f"— {len(batch)} cell(s)</div>",
        unsafe_allow_html=True,
    )
    components.html(
        f"<div style='text-align:center;padding:4px 0;'>"
        f"<img src='data:image/png;base64,{b64}' "
        f"style='width:{display_w}px;height:{display_h}px;max-width:none;"
        f"image-rendering:pixelated;image-rendering:crisp-edges;'/></div>",
        height=display_h + 16,
        scrolling=True,
    )

    _, c_dl, c_print, _ = st.columns([2, 1, 1, 2])
    c_dl.download_button(
        "Download 1:1 PNG",
        png_bytes,
        f"label_{i}.png",
        "image/png",
        key=f"{prefix}_dl_{i}",
    )
    if c_print.button("🖨 Print", key=f"{prefix}_print_{i}"):
        try:
            with st.spinner(f"Printing label {i} on {cfg.printer_port}…"):
                _print_image(img, cfg.printer_port, cfg)
            st.success(f"Sent label {i} to {cfg.printer_port}")
        except Exception as e:
            st.error(f"Print failed: {e}")
