from enum import Enum

import serial
from PIL import Image


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


class Cmd(Enum):
    ESC = b"\x1b"
    ESC_AT =b"\x1b\x40"
    GS = b"\x1d"
    GS_FF = b"\x1d\x0c"
    GS_W = b"\x1d\x57"
    GS_L = b"\x1d\x4c"
    # GS P x y: set motion units to 1/x" horizontal, 1/y" vertical.
    # 203 = 0xCB ≈ 8 dots/mm so GS L / GS W / GS $ etc. take dot counts directly.
    GS_P_DOTS = b"\x1d\x50\xcb\xcb"



class LabelPrinter:
    DOTS_PER_MM = 8
    MAX_WIDTH_DOTS = 384  # 48mm * 8

    def __init__(self,
        port: str,
        baud: int = 9600,
        label_width_mm: int = MAX_WIDTH_DOTS/DOTS_PER_MM,
        label_height_mm: int = 30
 ):
        self.label_width_mm = label_width_mm
        self.label_height_mm = label_height_mm
        self.ser = serial.Serial(port, baud)

        self.send(Cmd.ESC_AT)
        self.send(Cmd.GS_P_DOTS)
        self.set_label_size(label_width_mm, label_height_mm)

    def send(self, *commands: bytes|Cmd):
        if len(commands) >= 1:
            command_bytes = []
            for command in commands:
                if isinstance(command, Cmd):
                    command_bytes.append(command.value)
                else:
                    command_bytes.append(command)

            data = b''.join(command_bytes)
            print(f"Sending [{len(commands)}] commands, data: {data}")
            self.ser.write(data)
        else:
            raise ValueError("No commands provided")

    def set_label_size(self, width_mm, height_mm):
        self.label_width_mm = width_mm
        self.label_height_mm = height_mm
        print(f"Setting label size to {width_mm}x{height_mm}")

        # This printer aligns the label to the right side of the print head,
        # so margin = head width - label width puts print origin at the label's left edge.

        width_dots = int(width_mm * self.DOTS_PER_MM)
        left_margin_dots = LabelPrinter.MAX_WIDTH_DOTS - width_dots
        if width_dots + left_margin_dots > LabelPrinter.MAX_WIDTH_DOTS:
            raise AssertionError("Something is not right with label size")

        print("Left margin: ", left_margin_dots, "Width:", width_dots)
        print(f"Total width", width_dots + left_margin_dots)
        # GS L nL nH: set left margin (from paper left edge)
        self.send(Cmd.GS_L, left_margin_dots.to_bytes(2, 'little'))
        # GS W nL nH: set print area width
        self.send(Cmd.GS_W, width_dots.to_bytes(2, 'little'))

    @property
    def width_dots(self):
        return int(self.label_width_mm * LabelPrinter.DOTS_PER_MM)

    @property
    def height_dots(self):
        return int(self.label_height_mm * LabelPrinter.DOTS_PER_MM)

    def write_text(self, text: str):
        bytes_text = text.encode() + b'\n'
        print(f"Sending [{len(text)}] bytes: {bytes_text}")
        self.ser.write(bytes_text)

    def print_bitmap(self,
        bitmap,
        halign: HAlign = HAlign.LEFT,
        valign: VAlign = VAlign.TOP,
    ):
        """Print a bitmap, padded to the full label area per alignment.

        Accepts a PIL Image in mode '1', or a 2D tuple/list of 0/1 where
        1 = print a black dot. Raises ValueError if the bitmap exceeds the
        label dimensions in dots.
        """
        bits = self._to_bit_grid(bitmap)
        bm_h = len(bits)
        bm_w = len(bits[0]) if bm_h else 0

        label_w = self.width_dots
        label_h = self.height_dots

        if bm_w > label_w or bm_h > label_h:
            raise ValueError(
                f"Bitmap {bm_w}x{bm_h} dots exceeds label {label_w}x{label_h} dots"
            )

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

        # GS v 0 m xL xH yL yH d1...dk
        header = b"\x1d\x76\x30\x00"
        header += width_bytes.to_bytes(2, 'little')
        header += label_h.to_bytes(2, 'little')
        print(f"Sending bitmap: {bm_w}x{bm_h} -> canvas {padded_w}x{label_h} "
              f"({len(raster)} bytes), halign={halign.value}, valign={valign.value}")
        self.ser.write(header + bytes(raster))

    def print_png(self,
        path: str,
        halign: HAlign = HAlign.LEFT,
        valign: VAlign = VAlign.TOP,
        dither: DitherMode = DitherMode.THRESHOLD,
        threshold: int = 128,
    ):
        """Load a PNG, convert to 1-bit, and print via print_bitmap."""
        img = load_png(path, dither=dither, threshold=threshold)
        self.print_bitmap(img, halign=halign, valign=valign)

    @staticmethod
    def _to_bit_grid(bitmap) -> list[list[int]]:
        if isinstance(bitmap, Image.Image):
            if bitmap.mode != '1':
                bitmap = bitmap.convert('1')
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

    def next_label(self):
        self.send(Cmd.GS_FF)

    def close(self):
        self.ser.close()
        print("Printer Serial closed")


def load_png(path: str,
    dither: DitherMode = DitherMode.THRESHOLD,
    threshold: int = 128,
) -> Image.Image:
    """Load a PNG, convert to 1-bit, return a PIL Image ready for print_bitmap.

    THRESHOLD: pixels darker than `threshold` become black.
    FLOYD_STEINBERG: error-diffusion dithering (better for photos).
    """
    img = Image.open(path)
    if img.mode != 'L':
        img = img.convert('L')
    if dither is DitherMode.THRESHOLD:
        return img.point(lambda p: 0 if p < threshold else 255, mode='1')
    if dither is DitherMode.FLOYD_STEINBERG:
        return img.convert('1')  # PIL uses Floyd–Steinberg by default for '1'
    raise ValueError(f"Unknown dither mode: {dither}")