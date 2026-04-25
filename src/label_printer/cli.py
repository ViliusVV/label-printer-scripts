"""Unified CLI: `label-printer print|preview|ui`.

Wired via `[project.scripts]` in pyproject.toml. Each subcommand takes the
same `<config>` positional (path to a YAML in `data/`); the sibling .csv is
discovered via `csv_path_for`.
"""

from __future__ import annotations

import argparse
import logging
import subprocess
import sys
from pathlib import Path

from PIL import Image

from label_printer.config import LabelConfig, csv_path_for
from label_printer.csv_io import render_labels_from_csv
from label_printer.printer import HAlign, LabelPrinter, VAlign

DEFAULT_CONFIG = Path("data/VIAL_TOP_default.yaml")
PREVIEW_SCALE = 6

log = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="label-printer")
    parser.add_argument(
        "-v",
        "--verbose",
        action="count",
        default=0,
        help="Logging verbosity (-v = INFO, -vv = DEBUG).",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_print = sub.add_parser(
        "print",
        help="Render config's CSV and send every label to the printer.",
    )
    _add_config_arg(p_print)

    p_preview = sub.add_parser(
        "preview",
        help="Render config's CSV to preview_N.png and open the first.",
    )
    _add_config_arg(p_preview)

    sub.add_parser("ui", help="Launch the interactive Streamlit preview.")

    args = parser.parse_args(argv)
    _setup_logging(args.verbose)

    if args.cmd == "print":
        return cmd_print(args.config)
    if args.cmd == "preview":
        return cmd_preview(args.config)
    if args.cmd == "ui":
        return cmd_ui()
    parser.error(f"Unknown command: {args.cmd}")
    return 2


def _add_config_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "config",
        nargs="?",
        default=DEFAULT_CONFIG,
        type=Path,
        help="Path to a YAML config; sibling .csv supplies data.",
    )


def _setup_logging(verbosity: int) -> None:
    level = logging.WARNING
    if verbosity == 1:
        level = logging.INFO
    elif verbosity >= 2:
        level = logging.DEBUG
    logging.basicConfig(
        level=level,
        format="%(levelname)s %(name)s: %(message)s",
    )


def cmd_print(config_path: Path) -> int:
    cfg = LabelConfig.from_yaml(config_path)
    csv_path = csv_path_for(config_path)
    images = list(render_labels_from_csv(csv_path, cfg))
    if not images:
        log.warning("No labels rendered — %s empty?", csv_path)
        return 0

    with LabelPrinter(
        cfg.printer_port,
        label_width_mm=cfg.width_mm,
        label_height_mm=cfg.height_mm,
    ) as printer:
        for i, img in enumerate(images, 1):
            log.info(
                "[%s] printing label %d/%d on %s",
                cfg.type,
                i,
                len(images),
                cfg.printer_port,
            )
            printer.print_bitmap(img, halign=HAlign.LEFT, valign=VAlign.TOP)
            printer.next_label()
    return 0


def cmd_preview(config_path: Path) -> int:
    cfg = LabelConfig.from_yaml(config_path)
    csv_path = csv_path_for(config_path)
    images = list(render_labels_from_csv(csv_path, cfg))
    if not images:
        log.warning("No labels rendered — %s empty?", csv_path)
        return 0

    for i, img in enumerate(images, 1):
        img.save(f"preview_{i}.png")
    log.info(
        "[%s] rendered %d label(s); saved preview_1..%d.png",
        cfg.type,
        len(images),
        len(images),
    )
    first = images[0]
    first.resize(
        (first.width * PREVIEW_SCALE, first.height * PREVIEW_SCALE),
        Image.NEAREST,
    ).show()
    return 0


def cmd_ui() -> int:
    """Launch `streamlit run` against the app entry module."""
    app_path = Path(__file__).resolve().parent / "app" / "main.py"
    return subprocess.call(
        [sys.executable, "-m", "streamlit", "run", str(app_path)],
    )


if __name__ == "__main__":
    raise SystemExit(main())
