"""SQLite helpers: connection, schema init, and idempotent analytics upsert.

A single DB file (``data/music.db``) holds three tables:
- ``songs``     : library metadata
- ``analytics`` : aggregated per-song stats
- ``playlogs``  : raw logs, keyed by a client-supplied UUID for idempotency
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator


DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DB_PATH = os.path.join(DB_DIR, "music.db")


SCHEMA = """
CREATE TABLE IF NOT EXISTS songs (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    artist      TEXT,
    album       TEXT,
    duration    REAL,
    file_path   TEXT NOT NULL,
    cover_path  TEXT,
    sort_order  INTEGER DEFAULT 0,
    downloaded  INTEGER DEFAULT 0,
    date_added  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics (
    song_id     TEXT PRIMARY KEY,
    play_count  INTEGER DEFAULT 0,
    total_time  REAL    DEFAULT 0,
    last_played TIMESTAMP,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playlogs (
    id          TEXT PRIMARY KEY,
    song_id     TEXT NOT NULL,
    duration    REAL NOT NULL,
    timestamp   TIMESTAMP NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_playlogs_song ON playlogs(song_id);

CREATE TABLE IF NOT EXISTS playlists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_songs (
    playlist_id TEXT NOT NULL,
    song_id     TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (playlist_id, song_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artists (
    name                TEXT PRIMARY KEY,
    image_path          TEXT,
    image_position      TEXT DEFAULT 'center 30%',
    image_position_mobile TEXT DEFAULT 'center center',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lyric_sets (
    id          TEXT PRIMARY KEY,
    song_id     TEXT NOT NULL,
    label       TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);
"""


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
COVERS_DIR = os.path.join(BASE_DIR, "storage", "covers")


def _migrate_cover_dedup(conn: sqlite3.Connection) -> None:
    """One-time migration: rename cover files to content-hash names."""
    rows = conn.execute(
        "SELECT DISTINCT cover_path FROM songs WHERE cover_path IS NOT NULL"
    ).fetchall()
    if not rows:
        return
    os.makedirs(COVERS_DIR, exist_ok=True)
    for (cover_path,) in rows:
        abs_path = os.path.join(BASE_DIR, cover_path)
        if not os.path.isfile(abs_path):
            continue
        basename = os.path.basename(cover_path)
        # Already migrated if name is 64-char hex + extension
        name_no_ext, ext = os.path.splitext(basename)
        if len(name_no_ext) == 64:
            try:
                int(name_no_ext, 16)
                continue
            except ValueError:
                pass
        with open(abs_path, "rb") as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        new_name = f"{digest}{ext}"
        new_abs = os.path.join(COVERS_DIR, new_name)
        new_rel = os.path.relpath(new_abs, BASE_DIR).replace("\\", "/")
        if not os.path.isfile(new_abs):
            os.replace(abs_path, new_abs)
        else:
            try:
                os.remove(abs_path)
            except OSError:
                pass
        if new_rel != cover_path:
            conn.execute(
                "UPDATE songs SET cover_path = ? WHERE cover_path = ?",
                (new_rel, cover_path),
            )


LYRICS_DIR = os.path.join(BASE_DIR, "storage", "lyrics")


def _migrate_lyrics_to_sets(conn: sqlite3.Connection) -> None:
    """Migrate old {song_id}.lrc files into {song_id}/ directories with DB entries."""
    if not os.path.isdir(LYRICS_DIR):
        return
    import uuid
    for fname in os.listdir(LYRICS_DIR):
        if not fname.endswith(".lrc"):
            continue
        old_path = os.path.join(LYRICS_DIR, fname)
        if not os.path.isfile(old_path):
            continue
        song_id = fname[:-4]
        existing = conn.execute(
            "SELECT id FROM lyric_sets WHERE song_id = ?", (song_id,)
        ).fetchone()
        if existing:
            continue
        song_dir = os.path.join(LYRICS_DIR, song_id)
        os.makedirs(song_dir, exist_ok=True)
        set_id = uuid.uuid4().hex
        new_path = os.path.join(song_dir, f"{set_id}.lrc")
        os.replace(old_path, new_path)
        conn.execute(
            "INSERT INTO lyric_sets (id, song_id, label, position) VALUES (?, ?, ?, ?)",
            (set_id, song_id, "Original", 0),
        )


def _migrate_lyrics_readable_names(conn: sqlite3.Connection) -> None:
    """Rename lyrics dirs from {song_id} to {Title - Artist} and files from {set_id}.lrc to Lyrics - {label}.lrc."""
    if not os.path.isdir(LYRICS_DIR):
        return

    def _safe(text: str) -> str:
        import re
        return re.sub(r'[<>:"/\\|?*]', "_", text).strip().rstrip(".") or "unknown"

    song_ids = conn.execute(
        "SELECT DISTINCT song_id FROM lyric_sets"
    ).fetchall()

    for (song_id,) in song_ids:
        old_dir = os.path.join(LYRICS_DIR, song_id)
        if not os.path.isdir(old_dir):
            continue

        song_row = conn.execute(
            "SELECT title, artist FROM songs WHERE id = ?", (song_id,)
        ).fetchone()
        if not song_row:
            continue

        base = song_row["title"]
        if song_row["artist"]:
            base = f"{song_row['title']} - {song_row['artist']}"
        new_name = _safe(base)
        new_dir = os.path.join(LYRICS_DIR, new_name)

        if old_dir != new_dir:
            if os.path.isdir(new_dir):
                for f in os.listdir(old_dir):
                    os.replace(os.path.join(old_dir, f), os.path.join(new_dir, f))
                try:
                    os.rmdir(old_dir)
                except OSError:
                    pass
            else:
                os.replace(old_dir, new_dir)

        sets = conn.execute(
            "SELECT id, label FROM lyric_sets WHERE song_id = ?", (song_id,)
        ).fetchall()
        target_dir = new_dir if os.path.isdir(new_dir) else old_dir
        for s in sets:
            old_file = os.path.join(target_dir, f"{s['id']}.lrc")
            safe_label = _safe(s["label"])
            new_file = os.path.join(target_dir, f"Lyrics - {safe_label}.lrc")
            if os.path.isfile(old_file) and old_file != new_file:
                os.replace(old_file, new_file)


def init_db() -> None:
    """Create the data directory and run the schema DDL (idempotent)."""
    os.makedirs(DB_DIR, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        # Migrate existing DBs that lack the cover_path column.
        try:
            conn.execute("SELECT cover_path FROM songs LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE songs ADD COLUMN cover_path TEXT")
        # Migrate existing DBs that lack the sort_order column.
        try:
            conn.execute("SELECT sort_order FROM songs LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE songs ADD COLUMN sort_order INTEGER DEFAULT 0")
            conn.execute(
                "UPDATE songs SET sort_order = ("
                "  SELECT COUNT(*) FROM songs s2 WHERE s2.date_added > songs.date_added"
                ")"
            )
        # Migrate existing DBs that lack the downloaded column.
        try:
            conn.execute("SELECT downloaded FROM songs LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE songs ADD COLUMN downloaded INTEGER DEFAULT 0")
        # Backfill artists table from songs that pre-date the artists table.
        conn.execute(
            "INSERT OR IGNORE INTO artists (name) "
            "SELECT DISTINCT artist FROM songs "
            "WHERE artist IS NOT NULL AND artist <> '' "
            "AND artist NOT IN (SELECT name FROM artists)"
        )
        # Deduplicate existing cover files: rename to content-hash names and
        # consolidate duplicates so only one copy lives on disk.
        _migrate_cover_dedup(conn)
        # Migrate old single-file lyrics to directory-per-song model.
        _migrate_lyrics_to_sets(conn)
        # Rename lyrics dirs/files to human-readable names.
        _migrate_lyrics_readable_names(conn)
        # Migrate existing DBs that lack artist image_position columns.
        try:
            conn.execute("SELECT image_position FROM artists LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE artists ADD COLUMN image_position TEXT DEFAULT 'center 30%'")
        try:
            conn.execute("SELECT image_position_mobile FROM artists LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE artists ADD COLUMN image_position_mobile TEXT DEFAULT 'center center'")
        conn.commit()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    """Context manager yielding a connection; commits on clean exit."""
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def insert_playlog_and_update_analytics(
    conn: sqlite3.Connection,
    log_id: str,
    song_id: str,
    duration: float,
    timestamp: str,
) -> bool:
    """Insert one playlog idempotently and update analytics only if new.

    Returns True if the log was newly inserted, False if it was a duplicate.
    """
    cur = conn.execute(
        "INSERT OR IGNORE INTO playlogs (id, song_id, duration, timestamp) "
        "VALUES (?, ?, ?, ?)",
        (log_id, song_id, duration, timestamp),
    )
    if cur.rowcount == 0:
        return False

    # Upsert analytics: increment count, add time, keep latest last_played.
    conn.execute(
        """
        INSERT INTO analytics (song_id, play_count, total_time, last_played)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(song_id) DO UPDATE SET
            play_count  = play_count + 1,
            total_time  = total_time + excluded.total_time,
            last_played = CASE
                WHEN analytics.last_played IS NULL
                     OR excluded.last_played > analytics.last_played
                THEN excluded.last_played
                ELSE analytics.last_played
            END
        """,
        (song_id, duration, timestamp),
    )
    return True
