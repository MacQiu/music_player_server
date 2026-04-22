"""Small helpers: ID generation, safe filenames, audio metadata extraction."""

from __future__ import annotations

import os
import re
import uuid
from typing import Optional, Tuple

from werkzeug.utils import secure_filename


ALLOWED_EXTENSIONS = {".mp3", ".wav"}


def new_id() -> str:
    """Return a short URL-safe unique ID (hex UUID4)."""
    return uuid.uuid4().hex


def allowed_file(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in ALLOWED_EXTENSIONS


def safe_storage_name(title: str, artist: str | None, ext: str, dest_dir: str) -> str:
    """Return ``Title - Artist<ext>``, appending ``(N)`` on collision."""
    base = title
    if artist:
        base = f"{title} - {artist}"
    safe = re.sub(r'[<>:"/\\|?*]', "_", base).strip().rstrip(".")
    if not safe:
        safe = "audio"
    candidate = f"{safe}{ext}"
    if not os.path.exists(os.path.join(dest_dir, candidate)):
        return candidate
    n = 2
    while os.path.exists(os.path.join(dest_dir, f"{safe} ({n}){ext}")):
        n += 1
    return f"{safe} ({n}){ext}"


def extract_metadata(path: str) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[float]]:
    """Best-effort (title, artist, album, duration) via mutagen.

    Returns ``(None, None, None, None)`` silently if the file can't be parsed.
    """
    try:
        from mutagen import File as MutagenFile  # lazy import
    except Exception:
        return None, None, None, None

    try:
        mf = MutagenFile(path, easy=True)
    except Exception:
        return None, None, None, None

    if mf is None:
        return None, None, None, None

    def _first(key: str) -> Optional[str]:
        val = mf.tags.get(key) if mf.tags else None
        if not val:
            return None
        if isinstance(val, list):
            return str(val[0]) if val else None
        return str(val)

    title = _first("title")
    artist = _first("artist")
    album = _first("album")
    duration = None
    try:
        if mf.info and getattr(mf.info, "length", None) is not None:
            duration = float(mf.info.length)
    except Exception:
        duration = None

    return title, artist, album, duration
