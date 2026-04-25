"""Quick one-shot preview: renders every physical label from the CSV
associated with a config, saves each to preview_N.png, and opens the
first in the OS image viewer.

Run:  python preview.py [data/VIAL_TOP_default.yaml]
"""
import argparse
from pathlib import Path

from PIL import Image

from labels import LabelConfig, csv_path_for, render_labels_from_csv

SCALE = 6


def main(config_path: Path):
    cfg = LabelConfig.from_yaml(config_path)
    csv_path = csv_path_for(config_path)
    images = list(render_labels_from_csv(csv_path, cfg))
    if not images:
        print(f"No labels rendered — {csv_path} empty?")
        return

    for i, img in enumerate(images, 1):
        img.save(f"preview_{i}.png")

    print(
        f"[{cfg.type}] rendered {len(images)} label(s); "
        f"saved preview_1..{len(images)}.png"
    )
    first = images[0]
    first.resize(
        (first.width * SCALE, first.height * SCALE), Image.NEAREST
    ).show()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "config", nargs="?", default="data/VIAL_TOP_default.yaml",
        type=Path, help="Path to a YAML config; sibling .csv supplies data.",
    )
    args = parser.parse_args()
    main(args.config)
