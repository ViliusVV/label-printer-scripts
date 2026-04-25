"""Streamlit entry point.

Run via the CLI: `uv run label-printer ui` (or `streamlit run` against
this file directly).
"""

from __future__ import annotations

import base64
import io
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

from label_printer.app.sidebar import render_sidebar
from label_printer.app.text_source import render_text_source
from label_printer.config import LabelConfig, csv_path_for
from label_printer.printer import HAlign, VAlign, print_image_with_config
from label_printer.render import render_label

DATA_DIR = Path("data")
DEFAULT_CONFIG = "VIAL_TOP_default.yaml"


def main() -> None:
    st.set_page_config(page_title="Label Preview", layout="wide")
    st.title("Label skeleton preview")

    config_path, prefix = _config_picker()
    csv_path = csv_path_for(config_path)

    initial = _load_config_or_stop(config_path)

    cfg = render_sidebar(initial, prefix)

    label_batches, cfg.manual = render_text_source(
        cfg,
        csv_path,
        prefix,
        initial.manual,
    )

    # YAML save AFTER text-source so Manual-mode matrix edits are persisted.
    try:
        cfg.to_yaml(config_path)
        st.sidebar.caption(f"Auto-saved to {config_path}")
    except OSError as e:
        st.sidebar.error(f"Couldn't save {config_path.name}: {e}")

    _render_labels(cfg, label_batches, prefix)


def _config_picker() -> tuple[Path, str]:
    DATA_DIR.mkdir(exist_ok=True)
    config_files = sorted(p.name for p in DATA_DIR.glob("*.yaml"))
    if not config_files:
        st.error(f"No .yaml configs in {DATA_DIR}/")
        st.stop()

    with st.sidebar.expander("Config file", expanded=True):
        default_idx = config_files.index(DEFAULT_CONFIG) if DEFAULT_CONFIG in config_files else 0
        selected_name = st.selectbox(
            "File",
            config_files,
            index=default_idx,
            key="config_file",
        )
    config_path = DATA_DIR / selected_name
    return config_path, config_path.stem


def _load_config_or_stop(config_path: Path) -> LabelConfig:
    try:
        return LabelConfig.from_yaml(config_path)
    except Exception as e:
        st.error(f"Failed to load {config_path}: {e}")
        st.stop()


def _render_labels(
    cfg: LabelConfig,
    label_batches: list[list[list[str]]],
    prefix: str,
) -> None:
    scale = st.slider("Display scale", 1, 4, 2, key="scale")

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
        # components.html avoids Streamlit's `img { max-width: 100% }` rule
        # so the display-scale slider keeps working past ~4×.
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
                    print_image_with_config(img, cfg, halign=HAlign.LEFT, valign=VAlign.TOP)
                st.success(f"Sent label {i} to {cfg.printer_port}")
            except Exception as e:
                st.error(f"Print failed: {e}")


# Streamlit imports the module top-level when launched via `streamlit run`,
# so the entry has to execute on import — not under `if __name__ == "__main__"`.
main()
