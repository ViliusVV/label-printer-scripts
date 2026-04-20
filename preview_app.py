"""Interactive Streamlit preview for the label skeleton.

Lets you nudge every variable in LabelConfig and see the bitmap live.
In CSV mode, all labels are rendered (using the same helper that
print_labels.py uses, so what you see is what gets printed).

Config changes in the sidebar are auto-saved to config.toml on every rerun.

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
    CircleText,
    LabelConfig,
    LineConfig,
    circles_from_csv,
    pack_circles_to_labels,
    render_label,
)
from printer import HAlign, LabelPrinter, VAlign

CONFIG_PATH = Path("config.toml")
CSV_PATH = Path("labels.csv")
FONTS_DIR = Path("C:/Windows/Fonts")


def _val(x) -> str:
    return "" if pd.isna(x) else str(x)


def _save_csv(path: Path, circles: list[CircleText]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv_mod.writer(f)
        w.writerow(["top", "middle", "bottom"])
        for c in circles:
            w.writerow([c.top, c.middle, c.bottom])
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
    """Return [(display_name, path), ...] sorted by display name."""
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
        # Prefer the first path seen for a given display name.
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

st.set_page_config(page_title="Label Preview", layout="wide")
st.title("Round vial label — skeleton preview")


# --- Load initial config once per session -------------------------------------

if "initial_cfg" not in st.session_state:
    try:
        st.session_state["initial_cfg"] = LabelConfig.from_toml(CONFIG_PATH)
    except FileNotFoundError:
        st.session_state["initial_cfg"] = LabelConfig()

initial: LabelConfig = st.session_state["initial_cfg"]


def _line_controls(label: str, defaults: LineConfig) -> LineConfig:
    with st.sidebar.expander(label, expanded=False):
        font_path = _font_selectbox(
            "Font", defaults.font_path, key=f"{label}_font"
        )
        size_px = st.slider(
            "Size (px)", 6, 120, value=defaults.size_px, key=f"{label}_size"
        )
        c1, c2, c3 = st.columns(3)
        bold = c1.checkbox("Bold", value=defaults.bold, key=f"{label}_bold")
        italic = c2.checkbox("Italic", value=defaults.italic, key=f"{label}_italic")
        underline = c3.checkbox(
            "Underline", value=defaults.underline, key=f"{label}_underline"
        )
        default_text = st.text_input(
            "Default when empty", value=defaults.default_text, key=f"{label}_default"
        )
    return LineConfig(
        font_path=font_path,
        size_px=int(size_px),
        bold=bold,
        italic=italic,
        underline=underline,
        default_text=default_text,
    )


# --- Sidebar: geometry --------------------------------------------------------

with st.sidebar.expander("Label paper", expanded=True):
    width_mm = st.number_input(
        "Width (mm)", 5.0, 100.0, value=float(initial.width_mm), step=0.5, key="width_mm"
    )
    height_mm = st.number_input(
        "Height (mm)", 5.0, 100.0, value=float(initial.height_mm), step=0.5, key="height_mm"
    )
    dots_per_mm = st.number_input(
        "Dots / mm", 4, 16, value=int(initial.dots_per_mm), key="dots_per_mm"
    )

with st.sidebar.expander("Circles", expanded=True):
    circle_diameter_mm = st.number_input(
        "Diameter (mm)", 1.0, 50.0,
        value=float(initial.circle_diameter_mm), step=0.5, key="circle_diameter_mm",
    )
    circle_count = st.number_input(
        "Count", 1, 6, value=int(initial.circle_count), key="circle_count"
    )
    outline_px = st.number_input(
        "Outline thickness (px)", 1, 5, value=int(initial.outline_px), key="outline_px"
    )
    horizontal_gap_mm = st.number_input(
        "Gap (mm)", 0.0, 20.0,
        value=float(initial.horizontal_gap_mm), step=0.5, key="horizontal_gap_mm",
    )
    line_gap_px = st.slider(
        "Line gap (px)", 0, 20, value=int(initial.line_gap_px), key="line_gap_px"
    )

# --- Sidebar: per-line --------------------------------------------------------

top_cfg = _line_controls("Top line", initial.top)
middle_cfg = _line_controls("Middle line", initial.middle)
bottom_cfg = _line_controls("Bottom line", initial.bottom)

with st.sidebar.expander("Printer", expanded=False):
    printer_port = st.text_input("Serial port", "COM4", key="printer_port")

cfg = LabelConfig(
    width_mm=width_mm,
    height_mm=height_mm,
    dots_per_mm=int(dots_per_mm),
    circle_diameter_mm=circle_diameter_mm,
    circle_count=int(circle_count),
    outline_px=int(outline_px),
    horizontal_gap_mm=horizontal_gap_mm,
    line_gap_px=int(line_gap_px),
    top=top_cfg,
    middle=middle_cfg,
    bottom=bottom_cfg,
)

# --- Auto-save ----------------------------------------------------------------
try:
    cfg.to_toml(CONFIG_PATH)
except OSError as e:
    st.sidebar.error(f"Couldn't save config.toml: {e}")
else:
    st.sidebar.caption(f"Auto-saved to {CONFIG_PATH.name}")

# --- Text source --------------------------------------------------------------

source = st.radio("Text source", ["Manual", "labels.csv"], horizontal=True)

if source == "Manual":
    defaults_top = ["R1", "C1", "L1", "D1", "Q1", "U1"]
    defaults_mid = ["10k", "100n", "10uH", "1N4148", "BC547", "LM358"]
    cols = st.columns(cfg.circle_count)
    manual_circles: list[CircleText] = []
    for i, col in enumerate(cols):
        with col:
            st.markdown(f"**Circle {i + 1}**")
            t = st.text_input("Top", defaults_top[i % len(defaults_top)], key=f"t{i}")
            m = st.text_input("Middle", defaults_mid[i % len(defaults_mid)], key=f"m{i}")
            b = st.text_input("Bottom", "", key=f"b{i}")
            manual_circles.append(CircleText(top=t, middle=m, bottom=b))
    label_batches = [manual_circles]
else:
    try:
        loaded = circles_from_csv(CSV_PATH)
    except FileNotFoundError:
        loaded = []

    df_in = pd.DataFrame(
        [{"top": c.top, "middle": c.middle, "bottom": c.bottom} for c in loaded],
        columns=["top", "middle", "bottom"],
    )
    df_edited = st.data_editor(
        df_in,
        num_rows="dynamic",
        use_container_width=True,
        key="csv_editor",
        column_config={
            "top": st.column_config.TextColumn("Top"),
            "middle": st.column_config.TextColumn("Middle"),
            "bottom": st.column_config.TextColumn("Bottom"),
        },
    )

    csv_circles = [
        CircleText(top=_val(r.top), middle=_val(r.middle), bottom=_val(r.bottom))
        for r in df_edited.itertuples(index=False)
        if any(_val(getattr(r, c)).strip() for c in ("top", "middle", "bottom"))
    ]
    try:
        _save_csv(CSV_PATH, csv_circles)
        st.caption(f"{len(csv_circles)} row(s) · auto-saved to {CSV_PATH.name}")
    except OSError as e:
        st.error(f"Couldn't save labels.csv: {e}")

    label_batches = pack_circles_to_labels(csv_circles, cfg.circle_count)
    if not label_batches:
        st.info("CSV has no rows — add some via the table above.")
        st.stop()

scale = st.slider("Display scale", 1, 12, 6, key="scale")

st.caption(
    f"{cfg.width_dots}×{cfg.height_dots} dots "
    f"({cfg.width_mm:g}×{cfg.height_mm:g} mm) — "
    f"{len(label_batches)} label(s)"
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

    st.markdown(
        f"<div style='text-align:center'><b>Label {i}/{len(label_batches)}</b> "
        f"— {len(batch)} circle(s)</div>",
        unsafe_allow_html=True,
    )
    display_h = img.height * scale
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
        key=f"dl_{i}",
    )
    if c_print.button("🖨 Print", key=f"print_{i}"):
        try:
            with st.spinner(f"Printing label {i} on {printer_port}…"):
                _print_image(img, printer_port, cfg)
            st.success(f"Sent label {i} to {printer_port}")
        except Exception as e:
            st.error(f"Print failed: {e}")
