"""Interactive Streamlit preview for the label skeleton.

Lets you nudge every variable in LabelConfig and see the bitmap live.

Run:  streamlit run preview_app.py
Install streamlit first:  uv pip install streamlit   (or `uv sync --extra preview`)
"""
from __future__ import annotations

import io

import streamlit as st
from PIL import Image

from labels import (
    CircleText,
    LabelConfig,
    circles_from_csv,
    pack_circles_to_labels,
    render_label,
)

st.set_page_config(page_title="Label Preview", layout="wide")
st.title("Round vial label — skeleton preview")

# ---- Sidebar: LabelConfig ----
with st.sidebar:
    st.header("Label paper")
    width_mm = st.number_input("Width (mm)", 5.0, 100.0, 36.0, step=0.5)
    height_mm = st.number_input("Height (mm)", 5.0, 100.0, 30.0, step=0.5)
    dots_per_mm = st.number_input("Dots / mm", 4, 16, 8)

    st.header("Circles")
    circle_diameter_mm = st.number_input("Diameter (mm)", 1.0, 50.0, 14.5, step=0.5)
    circle_count = st.number_input("Count", 1, 6, 2)
    outline_px = st.number_input("Outline thickness (px)", 1, 5, 1)
    horizontal_gap_mm = st.number_input("Gap between circles (mm)", 0.0, 20.0, 0.0, step=0.5)

    st.header("Font")
    font_path = st.text_input("Path", "C:/Windows/Fonts/verdanab.ttf")

    st.header("Lines (sizes in px)")
    top_size_px = st.slider("Top size", 6, 80, 28)
    top_underline = st.checkbox("Top underline", True)
    middle_size_px = st.slider("Middle size", 6, 120, 56)
    middle_underline = st.checkbox("Middle underline", False)
    bottom_size_px = st.slider("Bottom size", 6, 80, 28)
    bottom_underline = st.checkbox("Bottom underline", True)
    bottom_default_text = st.text_input("Bottom default when empty", "        ")
    line_gap_px = st.slider("Line gap (px)", 0, 20, 1)

cfg = LabelConfig(
    width_mm=width_mm,
    height_mm=height_mm,
    dots_per_mm=dots_per_mm,
    circle_diameter_mm=circle_diameter_mm,
    circle_count=int(circle_count),
    outline_px=int(outline_px),
    horizontal_gap_mm=horizontal_gap_mm,
    font_path=font_path,
    top_size_px=int(top_size_px),
    top_underline=top_underline,
    middle_size_px=int(middle_size_px),
    middle_underline=middle_underline,
    bottom_size_px=int(bottom_size_px),
    bottom_underline=bottom_underline,
    bottom_default_text=bottom_default_text,
    line_gap_px=int(line_gap_px),
)

# ---- Text inputs ----
source = st.radio("Text source", ["Manual", "labels.csv"], horizontal=True)

if source == "Manual":
    defaults_top = ["R1", "C1", "L1", "D1", "Q1", "U1"]
    defaults_mid = ["10k", "100n", "10uH", "1N4148", "BC547", "LM358"]
    cols = st.columns(cfg.circle_count)
    circles: list[CircleText] = []
    for i, col in enumerate(cols):
        with col:
            st.markdown(f"**Circle {i + 1}**")
            t = st.text_input("Top", defaults_top[i % len(defaults_top)], key=f"t{i}")
            m = st.text_input("Middle", defaults_mid[i % len(defaults_mid)], key=f"m{i}")
            b = st.text_input("Bottom", "", key=f"b{i}")
            circles.append(CircleText(top=t, middle=m, bottom=b))
    labels_to_show = [circles]
else:
    try:
        all_circles = circles_from_csv("labels.csv")
        labels_to_show = pack_circles_to_labels(all_circles, cfg.circle_count)
        idx = st.number_input(
            f"Label index (1–{len(labels_to_show)})",
            min_value=1,
            max_value=max(1, len(labels_to_show)),
            value=1,
        )
        labels_to_show = [labels_to_show[idx - 1]]
    except FileNotFoundError:
        st.error("labels.csv not found in working directory.")
        st.stop()

# ---- Render ----
scale = st.slider("Display scale", 1, 12, 6)

try:
    img = render_label(labels_to_show[0], cfg)
    st.caption(
        f"{cfg.width_dots}×{cfg.height_dots} dots "
        f"({cfg.width_mm:g}×{cfg.height_mm:g} mm)"
    )
    preview = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    st.image(preview.convert("RGB"))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    st.download_button(
        "Download 1:1 PNG", buf.getvalue(), "label.png", "image/png"
    )
except Exception as e:
    st.error(f"Render error: {e}")
