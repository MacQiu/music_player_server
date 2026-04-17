"""
Lightweight endpoint tests for the music_player_server Flask app.

Run with:
    python tests/test_endpoints.py

Requires:
    pip install requests

Assumes the server is already running at http://localhost:5000.
"""

import os
import sys
import time
import tempfile
from datetime import datetime, timezone

import requests

BASE_URL = "http://localhost:5000"
DOWNLOAD_PATH = os.path.join(tempfile.gettempdir(), "test_download.mp3")

# Minimal valid MPEG Layer-3 frame (MPEG1, 128 kbps, 44100 Hz, mono).
# Sync word 0xFFE3 + enough padding to satisfy the frame size (~417 bytes).
MINIMAL_MP3 = (
    b"\xff\xe3\x18\xc4"  # MPEG1 Layer3 128kbps 44100Hz mono frame header
    + b"\x00" * 413       # zero-padded frame body
)

# Shared state passed between tests.
state: dict = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sep(title: str) -> None:
    print(f"\n{'=' * 50}")
    print(f"TEST: {title}")
    print("=" * 50)


def _result(passed: bool, detail: str = "") -> bool:
    tag = "PASS" if passed else "FAIL"
    if detail:
        print(f"  {tag} - {detail}")
    else:
        print(f"  {tag}")
    return passed


def _request(method: str, path: str, **kwargs):
    """Make a request and print the headline. Returns the Response object."""
    url = f"{BASE_URL}{path}"
    print(f"  -> {method.upper()} {url}")
    resp = requests.request(method, url, timeout=15, **kwargs)
    print(f"  <- {resp.status_code} {resp.reason}")
    return resp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_ping() -> bool:
    _sep("Ping")
    try:
        resp = _request("GET", "/ping")
        data = resp.json()
        print(f"  Response: {data}")
        ok = resp.status_code == 200 and data.get("status") == "ok"
        return _result(ok)
    except requests.ConnectionError:
        return _result(False, "Server not reachable at " + BASE_URL)
    except Exception as e:
        return _result(False, str(e))


def test_get_songs(label: str = "Get Songs") -> bool:
    _sep(label)
    try:
        resp = _request("GET", "/songs")
        data = resp.json()
        if not isinstance(data, list):
            return _result(False, "Expected JSON array")
        state["song_count"] = len(data)
        print(f"  Songs returned: {len(data)}")
        return _result(resp.status_code == 200)
    except requests.ConnectionError:
        return _result(False, "Server not reachable")
    except Exception as e:
        return _result(False, str(e))


def test_upload() -> bool:
    _sep("Upload")
    try:
        tmp = os.path.join(tempfile.gettempdir(), "test_sample.mp3")
        with open(tmp, "wb") as f:
            f.write(MINIMAL_MP3)

        with open(tmp, "rb") as f:
            resp = _request(
                "POST", "/upload",
                files={"file": ("test_sample.mp3", f, "audio/mpeg")},
                data={"title": "Test Song", "artist": "Test Artist", "album": "Test Album"},
            )

        os.remove(tmp)

        data = resp.json()
        print(f"  Response: {data}")

        if resp.status_code != 201:
            return _result(False, f"Expected 201, got {resp.status_code}")

        song_id = data.get("id")
        if not song_id:
            return _result(False, "Response missing 'id'")

        state["song_id"] = song_id
        print(f"  Stored song_id: {song_id}")
        return _result(True)
    except requests.ConnectionError:
        return _result(False, "Server not reachable")
    except Exception as e:
        return _result(False, str(e))


def test_get_songs_after_upload() -> bool:
    _sep("Get Songs (after upload)")
    try:
        resp = _request("GET", "/songs")
        data = resp.json()
        new_count = len(data)
        prev_count = state.get("song_count", 0)
        print(f"  Previous count: {prev_count}, Current count: {new_count}")

        if new_count <= prev_count:
            return _result(False, "Song count did not increase after upload")

        ids = [s["id"] for s in data]
        if state.get("song_id") not in ids:
            return _result(False, "Uploaded song not found in song list")

        return _result(True)
    except requests.ConnectionError:
        return _result(False, "Server not reachable")
    except Exception as e:
        return _result(False, str(e))


def test_download(song_id: str) -> bool:
    _sep("Download")
    try:
        resp = _request("GET", f"/download/{song_id}")
        if resp.status_code != 200:
            return _result(False, f"Expected 200, got {resp.status_code}")

        with open(DOWNLOAD_PATH, "wb") as f:
            f.write(resp.content)

        size = os.path.getsize(DOWNLOAD_PATH)
        print(f"  Saved to: {DOWNLOAD_PATH} ({size} bytes)")
        if size == 0:
            return _result(False, "Downloaded file is empty")

        return _result(True)
    except requests.ConnectionError:
        return _result(False, "Server not reachable")
    except Exception as e:
        return _result(False, str(e))


