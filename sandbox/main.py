"""Sandbox script for ad-hoc printer experiments.

Not part of the package — invoke directly with `python sandbox/main.py`.
"""

from label_printer.printer import DitherMode, HAlign, LabelPrinter, VAlign

PORT = "COM4"

printer = LabelPrinter(PORT, label_width_mm=36)


def esc_hello() -> None:
    printer.write_text("A")
    printer.write_text("ABCDEFGHIJ")
    printer.write_text("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")  # 32 A's
    printer.write_text("Hello label12345")
    printer.next_label()


def print_circles() -> None:
    printer.print_png(
        path="sandbox/thing.png",
        halign=HAlign.LEFT,
        valign=VAlign.BOTTOM,
        dither=DitherMode.THRESHOLD,
    )
    printer.next_label()


if __name__ == "__main__":
    print_circles()
    printer.close()
