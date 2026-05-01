"""Sidebar widget builders for the Streamlit app.

Each function reads from an `initial: LabelConfig` (the values just loaded
from disk) and returns the user-edited values. All widget keys are prefixed
with the config's file stem so switching configs reloads its defaults.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import streamlit as st

from label_printer.app.fonts import font_selectbox
from label_printer.config import LabelConfig, LineConfig, SkeletonType, line_display_name


def _clamp(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


@dataclass
class TypeSpecific:
    circle_diameter_mm: float
    octa_width_mm: float
    octa_height_mm: float
    octa_horizontal_segment_mm: float
    octa_vertical_segment_mm: float
    text_width_mm: float
    text_height_mm: float


def _carry(initial: LabelConfig, **overrides: float) -> TypeSpecific:
    """TypeSpecific that defaults every field to `initial`'s value, overriding
    only the active type's edited values. Inactive types' fields round-trip
    through the YAML untouched."""
    base = {
        "circle_diameter_mm": initial.circle_diameter_mm,
        "octa_width_mm": initial.octa_width_mm,
        "octa_height_mm": initial.octa_height_mm,
        "octa_horizontal_segment_mm": initial.octa_horizontal_segment_mm,
        "octa_vertical_segment_mm": initial.octa_vertical_segment_mm,
        "text_width_mm": initial.text_width_mm,
        "text_height_mm": initial.text_height_mm,
    }
    base.update(overrides)
    return TypeSpecific(**base)


def render_sidebar(initial: LabelConfig, prefix: str) -> LabelConfig:
    """Build the full sidebar and return the user-edited LabelConfig.

    `cfg.manual` is carried through from `initial`; the caller overwrites it
    after the text-source block has run.
    """
    printer_port = _printer_section(initial, prefix)
    cfg_type, type_specific = _type_section(initial, prefix)
    width_mm, height_mm, dots_per_mm = _label_paper_section(initial, prefix)
    count_x, count_y, gap_mm = _grid_section(initial, prefix)
    outline_px = _styling_section(initial, prefix)

    n_lines = _n_lines_input(initial, prefix)
    cell_w_dots, cell_h_dots = _cell_box_dots_for_ui(
        cfg_type,
        type_specific,
        dots_per_mm,
    )
    lines = [
        _line_controls(
            i,
            initial.lines[i] if i < len(initial.lines) else LineConfig(),
            cell_w_dots,
            cell_h_dots,
            prefix,
        )
        for i in range(n_lines)
    ]

    return LabelConfig(
        type=cfg_type,
        width_mm=width_mm,
        height_mm=height_mm,
        dots_per_mm=dots_per_mm,
        count_x=count_x,
        count_y=count_y,
        gap_mm=gap_mm,
        outline_px=outline_px,
        circle_diameter_mm=type_specific.circle_diameter_mm,
        octa_width_mm=type_specific.octa_width_mm,
        octa_height_mm=type_specific.octa_height_mm,
        octa_horizontal_segment_mm=type_specific.octa_horizontal_segment_mm,
        octa_vertical_segment_mm=type_specific.octa_vertical_segment_mm,
        text_width_mm=type_specific.text_width_mm,
        text_height_mm=type_specific.text_height_mm,
        printer_port=printer_port,
        lines=lines,
        manual=initial.manual,
    )


def _printer_section(initial: LabelConfig, prefix: str) -> str:
    with st.sidebar.expander("Printer", expanded=False):
        return st.text_input(
            "Serial port",
            value=initial.printer_port,
            key=f"{prefix}_printer_port",
        )


def _type_section(initial: LabelConfig, prefix: str) -> tuple[str, TypeSpecific]:
    with st.sidebar.expander("Type & layout", expanded=True):
        type_options = [t.value for t in SkeletonType]
        type_idx = type_options.index(initial.type) if initial.type in type_options else 0
        cfg_type = st.selectbox(
            "Skeleton type",
            type_options,
            index=type_idx,
            key=f"{prefix}_type",
        )
        type_specific = _type_specific_inputs(initial, prefix, cfg_type)
        _computed_values(cfg_type, type_specific)
    return cfg_type, type_specific


def _computed_values(cfg_type: str, ts: TypeSpecific) -> None:
    """Read-only summary derived from the type-specific inputs."""
    st.divider()
    st.caption("Computed")
    if cfg_type == SkeletonType.VIAL_TOP.value:
        area_cm2 = math.pi * (ts.circle_diameter_mm / 2) ** 2 / 100
        st.markdown(f"- Area: **{area_cm2:.2f} cm²**")
        return
    if cfg_type == SkeletonType.VIAL_TOP_OCTA.value:
        # Body diagonals between opposite vertices. There are 8 vertices, but
        # they pair into two distinct spans: top↔bottom corners of the
        # horizontal edges, and left↔right corners of the vertical edges.
        cut_w = (ts.octa_width_mm - ts.octa_horizontal_segment_mm) / 2
        cut_h = (ts.octa_height_mm - ts.octa_vertical_segment_mm) / 2
        slanted_mm = math.hypot(cut_w, cut_h)
        diag_v_mm = math.hypot(ts.octa_horizontal_segment_mm, ts.octa_height_mm)
        diag_h_mm = math.hypot(ts.octa_width_mm, ts.octa_vertical_segment_mm)
        area_cm2 = (ts.octa_width_mm * ts.octa_height_mm - 2 * cut_w * cut_h) / 100
        st.markdown(f"- Slanted edge: **{slanted_mm:.2f} mm**")
        st.markdown(f"- Top↔bottom diagonal: **{diag_v_mm:.2f} mm**")
        st.markdown(f"- Left↔right diagonal: **{diag_h_mm:.2f} mm**")
        st.markdown(f"- Area: **{area_cm2:.2f} cm²**")
        return
    if cfg_type == SkeletonType.TEXT.value:
        diag_mm = math.hypot(ts.text_width_mm, ts.text_height_mm)
        area_cm2 = ts.text_width_mm * ts.text_height_mm / 100
        st.markdown(f"- Diagonal: **{diag_mm:.2f} mm**")
        st.markdown(f"- Area: **{area_cm2:.2f} cm²**")


def _label_paper_section(initial: LabelConfig, prefix: str) -> tuple[float, float, int]:
    with st.sidebar.expander("Label paper", expanded=False):
        width_mm = st.number_input(
            "Width (mm)",
            5.0,
            100.0,
            value=float(initial.width_mm),
            step=0.5,
            key=f"{prefix}_width_mm",
        )
        height_mm = st.number_input(
            "Height (mm)",
            5.0,
            100.0,
            value=float(initial.height_mm),
            step=0.5,
            key=f"{prefix}_height_mm",
        )
        dots_per_mm = st.number_input(
            "Dots / mm",
            4,
            16,
            value=int(initial.dots_per_mm),
            key=f"{prefix}_dots_per_mm",
        )
    return width_mm, height_mm, int(dots_per_mm)


def _grid_section(initial: LabelConfig, prefix: str) -> tuple[int, int, float]:
    with st.sidebar.expander("Grid", expanded=True):
        count_x = st.number_input(
            "Count X",
            1,
            10,
            value=int(initial.count_x),
            key=f"{prefix}_count_x",
        )
        count_y = st.number_input(
            "Count Y",
            1,
            10,
            value=int(initial.count_y),
            key=f"{prefix}_count_y",
        )
        gap_mm = st.number_input(
            "Gap between cells (mm, negative = overlap / shared outline)",
            -10.0,
            20.0,
            value=float(initial.gap_mm),
            step=0.125,
            key=f"{prefix}_gap_mm",
        )
    return int(count_x), int(count_y), gap_mm


def _styling_section(initial: LabelConfig, prefix: str) -> int:
    with st.sidebar.expander("Common styling", expanded=False):
        outline_px = st.number_input(
            "Outline thickness (px, 0 = none)",
            0,
            10,
            value=int(initial.outline_px),
            key=f"{prefix}_outline_px",
        )
    return int(outline_px)


def _type_specific_inputs(
    initial: LabelConfig,
    prefix: str,
    cfg_type: str,
) -> TypeSpecific:
    """Render type-specific knobs inline (caller owns the container).

    Inactive types' fields are carried through unchanged so switching types
    later doesn't lose their values.
    """
    if cfg_type == SkeletonType.VIAL_TOP.value:
        circle_diameter_mm = st.number_input(
            "Circle diameter (mm)",
            1.0,
            50.0,
            value=float(initial.circle_diameter_mm),
            step=0.5,
            key=f"{prefix}_circle_diameter_mm",
        )
        return _carry(initial, circle_diameter_mm=circle_diameter_mm)
    if cfg_type == SkeletonType.VIAL_TOP_OCTA.value:
        octa_width_mm = st.number_input(
            "Bounding box width (mm)",
            1.0,
            50.0,
            value=float(initial.octa_width_mm),
            step=0.5,
            key=f"{prefix}_octa_width_mm",
        )
        octa_height_mm = st.number_input(
            "Bounding box height (mm)",
            1.0,
            50.0,
            value=float(initial.octa_height_mm),
            step=0.5,
            key=f"{prefix}_octa_height_mm",
        )
        # Auto-clamp segments to the current bbox so adjacent diagonals
        # never cross. Adjusting session state before the widget renders
        # avoids Streamlit's "value out of [min,max] range" error when the
        # user shrinks a dimension below a previously-stored segment.
        h_seg_key = f"{prefix}_octa_horizontal_segment_mm"
        v_seg_key = f"{prefix}_octa_vertical_segment_mm"
        if h_seg_key in st.session_state and st.session_state[h_seg_key] > octa_width_mm:
            st.session_state[h_seg_key] = octa_width_mm
        if v_seg_key in st.session_state and st.session_state[v_seg_key] > octa_height_mm:
            st.session_state[v_seg_key] = octa_height_mm
        octa_horizontal_segment_mm = st.number_input(
            "Horizontal segment length (mm)",
            0.0,
            float(octa_width_mm),
            value=min(float(initial.octa_horizontal_segment_mm), float(octa_width_mm)),
            step=0.5,
            key=h_seg_key,
            help="Length of the top/bottom straight edges. Must be ≤ bounding box width.",
        )
        octa_vertical_segment_mm = st.number_input(
            "Vertical segment length (mm)",
            0.0,
            float(octa_height_mm),
            value=min(float(initial.octa_vertical_segment_mm), float(octa_height_mm)),
            step=0.5,
            key=v_seg_key,
            help="Length of the left/right straight edges. Must be ≤ bounding box height.",
        )
        return _carry(
            initial,
            octa_width_mm=octa_width_mm,
            octa_height_mm=octa_height_mm,
            octa_horizontal_segment_mm=octa_horizontal_segment_mm,
            octa_vertical_segment_mm=octa_vertical_segment_mm,
        )
    if cfg_type == SkeletonType.TEXT.value:
        text_width_mm = st.number_input(
            "Text box width (mm)",
            1.0,
            100.0,
            value=float(initial.text_width_mm),
            step=0.5,
            key=f"{prefix}_text_width_mm",
        )
        text_height_mm = st.number_input(
            "Text box height (mm)",
            1.0,
            100.0,
            value=float(initial.text_height_mm),
            step=0.5,
            key=f"{prefix}_text_height_mm",
        )
        return _carry(
            initial,
            text_width_mm=text_width_mm,
            text_height_mm=text_height_mm,
        )
    return _carry(initial)


def _n_lines_input(initial: LabelConfig, prefix: str) -> int:
    with st.sidebar.expander("Lines", expanded=True):
        return int(
            st.number_input(
                "Number of lines",
                1,
                10,
                value=max(1, len(initial.lines)),
                key=f"{prefix}_n_lines",
            )
        )


def _cell_box_dots_for_ui(
    cfg_type: str,
    ts: TypeSpecific,
    dots_per_mm: int,
) -> tuple[int, int]:
    """Per-type cell bounding box used to bound each line's offset sliders."""
    if cfg_type == SkeletonType.VIAL_TOP.value:
        d = round(ts.circle_diameter_mm * dots_per_mm)
        return d, d
    if cfg_type == SkeletonType.VIAL_TOP_OCTA.value:
        return (
            round(ts.octa_width_mm * dots_per_mm),
            round(ts.octa_height_mm * dots_per_mm),
        )
    if cfg_type == SkeletonType.TEXT.value:
        return (
            round(ts.text_width_mm * dots_per_mm),
            round(ts.text_height_mm * dots_per_mm),
        )
    return 100, 100


