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

import hashlib
import io
import json
import logging
import os
import random
import re
import sqlite3
import time
import zipfile
from urllib.parse import quote as url_quote
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from flask import Flask, g, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from werkzeug.utils import secure_filename

import db
import utils
import shutil


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SONGS_DIR = os.path.join(BASE_DIR, "storage", "songs")
LYRICS_DIR = os.path.join(BASE_DIR, "storage", "lyrics")
COVERS_DIR = os.path.join(BASE_DIR, "storage", "covers")
ARTISTS_DIR = os.path.join(BASE_DIR, "storage", "artists")

MAX_CONTENT_LENGTH = 4 * 1024 * 1024 * 1024
AUDIO_UPLOAD_LIMIT = 100 * 1024 * 1024

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def _safe_lyrics_name(text: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', "_", text).strip().rstrip(".") or "unknown"


def _lyrics_folder(song_id: str, title: str, artist: str | None) -> str:
    base = f"{title} - {artist}" if artist else (title or song_id)
    return os.path.join(LYRICS_DIR, _safe_lyrics_name(base) or song_id)


def _lyrics_filename(label: str) -> str:
    return f"Lyrics - {_safe_lyrics_name(label) or 'default'}.lrc"


def _colors_filename(label: str) -> str:
    return f"Lyrics - {_safe_lyrics_name(label) or 'default'}.colors.json"


def _lrc_has_text(path: str) -> bool:
    if not os.path.isfile(path):
        return False
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return bool(fh.read().strip())
    except OSError:
        return False


def purge_empty_lyric_sets(conn, song_id: str | None = None) -> None:
    """Drop lyric-set rows whose file is missing or blank. Recycle leftover files."""
    sql = (
        "SELECT ls.id, ls.song_id, ls.label, s.title, s.artist "
        "FROM lyric_sets ls JOIN songs s ON s.id = ls.song_id"
    )
    params: tuple = ()
    if song_id:
        sql += " WHERE ls.song_id = ?"
        params = (song_id,)
    rows = list(conn.execute(sql, params))
    folders: dict[str, str] = {}
    for row in rows:
        folder = _lyrics_folder(row["song_id"], row["title"], row["artist"])
        folders[row["song_id"]] = folder
        path = os.path.join(folder, _lyrics_filename(row["label"]))
        if _lrc_has_text(path):
            continue
        for extra in (path, os.path.join(folder, _colors_filename(row["label"]))):
            if os.path.isfile(extra):
                try:
                    utils.recycle_path(extra)
                except OSError as e:
                    logging.getLogger("music_server").warning(
                        "Could not recycle %s: %s", extra, e
                    )
        conn.execute("DELETE FROM lyric_sets WHERE id = ?", (row["id"],))
    for sid, folder in folders.items():
        still = conn.execute(
            "SELECT 1 FROM lyric_sets WHERE song_id = ? LIMIT 1", (sid,)
        ).fetchone()
        if still or not os.path.isdir(folder):
            continue
        try:
            utils.recycle_path(folder)
        except OSError as e:
            logging.getLogger("music_server").warning(
                "Could not recycle lyrics dir %s: %s", folder, e
            )


def _allowed_image(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


def _save_cover(file_storage, song_id: str = "") -> str | None:
    """Save an uploaded cover image using content-hash naming for dedup."""
    if not file_storage or not file_storage.filename:
        return None
    if not _allowed_image(file_storage.filename):
        return None
    ext = os.path.splitext(file_storage.filename)[1].lower()
    data = file_storage.read()
    digest = hashlib.sha256(data).hexdigest()
    fname = f"{digest}{ext}"
    abs_path = os.path.join(COVERS_DIR, fname)
    if not os.path.isfile(abs_path):
        with open(abs_path, "wb") as out:
            out.write(data)
    return os.path.relpath(abs_path, BASE_DIR).replace("\\", "/")


def _backfill_missing_durations(conn) -> None:
    """Fill durations that were never stored, using the audio file on disk."""
    rows = conn.execute(
        "SELECT id, file_path FROM songs "
        "WHERE duration IS NULL AND IFNULL(file_path, '') != '' AND IFNULL(is_blank, 0) = 0"
    ).fetchall()
    for row in rows:
        abs_path = os.path.join(BASE_DIR, row["file_path"])
        if not os.path.isfile(abs_path):
            continue
        _, _, _, duration = utils.extract_metadata(abs_path)
        if duration:
            conn.execute(
                "UPDATE songs SET duration = ? WHERE id = ?",
                (duration, row["id"]),
            )


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
    CORS(
        app,
        expose_headers=["Content-Length", "Content-Range", "Accept-Ranges"],
        allow_private_network=True,
    )

    for d in (SONGS_DIR, LYRICS_DIR, COVERS_DIR, ARTISTS_DIR):
        os.makedirs(d, exist_ok=True)
    db.init_db()
    with db.get_conn() as conn:
        purge_empty_lyric_sets(conn)
        _backfill_missing_durations(conn)
        db.refresh_period_snapshots(conn)
        db.maybe_generate_wrapped(conn)

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
                "SELECT id, title, artist, album, duration, file_path, cover_path, sort_order, date_added, downloaded, is_blank "
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
        if request.content_length and request.content_length > AUDIO_UPLOAD_LIMIT:
            return jsonify({"error": "audio upload exceeds 100 MB"}), 413
        if "file" not in request.files:
            return jsonify({"error": "missing 'file' form field"}), 400
        f = request.files["file"]
        if not f.filename:
            return jsonify({"error": "empty filename"}), 400
        if not utils.allowed_file(f.filename):
            return jsonify({"error": "only .mp3 and .wav are allowed"}), 400

        song_id = utils.new_id()

        ext = os.path.splitext(f.filename)[1].lower()
        tmp_name = f"_tmp_{song_id}{ext}"
        tmp_path = os.path.join(SONGS_DIR, tmp_name)
        f.save(tmp_path)

        form_title = (request.form.get("title") or "").strip() or None
        form_artist = (request.form.get("artist") or "").strip() or None
        form_album = (request.form.get("album") or "").strip() or None
        form_duration = request.form.get("duration")
        try:
            form_duration_val = float(form_duration) if form_duration else None
        except ValueError:
            form_duration_val = None

        mt_title, mt_artist, mt_album, mt_duration = utils.extract_metadata(tmp_path)

        title = form_title or mt_title or os.path.splitext(os.path.basename(f.filename))[0]
        artist = form_artist or mt_artist
        album = form_album or mt_album
        duration = form_duration_val if form_duration_val is not None else mt_duration

        stored_name = utils.safe_storage_name(title, artist, ext, SONGS_DIR)
        abs_path = os.path.join(SONGS_DIR, stored_name)
        os.replace(tmp_path, abs_path)

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

    @app.post("/songs/blank")
    def create_blank_song():
        """Metadata-only song: cover and title, no audio file, cannot be played."""
        title = (request.form.get("title") or "").strip()
        if not title:
            return jsonify({"error": "title is required"}), 400
        artist = (request.form.get("artist") or "").strip() or None
        album = (request.form.get("album") or "").strip() or None
        song_id = utils.new_id()
        cover_path = _save_cover(request.files.get("cover"), song_id)

        with db.get_conn() as conn:
            conn.execute(
                "INSERT INTO songs (id, title, artist, album, duration, file_path, cover_path, is_blank) "
                "VALUES (?, ?, ?, ?, 0, '', ?, 1)",
                (song_id, title, artist, album, cover_path),
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

        return jsonify({
            "id": song_id,
            "title": title,
            "artist": artist,
            "album": album,
            "duration": 0,
            "file_path": "",
            "cover_path": cover_path,
            "cover_url": f"/covers/{song_id}" if cover_path else None,
            "is_blank": 1,
        }), 201

    @app.post("/songs/<song_id>/audio")
    def attach_audio(song_id: str):
        """Add the audio file to an existing placeholder and make it playable."""
        if request.content_length and request.content_length > AUDIO_UPLOAD_LIMIT:
            return jsonify({"error": "audio upload exceeds 100 MB"}), 413
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT id, title, artist, album, cover_path, is_blank, file_path "
                "FROM songs WHERE id = ?",
                (song_id,),
            ).fetchone()
        if not row:
            return jsonify({"error": "song not found"}), 404
        if not row["is_blank"] and row["file_path"]:
            return jsonify({"error": "song already has audio"}), 409
        if "file" not in request.files:
            return jsonify({"error": "missing 'file' form field"}), 400
        f = request.files["file"]
        if not f.filename:
            return jsonify({"error": "empty filename"}), 400
        if not utils.allowed_file(f.filename):
            return jsonify({"error": "only .mp3 and .wav are allowed"}), 400

        ext = os.path.splitext(f.filename)[1].lower()
        tmp_path = os.path.join(SONGS_DIR, f"_tmp_{song_id}{ext}")
        f.save(tmp_path)
        _, _, _, duration = utils.extract_metadata(tmp_path)
        stored_name = utils.safe_storage_name(row["title"] or "audio", row["artist"], ext, SONGS_DIR)
        abs_path = os.path.join(SONGS_DIR, stored_name)
        os.replace(tmp_path, abs_path)
        rel_path = os.path.relpath(abs_path, BASE_DIR).replace("\\", "/")

        with db.get_conn() as conn:
            conn.execute(
                "UPDATE songs SET file_path = ?, duration = ?, is_blank = 0 WHERE id = ?",
                (rel_path, duration or 0, song_id),
            )

        return jsonify({
            "id": song_id,
            "title": row["title"],
            "artist": row["artist"],
            "album": row["album"],
            "duration": duration or 0,
            "file_path": rel_path,
            "cover_path": row["cover_path"],
            "cover_url": f"/covers/{song_id}" if row["cover_path"] else None,
            "is_blank": 0,
        })

    @app.get("/download/<song_id>")
    def download(song_id: str):
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT file_path, is_blank FROM songs WHERE id = ?", (song_id,)
            ).fetchone()
        if not row:
            return jsonify({"error": "song not found"}), 404
        if row["is_blank"] or not row["file_path"]:
            return jsonify({"error": "blank songs have no audio"}), 409

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

    @app.delete("/covers/file/<filename>")
    def delete_cover_file(filename: str):
        cover_rel = f"storage/covers/{filename}"
        abs_path = os.path.join(BASE_DIR, cover_rel)
        if not os.path.isfile(abs_path):
            return jsonify({"error": "cover file not found"}), 404
        with db.get_conn() as conn:
            conn.execute(
                "UPDATE songs SET cover_path = NULL WHERE cover_path = ?",
                (cover_rel,),
            )
        try:
            utils.recycle_path(abs_path)
        except OSError as e:
            app.logger.warning("Could not recycle cover %s: %s", abs_path, e)
        return jsonify({"ok": True})

    # =====================================================================
    #  Artists
    # =====================================================================

    @app.get("/artists")
    def list_artists():
        with db.get_conn() as conn:
            rows = conn.execute(
                "SELECT a.name, a.image_path, a.image_position, "
                "a.image_position_mobile, a.created_at, "
                "COUNT(s.id) AS song_count "
                "FROM artists a LEFT JOIN songs s ON s.artist = a.name "
                "GROUP BY a.name ORDER BY a.name"
            ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["image_url"] = f"/artist-image/{url_quote(d['name'])}" if d.get("image_path") else None
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
        return jsonify({"ok": True, "image_url": f"/artist-image/{url_quote(name)}"})

    @app.put("/artists/<path:name>/position")
    def update_artist_position(name: str):
        data = request.get_json(force=True) or {}
        position = data.get("image_position")
        position_mobile = data.get("image_position_mobile")
        if not position and not position_mobile:
            return jsonify({"error": "provide image_position or image_position_mobile"}), 400
        with db.get_conn() as conn:
            if position:
                conn.execute(
                    "UPDATE artists SET image_position = ? WHERE name = ?",
                    (position, name),
                )
            if position_mobile:
                conn.execute(
                    "UPDATE artists SET image_position_mobile = ? WHERE name = ?",
                    (position_mobile, name),
                )
        return jsonify({"ok": True})

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
        if db.is_wrapped_playlist_name(name):
            return jsonify({"error": "wrapped playlists can only be generated on the server"}), 403
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
                    "SELECT s.id, s.title, s.artist, s.album, s.duration, s.is_blank, "
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
                    "SELECT s.id, s.title, s.artist, s.album, s.duration, s.is_blank, "
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
        if db.is_wrapped_playlist_name(name):
            return jsonify({"error": "wrapped playlists can only be generated on the server"}), 403
        with db.get_conn() as conn:
            row = conn.execute("SELECT name FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
            if not row:
                return jsonify({"error": "playlist not found"}), 404
            if db.is_wrapped_playlist_name(row["name"]):
                return jsonify({"error": "wrapped playlists are read-only"}), 403
            conn.execute("UPDATE playlists SET name = ? WHERE id = ?", (name, playlist_id))
        return jsonify({"ok": True})

    @app.delete("/playlists/<playlist_id>")
    def delete_playlist(playlist_id: str):
        with db.get_conn() as conn:
            row = conn.execute("SELECT name FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
            if not row:
                return jsonify({"error": "playlist not found"}), 404
            if db.is_wrapped_playlist_name(row["name"]):
                return jsonify({"error": "wrapped playlists are read-only"}), 403
            conn.execute("DELETE FROM playlists WHERE id = ?", (playlist_id,))
        return jsonify({"ok": True})

    @app.post("/playlists/<playlist_id>/songs")
    def add_song_to_playlist(playlist_id: str):
        body = request.get_json(silent=True) or {}
        song_id = body.get("song_id")
        if not song_id:
            return jsonify({"error": "song_id is required"}), 400
        with db.get_conn() as conn:
            pl = conn.execute("SELECT name FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
            if not pl:
                return jsonify({"error": "playlist not found"}), 404
            if db.is_wrapped_playlist_name(pl["name"]):
                return jsonify({"error": "wrapped playlists are read-only"}), 403
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
            pl = conn.execute("SELECT name FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
            if not pl:
                return jsonify({"error": "playlist not found"}), 404
            if db.is_wrapped_playlist_name(pl["name"]):
                return jsonify({"error": "wrapped playlists are read-only"}), 403
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
            pl = conn.execute("SELECT name FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
            if not pl:
                return jsonify({"error": "playlist not found"}), 404
            if db.is_wrapped_playlist_name(pl["name"]):
                return jsonify({"error": "wrapped playlists are read-only"}), 403
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
            song = conn.execute(
                "SELECT is_blank FROM songs WHERE id = ?", (entry["song_id"],)
            ).fetchone()
            if not song:
                return jsonify({"error": "song not found"}), 404
            if song["is_blank"]:
                return jsonify({"error": "blank songs cannot be played"}), 409

            inserted = db.insert_playlog_and_update_analytics(
                conn, entry["id"], entry["song_id"], entry["duration"], entry["timestamp"]
            )
            db.refresh_period_snapshots(conn)

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
            known = {
                r["id"]: r["is_blank"]
                for r in conn.execute("SELECT id, is_blank FROM songs").fetchall()
            }
            for idx, raw in enumerate(logs):
                try:
                    entry = _parse_log_entry(raw)
                except ValueError as e:
                    errors.append({"index": idx, "error": str(e)})
                    continue

                if entry["song_id"] not in known:
                    errors.append({"index": idx, "error": "unknown song_id"})
                    continue
                if known[entry["song_id"]]:
                    errors.append({"index": idx, "error": "blank songs cannot be played"})
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

            db.touch_last_sync(conn)
            db.refresh_period_snapshots(conn)
            db.maybe_generate_wrapped(conn)

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

    @app.get("/analytics/periods")
    def analytics_periods():
        period_type = (request.args.get("type") or "month").strip()
        if period_type not in ("week", "month", "year"):
            return jsonify({"error": "type must be week, month, or year"}), 400
        key = (request.args.get("key") or "").strip() or None
        with db.get_conn() as conn:
            db.refresh_period_snapshots(conn)
            keys = db.list_period_keys(conn, period_type)
            if key is None:
                key = keys[0] if keys else None
            snapshot = db.get_period_snapshot(conn, period_type, key) if key else None
        return jsonify({
            "type": period_type,
            "key": key,
            "keys": keys,
            "snapshot": snapshot,
        })

    @app.get("/wrapped/status")
    def get_wrapped_status():
        with db.get_conn() as conn:
            return jsonify(db.wrapped_status(conn))

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

            cover_ref_count = 0
            if row["cover_path"]:
                cover_ref_count = conn.execute(
                    "SELECT COUNT(*) as cnt FROM songs WHERE cover_path = ? AND id != ?",
                    (row["cover_path"], song_id),
                ).fetchone()["cnt"]

            has_lyrics = conn.execute(
                "SELECT 1 FROM lyric_sets WHERE song_id = ? LIMIT 1", (song_id,)
            ).fetchone()
            lyrics_dir_to_remove = _lyrics_dir(song_id) if has_lyrics else None

            conn.execute("DELETE FROM playlogs WHERE song_id = ?", (song_id,))
            conn.execute("DELETE FROM playlist_songs WHERE song_id = ?", (song_id,))
            conn.execute("DELETE FROM songs WHERE id = ?", (song_id,))

        if row["file_path"]:
            abs_path = os.path.join(BASE_DIR, row["file_path"])
            try:
                if os.path.isfile(abs_path):
                    utils.recycle_path(abs_path)
            except OSError as e:
                app.logger.warning("Could not recycle file %s: %s", abs_path, e)

        if row["cover_path"] and cover_ref_count == 0:
            abs_path = os.path.join(BASE_DIR, row["cover_path"])
            try:
                if os.path.isfile(abs_path):
                    utils.recycle_path(abs_path)
            except OSError as e:
                app.logger.warning("Could not recycle cover %s: %s", abs_path, e)

        if lyrics_dir_to_remove and os.path.isdir(lyrics_dir_to_remove):
            try:
                utils.recycle_path(lyrics_dir_to_remove)
            except OSError as e:
                app.logger.warning("Could not recycle lyrics dir %s: %s", lyrics_dir_to_remove, e)

        return jsonify({"ok": True, "id": song_id})

    # =====================================================================
    #  Lyrics (multi-set)
    # =====================================================================

    def _lyrics_dir(song_id: str) -> str:
        """Return the human-readable lyrics directory for a song, creating it."""
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT title, artist FROM songs WHERE id = ?", (song_id,)
            ).fetchone()
        if row:
            d = _lyrics_folder(song_id, row["title"], row["artist"])
        else:
            d = os.path.join(LYRICS_DIR, song_id)
        os.makedirs(d, exist_ok=True)
        return d

    def _parse_lrc_timestamps(text: str):
        """Extract (time_seconds, raw_text) tuples from LRC text."""
        import re as _re
        result = []
        for line in text.split("\n"):
            m = _re.match(r"^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s?(.*)", line)
            if m:
                mins = int(m.group(1))
                secs = int(m.group(2))
                ms = int(m.group(3).ljust(3, "0"))
                result.append((mins * 60 + secs + ms / 1000, m.group(4)))
            elif line.strip():
                result.append((None, line.strip()))
        return result

    def _fmt_ts(seconds: float) -> str:
        m = int(seconds // 60)
        s = int(seconds % 60)
        cs = int((seconds % 1) * 100)
        return f"{m:02d}:{s:02d}.{cs:02d}"

    @app.get("/lyrics/<song_id>")
    def list_lyric_sets(song_id: str):
        with db.get_conn() as conn:
            purge_empty_lyric_sets(conn, song_id)
            rows = conn.execute(
                "SELECT id, label, position FROM lyric_sets WHERE song_id = ? ORDER BY position",
                (song_id,),
            ).fetchall()
        return jsonify({"sets": [dict(r) for r in rows]})

    @app.post("/lyrics/<song_id>")
    def create_lyric_set(song_id: str):
        data = request.get_json(silent=True) or {}
        label = (data.get("label") or "").strip() or "Lyrics"
        lrc_text = data.get("lyrics", "")
        auto_sync_from = data.get("auto_sync_from")

        if auto_sync_from:
            with db.get_conn() as conn:
                src_row = conn.execute(
                    "SELECT label FROM lyric_sets WHERE id = ? AND song_id = ?",
                    (auto_sync_from, song_id),
                ).fetchone()
            if src_row:
                src_path = os.path.join(
                    _lyrics_dir(song_id), _lyrics_filename(src_row["label"])
                )
                if os.path.isfile(src_path):
                    with open(src_path, "r", encoding="utf-8") as fh:
                        src_parsed = _parse_lrc_timestamps(fh.read())
                    new_lines = [l.strip() for l in lrc_text.split("\n") if l.strip()]
                    synced = []
                    for i, line in enumerate(new_lines):
                        if i < len(src_parsed) and src_parsed[i][0] is not None:
                            synced.append(f"[{_fmt_ts(src_parsed[i][0])}]{line}")
                        else:
                            synced.append(line)
                    lrc_text = "\n".join(synced)

        set_id = utils.new_id()
        with db.get_conn() as conn:
            max_pos = conn.execute(
                "SELECT COALESCE(MAX(position), -1) FROM lyric_sets WHERE song_id = ?",
                (song_id,),
            ).fetchone()[0]
            conn.execute(
                "INSERT INTO lyric_sets (id, song_id, label, position) VALUES (?, ?, ?, ?)",
                (set_id, song_id, label, max_pos + 1),
            )
        path = os.path.join(_lyrics_dir(song_id), _lyrics_filename(label))
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(lrc_text)
        return jsonify({"id": set_id, "label": label}), 201

    # Legend routes registered before dynamic <set_id> to avoid collision
    @app.get("/lyrics/<song_id>/legend")
    def get_legend(song_id: str):
        path = os.path.join(_lyrics_dir(song_id), "legend.json")
        if not os.path.isfile(path):
            return jsonify({})
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        # Keep the saved key order. jsonify sorts keys, which reshuffles the legend.
        return app.response_class(
            json.dumps(data, ensure_ascii=False),
            mimetype="application/json",
        )

    @app.put("/lyrics/<song_id>/legend")
    def save_legend(song_id: str):
        data = request.get_json(silent=True) or {}
        path = os.path.join(_lyrics_dir(song_id), "legend.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
        return jsonify({"ok": True})

    # =====================================================================
    #  Per-set color map (line → color assignments, stored separately)
    # =====================================================================

    @app.get("/lyrics/<song_id>/<set_id>/colors")
    def get_set_colors(song_id: str, set_id: str):
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT label FROM lyric_sets WHERE id = ? AND song_id = ?",
                (set_id, song_id),
            ).fetchone()
        if not row:
            return jsonify({})
        path = os.path.join(_lyrics_dir(song_id), _colors_filename(row["label"]))
        if not os.path.isfile(path):
            return jsonify({})
        with open(path, "r", encoding="utf-8") as fh:
            return jsonify(json.load(fh))

    @app.put("/lyrics/<song_id>/<set_id>/colors")
    def save_set_colors(song_id: str, set_id: str):
        data = request.get_json(silent=True) or {}
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT label FROM lyric_sets WHERE id = ? AND song_id = ?",
                (set_id, song_id),
            ).fetchone()
        if not row:
            return jsonify({"error": "set not found"}), 404
        path = os.path.join(_lyrics_dir(song_id), _colors_filename(row["label"]))
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
        return jsonify({"ok": True})

    @app.get("/lyrics/<song_id>/<set_id>")
    def get_lyric_set(song_id: str, set_id: str):
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT label FROM lyric_sets WHERE id = ? AND song_id = ?",
                (set_id, song_id),
            ).fetchone()
        if not row:
            return jsonify({"error": "lyric set not found"}), 404
        with db.get_conn() as conn:
            purge_empty_lyric_sets(conn, song_id)
            still = conn.execute(
                "SELECT 1 FROM lyric_sets WHERE id = ? AND song_id = ?",
                (set_id, song_id),
            ).fetchone()
        if not still:
            return jsonify({"error": "lyric set not found"}), 404
        path = os.path.join(_lyrics_dir(song_id), _lyrics_filename(row["label"]))
        if not os.path.isfile(path):
            return jsonify({"error": "lyric set not found"}), 404
        with open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
        return jsonify({"song_id": song_id, "set_id": set_id, "lyrics": text})

    @app.put("/lyrics/<song_id>/<set_id>")
    def update_lyric_set(song_id: str, set_id: str):
        data = request.get_json(silent=True) or {}
        lrc_text = data.get("lyrics")
        new_label = data.get("label")

        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT label FROM lyric_sets WHERE id = ? AND song_id = ?",
                (set_id, song_id),
            ).fetchone()
        if not row:
            return jsonify({"error": "lyric set not found"}), 404
        old_label = row["label"]
        song_dir = _lyrics_dir(song_id)

        if new_label is not None and new_label.strip() != old_label:
            old_path = os.path.join(song_dir, _lyrics_filename(old_label))
            new_path = os.path.join(song_dir, _lyrics_filename(new_label.strip()))
            if os.path.isfile(old_path):
                os.replace(old_path, new_path)
            old_colors = os.path.join(song_dir, _colors_filename(old_label))
            new_colors = os.path.join(song_dir, _colors_filename(new_label.strip()))
            if os.path.isfile(old_colors):
                os.replace(old_colors, new_colors)
            with db.get_conn() as conn:
                conn.execute(
                    "UPDATE lyric_sets SET label = ? WHERE id = ? AND song_id = ?",
                    (new_label.strip(), set_id, song_id),
                )
            old_label = new_label.strip()

        if lrc_text is not None:
            path = os.path.join(song_dir, _lyrics_filename(old_label))
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(lrc_text)

        return jsonify({"ok": True})

    @app.delete("/lyrics/<song_id>/<set_id>")
    def delete_lyric_set(song_id: str, set_id: str):
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT label FROM lyric_sets WHERE id = ? AND song_id = ?",
                (set_id, song_id),
            ).fetchone()
        if row:
            song_dir = _lyrics_dir(song_id)
            for fn in (_lyrics_filename(row["label"]), _colors_filename(row["label"])):
                try:
                    fp = os.path.join(song_dir, fn)
                    if os.path.isfile(fp):
                        utils.recycle_path(fp)
                except OSError as e:
                    app.logger.warning("Could not recycle %s: %s", fp, e)
        with db.get_conn() as conn:
            conn.execute(
                "DELETE FROM lyric_sets WHERE id = ? AND song_id = ?",
                (set_id, song_id),
            )
        return jsonify({"ok": True})

    # =====================================================================
    #  Download flag
    # =====================================================================

    @app.put("/songs/<song_id>/download")
    def toggle_download(song_id: str):
        data = request.get_json(silent=True) or {}
        downloaded = 1 if data.get("downloaded") else 0
        with db.get_conn() as conn:
            conn.execute(
                "UPDATE songs SET downloaded = ? WHERE id = ?",
                (downloaded, song_id),
            )
        return jsonify({"ok": True, "downloaded": downloaded})

    # =====================================================================
    #  Wrapped playlist generation
    # =====================================================================

    @app.post("/wrapped/<int:year>/playlist")
    def create_wrapped_playlist(year: int):
        """Desktop force-generate. Mobile clients are not allowed to build a local copy."""
        with db.get_conn() as conn:
            created = db.generate_wrapped_playlist(conn, year)
        if not created:
            return jsonify({"error": "no play data for this year"}), 400
        return jsonify(created)

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
            db._mark_wrapped(conn, year, "generated")
        return jsonify({"ok": True, "playlist_id": pid, "name": playlist_name, "song_count": len(song_ids)})

    # =====================================================================
    #  Library export / import
    # =====================================================================

    def _zip_member_ok(name: str) -> bool:
        name = name.replace("\\", "/").lstrip("/")
        if not name or name.endswith("/"):
            return False
        parts = [p for p in name.split("/") if p]
        if any(p == ".." for p in parts):
            return False
        if name == "data/music.db":
            return True
        return name.startswith("storage/")

    @app.get("/admin/export")
    def admin_export():
        if os.path.isfile(db.DB_PATH):
            try:
                checkpoint = sqlite3.connect(db.DB_PATH)
                checkpoint.execute("PRAGMA wal_checkpoint(FULL)")
                checkpoint.close()
            except sqlite3.Error:
                pass
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            if os.path.isfile(db.DB_PATH):
                zf.write(db.DB_PATH, "data/music.db")
            storage = os.path.join(BASE_DIR, "storage")
            if os.path.isdir(storage):
                for root, _dirs, files in os.walk(storage):
                    for fn in files:
                        abs_path = os.path.join(root, fn)
                        rel = os.path.relpath(abs_path, BASE_DIR).replace("\\", "/")
                        if _zip_member_ok(rel):
                            zf.write(abs_path, rel)
        buf.seek(0)
        return send_file(
            buf,
            mimetype="application/zip",
            as_attachment=True,
            download_name="spectrum-library.zip",
        )

    @app.post("/admin/import")
    def admin_import():
        upload = request.files.get("file")
        if not upload or not upload.filename:
            return jsonify({"error": "missing 'file' zip"}), 400
        import tempfile
        staging = tempfile.mkdtemp(prefix="spectrum-import-")
        try:
            raw = upload.read()
            try:
                zf = zipfile.ZipFile(io.BytesIO(raw))
            except zipfile.BadZipFile:
                return jsonify({"error": "file is not a zip archive"}), 400
            with zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    name = info.filename.replace("\\", "/")
                    if not _zip_member_ok(name):
                        return jsonify({"error": f"unexpected path in archive: {name}"}), 400
                    dest = os.path.join(staging, *name.split("/"))
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with zf.open(info) as src, open(dest, "wb") as out:
                        shutil.copyfileobj(src, out)
            new_db = os.path.join(staging, "data", "music.db")
            if not os.path.isfile(new_db):
                return jsonify({"error": "archive is missing data/music.db"}), 400
            try:
                check = sqlite3.connect(new_db)
                check.execute("SELECT id FROM songs LIMIT 1")
                check.close()
            except sqlite3.Error as e:
                return jsonify({"error": f"music.db is not a library database: {e}"}), 400

            os.makedirs(os.path.dirname(db.DB_PATH), exist_ok=True)
            if os.path.isfile(db.DB_PATH):
                shutil.copy2(db.DB_PATH, db.DB_PATH + ".bak")
            shutil.copy2(new_db, db.DB_PATH)
            for suffix in ("-wal", "-shm"):
                sidecar = db.DB_PATH + suffix
                if os.path.isfile(sidecar):
                    try:
                        os.remove(sidecar)
                    except OSError:
                        pass
            new_storage = os.path.join(staging, "storage")
            storage_dest = os.path.join(BASE_DIR, "storage")
            if os.path.isdir(new_storage):
                if os.path.isdir(storage_dest):
                    shutil.rmtree(storage_dest)
                shutil.copytree(new_storage, storage_dest)
            db.init_db()
            with db.get_conn() as conn:
                db.refresh_period_snapshots(conn)
                db.maybe_generate_wrapped(conn)
        finally:
            shutil.rmtree(staging, ignore_errors=True)
        return jsonify({"ok": True})

    return app


app = create_app()

HTTP_PORT = 5000
HTTPS_PORT = int(os.environ.get("SPECTRUM_HTTPS_PORT", "5443"))
CERT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "certs")
SSL_CERT = os.environ.get("SPECTRUM_SSL_CERT", os.path.join(CERT_DIR, "cert.pem"))
SSL_KEY = os.environ.get("SPECTRUM_SSL_KEY", os.path.join(CERT_DIR, "key.pem"))


def _start_https_server() -> None:
    """Serve HTTPS alongside HTTP when a certificate exists (needed by the GitHub Pages PWA)."""
    if not (os.path.isfile(SSL_CERT) and os.path.isfile(SSL_KEY)):
        app.logger.info("No certificate in %s; HTTPS disabled (PWA on iPhone needs it)", CERT_DIR)
        return
    import threading
    from werkzeug.serving import make_server

    server = make_server("0.0.0.0", HTTPS_PORT, app, threaded=True, ssl_context=(SSL_CERT, SSL_KEY))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    app.logger.info("HTTPS listening on https://0.0.0.0:%d", HTTPS_PORT)


if __name__ == "__main__":
    _start_https_server()
    app.run(host="0.0.0.0", port=HTTP_PORT, debug=False)
