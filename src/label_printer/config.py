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
    TEXT = "TEXT"


@dataclass
class LineConfig:
    name: str = ""  # human label shown in the UI + CSV header; falls back to "Line N"
    font_path: str = "C:/Windows/Fonts/verdanab.ttf"
    size_px: int = 28
    bold: bool = False
    italic: bool = False
    underline: bool = False
    underline_offset_px: int = 0
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
    width_mm: float = 36.0
    height_mm: float = 30.0
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

    # TEXT-specific
    text_width_mm: float = 36.0
    text_height_mm: float = 30.0

    # Printer
    printer_port: str = "COM4"

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
