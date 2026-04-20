"""Read labels.csv and print every physical label to the TF P2.

Run:  python print_labels.py
"""
from labels import LabelConfig, render_labels_from_csv
from printer import HAlign, LabelPrinter, VAlign

CFG_PATH = "config.toml"
CSV_PATH = "labels.csv"
PORT = "COM4"


def main():
    cfg = LabelConfig.from_toml(CFG_PATH)
    images = list(render_labels_from_csv(CSV_PATH, cfg))

    printer = LabelPrinter(
        PORT,
        label_width_mm=cfg.width_mm,
        label_height_mm=cfg.height_mm,
    )
    try:
        for i, img in enumerate(images, 1):
            print(f"Printing label {i}/{len(images)}")
            printer.print_bitmap(img, halign=HAlign.LEFT, valign=VAlign.TOP)
            printer.next_label()
    finally:
        printer.close()


if __name__ == "__main__":
    main()
