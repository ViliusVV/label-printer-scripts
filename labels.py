"""Label skeleton generator.

Produces a rectangular label bitmap containing an X×Y grid of cells, each
rendered by a type-specific "skeleton" renderer. Currently two types:

- VIAL_TOP : circle outline (for round cutouts) with a vertical stack of N text lines inside.
- TEXT     : optional rectangle outline with a vertical stack of N text lines.

Shared pieces: the LineConfig (font / size / bold / italic / underline /
underline_offset / default_text), cell grid geometry, and the _render_lines
helper that stacks lines vertically centred on a cell's midpoint.
"""
from __future__ import annotations

import csv
import tomllib
from dataclasses import dataclass, field, fields
from enum import Enum
from pathlib import Path
from typing import Callable, Iterable, Iterator

from PIL import Image, ImageDraw, ImageFont


# ---------------------------- Types ----------------------------


class SkeletonType(str, Enum):
    VIAL_TOP = "VIAL_TOP"
    TEXT = "TEXT"


@dataclass
class LineConfig:
    font_path: str = "C:/Windows/Fonts/verdanab.ttf"
    size_px: int = 28
    bold: bool = False
    italic: bool = False
    underline: bool = False
    underline_offset_px: int = 0
    default_text: str = ""


@dataclass
class LabelConfig:
    type: str = SkeletonType.VIAL_TOP.value

    # Label paper
    width_mm: float = 36.0
    height_mm: float = 30.0
    dots_per_mm: int = 8

    # Grid (X columns × Y rows of cells on a single physical label)
    count_x: int = 2
    count_y: int = 1
    gap_mm: float = 0.0

    # Common styling
    outline_px: int = 1
    line_gap_px: int = 1

    # Lines stacked inside every cell
    lines: list[LineConfig] = field(default_factory=list)

    # VIAL_TOP-specific
    circle_diameter_mm: float = 14.5

    # TEXT-specific
    text_width_mm: float = 36.0
    text_height_mm: float = 30.0

    # Printer
    printer_port: str = "COM4"

    @property
    def width_dots(self) -> int:
        return round(self.width_mm * self.dots_per_mm)

    @property
    def height_dots(self) -> int:
        return round(self.height_mm * self.dots_per_mm)

    @property
    def gap_dots(self) -> int:
        return round(self.gap_mm * self.dots_per_mm)

    @property
    def circle_diameter_dots(self) -> int:
        return round(self.circle_diameter_mm * self.dots_per_mm)

    @property
    def text_width_dots(self) -> int:
        return round(self.text_width_mm * self.dots_per_mm)

    @property
    def text_height_dots(self) -> int:
        return round(self.text_height_mm * self.dots_per_mm)

    @property
    def cells_per_label(self) -> int:
        return self.count_x * self.count_y

    @classmethod
    def from_toml(cls, path: str | Path) -> "LabelConfig":
        with open(path, "rb") as f:
            data = tomllib.load(f)
        line_fields = {f.name for f in fields(LineConfig)}
        raw_lines = data.pop("lines", []) or []
        line_cfgs = [
            LineConfig(**{k: v for k, v in entry.items() if k in line_fields})
            for entry in raw_lines
        ]
        valid = {f.name for f in fields(cls) if f.name != "lines"}
        base = {k: v for k, v in data.items() if k in valid}
        return cls(**base, lines=line_cfgs)

    def to_toml(self, path: str | Path) -> None:
        path = Path(path)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(_dump_toml(self), encoding="utf-8")
        tmp.replace(path)


def _toml_value(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str):
        escaped = v.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    raise TypeError(f"Cannot serialize {type(v).__name__} to TOML")


def _dump_toml(cfg: LabelConfig) -> str:
    out: list[str] = [
        "# Label skeleton configuration — auto-saved by preview_app.py.",
        "",
        f"type = {_toml_value(cfg.type)}",
        "",
        "# Label paper",
        f"width_mm = {_toml_value(cfg.width_mm)}",
        f"height_mm = {_toml_value(cfg.height_mm)}",
        f"dots_per_mm = {_toml_value(cfg.dots_per_mm)}",
        "",
        "# Grid",
        f"count_x = {_toml_value(cfg.count_x)}",
        f"count_y = {_toml_value(cfg.count_y)}",
        f"gap_mm = {_toml_value(cfg.gap_mm)}",
        "",
        "# Common",
        f"outline_px = {_toml_value(cfg.outline_px)}",
        f"line_gap_px = {_toml_value(cfg.line_gap_px)}",
        "",
        "# VIAL_TOP specific",
        f"circle_diameter_mm = {_toml_value(cfg.circle_diameter_mm)}",
        "",
        "# TEXT specific",
        f"text_width_mm = {_toml_value(cfg.text_width_mm)}",
        f"text_height_mm = {_toml_value(cfg.text_height_mm)}",
        "",
        "# Printer",
        f"printer_port = {_toml_value(cfg.printer_port)}",
    ]
    line_keys = [f.name for f in fields(LineConfig)]
    for lc in cfg.lines:
        out.append("")
        out.append("[[lines]]")
        for k in line_keys:
            out.append(f"{k} = {_toml_value(getattr(lc, k))}")
    out.append("")
    return "\n".join(out)


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
        print(f"Font '{path}' not found — falling back to PIL default")
        font = ImageFont.load_default(size=size_px)
    _font_cache[key] = font
    return font


