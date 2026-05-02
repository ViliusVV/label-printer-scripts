"""ESC/POS transport for the TF P2 thermal label printer.

This module knows nothing about fonts, CSVs, or skeleton types — it just
converts a 1-bit bitmap into a raster command stream and writes it to a
serial port. See `label_printer.render` for the bitmap producer.
"""

from __future__ import annotations

import logging
from enum import Enum
from pathlib import Path

import serial
from PIL import Image

from label_printer.config import HeadAlignment, LabelConfig

log = logging.getLogger(__name__)


# ---------------------------- Public enums ----------------------------


class HAlign(Enum):
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"


class VAlign(Enum):
    TOP = "top"
    MIDDLE = "middle"
    BOTTOM = "bottom"


class DitherMode(Enum):
    THRESHOLD = "threshold"
    FLOYD_STEINBERG = "floyd_steinberg"


# ---------------------------- ESC/POS commands ----------------------------
#
# The TF P2 speaks ESC/POS over Bluetooth serial. Each byte sequence below
# is a complete, self-contained command (no operands appended). Commands
# that take operands are sent inline in the methods that build them.


class Cmd(Enum):
    """ESC/POS command sequences with no embedded operands.

    Operand-carrying commands (set-margin, set-area, raster-image) are built
    inline by the methods that emit them, since their operand bytes change.
    """

    INIT = b"\x1b\x40"  # ESC @  - reset printer state
    FORM_FEED = b"\x1d\x0c"  # GS FF  - feed paper to next label
    # GS P x y: set motion units to 1/x" horizontal, 1/y" vertical.
    # 0xCB = 203 ≈ 8 dots/mm so GS L / GS W / GS $ etc. take dot counts directly.
    SET_MOTION_UNITS_DOTS = b"\x1d\x50\xcb\xcb"

    # Operand-carrying command prefixes. The trailing operand bytes are appended
    # at call time. Keeping them as named constants makes wire reads easier.
    GS_L_SET_LEFT_MARGIN = b"\x1d\x4c"
    GS_W_SET_PRINT_WIDTH = b"\x1d\x57"
    GS_V_RASTER_BIT_IMAGE = b"\x1d\x76\x30\x00"  # GS v 0, m=0 (normal)


# ---------------------------- LabelPrinter ----------------------------


