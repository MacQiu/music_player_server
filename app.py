"""Flask music server.

Local-first REST API backing a personal music app (iOS + web). Exposes
endpoints for uploading/downloading songs, cover images, playlists, artist
images, streaming metadata, recording play logs (offline-safe via idempotent
UUIDs), and returning aggregate analytics.

Run with:
    python app.py
Listens on http://0.0.0.0:5000
"""

from __future__ import annotations

import logging
import os
import random
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from werkzeug.utils import secure_filename

import db
import utils


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SONGS_DIR = os.path.join(BASE_DIR, "storage", "songs")
LYRICS_DIR = os.path.join(BASE_DIR, "storage", "lyrics")
COVERS_DIR = os.path.join(BASE_DIR, "storage", "covers")
ARTISTS_DIR = os.path.join(BASE_DIR, "storage", "artists")

MAX_CONTENT_LENGTH = 100 * 1024 * 1024

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def _allowed_image(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


def _save_cover(file_storage, song_id: str) -> str | None:
    """Save an uploaded cover image and return its relative path."""
    if not file_storage or not file_storage.filename:
        return None
    if not _allowed_image(file_storage.filename):
        return None
    ext = os.path.splitext(file_storage.filename)[1].lower()
    fname = f"{song_id}{ext}"
    abs_path = os.path.join(COVERS_DIR, fname)
    file_storage.save(abs_path)
    return os.path.relpath(abs_path, BASE_DIR).replace("\\", "/")


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
    CORS(app)

    for d in (SONGS_DIR, LYRICS_DIR, COVERS_DIR, ARTISTS_DIR):
        os.makedirs(d, exist_ok=True)
    db.init_db()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    # ----- Request logging ------------------------------------------------

    @app.before_request
    def _start_timer() -> None:
        g._start = time.perf_counter()

    @app.after_request
    def _log_request(response):
        elapsed_ms = (time.perf_counter() - getattr(g, "_start", time.perf_counter())) * 1000
        app.logger.info(
            "%s %s -> %s (%.1f ms)",
            request.method,
            request.path,
            response.status_code,
            elapsed_ms,
        )
        return response

    # ----- Error handlers -------------------------------------------------

    @app.errorhandler(HTTPException)
    def _http_err(e: HTTPException):
        return jsonify({"error": e.description, "code": e.code}), e.code

    @app.errorhandler(Exception)
    def _any_err(e: Exception):
        app.logger.exception("Unhandled error: %s", e)
        return jsonify({"error": "internal server error"}), 500

    # =====================================================================
    #  Core routes
    # =====================================================================

    @app.get("/ping")
    def ping():
        return jsonify({"status": "ok", "time": datetime.now(timezone.utc).isoformat()})

    @app.get("/songs")
    def list_songs():
        with db.get_conn() as conn:
            rows = conn.execute(
                "SELECT id, title, artist, album, duration, file_path, cover_path, sort_order, date_added "
                "FROM songs ORDER BY sort_order ASC, date_added DESC"
            ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["cover_url"] = f"/covers/{d['id']}" if d.get("cover_path") else None
            result.append(d)
        return jsonify(result)

    @app.put("/songs/order")
    def reorder_songs():
        body = request.get_json(silent=True) or {}
        song_ids = body.get("song_ids")
        if not isinstance(song_ids, list):
            return jsonify({"error": "song_ids must be a list"}), 400
        with db.get_conn() as conn:
            for pos, sid in enumerate(song_ids):
                conn.execute(
                    "UPDATE songs SET sort_order = ? WHERE id = ?", (pos, sid)
                )
        return jsonify({"ok": True})

    @app.post("/upload")
    def upload():
        if "file" not in request.files:
            return jsonify({"error": "missing 'file' form field"}), 400
        f = request.files["file"]
        if not f.filename:
            return jsonify({"error": "empty filename"}), 400
        if not utils.allowed_file(f.filename):
            return jsonify({"error": "only .mp3 and .wav are allowed"}), 400

        song_id = utils.new_id()
        stored_name = utils.safe_storage_name(f.filename, song_id)
        abs_path = os.path.join(SONGS_DIR, stored_name)
        f.save(abs_path)

        form_title = (request.form.get("title") or "").strip() or None
        form_artist = (request.form.get("artist") or "").strip() or None
        form_album = (request.form.get("album") or "").strip() or None
        form_duration = request.form.get("duration")
        try:
            form_duration_val = float(form_duration) if form_duration else None
        except ValueError:
            form_duration_val = None

        mt_title, mt_artist, mt_album, mt_duration = utils.extract_metadata(abs_path)

        title = form_title or mt_title or os.path.splitext(os.path.basename(f.filename))[0]
        artist = form_artist or mt_artist
        album = form_album or mt_album
        duration = form_duration_val if form_duration_val is not None else mt_duration

        cover_path = _save_cover(request.files.get("cover"), song_id)

        rel_path = os.path.relpath(abs_path, BASE_DIR).replace("\\", "/")

        with db.get_conn() as conn:
            conn.execute(
                "INSERT INTO songs (id, title, artist, album, duration, file_path, cover_path) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (song_id, title, artist, album, duration, rel_path, cover_path),
            )
            conn.execute(
                "INSERT OR IGNORE INTO analytics (song_id) VALUES (?)",
                (song_id,),
            )
            if artist:
                conn.execute(
                    "INSERT OR IGNORE INTO artists (name) VALUES (?)",
                    (artist,),
                )

        return (
            jsonify(
                {
                    "id": song_id,
                    "title": title,
                    "artist": artist,
                    "album": album,
                    "duration": duration,
                    "file_path": rel_path,
                    "cover_path": cover_path,
                    "cover_url": f"/covers/{song_id}" if cover_path else None,
                }
            ),
            201,
        )

    @app.get("/download/<song_id>")
    def download(song_id: str):
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT file_path FROM songs WHERE id = ?", (song_id,)
            ).fetchone()
        if not row:
            return jsonify({"error": "song not found"}), 404

        abs_path = os.path.join(BASE_DIR, row["file_path"])
        if not os.path.isfile(abs_path):
            return jsonify({"error": "file missing on disk"}), 404

        directory, filename = os.path.split(abs_path)
        return send_from_directory(directory, filename, as_attachment=False)

    # =====================================================================
    #  Cover images
    # =====================================================================

    @app.get("/covers/<song_id>")
    def get_cover(song_id: str):
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT cover_path FROM songs WHERE id = ?", (song_id,)
            ).fetchone()
        if not row or not row["cover_path"]:
            return jsonify({"error": "cover not found"}), 404
        abs_path = os.path.join(BASE_DIR, row["cover_path"])
        if not os.path.isfile(abs_path):
            return jsonify({"error": "cover file missing"}), 404
        directory, filename = os.path.split(abs_path)
        return send_from_directory(directory, filename)

    @app.post("/songs/<song_id>/cover")
    def upload_cover(song_id: str):
        with db.get_conn() as conn:
            row = conn.execute("SELECT id FROM songs WHERE id = ?", (song_id,)).fetchone()
        if not row:
            return jsonify({"error": "song not found"}), 404
        if "cover" not in request.files:
            return jsonify({"error": "missing 'cover' file field"}), 400
        cover_path = _save_cover(request.files["cover"], song_id)
        if not cover_path:
            return jsonify({"error": "invalid image file"}), 400
        with db.get_conn() as conn:
            conn.execute("UPDATE songs SET cover_path = ? WHERE id = ?", (cover_path, song_id))
        return jsonify({"ok": True, "cover_url": f"/covers/{song_id}"})

    # =====================================================================
    #  Artists
    # =====================================================================

    @app.get("/artists")
    def list_artists():
        with db.get_conn() as conn:
            rows = conn.execute(
                "SELECT a.name, a.image_path, a.created_at, "
                "COUNT(s.id) AS song_count "
                "FROM artists a LEFT JOIN songs s ON s.artist = a.name "
                "GROUP BY a.name ORDER BY a.name"
            ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["image_url"] = f"/artist-image/{d['name']}" if d.get("image_path") else None
            result.append(d)
        return jsonify(result)

    @app.post("/artists/<path:name>/image")
    def upload_artist_image(name: str):
        if "image" not in request.files:
            return jsonify({"error": "missing 'image' file field"}), 400
        img = request.files["image"]
        if not img.filename or not _allowed_image(img.filename):
            return jsonify({"error": "invalid image file"}), 400
        ext = os.path.splitext(img.filename)[1].lower()
        safe_name = secure_filename(name) or "artist"
        fname = f"{safe_name}{ext}"
        abs_path = os.path.join(ARTISTS_DIR, fname)
        img.save(abs_path)
        rel_path = os.path.relpath(abs_path, BASE_DIR).replace("\\", "/")
        with db.get_conn() as conn:
            conn.execute(
                "INSERT INTO artists (name, image_path) VALUES (?, ?) "
                "ON CONFLICT(name) DO UPDATE SET image_path = excluded.image_path",
                (name, rel_path),
            )
        return jsonify({"ok": True, "image_url": f"/artist-image/{name}"})

    @app.get("/artist-image/<path:name>")
    def get_artist_image(name: str):
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT image_path FROM artists WHERE name = ?", (name,)
            ).fetchone()
        if not row or not row["image_path"]:
            return jsonify({"error": "artist image not found"}), 404
        abs_path = os.path.join(BASE_DIR, row["image_path"])
        if not os.path.isfile(abs_path):
            return jsonify({"error": "image file missing"}), 404
        directory, filename = os.path.split(abs_path)
        return send_from_directory(directory, filename)

    # =====================================================================
    #  Playlists
    # =====================================================================

    @app.get("/playlists")
    def list_playlists():
        with db.get_conn() as conn:
            rows = conn.execute(
                "SELECT p.id, p.name, p.created_at, "
                "COUNT(ps.song_id) AS song_count "
                "FROM playlists p LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id "
                "GROUP BY p.id ORDER BY p.created_at DESC"
            ).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                first = conn.execute(
                    "SELECT s.id, s.cover_path FROM playlist_songs ps "
                    "JOIN songs s ON s.id = ps.song_id "
                    "WHERE ps.playlist_id = ? ORDER BY ps.position LIMIT 1",
                    (d["id"],),
                ).fetchone()
                d["cover_url"] = f"/covers/{first['id']}" if first and first["cover_path"] else None
                result.append(d)
        return jsonify(result)

    @app.post("/playlists")
    def create_playlist():
        body = request.get_json(silent=True) or {}
        name = (body.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name is required"}), 400
        pid = utils.new_id()
        with db.get_conn() as conn:
            conn.execute("INSERT INTO playlists (id, name) VALUES (?, ?)", (pid, name))
        return jsonify({"id": pid, "name": name}), 201

    @app.get("/playlists/<playlist_id>")
    def get_playlist(playlist_id: str):
        with db.get_conn() as conn:
            pl = conn.execute(
                "SELECT id, name, created_at FROM playlists WHERE id = ?", (playlist_id,)
            ).fetchone()
            if not pl:
                return jsonify({"error": "playlist not found"}), 404

            m = re.match(r"^Your (\d{4}) Playback$", pl["name"])
            is_wrapped = bool(m)

            if is_wrapped:
                year = int(m.group(1))
                start_date = f"{year - 1}-12-01"
                end_date = f"{year}-11-30"
                songs = conn.execute(
                    "SELECT s.id, s.title, s.artist, s.album, s.duration, "
                    "s.cover_path, ps.position, "
                    "COUNT(p.id) AS play_count, "
                    "COALESCE(SUM(p.duration), 0) AS total_time "
                    "FROM playlist_songs ps JOIN songs s ON s.id = ps.song_id "
                    "LEFT JOIN playlogs p ON p.song_id = s.id "
                    "AND DATE(p.timestamp) >= ? AND DATE(p.timestamp) <= ? "
                    "WHERE ps.playlist_id = ? "
                    "GROUP BY s.id ORDER BY ps.position",
                    (start_date, end_date, playlist_id),
                ).fetchall()
            else:
                songs = conn.execute(
                    "SELECT s.id, s.title, s.artist, s.album, s.duration, "
                    "s.cover_path, s.date_added, ps.position "
                    "FROM playlist_songs ps JOIN songs s ON s.id = ps.song_id "
                    "WHERE ps.playlist_id = ? ORDER BY ps.position",
                    (playlist_id,),
                ).fetchall()

        song_list = []
        for s in songs:
            d = dict(s)
            d["cover_url"] = f"/covers/{d['id']}" if d.get("cover_path") else None
            song_list.append(d)
        return jsonify({
            "id": pl["id"], "name": pl["name"], "created_at": pl["created_at"],
            "is_wrapped": is_wrapped, "songs": song_list,
        })

    @app.put("/playlists/<playlist_id>")
    def update_playlist(playlist_id: str):
        body = request.get_json(silent=True) or {}
        name = (body.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name is required"}), 400
        with db.get_conn() as conn:
            cur = conn.execute("UPDATE playlists SET name = ? WHERE id = ?", (name, playlist_id))
            if cur.rowcount == 0:
                return jsonify({"error": "playlist not found"}), 404
        return jsonify({"ok": True})

    @app.delete("/playlists/<playlist_id>")
    def delete_playlist(playlist_id: str):
        with db.get_conn() as conn:
            cur = conn.execute("DELETE FROM playlists WHERE id = ?", (playlist_id,))
            if cur.rowcount == 0:
                return jsonify({"error": "playlist not found"}), 404
        return jsonify({"ok": True})

    @app.post("/playlists/<playlist_id>/songs")
    def add_song_to_playlist(playlist_id: str):
        body = request.get_json(silent=True) or {}
        song_id = body.get("song_id")
        if not song_id:
            return jsonify({"error": "song_id is required"}), 400
        with db.get_conn() as conn:
            if not conn.execute("SELECT 1 FROM playlists WHERE id = ?", (playlist_id,)).fetchone():
                return jsonify({"error": "playlist not found"}), 404
            if not conn.execute("SELECT 1 FROM songs WHERE id = ?", (song_id,)).fetchone():
                return jsonify({"error": "song not found"}), 404
            max_pos = conn.execute(
                "SELECT COALESCE(MAX(position), -1) FROM playlist_songs WHERE playlist_id = ?",
                (playlist_id,),
            ).fetchone()[0]
            conn.execute(
                "INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)",
                (playlist_id, song_id, max_pos + 1),
            )
        return jsonify({"ok": True}), 201

    @app.delete("/playlists/<playlist_id>/songs/<song_id>")
    def remove_song_from_playlist(playlist_id: str, song_id: str):
        with db.get_conn() as conn:
            cur = conn.execute(
                "DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?",
                (playlist_id, song_id),
            )
            if cur.rowcount == 0:
                return jsonify({"error": "not found"}), 404
        return jsonify({"ok": True})

    @app.put("/playlists/<playlist_id>/songs")
    def reorder_playlist_songs(playlist_id: str):
        body = request.get_json(silent=True) or {}
        song_ids = body.get("song_ids")
        if not isinstance(song_ids, list):
            return jsonify({"error": "song_ids must be a list"}), 400
        with db.get_conn() as conn:
            for pos, sid in enumerate(song_ids):
                conn.execute(
                    "UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND song_id = ?",
                    (pos, playlist_id, sid),
                )
        return jsonify({"ok": True})

    # =====================================================================
    #  Play logs & sync
    # =====================================================================

    def _parse_log_entry(raw: Dict[str, Any]) -> Dict[str, Any]:
        song_id = raw.get("song_id")
        if not song_id or not isinstance(song_id, str):
            raise ValueError("song_id is required")
        try:
            duration = float(raw.get("duration", 0))
        except (TypeError, ValueError):
            raise ValueError("duration must be a number")
        if duration < 0:
            raise ValueError("duration must be non-negative")

        timestamp = raw.get("timestamp")
        if not timestamp:
            timestamp = datetime.now(timezone.utc).isoformat()
        log_id = raw.get("id") or utils.new_id()
        return {
            "id": log_id,
            "song_id": song_id,
            "duration": duration,
            "timestamp": timestamp,
        }

    @app.post("/playlog")
    def playlog():
        body = request.get_json(silent=True) or {}
        try:
            entry = _parse_log_entry(body)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        with db.get_conn() as conn:
            exists = conn.execute(
                "SELECT 1 FROM songs WHERE id = ?", (entry["song_id"],)
            ).fetchone()
            if not exists:
                return jsonify({"error": "song not found"}), 404

            inserted = db.insert_playlog_and_update_analytics(
                conn, entry["id"], entry["song_id"], entry["duration"], entry["timestamp"]
            )

        return jsonify({"ok": True, "id": entry["id"], "inserted": inserted})

    @app.post("/sync")
    def sync():
        body = request.get_json(silent=True) or {}
        logs = body.get("logs")
        if not isinstance(logs, list):
            return jsonify({"error": "'logs' must be a list"}), 400

        inserted = 0
        skipped = 0
        errors = []

        with db.get_conn() as conn:
            known_ids = {
                r["id"] for r in conn.execute("SELECT id FROM songs").fetchall()
            }
            for idx, raw in enumerate(logs):
                try:
                    entry = _parse_log_entry(raw)
                except ValueError as e:
                    errors.append({"index": idx, "error": str(e)})
                    continue

                if entry["song_id"] not in known_ids:
                    errors.append({"index": idx, "error": "unknown song_id"})
                    continue

                was_new = db.insert_playlog_and_update_analytics(
                    conn,
                    entry["id"],
                    entry["song_id"],
                    entry["duration"],
                    entry["timestamp"],
                )
                if was_new:
                    inserted += 1
                else:
                    skipped += 1

        return jsonify({"inserted": inserted, "skipped": skipped, "errors": errors})

    # =====================================================================
    #  Analytics
    # =====================================================================

    @app.get("/analytics")
    def analytics():
        with db.get_conn() as conn:
            top_songs = conn.execute(
                """
                SELECT s.id, s.title, s.artist, s.album, s.cover_path,
                       a.play_count, a.total_time, a.last_played
                FROM analytics a
                JOIN songs s ON s.id = a.song_id
                WHERE a.play_count > 0
                ORDER BY a.play_count DESC, a.total_time DESC
                LIMIT 10
                """
            ).fetchall()

            top_artists = conn.execute(
                """
                SELECT s.artist AS artist,
                       SUM(a.play_count) AS play_count,
                       SUM(a.total_time) AS total_time
                FROM analytics a
                JOIN songs s ON s.id = a.song_id
                WHERE s.artist IS NOT NULL AND s.artist <> ''
                GROUP BY s.artist
                ORDER BY play_count DESC
                LIMIT 10
                """
            ).fetchall()

            totals = conn.execute(
                "SELECT COALESCE(SUM(total_time), 0) AS total_listening_time, "
                "COALESCE(SUM(play_count), 0) AS total_plays FROM analytics"
            ).fetchone()

            rec_candidates = conn.execute(
                """
                SELECT s.id, s.title, s.artist, s.cover_path, a.play_count, a.last_played
                FROM analytics a
                JOIN songs s ON s.id = a.song_id
                WHERE a.play_count > 0
                ORDER BY a.play_count DESC
                LIMIT 15
                """
            ).fetchall()
            recommendations = random.sample(rec_candidates, min(5, len(rec_candidates)))

            play_history = conn.execute(
                """
                SELECT DATE(timestamp) AS date, COUNT(*) AS plays,
                       SUM(duration) AS total_time
                FROM playlogs
                WHERE timestamp >= DATE('now', '-30 days')
                GROUP BY DATE(timestamp)
                ORDER BY date
                """
            ).fetchall()

        top_songs_list = []
        for r in top_songs:
            d = dict(r)
            d["cover_url"] = f"/covers/{d['id']}" if d.get("cover_path") else None
            top_songs_list.append(d)

        recs_list = []
        for r in recommendations:
            d = dict(r)
            d["cover_url"] = f"/covers/{d['id']}" if d.get("cover_path") else None
            recs_list.append(d)

        return jsonify(
            {
                "top_songs": top_songs_list,
                "top_artists": [dict(r) for r in top_artists],
                "total_listening_time": totals["total_listening_time"],
                "total_plays": totals["total_plays"],
                "recommendations": recs_list,
                "play_history": [dict(r) for r in play_history],
            }
        )

    # =====================================================================
    #  Wrapped / Yearly Analytics
    # =====================================================================

    @app.get("/analytics/wrapped")
    def analytics_wrapped():
        year_str = request.args.get("year")
        try:
            year = int(year_str)
        except (TypeError, ValueError):
            year = datetime.now().year

        start_date = f"{year - 1}-12-01"
        end_date = f"{year}-11-30"

        with db.get_conn() as conn:
            top_songs = conn.execute(
                """
                SELECT s.id, s.title, s.artist, s.cover_path,
                       COUNT(*) AS play_count, SUM(p.duration) AS total_time
                FROM playlogs p JOIN songs s ON s.id = p.song_id
                WHERE DATE(p.timestamp) >= ? AND DATE(p.timestamp) <= ?
                GROUP BY s.id
                ORDER BY play_count DESC
                LIMIT 10
                """,
                (start_date, end_date),
            ).fetchall()

            top_artists = conn.execute(
                """
                SELECT s.artist,
                       COUNT(*) AS play_count, SUM(p.duration) AS total_time
                FROM playlogs p JOIN songs s ON s.id = p.song_id
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

        songs_list = []
        for r in top_songs:
            d = dict(r)
            d["cover_url"] = f"/covers/{d['id']}" if d.get("cover_path") else None
            songs_list.append(d)

        return jsonify(
            {
                "year": year,
                "top_songs": songs_list,
                "top_artists": [dict(r) for r in top_artists],
                "total_plays": totals["total_plays"],
                "total_listening_time": totals["total_listening_time"],
            }
        )

    # =====================================================================
    #  Song deletion
    # =====================================================================

    @app.delete("/songs/<song_id>")
    def delete_song(song_id: str):
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT file_path, cover_path FROM songs WHERE id = ?", (song_id,)
            ).fetchone()
            if not row:
                return jsonify({"error": "song not found"}), 404

            conn.execute("DELETE FROM playlogs WHERE song_id = ?", (song_id,))
            conn.execute("DELETE FROM playlist_songs WHERE song_id = ?", (song_id,))
            conn.execute("DELETE FROM songs WHERE id = ?", (song_id,))

        for rel in (row["file_path"], row["cover_path"]):
            if not rel:
                continue
            abs_path = os.path.join(BASE_DIR, rel)
            try:
                if os.path.isfile(abs_path):
                    os.remove(abs_path)
            except OSError as e:
                app.logger.warning("Could not delete file %s: %s", abs_path, e)

        return jsonify({"ok": True, "id": song_id})

    # =====================================================================
    #  Lyrics
    # =====================================================================

    @app.get("/lyrics/<song_id>")
    def lyrics(song_id: str):
        path = os.path.join(LYRICS_DIR, f"{song_id}.lrc")
        if not os.path.isfile(path):
            return jsonify({"error": "lyrics not found"}), 404
        with open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
        return jsonify({"song_id": song_id, "lyrics": text})

    @app.post("/lyrics/<song_id>")
    def save_lyrics(song_id: str):
        data = request.get_json(silent=True) or {}
        lrc_text = data.get("lyrics", "")
        path = os.path.join(LYRICS_DIR, f"{song_id}.lrc")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(lrc_text)
        return jsonify({"ok": True})

    # =====================================================================
    #  Wrapped playlist generation
    # =====================================================================

    @app.post("/wrapped/<int:year>/playlist")
    def create_wrapped_playlist(year: int):
        start_date = f"{year - 1}-12-01"
        end_date = f"{year}-11-30"

        with db.get_conn() as conn:
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

            if not top_songs:
                return jsonify({"error": "no play data for this year"}), 400

            playlist_name = f"Your {year} Playback"
            existing = conn.execute(
                "SELECT id FROM playlists WHERE name = ?", (playlist_name,)
            ).fetchone()

            if existing:
                pid = existing["id"]
                conn.execute(
                    "DELETE FROM playlist_songs WHERE playlist_id = ?", (pid,)
                )
            else:
                pid = utils.new_id()
                conn.execute(
                    "INSERT INTO playlists (id, name) VALUES (?, ?)",
                    (pid, playlist_name),
                )

            for pos, row in enumerate(top_songs):
                conn.execute(
                    "INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)",
                    (pid, row["id"], pos),
                )

        return jsonify({"ok": True, "playlist_id": pid, "name": playlist_name, "song_count": len(top_songs)})

    # =====================================================================
    #  Dev / testing tools
    # =====================================================================

    @app.post("/dev/generate-playlogs")
    def dev_generate_playlogs():
        body = request.get_json(silent=True) or {}
        try:
            year = int(body.get("year", datetime.now().year))
        except (TypeError, ValueError):
            year = datetime.now().year
        count = min(int(body.get("count", 200)), 5000)

        start_dt = datetime(year - 1, 12, 1)
        end_dt = datetime(year, 11, 30, 23, 59, 59)
        span_seconds = int((end_dt - start_dt).total_seconds())

        with db.get_conn() as conn:
            song_ids = [
                r["id"] for r in conn.execute("SELECT id FROM songs").fetchall()
            ]
            if not song_ids:
                return jsonify({"error": "no songs in library"}), 400

            inserted = 0
            for _ in range(count):
                sid = random.choice(song_ids)
                dur = random.uniform(30, 240)
                offset = random.randint(0, span_seconds)
                ts = (start_dt + timedelta(seconds=offset)).isoformat()
                log_id = utils.new_id()
                was_new = db.insert_playlog_and_update_analytics(
                    conn, log_id, sid, dur, ts
                )
                if was_new:
                    inserted += 1

        return jsonify({"ok": True, "inserted": inserted, "year": year})

    @app.delete("/dev/playlogs")
    def dev_delete_playlogs():
        body = request.get_json(silent=True) or {}
        try:
            year = int(body.get("year", datetime.now().year))
        except (TypeError, ValueError):
            year = datetime.now().year

        start_date = f"{year - 1}-12-01"
        end_date = f"{year}-11-30"

        with db.get_conn() as conn:
            result = conn.execute(
                "DELETE FROM playlogs WHERE DATE(timestamp) >= ? AND DATE(timestamp) <= ?",
                (start_date, end_date),
            )
            deleted = result.rowcount

            conn.execute(
                """
                UPDATE analytics SET
                    play_count = (SELECT COUNT(*) FROM playlogs WHERE playlogs.song_id = analytics.song_id),
                    total_time = (SELECT COALESCE(SUM(duration), 0) FROM playlogs WHERE playlogs.song_id = analytics.song_id),
                    last_played = (SELECT MAX(timestamp) FROM playlogs WHERE playlogs.song_id = analytics.song_id)
                """
            )

        return jsonify({"ok": True, "deleted": deleted, "year": year})

    @app.post("/dev/playback-playlist")
    def dev_create_playback_playlist():
        body = request.get_json(silent=True) or {}
        try:
            year = int(body.get("year"))
        except (TypeError, ValueError):
            return jsonify({"error": "year is required"}), 400
        song_ids = body.get("song_ids")
        if not isinstance(song_ids, list) or len(song_ids) == 0:
            return jsonify({"error": "song_ids must be a non-empty list"}), 400

        playlist_name = f"Your {year} Playback"
        with db.get_conn() as conn:
            existing = conn.execute(
                "SELECT id FROM playlists WHERE name = ?", (playlist_name,)
            ).fetchone()
            if existing:
                pid = existing["id"]
                conn.execute(
                    "DELETE FROM playlist_songs WHERE playlist_id = ?", (pid,)
                )
            else:
                pid = utils.new_id()
                conn.execute(
                    "INSERT INTO playlists (id, name) VALUES (?, ?)",
                    (pid, playlist_name),
                )
            for pos, sid in enumerate(song_ids):
                conn.execute(
                    "INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)",
                    (pid, sid, pos),
                )
        return jsonify({"ok": True, "playlist_id": pid, "name": playlist_name, "song_count": len(song_ids)})

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
