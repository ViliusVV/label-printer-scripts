"""Serial transports for thermal label printers.

Two protocol classes share a tiny serial-transport base:

- `ESCPrinter` — ESC/POS, used by the TF P2 and similar receipt-style
  printers. Sends `GS L` / `GS W` / `GS v 0` raster.
- `TSPLPrinter` — TSPL/TSPL2, used by the Xprinter D-series and most
  barcode label printers. Sends `SIZE` / `GAP` / `BITMAP` / `PRINT`.

Neither class knows anything about fonts, CSVs, or skeleton types — they
just take a 1-bit bitmap and push it down the wire. See
`label_printer.render` for the bitmap producer.
"""

from __future__ import annotations

import logging
from enum import Enum
from pathlib import Path
from typing import ClassVar

import serial
from PIL import Image

from label_printer.config import CommandSet, HeadAlignment, LabelConfig

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


# ---------------------------- Shared transport base ----------------------------


class _SerialPrinter:
    """Common serial + context-manager scaffolding for both protocol classes."""

    DOTS_PER_MM: ClassVar[int] = 8

    def __init__(self, port: str, baud: int = 9600) -> None:
        self.ser = serial.Serial(port, baud)

    def close(self) -> None:
        self.ser.close()
        log.debug("Printer serial closed")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    @staticmethod
    def _to_bit_grid(bitmap) -> list[list[int]]:
        """Normalise a PIL Image '1' or 2D 0/1 sequence to a list[list[int]]
        where 1 = black dot. PIL '1' has 0=black, so it's inverted here.
        """
        if isinstance(bitmap, Image.Image):
            if bitmap.mode != "1":
                bitmap = bitmap.convert("1")
            w, h = bitmap.size
            px = bitmap.load()
            return [[1 if px[x, y] == 0 else 0 for x in range(w)] for y in range(h)]
        rows = list(bitmap)
        if not rows:
            return []
        w = len(rows[0])
        for r in rows:
            if len(r) != w:
                raise ValueError("Bitmap rows must all have the same length")
        return [[int(v) & 1 for v in r] for r in rows]


# ---------------------------- ESCPrinter (ESC/POS) ----------------------------


