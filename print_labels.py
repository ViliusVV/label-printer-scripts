"""Read labels.csv and print every physical label to the TF P2.

Run:  python print_labels.py
"""
from labels import (
    LabelConfig,
    circles_from_csv,
    pack_circles_to_labels,
    render_label,
)
from printer import HAlign, LabelPrinter, VAlign

CFG_PATH = "config.toml"
CSV_PATH = "labels.csv"
PORT = "COM4"


def main():
    cfg = LabelConfig.from_toml(CFG_PATH)
    circles = circles_from_csv(CSV_PATH)
    labels = pack_circles_to_labels(circles, cfg.circle_count)

    printer = LabelPrinter(
        PORT,
        label_width_mm=cfg.width_mm,
        label_height_mm=cfg.height_mm,
    )
    try:
        for i, batch in enumerate(labels, 1):
            img = render_label(batch, cfg)
            print(f"Printing label {i}/{len(labels)}")
            printer.print_bitmap(img, halign=HAlign.LEFT, valign=VAlign.TOP)
            printer.next_label()
    finally:
        printer.close()


if __name__ == "__main__":
    main()
