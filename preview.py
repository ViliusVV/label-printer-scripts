"""Quick preview: renders the first physical label from labels.csv and
opens it in the OS default image viewer.

Run:  python preview.py
"""
from PIL import Image

from labels import (
    CircleText,
    LabelConfig,
    circles_from_csv,
    pack_circles_to_labels,
    render_label,
)

SCALE = 6  # upscale factor for on-screen viewing (uses nearest-neighbour)


def main():
    cfg = LabelConfig.from_toml("config.toml")
    try:
        circles = circles_from_csv("labels.csv")
    except FileNotFoundError:
        circles = [
            CircleText(top="R1", middle="10k", bottom="1%"),
            CircleText(top="C1", middle="100n", bottom=""),
        ]

    labels = pack_circles_to_labels(circles, cfg.circle_count)
    if not labels:
        print("No labels to render.")
        return

    img = render_label(labels[0], cfg)
    img.save("preview.png")
    preview = img.resize((img.width * SCALE, img.height * SCALE), Image.NEAREST)
    preview.show()
    print(f"Rendered {len(labels)} physical label(s); showing label 1 of {len(labels)}.")
    print(f"Saved 1:1 bitmap to preview.png ({img.width}x{img.height} dots).")


if __name__ == "__main__":
    main()
