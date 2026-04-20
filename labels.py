"""Label skeleton generator for round (vial) labels.

Renders a rectangular label bitmap containing N circles side-by-side, each with
three text lines (top / middle / bottom). Shape, circle layout, fonts and
text styling are fully driven by LabelConfig so the skeleton can be swapped
for different label sizes or shapes later.
"""
from __future__ import annotations

import csv
import tomllib
from dataclasses import dataclass, fields
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


@dataclass
class LabelConfig:
    # Label paper
    width_mm: float = 36.0
    height_mm: float = 30.0
    dots_per_mm: int = 8

    # Circles (cut guides)
    circle_diameter_mm: float = 14.5
    circle_count: int = 2
    outline_px: int = 1
    horizontal_gap_mm: float = 0.0

    # Font
    font_path: str = "C:/Windows/Fonts/verdanab.ttf"

    # Text lines. Sizes are in PIXELS (≈ pt * dots_per_mm * 25.4 / 72).
    top_size_px: int = 28
    top_underline: bool = True
    middle_size_px: int = 56
    middle_underline: bool = False
    bottom_size_px: int = 28
    bottom_underline: bool = True
    bottom_default_text: str = "        "
    line_gap_px: int = 1

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
        valid = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in valid})


@dataclass
class CircleText:
    top: str = ""
    middle: str = ""
    bottom: str = ""


def render_label(circles: list[CircleText], cfg: LabelConfig) -> Image.Image:
    """Render one physical label containing cfg.circle_count circles."""
    if len(circles) != cfg.circle_count:
        raise ValueError(f"Expected {cfg.circle_count} circles, got {len(circles)}")

    W, H = cfg.width_dots, cfg.height_dots
    img = Image.new("1", (W, H), 1)  # mode '1': 0=black, 1=white
    draw = ImageDraw.Draw(img)

    d = cfg.circle_diameter_dots
    r = d / 2
    gap = cfg.horizontal_gap_dots
    total_w = d * cfg.circle_count + gap * (cfg.circle_count - 1)
    start_x = (W - total_w) / 2
    cy = H / 2

    font_top = _load_font(cfg.font_path, cfg.top_size_px)
    font_mid = _load_font(cfg.font_path, cfg.middle_size_px)
    font_bot = _load_font(cfg.font_path, cfg.bottom_size_px)

    for i, ct in enumerate(circles):
        cx = start_x + r + i * (d + gap)
        draw.ellipse(
            (cx - r, cy - r, cx - r + d - 1, cy - r + d - 1),
            outline=0,
            width=cfg.outline_px,
        )
        _render_text_in_circle(draw, (cx, cy), ct, cfg, font_top, font_mid, font_bot)

    return img


def _load_font(path: str, size_px: int):
    try:
        return ImageFont.truetype(path, size_px)
    except OSError:
        print(f"Font '{path}' not found — falling back to PIL default")
        return ImageFont.load_default(size=size_px)


def _render_text_in_circle(draw, center, ct, cfg, font_top, font_mid, font_bot):
    cx, cy = center
    gap = cfg.line_gap_px

    mid_y = cy - cfg.middle_size_px / 2
    top_y = mid_y - gap - cfg.top_size_px
    bot_y = mid_y + cfg.middle_size_px + gap

    _draw_line(draw, (cx, top_y), ct.top, font_top, cfg.top_size_px, cfg.top_underline)
    _draw_line(draw, (cx, mid_y), ct.middle, font_mid, cfg.middle_size_px, cfg.middle_underline)

    bot = ct.bottom if ct.bottom else cfg.bottom_default_text
    _draw_line(draw, (cx, bot_y), bot, font_bot, cfg.bottom_size_px, cfg.bottom_underline)


def _draw_line(draw, xy, text, font, line_h, underline):
    cx, y = xy
    has_glyph = bool(text.strip())
    if has_glyph:
        draw.text((cx, y), text, fill=0, font=font, anchor="mt")
    if underline:
        tw = font.getlength(text) if has_glyph else font.getlength("0" * 8)
        uy = y + line_h
        draw.line([(cx - tw / 2, uy), (cx + tw / 2, uy)], fill=0, width=1)


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
    circles: list[CircleText], per_label: int
) -> list[list[CircleText]]:
    """Group circles into physical labels, padding the last one with empties."""
    out = []
    for i in range(0, len(circles), per_label):
        batch = circles[i : i + per_label]
        while len(batch) < per_label:
            batch.append(CircleText())
        out.append(batch)
    return out
