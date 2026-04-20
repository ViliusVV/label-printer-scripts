# This is a sample Python script.
import time

from printer import LabelPrinter, HAlign, VAlign, DitherMode

PORT = "COM4"

printer = LabelPrinter(PORT, label_width_mm=36)

def esc_hello():
    # Initialize


    # Print text

    # printer.write_text("Hello label12345")
    # printer.next_label()

    printer.write_text("A")
    printer.write_text("ABCDEFGHIJ")
    printer.write_text("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")  # 32 A's
    printer.write_text("Hello label12345")
    printer.next_label()

def print_circles():
    printer.print_png(
        path="thing.png",
        halign=HAlign.LEFT,
        valign=VAlign.BOTTOM,
        dither=DitherMode.THRESHOLD
    )
    printer.next_label()

# Press the green button in the gutter to run the script.
if __name__ == '__main__':
    # esc_hello()
    print_circles()
    printer.close()

# See PyCharm help at https://www.jetbrains.com/help/pycharm/
