"""Label config: dataclasses + YAML round-trip.

`LabelConfig` owns the full skeleton spec. One config file pairs with a sibling
.csv that supplies per-cell text — see `csv_path_for`.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field, fields
from enum import StrEnum
from pathlib import Path

import yaml

log = logging.getLogger(__name__)


class SkeletonType(StrEnum):
    VIAL_TOP = "VIAL_TOP"
    VIAL_TOP_OCTA = "VIAL_TOP_OCTA"
    TEXT = "TEXT"


class HeadAlignment(StrEnum):
    """Where the label sits under the printer's print head.

    The TF P2 head is right-aligned on the paper, so a sub-48 mm label must
    be pushed to the right of the head's 384-dot span (`RIGHT`). The
    XP-D463B feeds paper through the centre of the head, so the same label
    is naturally centred (`CENTER`). `LEFT` is provided for symmetry.
    """

    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"


@dataclass
class LineConfig:
    name: str = ""  # human label shown in the UI + CSV header; falls back to "Line N"
    font_path: str = "C:/Windows/Fonts/verdanab.ttf"
    size_px: int = 28
    bold: bool = False
    italic: bool = False
    underline: bool = False
    underline_offset_px: int = 0
    # Extra horizontal space inserted between glyphs, in pixels.
    # 0 = font's natural advance (default). Positive = looser tracking;
    # negative = tighter (chars eventually overlap).
    letter_spacing_px: int = 0
    # Position relative to the cell's centre. (0, 0) = dead centre;
    # negative Y = above centre, positive = below.
    offset_x_px: int = 0
    offset_y_px: int = 0
    default_text: str = ""


def line_display_name(lc: LineConfig, index: int) -> str:
    """UI-friendly label: `lc.name` if set, otherwise `Line {index+1}`."""
    return lc.name.strip() if lc.name and lc.name.strip() else f"Line {index + 1}"


@dataclass
class LabelConfig:
    type: str = SkeletonType.VIAL_TOP.value

    # Label paper
    width_mm: int = 36
    height_mm: int = 30
    dots_per_mm: int = 8

    # Grid (X columns × Y rows of cells on a single physical label)
    count_x: int = 2
    count_y: int = 1
    gap_mm: float = 0.0

    # Common styling
    outline_px: int = 1

    # Lines stacked inside every cell
    lines: list[LineConfig] = field(default_factory=list)

    # VIAL_TOP-specific
    circle_diameter_mm: float = 14.5

    # VIAL_TOP_OCTA-specific (irregular octagon — bounding box plus the lengths
    # of the top/bottom (horizontal) and left/right (vertical) straight segments;
    # the four corner cuts have widths (width-h_seg)/2 and (height-v_seg)/2 and
    # don't have to be 45°). Constraints: 0 <= h_seg <= width, 0 <= v_seg <= height.
    octa_width_mm: float = 14.5
    octa_height_mm: float = 14.5
    octa_horizontal_segment_mm: float = 6.0
    octa_vertical_segment_mm: float = 6.0

    # TEXT-specific
    text_width_mm: float = 36.0
    text_height_mm: float = 30.0

    # Printer
    printer_port: str = "COM4"
    head_alignment: str = HeadAlignment.RIGHT.value

    # Manual-mode text matrix saved by the Streamlit app.
    # Shape: cells_per_label rows × len(lines) columns. Cells/lines beyond
    # the matrix default to "" on load; current widget values overwrite it
    # on every rerun.
    manual: list[list[str]] = field(default_factory=list)

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
    def octa_width_dots(self) -> int:
        return round(self.octa_width_mm * self.dots_per_mm)

    @property
    def octa_height_dots(self) -> int:
        return round(self.octa_height_mm * self.dots_per_mm)

    @property
    def octa_horizontal_segment_dots(self) -> int:
        return round(self.octa_horizontal_segment_mm * self.dots_per_mm)

    @property
    def octa_vertical_segment_dots(self) -> int:
        return round(self.octa_vertical_segment_mm * self.dots_per_mm)

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
    def from_yaml(cls, path: str | Path) -> LabelConfig:
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        line_field_names = {f.name for f in fields(LineConfig)}
        raw_lines = data.pop("lines", []) or []
        line_cfgs: list[LineConfig] = []
        for entry in raw_lines:
            unknown = set(entry) - line_field_names
            if unknown:
                log.warning("%s: ignoring unknown line keys %s", path, sorted(unknown))
            line_cfgs.append(
                LineConfig(**{k: v for k, v in entry.items() if k in line_field_names})
            )

        cfg_field_names = {f.name for f in fields(cls) if f.name != "lines"}
        unknown = set(data) - cfg_field_names
        if unknown:
            log.warning("%s: ignoring unknown config keys %s", path, sorted(unknown))
        base = {k: v for k, v in data.items() if k in cfg_field_names}
        return cls(**base, lines=line_cfgs)

    def to_yaml(self, path: str | Path) -> None:
        path = Path(path)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(
            yaml.safe_dump(asdict(self), sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )
        tmp.replace(path)


def csv_path_for(config_path: str | Path) -> Path:
    """Sibling .csv of a given config path (regardless of config extension)."""
    return Path(config_path).with_suffix(".csv")
