"""Label skeleton generator for round (vial) labels.

Renders a rectangular label bitmap containing N circles side-by-side, each with
three text lines (top / middle / bottom). Shape, circle layout, and per-line
font/bold/italic/underline/default are driven by LabelConfig so the skeleton
can be swapped for different label sizes or shapes later.
"""
from __future__ import annotations

import csv
import tomllib
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Iterable, Iterator

from PIL import Image, ImageDraw, ImageFont


# ---------------------------- Config dataclasses ----------------------------


@dataclass
class LineConfig:
    font_path: str = "C:/Windows/Fonts/verdanab.ttf"
    size_px: int = 28
    bold: bool = False
    italic: bool = False
    underline: bool = False
    underline_offset_px: int = 0  # extra gap between text bottom and underline
    default_text: str = ""  # rendered when the CSV cell is empty


@dataclass
class LabelConfig:
    # Label paper
    width_mm: float = 36.0
    height_mm: float = 30.0
    dots_per_mm: int = 8

    # Circle layout
    circle_diameter_mm: float = 14.5
    circle_count: int = 2
    outline_px: int = 1
    horizontal_gap_mm: float = 0.0
    line_gap_px: int = 1

    # Per-line styling
    top: LineConfig = field(
        default_factory=lambda: LineConfig(size_px=28, underline=True)
    )
    middle: LineConfig = field(
        default_factory=lambda: LineConfig(size_px=56, underline=False)
    )
    bottom: LineConfig = field(
        default_factory=lambda: LineConfig(
            size_px=28, underline=True, default_text="        "
        )
    )

    @property
    def width_dots(self) -> int:
        return round(self.width_mm * self.dots_per_mm)

    @property
    def height_dots(self) -> int:
        return round(self.height_mm * self.dots_per_mm)

    @property
    def circle_diameter_dots(self) -> int:
        return round(self.circle_diameter_mm * self.dots_per_mm)

    @property
    def horizontal_gap_dots(self) -> int:
        return round(self.horizontal_gap_mm * self.dots_per_mm)

    @classmethod
    def from_toml(cls, path: str | Path) -> "LabelConfig":
        with open(path, "rb") as f:
            data = tomllib.load(f)
        line_fields = {f.name for f in fields(LineConfig)}

        def _mk(name: str) -> LineConfig:
            section = data.pop(name, {}) or {}
            return LineConfig(**{k: v for k, v in section.items() if k in line_fields})

        top = _mk("top")
        middle = _mk("middle")
        bottom = _mk("bottom")
        excluded = {"top", "middle", "bottom"}
        valid = {f.name for f in fields(cls) if f.name not in excluded}
        base = {k: v for k, v in data.items() if k in valid}
        return cls(**base, top=top, middle=middle, bottom=bottom)

    def to_toml(self, path: str | Path) -> None:
        """Atomically write this config to a TOML file."""
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


def _dump_toml(cfg: "LabelConfig") -> str:
    base_keys = [
        "width_mm", "height_mm", "dots_per_mm",
        "circle_diameter_mm", "circle_count", "outline_px",
        "horizontal_gap_mm", "line_gap_px",
    ]
    line_keys = [f.name for f in fields(LineConfig)]
    out = ["# Label skeleton configuration — auto-saved by preview_app.py.", ""]
    for k in base_keys:
        out.append(f"{k} = {_toml_value(getattr(cfg, k))}")
    for section in ("top", "middle", "bottom"):
        lc = getattr(cfg, section)
        out.append("")
        out.append(f"[{section}]")
        for k in line_keys:
            out.append(f"{k} = {_toml_value(getattr(lc, k))}")
    out.append("")
    return "\n".join(out)


@dataclass
class CircleText:
    top: str = ""
    middle: str = ""
    bottom: str = ""


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