def test_playlog(song_id: str) -> bool:
    _sep("Playlog")
    try:
        payload = {
            "song_id": song_id,
            "duration": 120,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        print(f"  Payload: {payload}")
        resp = _request("POST", "/playlog", json=payload)
        data = resp.json()
        print(f"  Response: {data}")

        if resp.status_code != 200:
            return _result(False, f"Expected 200, got {resp.status_code}")
        if not data.get("ok"):
            return _result(False, "Response 'ok' is not True")

        return _result(True)
    except requests.ConnectionError:
        return _result(False, "Server not reachable")
    except Exception as e:
        return _result(False, str(e))


def test_analytics(label: str = "Analytics", min_plays: int = 1, min_time: float = 120) -> bool:
    _sep(label)
    try:
        resp = _request("GET", "/analytics")
        data = resp.json()
        total_plays = data.get("total_plays", 0)
        total_time = data.get("total_listening_time", 0)
        print(f"  total_plays: {total_plays}, total_listening_time: {total_time}")
        print(f"  top_songs: {len(data.get('top_songs', []))}")
        print(f"  top_artists: {len(data.get('top_artists', []))}")

        if resp.status_code != 200:
            return _result(False, f"Expected 200, got {resp.status_code}")
        if total_plays < min_plays:
            return _result(False, f"Expected total_plays >= {min_plays}, got {total_plays}")
        if total_time < min_time:
            return _result(False, f"Expected total_listening_time >= {min_time}, got {total_time}")

        state["prev_plays"] = total_plays
        state["prev_time"] = total_time
        return _result(True)
    except requests.ConnectionError:
        return _result(False, "Server not reachable")
    except Exception as e:
        return _result(False, str(e))


def test_sync(song_id: str) -> bool:
    _sep("Sync (batch playlogs)")
    try:
        now = datetime.now(timezone.utc).isoformat()
        payload = {
            "logs": [
                {"song_id": song_id, "duration": 30, "timestamp": now},
                {"song_id": song_id, "duration": 45, "timestamp": now},
            ]
        }
        print(f"  Sending {len(payload['logs'])} log entries")
        resp = _request("POST", "/sync", json=payload)
        data = resp.json()
        print(f"  Response: {data}")

        if resp.status_code != 200:
            return _result(False, f"Expected 200, got {resp.status_code}")
        if data.get("inserted", 0) < 1:
            return _result(False, "Expected at least 1 inserted log")
        if data.get("errors"):
            return _result(False, f"Server reported errors: {data['errors']}")

        return _result(True)
    except requests.ConnectionError:
        return _result(False, "Server not reachable")
    except Exception as e:
        return _result(False, str(e))


def test_analytics_after_sync() -> bool:
    prev_plays = state.get("prev_plays", 0)
    prev_time = state.get("prev_time", 0)
    return test_analytics(
        label="Analytics (after sync)",
        min_plays=prev_plays + 2,
        min_time=prev_time + 75,
    )


def test_delete(song_id: str) -> bool:
    _sep("Delete Song (cleanup)")
    try:
        resp = _request("DELETE", f"/songs/{song_id}")
        data = resp.json()
        print(f"  Response: {data}")

        if resp.status_code != 200:
            return _result(False, f"Expected 200, got {resp.status_code}")
        if not data.get("ok"):
            return _result(False, "Response 'ok' is not True")

        return _result(True)
    except requests.ConnectionError:
        return _result(False, "Server not reachable")
    except Exception as e:
        return _result(False, str(e))


def cleanup() -> None:
    if os.path.exists(DOWNLOAD_PATH):
        os.remove(DOWNLOAD_PATH)
        print(f"\nCleaned up: {DOWNLOAD_PATH}")


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

def main() -> None:
    print(f"Music Player Server - Endpoint Tests")
    print(f"Target: {BASE_URL}")
    print(f"Time:   {datetime.now().isoformat()}")

    results: list[tuple[str, bool]] = []

    # 1. Ping
    results.append(("Ping", test_ping()))
    if not results[-1][1]:
        print("\nServer is not reachable. Aborting remaining tests.")
        _print_summary(results)
        return

    # 2. Songs (baseline count)
    results.append(("Get Songs", test_get_songs()))

    # 3. Upload
    results.append(("Upload", test_upload()))
    song_id = state.get("song_id")
    if not song_id:
        print("\nUpload failed — skipping dependent tests.")
        _print_summary(results)
        return

    # 4. Songs after upload
    results.append(("Get Songs (post-upload)", test_get_songs_after_upload()))

    time.sleep(0.3)

    # 5. Download
    results.append(("Download", test_download(song_id)))

    # 6. Playlog
    results.append(("Playlog", test_playlog(song_id)))

    time.sleep(0.3)

    # 7. Analytics
    results.append(("Analytics", test_analytics()))

    # 8. Sync
    results.append(("Sync", test_sync(song_id)))

    time.sleep(0.3)

    # 9. Analytics after sync
    results.append(("Analytics (post-sync)", test_analytics_after_sync()))

    # 10. Delete (clean up the test song)
    results.append(("Delete", test_delete(song_id)))

    # Remove downloaded file
    cleanup()

    _print_summary(results)


def _print_summary(results: list[tuple[str, bool]]) -> None:
    passed = sum(1 for _, ok in results if ok)
    total = len(results)

    print(f"\n{'=' * 50}")
    print("SUMMARY")
    print("=" * 50)
    for name, ok in results:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name}")
    print(f"\n  {passed}/{total} tests passed.")

    if passed < total:
        sys.exit(1)


if __name__ == "__main__":
    main()
