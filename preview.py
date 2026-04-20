"""Quick one-shot preview: renders every physical label from labels.csv,
saves each to preview_N.png, and opens the first in the OS image viewer.

Run:  python preview.py
"""
from PIL import Image

from labels import LabelConfig, render_labels_from_csv

SCALE = 6


def main():
    cfg = LabelConfig.from_toml("config.toml")
    images = list(render_labels_from_csv("labels.csv", cfg))
    if not images:
        print("No labels rendered — labels.csv empty?")
        return

    for i, img in enumerate(images, 1):
        img.save(f"preview_{i}.png")

    print(f"Rendered {len(images)} label(s); saved preview_1..{len(images)}.png")
    first = images[0]
    first.resize(
        (first.width * SCALE, first.height * SCALE), Image.NEAREST
    ).show()


if __name__ == "__main__":
    main()