def _line_controls(
    idx: int,
    defaults: LineConfig,
    cell_w_dots: int,
    cell_h_dots: int,
    prefix: str,
) -> LineConfig:
    k = f"{prefix}_line{idx}"
    with st.sidebar.expander(line_display_name(defaults, idx), expanded=False):
        name = st.text_input(
            "Name",
            value=defaults.name,
            key=f"{k}_name",
            help="Shown as expander label, CSV column header, and manual-input label. "
            "Leave blank to fall back to 'Line N'.",
        )
        font_path = font_selectbox("Font", defaults.font_path, key=f"{k}_font")
        size_px = st.slider(
            "Size (px)",
            6,
            120,
            value=defaults.size_px,
            key=f"{k}_size",
        )
        c1, c2, c3 = st.columns(3)
        bold = c1.checkbox("Bold", value=defaults.bold, key=f"{k}_bold")
        italic = c2.checkbox("Italic", value=defaults.italic, key=f"{k}_italic")
        underline = c3.checkbox(
            "Underline",
            value=defaults.underline,
            key=f"{k}_underline",
        )
        underline_offset_px = st.slider(
            "Underline offset (px)",
            -10,
            30,
            value=int(defaults.underline_offset_px),
            key=f"{k}_ul_offset",
        )
        letter_spacing_px = st.slider(
            "Letter spacing (px, 0 = normal)",
            -5,
            30,
            value=_clamp(int(defaults.letter_spacing_px), -5, 30),
            key=f"{k}_letter_spacing",
            help="Extra horizontal space between glyphs. Negative compacts; "
            "positive extends. Negative values quickly make text overlap.",
        )
        x_max = max(1, cell_w_dots // 2)
        y_max = max(1, cell_h_dots // 2)
        offset_x_px = st.slider(
            "X offset from cell centre (px)",
            -x_max,
            x_max,
            value=_clamp(int(defaults.offset_x_px), -x_max, x_max),
            key=f"{k}_offset_x",
        )
        offset_y_px = st.slider(
            "Y offset from cell centre (px)",
            -y_max,
            y_max,
            value=_clamp(int(defaults.offset_y_px), -y_max, y_max),
            key=f"{k}_offset_y",
        )
        default_text = st.text_input(
            "Default when empty",
            value=defaults.default_text,
            key=f"{k}_default",
        )
    return LineConfig(
        name=name,
        font_path=font_path,
        size_px=int(size_px),
        bold=bold,
        italic=italic,
        underline=underline,
        underline_offset_px=int(underline_offset_px),
        letter_spacing_px=int(letter_spacing_px),
        offset_x_px=int(offset_x_px),
        offset_y_px=int(offset_y_px),
        default_text=default_text,
    )