class ESCPrinter(_SerialPrinter):
    """ESC/POS-over-serial driver for the TF P2 (8 dots/mm, 384-dot head)."""

    MAX_WIDTH_DOTS: ClassVar[int] = 384  # 48 mm * 8 dots/mm

    def __init__(
        self,
        port: str,
        baud: int = 9600,
        label_width_mm: int = MAX_WIDTH_DOTS // _SerialPrinter.DOTS_PER_MM,
        label_height_mm: int = 30,
        head_alignment: str = HeadAlignment.RIGHT.value,
    ) -> None:
        if label_width_mm > (self.MAX_WIDTH_DOTS // self.DOTS_PER_MM):
            raise ValueError(
                f"Label width {label_width_mm} mm exceeds head capacity "
                f"({self.MAX_WIDTH_DOTS // self.DOTS_PER_MM} mm)"
            )

        super().__init__(port, baud)
        self.label_width_mm = label_width_mm
        self.label_height_mm = label_height_mm
        self.head_alignment = head_alignment

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

    def next_label(self) -> None:
        self.send(Cmd.FORM_FEED)


# ---------------------------- TSPLPrinter (TSPL/TSPL2) ----------------------------


class TSPLPrinter(_SerialPrinter):
    """TSPL/TSPL2 driver for label printers like the Xprinter XP-D463B.

    TSPL is line-based ASCII; commands are CR/LF terminated. Bitmaps go via
    `BITMAP x,y,width_bytes,height,mode,<raster>` where each raster bit is
    1 = white / 0 = black (opposite of ESC/POS). The print head is
    centred over the paper for D-series printers, so `head_alignment` from
    the config has no effect here — the firmware handles paper width via
    `SIZE`.
    """

    EOL: ClassVar[bytes] = b"\r\n"

    def __init__(
        self,
        port: str,
        baud: int = 9600,
        label_width_mm: float = 40.0,
        label_height_mm: float = 30.0,
        gap_mm: float = 2.0,
        density: int = 8,
        speed: int = 4,
        head_alignment: str = HeadAlignment.RIGHT.value,
    ) -> None:
        # `head_alignment` is accepted (for parity with ESCPrinter and a
        # uniform `make_printer` signature) but ignored — TSPL printers
        # handle paper width via the SIZE command and the head is always
        # paper-centred for D-series.
        super().__init__(port, baud)
        self.label_width_mm = label_width_mm
        self.label_height_mm = label_height_mm
        self.gap_mm = gap_mm
        self.density = density
        self.speed = speed
        self.head_alignment = head_alignment

        self.set_label_size(label_width_mm, label_height_mm, gap_mm)
        self.send_text(f"DENSITY {density}")
        self.send_text(f"SPEED {speed}")
        self.send_text("DIRECTION 1")
        self.send_text("REFERENCE 0,0")

    def send_text(self, line: str) -> None:
        payload = line.encode("ascii") + self.EOL
        log.debug("TSPL >>> %s", line)
        self.ser.write(payload)

    def send_raw(self, data: bytes) -> None:
        log.debug("TSPL >>> <%d raw bytes>", len(data))
        self.ser.write(data)

    def set_label_size(
        self,
        width_mm: float,
        height_mm: float,
        gap_mm: float | None = None,
    ) -> None:
        self.label_width_mm = width_mm
        self.label_height_mm = height_mm
        if gap_mm is not None:
            self.gap_mm = gap_mm
        # TSPL accepts decimal mm via "SIZE w mm,h mm".
        self.send_text(f"SIZE {width_mm} mm,{height_mm} mm")
        self.send_text(f"GAP {self.gap_mm} mm,0 mm")

    @property
    def width_dots(self) -> int:
        return int(self.label_width_mm * self.DOTS_PER_MM)

    @property
    def height_dots(self) -> int:
        return int(self.label_height_mm * self.DOTS_PER_MM)

    def print_bitmap(
        self,
        bitmap: Image.Image | list[list[int]] | tuple[tuple[int, ...], ...],
        halign: HAlign = HAlign.LEFT,
        valign: VAlign = VAlign.TOP,
        copies: int = 1,
    ) -> None:
        """Render a 1-bit bitmap as a single TSPL `BITMAP` + `PRINT`.

        Honours HAlign/VAlign by positioning the bitmap inside the full
        label area (same convention as `ESCPrinter.print_bitmap`).
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

        # TSPL BITMAP: bit 0 = black, bit 1 = white. Initialise raster to
        # all-1 (white) and clear bits where we want black.
        width_bytes = (bm_w + 7) // 8
        raster = bytearray([0xFF] * (width_bytes * bm_h))
        for y in range(bm_h):
            row = bits[y]
            for x in range(bm_w):
                if row[x]:  # 1 = black dot from _to_bit_grid
                    raster[y * width_bytes + (x >> 3)] &= ~(0x80 >> (x & 7)) & 0xFF

        self.send_text("CLS")
        header = f"BITMAP {x_offset},{y_offset},{width_bytes},{bm_h},0,".encode("ascii")
        log.debug(
            "TSPL bitmap: %dx%d at (%d,%d), %d bytes raster",
            bm_w,
            bm_h,
            x_offset,
            y_offset,
            len(raster),
        )
        self.ser.write(header + bytes(raster) + self.EOL)
        self.send_text(f"PRINT 1,{copies}")

    def next_label(self) -> None:
        # TSPL's PRINT already feeds to the next label. Issue a FORMFEED
        # only if explicitly needed; default is no-op.
        return


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


def make_printer(cfg: LabelConfig) -> ESCPrinter | TSPLPrinter:
    """Open a printer of the right protocol based on `cfg.command_set`."""
    if cfg.command_set == CommandSet.ESCPOS.value:
        return ESCPrinter(
            cfg.printer_port,
            label_width_mm=cfg.width_mm,
            label_height_mm=cfg.height_mm,
            head_alignment=cfg.head_alignment,
        )
    if cfg.command_set == CommandSet.TSPL.value:
        return TSPLPrinter(
            cfg.printer_port,
            label_width_mm=cfg.width_mm,
            label_height_mm=cfg.height_mm,
            head_alignment=cfg.head_alignment,
        )
    raise ValueError(f"Unknown command_set: {cfg.command_set!r}")


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
    cleanly, so each call opens fresh. The protocol class is chosen from
    `cfg.command_set`.
    """
    with make_printer(cfg) as p:
        p.print_bitmap(img, halign=halign, valign=valign)
        if feed_after:
            p.next_label()
