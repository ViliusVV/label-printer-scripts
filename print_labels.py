"""Read the CSV associated with a config and print every physical label.

Run:  python print_labels.py [data/VIAL_TOP_default.toml]
"""
import argparse
from pathlib import Path

from labels import LabelConfig, csv_path_for, render_labels_from_csv
from printer import HAlign, LabelPrinter, VAlign


def main(config_path: Path):
    cfg = LabelConfig.from_toml(config_path)
    csv_path = csv_path_for(config_path)
    images = list(render_labels_from_csv(csv_path, cfg))

    printer = LabelPrinter(
        cfg.printer_port,
        label_width_mm=cfg.width_mm,
        label_height_mm=cfg.height_mm,
    )
    try:
        for i, img in enumerate(images, 1):
            print(f"[{cfg.type}] printing label {i}/{len(images)} on {cfg.printer_port}")
            printer.print_bitmap(img, halign=HAlign.LEFT, valign=VAlign.TOP)
            printer.next_label()
    finally:
        printer.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "config", nargs="?", default="data/VIAL_TOP_default.toml",
        type=Path, help="Path to a TOML config; sibling .csv supplies data.",
    )
    args = parser.parse_args()
    main(args.config)