class LabelPrinter:
    """ESC/POS-over-serial driver for a TF P2 (8 dots/mm, 384-dot head)."""

    DOTS_PER_MM: int = 8
    MAX_WIDTH_DOTS: int = 384  # 48 mm * 8 dots/mm

    def __init__(
        self,
        port: str,
        baud: int = 9600,
        label_width_mm: int = MAX_WIDTH_DOTS // DOTS_PER_MM,
        label_height_mm: int = 30,
        head_alignment: str = HeadAlignment.RIGHT.value,
    ) -> None:
        # Check if label is not over limit
        if label_width_mm > (LabelPrinter.MAX_WIDTH_DOTS // LabelPrinter.DOTS_PER_MM):
            raise

        self.label_width_mm = label_width_mm
        self.label_height_mm = label_height_mm
        self.head_alignment = head_alignment
        self.ser = serial.Serial(port, baud)

        self.send(Cmd.INIT)
        self.send(Cmd.SET_MOTION_UNITS_DOTS)
        self.set_label_size(label_width_mm, label_height_mm)

    def send(self, *commands: bytes | Cmd) -> None:
        if not commands:
            raise ValueError("No commands provided")
        parts: list[bytes] = [c.value if isinstance(c, Cmd) else c for c in commands]
        data = b"".join(parts)
        log.debug("Sending [%d] commands, data: %r", len(commands), data)
        self.ser.write(data)

    def set_label_size(self, width_mm: int, height_mm: int) -> None:
        self.label_width_mm = width_mm
        self.label_height_mm = height_mm
        log.debug("Setting label size to %sx%s mm", width_mm, height_mm)

        # `head_alignment` describes where the label sits under the head's
        # 384-dot span. TF P2's head is right-aligned on the paper, so the
        # label needs the full free margin on its left (RIGHT). XP-D463B
        # centres paper under the head (CENTER). LEFT is provided for
        # symmetry / future printers.
        width_dots = int(width_mm * self.DOTS_PER_MM)
        free_dots = self.MAX_WIDTH_DOTS - width_dots
        if free_dots < 0:
            raise ValueError(
                f"Label too wide: {width_dots} dots > {self.MAX_WIDTH_DOTS} max"
            )
        if self.head_alignment == HeadAlignment.LEFT.value:
            left_margin_dots = 0
        elif self.head_alignment == HeadAlignment.CENTER.value:
            left_margin_dots = free_dots // 2
        elif self.head_alignment == HeadAlignment.RIGHT.value:
            left_margin_dots = free_dots
        else:
            raise ValueError(f"Unknown head_alignment: {self.head_alignment!r}")
        log.debug(
            "Left margin: %d, Width: %d, Total: %d",
            left_margin_dots,
            width_dots,
            left_margin_dots + width_dots,
        )
        self.send(Cmd.GS_L_SET_LEFT_MARGIN, left_margin_dots.to_bytes(2, "little"))
        self.send(Cmd.GS_W_SET_PRINT_WIDTH, width_dots.to_bytes(2, "little"))

    @property
    def width_dots(self) -> int:
        return int(self.label_width_mm * self.DOTS_PER_MM)

    @property
    def height_dots(self) -> int:
        return int(self.label_height_mm * self.DOTS_PER_MM)

    def write_text(self, text: str) -> None:
        payload = text.encode() + b"\n"
        log.debug("Sending [%d] bytes: %r", len(text), payload)
        self.ser.write(payload)

    def print_bitmap(
        self,
        bitmap: Image.Image | list[list[int]] | tuple[tuple[int, ...], ...],
        halign: HAlign = HAlign.LEFT,
        valign: VAlign = VAlign.TOP,
    ) -> None:
        """Print a bitmap, padded to the full label area per alignment.

        Accepts a PIL Image in mode '1' (or convertible) or a 2D sequence of
        0/1 where 1 = print a black dot. Raises ValueError if the bitmap
        exceeds the label dimensions in dots.
        """
        bits = self._to_bit_grid(bitmap)
        bm_h = len(bits)
        bm_w = len(bits[0]) if bm_h else 0

        label_w = self.width_dots
        label_h = self.height_dots

        if bm_w > label_w or bm_h > label_h:
            raise ValueError(f"Bitmap {bm_w}x{bm_h} dots exceeds label {label_w}x{label_h} dots")

        x_offset = {
            HAlign.LEFT: 0,
            HAlign.CENTER: (label_w - bm_w) // 2,
            HAlign.RIGHT: label_w - bm_w,
        }[halign]
        y_offset = {
            VAlign.TOP: 0,
            VAlign.MIDDLE: (label_h - bm_h) // 2,
            VAlign.BOTTOM: label_h - bm_h,
        }[valign]

        # GS v 0 needs width rounded up to a byte boundary.
        padded_w = (label_w + 7) & ~7
        width_bytes = padded_w // 8

        raster = bytearray(width_bytes * label_h)
        for y in range(bm_h):
            row = bits[y]
            out_y = y + y_offset
            for x in range(bm_w):
                if row[x]:
                    px = x + x_offset
                    raster[out_y * width_bytes + (px >> 3)] |= 0x80 >> (px & 7)

        header = (
            Cmd.GS_V_RASTER_BIT_IMAGE.value
            + width_bytes.to_bytes(2, "little")
            + label_h.to_bytes(2, "little")
        )
        log.debug(
            "Sending bitmap: %dx%d -> canvas %dx%d (%d bytes), halign=%s, valign=%s",
            bm_w,
            bm_h,
            padded_w,
            label_h,
            len(raster),
            halign.value,
            valign.value,
        )
        self.ser.write(header + bytes(raster))

    def print_png(
        self,
        path: str | Path,
        halign: HAlign = HAlign.LEFT,
        valign: VAlign = VAlign.TOP,
        dither: DitherMode = DitherMode.THRESHOLD,
        threshold: int = 128,
    ) -> None:
        """Load a PNG, convert to 1-bit, and print via print_bitmap."""
        img = load_png(path, dither=dither, threshold=threshold)
        self.print_bitmap(img, halign=halign, valign=valign)

    @staticmethod
    def _to_bit_grid(bitmap) -> list[list[int]]:
        if isinstance(bitmap, Image.Image):
            if bitmap.mode != "1":
                bitmap = bitmap.convert("1")
            w, h = bitmap.size
            px = bitmap.load()
            # PIL mode '1': 0 = black, 255 = white. Printer: 1 = black dot.
            return [[1 if px[x, y] == 0 else 0 for x in range(w)] for y in range(h)]
        rows = list(bitmap)
        if not rows:
            return []
        w = len(rows[0])
        for r in rows:
            if len(r) != w:
                raise ValueError("Bitmap rows must all have the same length")
        return [[int(v) & 1 for v in r] for r in rows]

    def next_label(self) -> None:
        self.send(Cmd.FORM_FEED)

    def close(self) -> None:
        self.ser.close()
        log.debug("Printer serial closed")

    # Context-manager support so callers can `with LabelPrinter(...) as p:`.
    def __enter__(self) -> LabelPrinter:
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()


# ---------------------------- Helpers ----------------------------


def load_png(
    path: str | Path,
    dither: DitherMode = DitherMode.THRESHOLD,
    threshold: int = 128,
) -> Image.Image:
    """Load a PNG, convert to 1-bit, return a PIL Image ready for print_bitmap.

    THRESHOLD: pixels darker than `threshold` become black.
    FLOYD_STEINBERG: error-diffusion dithering (better for photos).
    """
    img = Image.open(path)
    if img.mode != "L":
        img = img.convert("L")
    if dither is DitherMode.THRESHOLD:
        return img.point(lambda p: 0 if p < threshold else 255, mode="1")
    if dither is DitherMode.FLOYD_STEINBERG:
        return img.convert("1")  # PIL uses Floyd–Steinberg by default for '1'
    raise ValueError(f"Unknown dither mode: {dither}")


def print_image_with_config(
    img: Image.Image,
    cfg: LabelConfig,
    halign: HAlign = HAlign.LEFT,
    valign: VAlign = VAlign.TOP,
    feed_after: bool = True,
) -> None:
    """Open the printer at `cfg.printer_port`, print `img`, then close.

    Shared by the CLI (`label_printer print`) and the Streamlit per-label
    Print button. Bluetooth serial doesn't survive a long-lived instance
    cleanly, so each call opens fresh.
    """
    with LabelPrinter(
        cfg.printer_port,
        label_width_mm=cfg.width_mm,
        label_height_mm=cfg.height_mm,
        head_alignment=cfg.head_alignment,
    ) as p:
        p.print_bitmap(img, halign=halign, valign=valign)
        if feed_after:
            p.next_label()
