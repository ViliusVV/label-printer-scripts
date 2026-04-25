"""Skeleton-aware label rendering.

`render_label` produces one mode '1' bitmap from a list of per-cell line lists
plus a `LabelConfig`. Cells are placed in a row-major grid built from the
type-specific cell bounding box (circle diameter for VIAL_TOP, width/height
for TEXT). Short final batches are intentional: unused grid slots draw
nothing.

Adding a new skeleton type = add a `SkeletonType` value, write a renderer with
signature `(img, draw, center, cell_dims, cell_lines, cfg)`, and register it
in `_CELL_RENDERERS`. Both built-in renderers finish with `_render_lines` so
the per-line offset/styling logic stays shared.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from PIL import Image, ImageDraw, ImageFont

from label_printer.config import LabelConfig, LineConfig, SkeletonType

log = logging.getLogger(__name__)

# Each cell is a list of per-line strings. Rendering pads with "" if shorter
# than len(cfg.lines) and truncates if longer.
Cell = list[str]


def render_label(cells: list[Cell], cfg: LabelConfig) -> Image.Image:
    """Render one physical label. Only the cells passed are drawn; missing
    grid slots are left blank (the skeleton outline is not drawn for them).

    Grid geometry uses the type-specific cell bounding box (see
    `_cell_box_dots`), NOT an even division of the label. The whole
    count_x × count_y block is centred in the label. `gap_mm` is applied
    between cells and may be negative so that adjacent outlines can share
    a single line (e.g. rectangle edges meeting with no doubling).
    """
    max_cells = cfg.cells_per_label
    if len(cells) > max_cells:
        raise ValueError(f"{len(cells)} cells provided but grid fits {max_cells}")

    renderer = _CELL_RENDERERS.get(cfg.type)
    if renderer is None:
        raise ValueError(f"Unknown skeleton type: {cfg.type!r}")

    W, H = cfg.width_dots, cfg.height_dots
    img = Image.new("1", (W, H), 1)
    draw = ImageDraw.Draw(img)

    cell_w, cell_h = _cell_box_dots(cfg)
    gap = cfg.gap_dots
    total_w = cell_w * cfg.count_x + gap * (cfg.count_x - 1)
    total_h = cell_h * cfg.count_y + gap * (cfg.count_y - 1)
    start_x = (W - total_w) / 2
    start_y = (H - total_h) / 2

    for i, cell in enumerate(cells):
        x_idx = i % cfg.count_x
        y_idx = i // cfg.count_x
        cx = start_x + cell_w / 2 + x_idx * (cell_w + gap)
        cy = start_y + cell_h / 2 + y_idx * (cell_h + gap)
        renderer(img, draw, (cx, cy), (cell_w, cell_h), cell, cfg)

    return img


def _cell_box_dots(cfg: LabelConfig) -> tuple[int, int]:
    """Per-type cell bounding box in printer dots."""
    if cfg.type == SkeletonType.VIAL_TOP.value:
        d = cfg.circle_diameter_dots
        return d, d
    if cfg.type == SkeletonType.TEXT.value:
        return cfg.text_width_dots, cfg.text_height_dots
    raise ValueError(f"Unknown skeleton type: {cfg.type!r}")


def _render_vial_top(img, draw, center, cell_dims, cell_lines, cfg: LabelConfig):
    cx, cy = center
    cell_w, _ = cell_dims  # cell box is square for VIAL_TOP (== circle diameter)
    r = cell_w / 2
    if cfg.outline_px > 0:
        draw.ellipse(
            (cx - r, cy - r, cx - r + cell_w - 1, cy - r + cell_w - 1),
            outline=0,
            width=cfg.outline_px,
        )
    _render_lines(img, draw, (cx, cy), cell_lines, cfg.lines)


def _render_text(img, draw, center, cell_dims, cell_lines, cfg: LabelConfig):
    cx, cy = center
    cell_w, cell_h = cell_dims
    if cfg.outline_px > 0:
        draw.rectangle(
            (cx - cell_w / 2, cy - cell_h / 2, cx + cell_w / 2 - 1, cy + cell_h / 2 - 1),
            outline=0,
            width=cfg.outline_px,
        )
    _render_lines(img, draw, (cx, cy), cell_lines, cfg.lines)


_CELL_RENDERERS: dict[str, Callable] = {
    SkeletonType.VIAL_TOP.value: _render_vial_top,
    SkeletonType.TEXT.value: _render_text,
}


# ---------------------------- Lines ----------------------------


def _render_lines(img, draw, center, cell_lines, line_cfgs):
    """Render each line at its own offset from the cell centre.

    Lines are positioned independently via `LineConfig.offset_x_px` /
    `offset_y_px`, so they can be placed anywhere inside (or outside) the cell.
    A line's anchor point is its visual centre.
    """
    if not line_cfgs:
        return
    cx, cy = center
    for i, lc in enumerate(line_cfgs):
        text = cell_lines[i] if i < len(cell_lines) else ""
        font = _load_font(lc.font_path, lc.size_px)
        _draw_line(
            img,
            draw,
            (cx + lc.offset_x_px, cy + lc.offset_y_px),
            text,
            lc,
            font,
        )


def _draw_line(img, draw, xy, text: str, lc: LineConfig, font):
    """Draw a single line centred on `xy` (both horizontally and vertically).

    Underline (if enabled) sits below the line's nominal half-height plus
    `underline_offset_px`, so moving a line via offsets carries its underline
    with it.
    """
    cx, cy = xy
    effective = text if text else lc.default_text
    if not effective:
        return

    has_glyph = bool(effective.strip())
    text_w: int | None = None

    if has_glyph:
        if lc.bold or lc.italic:
            temp = _render_text_image(effective, font, bold=lc.bold, italic=lc.italic)
            mask = temp.point(lambda p: 255 if p < 128 else 0, mode="L")
            text_w, text_h = temp.size
            x0 = round(cx - text_w / 2)
            y0 = round(cy - text_h / 2)
            img.paste(0, (x0, y0), mask)
        else:
            draw.text((cx, cy), effective, fill=0, font=font, anchor="mm")
            text_w = round(font.getlength(effective))

    if lc.underline:
        tw = text_w if text_w is not None else round(font.getlength(effective))
        if tw > 0:
            uy = cy + lc.size_px / 2 + lc.underline_offset_px
            draw.line([(cx - tw / 2, uy), (cx + tw / 2, uy)], fill=0, width=1)


def _render_text_image(
    text: str,
    font,
    bold: bool = False,
    italic: bool = False,
    shear: float = 0.2,
) -> Image.Image:
    stroke = 1 if bold else 0
    left, top, right, bottom = font.getbbox(text, stroke_width=stroke)
    pad = 2
    w = (right - left) + pad * 2
    h = (bottom - top) + pad * 2
    img = Image.new("L", (w, h), 255)
    ImageDraw.Draw(img).text(
        (-left + pad, -top + pad),
        text,
        fill=0,
        font=font,
        stroke_width=stroke,
        stroke_fill=0,
    )
    if italic:
        extra = int(h * shear) + 1
        img = img.transform(
            (w + extra, h),
            Image.AFFINE,
            (1, shear, -extra, 0, 1, 0),
            resample=Image.NEAREST,
            fillcolor=255,
        )
    return img


# ---------------------------- Font loading ----------------------------

_font_cache: dict[tuple[str, int], ImageFont.ImageFont] = {}


def _load_font(path: str, size_px: int):
    key = (path, size_px)
    cached = _font_cache.get(key)
    if cached is not None:
        return cached
    try:
        font = ImageFont.truetype(path, size_px)
    except OSError:
        log.warning("Font %r not found — falling back to PIL default", path)
        font = ImageFont.load_default(size=size_px)
    _font_cache[key] = font
    return font
