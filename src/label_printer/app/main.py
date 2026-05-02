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
from label_printer.config import LabelConfig, SkeletonType, csv_path_for
from label_printer.csv_io import save_csv
from label_printer.printer import HAlign, VAlign, make_printer, print_image_with_config
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

    label_batches, cfg.manual, is_csv = render_text_source(
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

    _render_labels(cfg, label_batches, prefix, is_csv=is_csv)


def _config_picker() -> tuple[Path, str]:
    DATA_DIR.mkdir(exist_ok=True)
    config_files = sorted(p.name for p in DATA_DIR.glob("*.yaml"))

    with st.sidebar.expander("Config file", expanded=True):
        if config_files:
            default_idx = (
                config_files.index(DEFAULT_CONFIG) if DEFAULT_CONFIG in config_files else 0
            )
            selected_name = st.selectbox(
                "File",
                config_files,
                index=default_idx,
                key="config_file",
            )
        else:
            selected_name = None
            st.caption(f"No .yaml configs in {DATA_DIR}/ — create one below.")
        if st.button("➕ New config", key="new_config_btn", use_container_width=True):
            _new_config_dialog()

    if selected_name is None:
        st.stop()
    config_path = DATA_DIR / selected_name
    return config_path, config_path.stem


@st.dialog("Create new config")
def _new_config_dialog() -> None:
    name = st.text_input(
        "Config name",
        key="new_config_name",
        help="File stem; '.yaml' is added automatically.",
    )
    type_options = [t.value for t in SkeletonType]
    skeleton_type = st.selectbox(
        "Skeleton type",
        type_options,
        key="new_config_type",
    )
    c_create, c_cancel = st.columns(2)
    if c_create.button("Create", type="primary", use_container_width=True):
        clean = (name or "").strip()
        if not clean:
            st.error("Name cannot be empty.")
            return
        if any(sep in clean for sep in ("/", "\\")) or clean.startswith("."):
            st.error("Name must not contain path separators or start with a dot.")
            return
        new_path = DATA_DIR / f"{clean}.yaml"
        if new_path.exists():
            st.error(f"{new_path.name} already exists.")
            return
        try:
            LabelConfig(type=skeleton_type).to_yaml(new_path)
            save_csv(csv_path_for(new_path), [], n_columns=1)
        except OSError as e:
            st.error(f"Could not create files: {e}")
            return
        # Pre-select the new file on the next run; the selectbox keyed
        # 'config_file' will pick this up before its own index= takes effect.
        st.session_state["config_file"] = new_path.name
        st.rerun()
    if c_cancel.button("Cancel", use_container_width=True):
        st.rerun()


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
    is_csv: bool = False,
) -> None:
    scale = st.slider("Display scale", 1, 4, 2, key="scale")

    st.caption(
        f"{cfg.type} · {cfg.width_dots}×{cfg.height_dots} dots "
        f"({cfg.width_mm:g}×{cfg.height_mm:g} mm) · "
        f"grid {cfg.count_x}×{cfg.count_y} · {len(label_batches)} label(s)"
    )

    # Pre-render every batch so a "Print all" can reuse the same images
    # without re-rendering, and a per-label render error doesn't block the
    # rest of the previews.
    rendered: list[tuple[int, list[list[str]], object]] = []
    for i, batch in enumerate(label_batches, 1):
        try:
            img = render_label(batch, cfg)
        except Exception as e:
            st.error(f"Label {i}: {e}")
            continue
        rendered.append((i, batch, img))

    if is_csv and rendered:
        _render_print_all_button(cfg, rendered, prefix)

    for i, batch, img in rendered:
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


def _render_print_all_button(
    cfg: LabelConfig,
    rendered: list,
    prefix: str,
) -> None:
    """Open the printer once and stream every pre-rendered label through it."""
    n = len(rendered)
    if not st.button(
        f"🖨 Print all ({n} label{'s' if n != 1 else ''})",
        key=f"{prefix}_print_all",
        type="primary",
    ):
        return
    progress = st.progress(0.0, text=f"Printing 0/{n} on {cfg.printer_port}…")
    try:
        with make_printer(cfg) as p:
            for k, (_i, _batch, img) in enumerate(rendered, 1):
                p.print_bitmap(img, halign=HAlign.LEFT, valign=VAlign.TOP)
                p.next_label()
                progress.progress(k / n, text=f"Printing {k}/{n} on {cfg.printer_port}…")
                # Inter-label pause: lets the printer finish feeding/cutting
                # before the next raster lands, and keeps BT serial from
                # back-pressuring on small buffers.
                # if k < n:
                    # time.sleep(0.5)
        progress.empty()
        st.success(f"Sent {n} label(s) to {cfg.printer_port}")
    except Exception as e:
        progress.empty()
        st.error(f"Batch print failed: {e}")


# Streamlit imports the module top-level when launched via `streamlit run`,
# so the entry has to execute on import — not under `if __name__ == "__main__"`.
main()
