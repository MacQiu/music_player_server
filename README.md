# Music Player Server

A local-first Flask backend for a personal iOS music app. Stores a music
library on your machine, serves audio over WiFi, tracks playback analytics,
and supports offline-first sync from the client.

No external services. SQLite only.

---

## Layout

```
app.py              # Flask app + all routes
db.py               # SQLite connection + schema + idempotent upsert
utils.py            # filename safety, UUIDs, mutagen metadata
requirements.txt
data/
  music.db          # created on first run
storage/
  songs/            # uploaded audio files
  lyrics/           # optional <song_id>.lrc files
```

---

## Setup

```bash
python -m venv venv
# Windows PowerShell
venv\Scripts\Activate.ps1
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
python app.py
```

Server listens on `http://0.0.0.0:5000`. From another device on the same WiFi,
use your machine's LAN IP (e.g. `http://192.168.1.42:5000`).

---

## Data Model

- `songs(id, title, artist, album, duration, file_path, date_added)`
- `analytics(song_id PK, play_count, total_time, last_played)`
- `playlogs(id PK, song_id, duration, timestamp, received_at)`

Idempotency: `playlogs.id` is a UUID the client generates when a play
happens. If the same ID arrives twice (e.g. retry after lost connection)
the second insert is ignored and analytics are **not** re-incremented.

---

## API

All responses are JSON unless noted. Errors look like `{"error": "..."}`.

### `GET /ping`

Connection check.

```bash
curl http://localhost:5000/ping
```

### `GET /songs`

List all songs ordered by newest first.

```bash
curl http://localhost:5000/songs
```

### `POST /upload`

Multipart upload. `file` is required; `title`, `artist`, `album`, `duration`
are optional overrides. Missing fields are filled from ID3/WAV tags via
`mutagen` when available.

```bash
curl -X POST http://localhost:5000/upload \
  -F "file=@/path/to/song.mp3" \
  -F "title=Clair de Lune" \
  -F "artist=Debussy"
```

Response:

```json
{ "id": "ab12…", "title": "Clair de Lune", "artist": "Debussy",
  "album": null, "duration": 312.4, "file_path": "storage/songs/ab12…_song.mp3" }
```

### `GET /download/<song_id>`

Streams the audio file. Use this URL directly from the iOS client.

```bash
curl -O -J http://localhost:5000/download/ab12...
```

### `POST /playlog`

Log a single play. Send a client-generated UUID as `id` to keep retries
idempotent. `timestamp` should be ISO 8601 UTC; server fills in "now" if
omitted.

```bash
curl -X POST http://localhost:5000/playlog \
  -H "Content-Type: application/json" \
  -d '{"id":"c1-uuid-1","song_id":"ab12...","duration":183.5,"timestamp":"2026-04-17T12:34:56Z"}'
```

Response:

```json
{ "ok": true, "id": "c1-uuid-1", "inserted": true }
```

Sending the same `id` again returns `"inserted": false` and does not
increment analytics.

### `POST /sync`

Batch version of `/playlog` for offline-first clients. Send everything
buffered since last sync; safe to resend.

```bash
curl -X POST http://localhost:5000/sync \
  -H "Content-Type: application/json" \
  -d '{
    "logs": [
      {"id":"c1-uuid-1","song_id":"ab12...","duration":183.5,"timestamp":"2026-04-17T12:34:56Z"},
      {"id":"c1-uuid-2","song_id":"ab12...","duration":201.0,"timestamp":"2026-04-17T12:40:12Z"}
    ]
  }'
```

Response:

```json
{ "inserted": 2, "skipped": 0, "errors": [] }
```

### `GET /analytics`

Aggregate stats: top 10 songs, top 10 artists, total listening time, and a
small "recommendations" list based on play counts.

```bash
curl http://localhost:5000/analytics
```

### `DELETE /songs/<song_id>`

Remove the DB rows and the audio file from disk.

```bash
curl -X DELETE http://localhost:5000/songs/ab12...
```

### `GET /lyrics/<song_id>`

Return the `.lrc` lyric file if you've dropped one at
`storage/lyrics/<song_id>.lrc`.

```bash
curl http://localhost:5000/lyrics/ab12...
```

---

## Python client example

```python
import requests, uuid, datetime

BASE = "http://localhost:5000"

# Upload
with open("track.mp3", "rb") as fh:
    r = requests.post(f"{BASE}/upload", files={"file": fh})
song_id = r.json()["id"]

# Log a play with an idempotent UUID
requests.post(f"{BASE}/playlog", json={
    "id": str(uuid.uuid4()),
    "song_id": song_id,
    "duration": 210.0,
    "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
})

print(requests.get(f"{BASE}/analytics").json())
```

---

## Notes

- CORS is open to everything, which is fine on a trusted home network.
  Do not expose this server to the public internet without adding auth.
- Max upload size is 100 MB (`MAX_CONTENT_LENGTH` in `app.py`).
- Only `.mp3` and `.wav` are accepted. File names are sanitized with
  `werkzeug.secure_filename` and prefixed with the song UUID to avoid
  collisions.
- `data/music.db` and `storage/` are ignored by git; delete them to reset
  the library.
