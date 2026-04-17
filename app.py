"""Flask music server.

Local-first REST API backing a personal iOS music app. Exposes endpoints for
uploading/downloading songs, streaming basic metadata, recording play logs
(offline-safe via idempotent UUIDs), and returning aggregate analytics.

Run with:
    python app.py
Listens on http://0.0.0.0:5000
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict

from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

import db
import utils


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SONGS_DIR = os.path.join(BASE_DIR, "storage", "songs")
LYRICS_DIR = os.path.join(BASE_DIR, "storage", "lyrics")

# 100 MB upload cap is plenty for personal music files.
MAX_CONTENT_LENGTH = 100 * 1024 * 1024


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
    CORS(app)  # allow any origin on the local network

    # Ensure filesystem layout exists before serving.
    os.makedirs(SONGS_DIR, exist_ok=True)
    os.makedirs(LYRICS_DIR, exist_ok=True)
    db.init_db()

    # Basic stdout logging.
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

    # ----- Routes ---------------------------------------------------------

    @app.get("/ping")
    def ping():
        return jsonify({"status": "ok", "time": datetime.now(timezone.utc).isoformat()})

    @app.get("/songs")
    def list_songs():
        with db.get_conn() as conn:
            rows = conn.execute(
                "SELECT id, title, artist, album, duration, file_path, date_added "
                "FROM songs ORDER BY date_added DESC"
            ).fetchall()
        return jsonify([dict(r) for r in rows])

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

        # Pull any user-supplied fields from the multipart form.
        form_title = (request.form.get("title") or "").strip() or None
        form_artist = (request.form.get("artist") or "").strip() or None
        form_album = (request.form.get("album") or "").strip() or None
        form_duration = request.form.get("duration")
        try:
            form_duration_val = float(form_duration) if form_duration else None
        except ValueError:
            form_duration_val = None

        # Best-effort metadata extraction fills in missing fields.
        mt_title, mt_artist, mt_album, mt_duration = utils.extract_metadata(abs_path)

        title = form_title or mt_title or os.path.splitext(os.path.basename(f.filename))[0]
        artist = form_artist or mt_artist
        album = form_album or mt_album
        duration = form_duration_val if form_duration_val is not None else mt_duration

        # DB stores a relative path so the library stays portable.
        rel_path = os.path.relpath(abs_path, BASE_DIR).replace("\\", "/")

        with db.get_conn() as conn:
            conn.execute(
                "INSERT INTO songs (id, title, artist, album, duration, file_path) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (song_id, title, artist, album, duration, rel_path),
            )
            # Pre-create an analytics row so joins always succeed.
            conn.execute(
                "INSERT OR IGNORE INTO analytics (song_id) VALUES (?)",
                (song_id,),
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

    def _parse_log_entry(raw: Dict[str, Any]) -> Dict[str, Any]:
        """Validate/normalize a single playlog dict, or raise ValueError."""
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
        # Client may pass its own UUID for idempotency; if not, server makes one.
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
            # Reject unknown songs so analytics stay consistent.
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
            # Cache known song IDs to avoid N queries for big batches.
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

    @app.get("/analytics")
    def analytics():
        with db.get_conn() as conn:
            top_songs = conn.execute(
                """
                SELECT s.id, s.title, s.artist, s.album,
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

            # Very simple recommendation: top songs the user hasn't played
            # in a while, weighted by play count (nice-to-have).
            recommendations = conn.execute(
                """
                SELECT s.id, s.title, s.artist, a.play_count, a.last_played
                FROM analytics a
                JOIN songs s ON s.id = a.song_id
                WHERE a.play_count > 0
                ORDER BY a.play_count DESC,
                         COALESCE(a.last_played, '1970-01-01') ASC
                LIMIT 5
                """
            ).fetchall()

        return jsonify(
            {
                "top_songs": [dict(r) for r in top_songs],
                "top_artists": [dict(r) for r in top_artists],
                "total_listening_time": totals["total_listening_time"],
                "total_plays": totals["total_plays"],
                "recommendations": [dict(r) for r in recommendations],
            }
        )

    @app.delete("/songs/<song_id>")
    def delete_song(song_id: str):
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT file_path FROM songs WHERE id = ?", (song_id,)
            ).fetchone()
            if not row:
                return jsonify({"error": "song not found"}), 404

            # FK ON DELETE CASCADE handles analytics; playlogs are kept for
            # historical sync safety but we clear them too to match brief.
            conn.execute("DELETE FROM playlogs WHERE song_id = ?", (song_id,))
            conn.execute("DELETE FROM songs WHERE id = ?", (song_id,))

        # Remove file after the DB row is gone; tolerate missing file.
        abs_path = os.path.join(BASE_DIR, row["file_path"])
        try:
            if os.path.isfile(abs_path):
                os.remove(abs_path)
        except OSError as e:
            app.logger.warning("Could not delete file %s: %s", abs_path, e)

        return jsonify({"ok": True, "id": song_id})

    @app.get("/lyrics/<song_id>")
    def lyrics(song_id: str):
        # Lyrics are stored as ``storage/lyrics/<song_id>.lrc``.
        path = os.path.join(LYRICS_DIR, f"{song_id}.lrc")
        if not os.path.isfile(path):
            return jsonify({"error": "lyrics not found"}), 404
        with open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
        return jsonify({"song_id": song_id, "lyrics": text})

    return app


app = create_app()


if __name__ == "__main__":
    # debug=False keeps the analytics DB clean and avoids double-init on reload.
    app.run(host="0.0.0.0", port=5000, debug=False)
