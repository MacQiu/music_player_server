"""SQLite helpers: connection, schema init, and idempotent analytics upsert.

A single DB file (``data/music.db``) holds three tables:
- ``songs``     : library metadata
- ``analytics`` : aggregated per-song stats
- ``playlogs``  : raw logs, keyed by a client-supplied UUID for idempotency
"""

from __future__ import annotations

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
    name        TEXT PRIMARY KEY,
    image_path  TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


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
