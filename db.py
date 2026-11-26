"""SQLite helpers: connection, schema init, and idempotent analytics upsert.

A single DB file (``data/music.db``) holds three tables:
- ``songs``     : library metadata
- ``analytics`` : aggregated per-song stats
- ``playlogs``  : raw logs, keyed by a client-supplied UUID for idempotency
"""

from __future__ import annotations

import hashlib
import utils
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Iterator
import shutil
import logging
import re


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

CREATE TABLE IF NOT EXISTS period_snapshots (
    period_type TEXT NOT NULL,
    period_key  TEXT NOT NULL,
    payload     TEXT NOT NULL,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (period_type, period_key)
);

CREATE TABLE IF NOT EXISTS server_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS wrapped_jobs (
    year         INTEGER PRIMARY KEY,
    status       TEXT NOT NULL,
    generated_at TIMESTAMP
);
"""

WRAPPED_NAME_RE = re.compile(r"^Your (\d{4}) Playback$")


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
                utils.recycle_path(abs_path)
            except OSError:
                pass
        if new_rel != cover_path:
            conn.execute(
                "UPDATE songs SET cover_path = ? WHERE cover_path = ?",
                (new_rel, cover_path),
            )


LYRICS_DIR = os.path.join(BASE_DIR, "storage", "lyrics")

def _migrate_cleanup_orphaned_lyrics(conn: sqlite3.Connection) -> None:
    """One-time cleanup: remove lyrics folders that don't match any current song.

    Handles two kinds of orphan:
      - Old-style folders still named by song_id (from before the readable-name
        migration), where that song_id no longer exists in `songs`.
      - Readable-name folders ("{Title} - {Artist}" or "{Title}") that don't
        match any current song's title/artist combination — e.g. left behind
        because delete_song() never cleaned up the lyrics directory.
    """
    if not os.path.isdir(LYRICS_DIR):
        return

    # An empty database means this process is not looking at the real library
    # (tests swap DB_PATH). Do not treat every lyrics folder as an orphan.
    song_count = conn.execute("SELECT COUNT(*) FROM songs").fetchone()[0]
    if song_count == 0:
        return

    def _safe(text: str) -> str:
        import re
        return re.sub(r'[<>:"/\\|?*]', "_", text).strip().rstrip(".") or "unknown"

    # Build the set of directory names that SHOULD exist right now, one per
    # song that still has at least one lyric_sets row.
    valid_names = set()
    rows = conn.execute(
        "SELECT DISTINCT s.id, s.title, s.artist "
        "FROM songs s JOIN lyric_sets ls ON ls.song_id = s.id"
    ).fetchall()
    for r in rows:
        base = r["title"]
        if r["artist"]:
            base = f"{r['title']} - {r['artist']}"
        valid_names.add(_safe(base))
        valid_names.add(r["id"])  # tolerate not-yet-renamed old-style folders

    for entry in os.listdir(LYRICS_DIR):
        entry_path = os.path.join(LYRICS_DIR, entry)
        if not os.path.isdir(entry_path):
            continue
        if entry in valid_names:
            continue
        try:
            utils.recycle_path(entry_path)
        except OSError as e:
            logging.getLogger("music_server").warning(
                "Could not remove orphaned lyrics dir %s: %s", entry_path, e
            )

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
        _migrate_cleanup_orphaned_lyrics(conn)
        # Deletes old unlinked lyrics files. 
        try:
            conn.execute("SELECT image_position FROM artists LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE artists ADD COLUMN image_position TEXT DEFAULT 'center 30%'")
        try:
            conn.execute("SELECT image_position_mobile FROM artists LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE artists ADD COLUMN image_position_mobile TEXT DEFAULT 'center center'")
        try:
            conn.execute("SELECT is_blank FROM songs LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE songs ADD COLUMN is_blank INTEGER DEFAULT 0")
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


def is_wrapped_playlist_name(name: str | None) -> bool:
    return bool(name and WRAPPED_NAME_RE.match(name))


def get_meta(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM server_meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO server_meta (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def touch_last_sync(conn: sqlite3.Connection, when: datetime | None = None) -> str:
    stamp = (when or datetime.now(timezone.utc)).isoformat()
    set_meta(conn, "last_sync_at", stamp)
    return stamp


def _stats_between(conn: sqlite3.Connection, start_date: str, end_date: str) -> dict:
    top_songs = conn.execute(
        """
        SELECT s.id, s.title, s.artist, s.cover_path,
               COUNT(p.id) AS play_count,
               COALESCE(SUM(p.duration), 0) AS total_time
        FROM playlogs p
        JOIN songs s ON s.id = p.song_id
        WHERE DATE(p.timestamp) >= ? AND DATE(p.timestamp) <= ?
        GROUP BY s.id
        ORDER BY play_count DESC
        LIMIT 10
        """,
        (start_date, end_date),
    ).fetchall()
    top_artists = conn.execute(
        """
        SELECT s.artist AS artist,
               COUNT(p.id) AS play_count,
               COALESCE(SUM(p.duration), 0) AS total_time
        FROM playlogs p
        JOIN songs s ON s.id = p.song_id
        WHERE DATE(p.timestamp) >= ? AND DATE(p.timestamp) <= ?
          AND s.artist IS NOT NULL AND s.artist <> ''
        GROUP BY s.artist
        ORDER BY play_count DESC
        LIMIT 10
        """,
        (start_date, end_date),
    ).fetchall()
    totals = conn.execute(
        """
        SELECT COUNT(*) AS total_plays,
               COALESCE(SUM(duration), 0) AS total_listening_time
        FROM playlogs
        WHERE DATE(timestamp) >= ? AND DATE(timestamp) <= ?
        """,
        (start_date, end_date),
    ).fetchone()
    songs = []
    for r in top_songs:
        d = dict(r)
        d["cover_url"] = f"/covers/{d['id']}" if d.get("cover_path") else None
        d.pop("cover_path", None)
        songs.append(d)
    return {
        "top_songs": songs,
        "top_artists": [dict(r) for r in top_artists],
        "total_plays": totals["total_plays"],
        "total_listening_time": totals["total_listening_time"],
    }


def _month_bounds(year: int, month: int) -> tuple[str, str]:
    start = date(year, month, 1)
    if month == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _upsert_period(conn: sqlite3.Connection, period_type: str, period_key: str, start: str, end: str) -> None:
    payload = json.dumps(_stats_between(conn, start, end))
    conn.execute(
        """
        INSERT INTO period_snapshots (period_type, period_key, payload, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(period_type, period_key) DO UPDATE SET
            payload = excluded.payload,
            updated_at = CURRENT_TIMESTAMP
        """,
        (period_type, period_key, payload),
    )


def refresh_period_snapshots(conn: sqlite3.Connection, now: datetime | None = None) -> None:
    """Recompute the current week, month, and year. Keep week/month rows for this year only."""
    today = (now or datetime.now()).date()
    iso = today.isocalendar()
    week_key = f"{iso.year}-W{iso.week:02d}"
    week_start = date.fromisocalendar(iso.year, iso.week, 1)
    week_end = week_start + timedelta(days=6)
    _upsert_period(conn, "week", week_key, week_start.isoformat(), week_end.isoformat())

    month_key = f"{today.year}-{today.month:02d}"
    _upsert_period(conn, "month", month_key, *_month_bounds(today.year, today.month))
    _upsert_period(conn, "year", str(today.year), f"{today.year}-01-01", f"{today.year}-12-31")

    prev = today.year - 1
    frozen = get_meta(conn, "frozen_year")
    if frozen is None or int(frozen) < prev:
        _upsert_period(conn, "year", str(prev), f"{prev}-01-01", f"{prev}-12-31")
        set_meta(conn, "frozen_year", str(prev))

    conn.execute(
        """
        DELETE FROM period_snapshots
        WHERE period_type IN ('week', 'month')
          AND substr(period_key, 1, 4) != ?
          AND period_key != ?
        """,
        (str(today.year), week_key),
    )


def list_period_keys(conn: sqlite3.Connection, period_type: str) -> list[str]:
    rows = conn.execute(
        "SELECT period_key FROM period_snapshots WHERE period_type = ? ORDER BY period_key DESC",
        (period_type,),
    ).fetchall()
    return [r["period_key"] for r in rows]


def get_period_snapshot(conn: sqlite3.Connection, period_type: str, period_key: str) -> dict | None:
    row = conn.execute(
        "SELECT payload, updated_at FROM period_snapshots WHERE period_type = ? AND period_key = ?",
        (period_type, period_key),
    ).fetchone()
    if not row:
        return None
    payload = json.loads(row["payload"])
    payload["updated_at"] = row["updated_at"]
    return payload


def _mark_wrapped(conn: sqlite3.Connection, year: int, status: str) -> None:
    generated_at = datetime.now(timezone.utc).isoformat() if status == "generated" else None
    conn.execute(
        """
        INSERT INTO wrapped_jobs (year, status, generated_at) VALUES (?, ?, ?)
        ON CONFLICT(year) DO UPDATE SET
            status = excluded.status,
            generated_at = COALESCE(excluded.generated_at, wrapped_jobs.generated_at)
        """,
        (year, status, generated_at),
    )


def generate_wrapped_playlist(conn: sqlite3.Connection, year: int) -> dict | None:
    """Build Your {year} Playback from playlogs through Nov 30. None when there is no data."""
    start_date = f"{year - 1}-12-01"
    end_date = f"{year}-11-30"
    top_songs = conn.execute(
        """
        SELECT s.id, COUNT(*) AS play_count
        FROM playlogs p JOIN songs s ON s.id = p.song_id
        WHERE DATE(p.timestamp) >= ? AND DATE(p.timestamp) <= ?
        GROUP BY s.id
        ORDER BY play_count DESC
        """,
        (start_date, end_date),
    ).fetchall()
    playlist_name = f"Your {year} Playback"
    if not top_songs:
        return None

    existing = conn.execute(
        "SELECT id FROM playlists WHERE name = ?", (playlist_name,)
    ).fetchone()
    if existing:
        pid = existing["id"]
        conn.execute("DELETE FROM playlist_songs WHERE playlist_id = ?", (pid,))
    else:
        pid = uuid.uuid4().hex
        conn.execute(
            "INSERT INTO playlists (id, name) VALUES (?, ?)",
            (pid, playlist_name),
        )
    for pos, row in enumerate(top_songs):
        conn.execute(
            "INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)",
            (pid, row["id"], pos),
        )
    _mark_wrapped(conn, year, "generated")
    return {
        "ok": True,
        "playlist_id": pid,
        "name": playlist_name,
        "song_count": len(top_songs),
    }


def _parse_sync_stamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def maybe_generate_wrapped(conn: sqlite3.Connection, now: datetime | None = None) -> None:
    """After Nov 30, generate the closed wrapped year if a sync happened on or after Nov 20.

    A later sync still unblocks generation. Playlogs after the deadline are ignored.
    """
    today = (now or datetime.now()).date()
    years = set()
    if today > date(today.year, 11, 30):
        years.add(today.year)
    else:
        years.add(today.year - 1)
    for row in conn.execute(
        "SELECT year FROM wrapped_jobs WHERE status = 'waiting_for_sync'"
    ):
        years.add(row["year"])

    last_sync = _parse_sync_stamp(get_meta(conn, "last_sync_at"))
    for year in sorted(years):
        if today <= date(year, 11, 30):
            continue
        job = conn.execute(
            "SELECT status FROM wrapped_jobs WHERE year = ?", (year,)
        ).fetchone()
        if job and job["status"] == "generated":
            continue
        # A playlist already built before this gate existed stays as-is.
        if not job and conn.execute(
            "SELECT 1 FROM playlists WHERE name = ?", (f"Your {year} Playback",)
        ).fetchone():
            _mark_wrapped(conn, year, "generated")
            continue
        gate = datetime(year, 11, 20)
        if last_sync is None or last_sync < gate:
            _mark_wrapped(conn, year, "waiting_for_sync")
            continue
        created = generate_wrapped_playlist(conn, year)
        if created is None:
            _mark_wrapped(conn, year, "generated")


def wrapped_status(conn: sqlite3.Connection, now: datetime | None = None) -> dict:
    today = (now or datetime.now()).date()
    waiting = conn.execute(
        "SELECT year FROM wrapped_jobs WHERE status = 'waiting_for_sync' ORDER BY year DESC LIMIT 1"
    ).fetchone()
    if waiting:
        year = int(waiting["year"])
        status = "waiting_for_sync"
        should_notify = True
        message = f"Sync now to generate your {year} Wrapped playlist."
    else:
        year = today.year
        job = conn.execute(
            "SELECT status FROM wrapped_jobs WHERE year = ?", (year,)
        ).fetchone()
        status = job["status"] if job else "pending"
        should_notify = (
            date(year, 11, 20) <= today <= date(year, 11, 30) and status != "generated"
        )
        message = (
            "Sync your listening data before Nov 30 so this year's Wrapped playlist can be generated."
            if should_notify else None
        )
    return {
        "year": year,
        "deadline": f"{year}-11-30",
        "notify_from": f"{year}-11-20",
        "last_sync_at": get_meta(conn, "last_sync_at"),
        "status": status,
        "should_notify": should_notify,
        "message": message,
    }
