"""Font discovery for the Streamlit sidebar.

Scans a fonts directory once (cached by Streamlit), returning `(display, path)`
tuples. Hardcoded to Windows fonts since the printer/UI are Windows-only.
"""

from __future__ import annotations

import logging
from pathlib import Path

import streamlit as st
from PIL import ImageFont

log = logging.getLogger(__name__)

FONTS_DIR = Path("C:/Windows/Fonts")


@st.cache_data(show_spinner="Scanning fonts…")
def available_fonts() -> list[tuple[str, str]]:
    """Return `(display_name, path)` pairs for installed TTF/OTF fonts."""
    if not FONTS_DIR.exists():
        return []
    seen: dict[str, str] = {}
    for path in sorted(list(FONTS_DIR.glob("*.ttf")) + list(FONTS_DIR.glob("*.otf"))):
        try:
            family, style = ImageFont.truetype(str(path), 16).getname()
            display = f"{family} {style}".strip() or path.stem
        except OSError:
            log.debug("Skipping unreadable font: %s", path)
            display = path.stem
        p_str = str(path).replace("\\", "/")
        seen.setdefault(display, p_str)
    return sorted(seen.items(), key=lambda kv: kv[0].lower())


def font_selectbox(label: str, current_path: str, key: str) -> str:
    """Selectbox of installed fonts; falls back to text input if scan empty."""
    fonts = available_fonts()
    paths = [p for _, p in fonts]
    display_by_path = {p: d for d, p in fonts}
    if current_path and current_path not in paths:
        paths.insert(0, current_path)
        display_by_path[current_path] = f"(custom) {Path(current_path).name}"
    if not paths:
        return st.text_input(label, current_path, key=key)
    return st.selectbox(
        label,
        paths,
        index=paths.index(current_path) if current_path in paths else 0,
        format_func=lambda p: display_by_path.get(p, p),
        key=key,
    )
