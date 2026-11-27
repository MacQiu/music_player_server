"""Offline tests for blank songs, period snapshots, wrapped gating, and export.

Run from the repo root:
    python tests/test_library_features.py
"""

from __future__ import annotations

import io
import json
import os
import shutil
import sys
import tempfile
import unittest
import zipfile
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

TMP = tempfile.mkdtemp(prefix="spectrum-test-")
import db  # noqa: E402

db.DB_DIR = os.path.join(TMP, "data")
db.DB_PATH = os.path.join(db.DB_DIR, "music.db")
db.COVERS_DIR = os.path.join(TMP, "storage", "covers")
db.LYRICS_DIR = os.path.join(TMP, "storage", "lyrics")
os.makedirs(db.DB_DIR, exist_ok=True)

import app as appmod  # noqa: E402

appmod.BASE_DIR = TMP
appmod.SONGS_DIR = os.path.join(TMP, "storage", "songs")
appmod.LYRICS_DIR = os.path.join(TMP, "storage", "lyrics")
appmod.COVERS_DIR = os.path.join(TMP, "storage", "covers")
appmod.ARTISTS_DIR = os.path.join(TMP, "storage", "artists")


class LibraryFeatureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = appmod.create_app().test_client()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(TMP, ignore_errors=True)

    def test_blank_song_has_no_audio(self):
        created = self.client.post("/songs/blank", data={"title": "Ghost", "artist": "Nobody"})
        self.assertEqual(created.status_code, 201, created.get_json())
        body = created.get_json()
        self.assertEqual(body["is_blank"], 1)
        listed = self.client.get("/songs").get_json()
        match = next(s for s in listed if s["id"] == body["id"])
        self.assertEqual(match["is_blank"], 1)
        download = self.client.get(f"/download/{body['id']}")
        self.assertEqual(download.status_code, 409)
        logged = self.client.post("/playlog", json={
            "song_id": body["id"], "duration": 30, "timestamp": "2026-06-01T00:00:00",
        })
        self.assertEqual(logged.status_code, 409)
        import struct
        pcm = b"\x00\x00" * 8
        wav = (
            b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt "
            + struct.pack("<IHHIIHH", 16, 1, 1, 8000, 16000, 2, 16)
            + b"data" + struct.pack("<I", len(pcm)) + pcm
        )
        attached = self.client.post(
            f"/songs/{body['id']}/audio",
            data={"file": (io.BytesIO(wav), "track.wav")},
            content_type="multipart/form-data",
        )
        self.assertEqual(attached.status_code, 200, attached.get_json())
        self.assertEqual(attached.get_json()["is_blank"], 0)
        self.assertEqual(attached.get_json()["title"], "Ghost")
        ready = self.client.get(f"/download/{body['id']}")
        self.assertEqual(ready.status_code, 200)

    def test_clients_cannot_create_wrapped_names(self):
        resp = self.client.post("/playlists", json={"name": "Your 2026 Playback"})
        self.assertEqual(resp.status_code, 403)

    def test_period_snapshots_prune_old_weeks_and_keep_years(self):
        with db.get_conn() as conn:
            conn.execute(
                "INSERT INTO period_snapshots (period_type, period_key, payload) VALUES ('week', '2020-W01', '{}')"
            )
            conn.execute(
                "INSERT INTO period_snapshots (period_type, period_key, payload) VALUES ('year', '2020', '{}')"
            )
            db.refresh_period_snapshots(conn, now=datetime(2026, 6, 15))
            weeks = db.list_period_keys(conn, "week")
            years = db.list_period_keys(conn, "year")
        self.assertNotIn("2020-W01", weeks)
        self.assertTrue(any(k.startswith("2026-W") for k in weeks))
        self.assertIn("2020", years)
        self.assertIn("2026", years)
        self.assertIn("2025", years)

    def test_wrapped_waits_then_ignores_logs_after_deadline(self):
        with db.get_conn() as conn:
            conn.execute("DELETE FROM wrapped_jobs")
            conn.execute("DELETE FROM playlists")
            conn.execute("DELETE FROM playlist_songs")
            conn.execute("DELETE FROM playlogs")
            conn.execute(
                "INSERT INTO songs (id, title, artist, file_path, is_blank) VALUES ('song-a', 'A', 'Art', 'storage/songs/a.mp3', 0)"
            )
            db.insert_playlog_and_update_analytics(conn, "log-before", "song-a", 10, "2026-11-15T12:00:00")
            db.insert_playlog_and_update_analytics(conn, "log-after", "song-a", 99, "2026-12-05T12:00:00")
            db.set_meta(conn, "last_sync_at", "2026-10-01T00:00:00")
            db.maybe_generate_wrapped(conn, now=datetime(2026, 12, 2))
            status = db.wrapped_status(conn, now=datetime(2026, 12, 2))
            self.assertEqual(status["status"], "waiting_for_sync")
            self.assertTrue(status["should_notify"])
            self.assertIn("Sync now", status["message"])
            missing = conn.execute(
                "SELECT id FROM playlists WHERE name = 'Your 2026 Playback'"
            ).fetchone()
            self.assertIsNone(missing)

            db.set_meta(conn, "last_sync_at", "2026-12-05T00:00:00")
            db.maybe_generate_wrapped(conn, now=datetime(2026, 12, 5))
            row = conn.execute(
                "SELECT id FROM playlists WHERE name = 'Your 2026 Playback'"
            ).fetchone()
            self.assertIsNotNone(row)
            counted = conn.execute(
                """
                SELECT COUNT(*) AS n FROM playlogs
                WHERE song_id = 'song-a' AND DATE(timestamp) <= '2026-11-30'
                """
            ).fetchone()["n"]
            self.assertEqual(counted, 1)
            job = conn.execute(
                "SELECT status FROM wrapped_jobs WHERE year = 2026"
            ).fetchone()
            self.assertEqual(job["status"], "generated")

    def test_missing_or_blank_lyric_file_drops_the_row(self):
        with db.get_conn() as conn:
            conn.execute(
                "INSERT INTO songs (id, title, artist, file_path) "
                "VALUES ('lyric-song', 'No File', 'Nobody', 'storage/songs/x.mp3')"
            )
            conn.execute(
                "INSERT INTO lyric_sets (id, song_id, label, position) "
                "VALUES ('set-missing', 'lyric-song', 'Original', 0)"
            )
            conn.execute(
                "INSERT INTO songs (id, title, artist, file_path) "
                "VALUES ('lyric-blank', 'Blank', 'Nobody', 'storage/songs/y.mp3')"
            )
            conn.execute(
                "INSERT INTO lyric_sets (id, song_id, label, position) "
                "VALUES ('set-blank', 'lyric-blank', 'Original', 0)"
            )
        blank_dir = os.path.join(appmod.LYRICS_DIR, "Blank - Nobody")
        os.makedirs(blank_dir, exist_ok=True)
        blank_file = os.path.join(blank_dir, "Lyrics - Original.lrc")
        with open(blank_file, "w", encoding="utf-8") as fh:
            fh.write("   \n")

        missing = self.client.get("/lyrics/lyric-song")
        blank = self.client.get("/lyrics/lyric-blank")
        self.assertEqual(missing.status_code, 200)
        self.assertEqual(missing.get_json()["sets"], [])
        self.assertEqual(blank.get_json()["sets"], [])
        self.assertFalse(os.path.exists(blank_file))
        with db.get_conn() as conn:
            left = conn.execute(
                "SELECT id FROM lyric_sets WHERE id IN ('set-missing', 'set-blank')"
            ).fetchall()
        self.assertEqual(left, [])

    def test_legend_order_round_trips(self):
        created = self.client.post("/songs/blank", data={"title": "Legend", "artist": "Order"})
        song_id = created.get_json()["id"]
        order = {"red": "Second", "blue": "First", "green": "Third"}
        saved = self.client.put(
            f"/lyrics/{song_id}/legend",
            data=json.dumps(order),
            content_type="application/json",
        )
        self.assertEqual(saved.status_code, 200)
        loaded = self.client.get(f"/lyrics/{song_id}/legend")
        self.assertEqual(list(json.loads(loaded.data).keys()), ["red", "blue", "green"])

    def test_export_zip_contains_database(self):
        resp = self.client.get("/admin/export")
        self.assertEqual(resp.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(resp.data)) as zf:
            names = zf.namelist()
        self.assertIn("data/music.db", names)


if __name__ == "__main__":
    unittest.main()
