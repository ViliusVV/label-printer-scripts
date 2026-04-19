# This is a sample Python script.
import time

# Press Shift+F10 to execute it or replace it with your code.
# Press Double Shift to search everywhere for classes, files, tool windows, actions, and settings.
import serial

from printer import LabelPrinter, ESC, AT

PORT = "COM4"

printer = LabelPrinter(PORT, label_width_mm=20)

def esc_hello():
    # Initialize
    printer.send(ESC, AT)

    # Print text
    printer.write_text("Hello label12345")
    printer.send(ESC, AT)
    printer.next_label()

# Press the green button in the gutter to run the script.
if __name__ == '__main__':
    esc_hello()
    # test_alignment_with_tear(
    #     label_height_dots=10,
    #     tear_distance_dots=56
    # )
    # tsc_hello()
    printer.close()

# See PyCharm help at https://www.jetbrains.com/help/pycharm/