def render_label(circles: list[CircleText], cfg: LabelConfig) -> Image.Image:
    """Render one physical label; draws only the circles provided (no padding)."""
    if len(circles) > cfg.circle_count:
        raise ValueError(
            f"Got {len(circles)} circles but cfg.circle_count = {cfg.circle_count}"
        )

    W, H = cfg.width_dots, cfg.height_dots
    img = Image.new("1", (W, H), 1)  # mode '1': 0=black, 1=white
    draw = ImageDraw.Draw(img)

    d = cfg.circle_diameter_dots
    r = d / 2
    gap = cfg.horizontal_gap_dots
    # Layout assumes the full slot count so earlier labels and short
    # trailing labels keep circles at the same horizontal positions.
    total_w = d * cfg.circle_count + gap * (cfg.circle_count - 1)
    start_x = (W - total_w) / 2
    cy = H / 2

    for i, ct in enumerate(circles):
        cx = start_x + r + i * (d + gap)
        draw.ellipse(
            (cx - r, cy - r, cx - r + d - 1, cy - r + d - 1),
            outline=0,
            width=cfg.outline_px,
        )
        _render_text_in_circle(img, draw, (cx, cy), ct, cfg)

    return img


def _render_text_in_circle(img, draw, center, ct: CircleText, cfg: LabelConfig):
    cx, cy = center
    gap = cfg.line_gap_px

    mid_y = cy - cfg.middle.size_px / 2
    top_y = mid_y - gap - cfg.top.size_px
    bot_y = mid_y + cfg.middle.size_px + gap

    font_top = _load_font(cfg.top.font_path, cfg.top.size_px)
    font_mid = _load_font(cfg.middle.font_path, cfg.middle.size_px)
    font_bot = _load_font(cfg.bottom.font_path, cfg.bottom.size_px)

    _draw_line(img, draw, (cx, top_y), ct.top, cfg.top, font_top)
    _draw_line(img, draw, (cx, mid_y), ct.middle, cfg.middle, font_mid)
    _draw_line(img, draw, (cx, bot_y), ct.bottom, cfg.bottom, font_bot)


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
    """Render text onto a new mode-'L' image (bg=255, text=0), optionally
    stroked for bold and sheared for italic.
    """
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
        # PIL affine reads input at (a*x + b*y + c, d*x + e*y + f) for each output pixel.
        # With (1, shear, -extra, 0, 1, 0): lookup_x = x + shear*y - extra, so the
        # top row (y=0) reads from x-extra (shifted left in source -> shifted right visually),
        # bottom row reads from x. Produces a rightward lean.
        img = img.transform(
            (w + extra, h),
            Image.AFFINE,
            (1, shear, -extra, 0, 1, 0),
            resample=Image.NEAREST,
            fillcolor=255,
        )
    return img


# ---------------------------- CSV + batching ----------------------------


def circles_from_csv(path: str | Path, skip_header: bool = True) -> list[CircleText]:
    """One CSV row = one circle. Columns: top, middle, bottom."""
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    if skip_header and rows:
        rows = rows[1:]
    return [
        CircleText(
            top=(row[0] if len(row) > 0 else ""),
            middle=(row[1] if len(row) > 1 else ""),
            bottom=(row[2] if len(row) > 2 else ""),
        )
        for row in rows
        if any(c.strip() for c in row)
    ]


def pack_circles_to_labels(
    circles: Iterable[CircleText], per_label: int
) -> list[list[CircleText]]:
    """Split into chunks of `per_label`. The last chunk may be shorter; render_label
    then draws only the circles present and leaves unused slots blank."""
    circles = list(circles)
    return [circles[i : i + per_label] for i in range(0, len(circles), per_label)]


def render_labels_from_csv(
    csv_path: str | Path, cfg: LabelConfig
) -> Iterator[Image.Image]:
    """Yield a PIL Image for every physical label produced by the CSV.
    Used by both the Streamlit preview and print_labels.py so the two stay in sync.
    """
    circles = circles_from_csv(csv_path)
    for batch in pack_circles_to_labels(circles, cfg.circle_count):
        yield render_label(batch, cfg)