# ---------------------------- Rendering ----------------------------

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
            outline=0, width=cfg.outline_px,
        )
    _render_lines(img, draw, (cx, cy), cell_lines, cfg.lines, cfg.line_gap_px)


def _render_text(img, draw, center, cell_dims, cell_lines, cfg: LabelConfig):
    cx, cy = center
    cell_w, cell_h = cell_dims
    if cfg.outline_px > 0:
        draw.rectangle(
            (cx - cell_w / 2, cy - cell_h / 2,
             cx + cell_w / 2 - 1, cy + cell_h / 2 - 1),
            outline=0, width=cfg.outline_px,
        )
    _render_lines(img, draw, (cx, cy), cell_lines, cfg.lines, cfg.line_gap_px)


_CELL_RENDERERS: dict[str, Callable] = {
    SkeletonType.VIAL_TOP.value: _render_vial_top,
    SkeletonType.TEXT.value: _render_text,
}


def _render_lines(img, draw, center, cell_lines, line_cfgs, line_gap_px):
    if not line_cfgs:
        return
    cx, cy = center
    total_h = sum(lc.size_px for lc in line_cfgs) + line_gap_px * (len(line_cfgs) - 1)
    y = cy - total_h / 2
    for i, lc in enumerate(line_cfgs):
        text = cell_lines[i] if i < len(cell_lines) else ""
        font = _load_font(lc.font_path, lc.size_px)
        _draw_line(img, draw, (cx, y), text, lc, font)
        y += lc.size_px + line_gap_px


def _draw_line(img, draw, xy, text: str, lc: LineConfig, font):
    cx, y = xy
    effective = text if text else lc.default_text
    if not effective:
        return

    has_glyph = bool(effective.strip())
    text_w: int | None = None

    if has_glyph:
        if lc.bold or lc.italic:
            temp = _render_text_image(effective, font, bold=lc.bold, italic=lc.italic)
            mask = temp.point(lambda p: 255 if p < 128 else 0, mode="L")
            text_w = temp.size[0]
            x0 = int(round(cx - text_w / 2))
            y0 = int(round(y))
            img.paste(0, (x0, y0), mask)
        else:
            draw.text((cx, y), effective, fill=0, font=font, anchor="mt")
            text_w = int(round(font.getlength(effective)))

    if lc.underline:
        tw = text_w if text_w is not None else int(round(font.getlength("0" * 8)))
        uy = y + lc.size_px + lc.underline_offset_px
        draw.line([(cx - tw / 2, uy), (cx + tw / 2, uy)], fill=0, width=1)


def _render_text_image(
    text: str, font, bold: bool = False, italic: bool = False, shear: float = 0.2
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


# ---------------------------- CSV ----------------------------


def cells_from_csv(path: str | Path, skip_header: bool = True) -> list[Cell]:
    """One CSV row = one cell. Columns map positionally onto cfg.lines."""
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    if skip_header and rows:
        rows = rows[1:]
    return [list(row) for row in rows if any(c.strip() for c in row)]


def pack_cells_to_labels(cells: Iterable[Cell], per_label: int) -> list[list[Cell]]:
    cells = list(cells)
    return [cells[i : i + per_label] for i in range(0, len(cells), per_label)]


def render_labels_from_csv(
    csv_path: str | Path, cfg: LabelConfig
) -> Iterator[Image.Image]:
    cells = cells_from_csv(csv_path)
    for batch in pack_cells_to_labels(cells, cfg.cells_per_label):
        yield render_label(batch, cfg)


def csv_path_for(config_path: str | Path) -> Path:
    """Sibling .csv of a given .toml config path."""
    return Path(config_path).with_suffix(".csv")
