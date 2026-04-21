# Music Player Server

A local-first Flask backend + React web UI for a personal music player.
Desktop UI is Spotify-inspired (sidebar, bottom player bar, queue, lyrics).
Mobile UI is SoundCloud-inspired (overlay player, swipe controls, simplified sync).

Stores a music library on your machine, serves audio over WiFi, tracks
playback analytics with charts, supports playlists, cover art, and
offline-first sync from mobile clients.

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
  covers/           # song cover images
  artists/          # artist profile images
  lyrics/           # optional <song_id>.lrc files
test-ui/            # Vite + React SPA
  src/
    api/client.js   # API client wrapper
    components/     # DesktopLayout, Sidebar, DesktopPlayer, Player,
                    # UploadModal, ServerModal, QueueSidebar, LyricsOverlay,
                    # LyricsEditor, MobilePlayerOverlay, MobileQueueOverlay,
                    # PlaylistOverlay, ArtistOverlay
    pages/          # Home, Library, Analytics, Sync (mobile)
                    # DesktopHome, DesktopLibrary, DesktopAnalytics,
                    # DesktopDevTools (desktop)
    App.jsx         # Root: mode toggle, shared audio, queue state, resume
    index.css       # All styles
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

# React UI
cd test-ui
npm install
npm run dev
```

Server listens on `http://0.0.0.0:5000`. From another device on the same WiFi,
use your machine's LAN IP (e.g. `http://192.168.1.42:5000`).

The React dev server runs on `http://localhost:3000` and proxies `/api/*` to
Flask.

---

## Data Model

- `songs(id, title, artist, album, duration, file_path, cover_path, date_added, sort_order)`
- `analytics(song_id PK, play_count, total_time, last_played)`
- `playlogs(id PK, song_id, duration, timestamp, received_at)`
- `playlists(id PK, name, created_at)`
- `playlist_songs(playlist_id, song_id, position)` -- composite PK, FK cascade
- `artists(name PK, image_path, created_at)`

Idempotency: `playlogs.id` is a UUID the client generates when a play
happens. If the same ID arrives twice the second insert is ignored and
analytics are not re-incremented.

---

## API

All responses are JSON. Errors look like `{"error": "..."}`.

### Core

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ping` | Health check + UTC time |
| `GET` | `/songs` | List all songs (ordered by `sort_order`, then newest first; includes `cover_url`) |
| `POST` | `/upload` | Multipart upload: `file` (required), `cover` (optional image), `title`, `artist`, `album`, `duration` |
| `GET` | `/download/<song_id>` | Stream audio file |
| `DELETE` | `/songs/<song_id>` | Delete song, analytics, cover, and audio file |
| `PUT` | `/songs/order` | Reorder library: `{"song_ids": ["id1", "id2", ...]}` |

### Cover Images

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/covers/<song_id>` | Serve cover image |
| `POST` | `/songs/<song_id>/cover` | Upload/replace cover image (`cover` file field) |

### Artists

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/artists` | List all artists with image URLs and song counts |
| `POST` | `/artists/<name>/image` | Upload artist profile image (`image` file field) |
| `GET` | `/artist-image/<name>` | Serve artist image |

### Playlists

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/playlists` | List all playlists with song counts and cover URLs |
| `POST` | `/playlists` | Create playlist `{"name": "..."}` |
| `GET` | `/playlists/<id>` | Get playlist with ordered songs. Wrapped playlists include `is_wrapped: true` and per-song `play_count`/`total_time` |
| `PUT` | `/playlists/<id>` | Rename playlist `{"name": "..."}` |
| `DELETE` | `/playlists/<id>` | Delete playlist |
| `POST` | `/playlists/<id>/songs` | Add song `{"song_id": "..."}` |
| `DELETE` | `/playlists/<id>/songs/<song_id>` | Remove song |
| `PUT` | `/playlists/<id>/songs` | Reorder songs `{"song_ids": [...]}` |

### Play Logs & Sync

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/playlog` | Log a single play (idempotent by `id`) |
| `POST` | `/sync` | Batch play logs `{"logs": [...]}` |

### Analytics

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/analytics` | Top songs, top artists, totals, 5 random recommendations from top 15, 30-day play history |
| `GET` | `/analytics/wrapped?year=YYYY` | Yearly stats (Dec 1 of year-1 to Nov 30 of year): top songs, top artists, total plays and time |

### Lyrics

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/lyrics/<song_id>` | Return `.lrc` file contents if available |
| `POST` | `/lyrics/<song_id>` | Save/update lyrics `{"lyrics": "[00:01.00]line..."}` |

### Wrapped Playlists

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/wrapped/<year>/playlist` | Auto-generate a "Your YYYY Playback" playlist from most-played songs of that year |

### Dev Tools

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/dev/generate-playlogs` | Generate fake play log data for testing `{"year": 2025, "count": 200}` |
| `DELETE` | `/dev/playlogs` | Delete all play logs for a wrapped period `{"year": 2025}` |
| `POST` | `/dev/playback-playlist` | Create an empty "Your YYYY Playback" playlist from selected songs without play data `{"year": 2023, "song_ids": [...]}` |

---

## Desktop UI (Spotify-inspired)

- **Sidebar**: Home, Library, Analytics navigation; playlist list split into
  user playlists and Wrapped playlists; inline create; cloud-upload icon for
  song upload modal; gear icon for server controls modal. Dev Tools nav link
  appears when developer mode is active.
- **Main content**: Home (recently played, artists with image upload, playlists
  that open as overlays, recommended cards), Library (searchable song table
  with drag-and-drop manual reordering, column sorting for title/artist/album/
  duration, right-click context menu for play/queue/set cover/add to playlist),
  Analytics (stat cards + recharts charts + yearly wrapped section with year
  selector, read-only), Dev Tools (test data management, wrapped playlist
  creation, empty playback playlist builder)
- **Bottom player bar**: cover thumbnail + song info (left), shuffle/prev/
  play/pause/next/repeat controls + seek bar (center), lyrics/queue/volume/
  connection icons (right). Repeat and shuffle icons use matching SVG style
  with active-state highlighting. Single-song repeat shows a visible "1".
- **Queue sidebar**: slides in from right; sections: previously in queue (songs
  above current in source list), now playing, added to queue (manual), playing
  next (remaining songs in source list). Tap to jump, drag to reorder manual
  queue, remove from manual queue.
- **Lyrics overlay**: replaces main content with synced lyrics that auto-scroll
  and highlight as the song plays. Includes a lyrics editor for line-level
  timestamping with the ability to edit/delete individual timestamps and save
  partially timestamped songs.
- **Upload modal**: audio file + cover image upload with preview. Includes a
  picker to select from existing cover images to avoid re-uploading duplicates.
- **Server modal**: server status, sync, fetch, analytics refresh
- **Playlist overlay**: modal dialog with playlist header (cover, editable name,
  track count, duration), Play All/Add Songs/Delete buttons, song list with
  reorder/remove/queue, and searchable add-song panel
- **Wrapped playlist overlay**: read-only; hides Add Songs, Delete, rename,
  remove, and drag controls. Shows per-song play count and listening time
  for the wrapped year.
- **Artist overlay**: clicking an artist opens a modal with all songs by that
  artist and an option to upload/change their profile image
- **Developer mode**: toggled with `Ctrl+Shift+D`. Adds a "Dev Tools" page
  accessible from the sidebar with: generate/delete test play data, create
  wrapped playlists from actual data, and create empty playback playlists
  by manually selecting and ordering songs (for retroactively adding old
  yearly playlists without play data).

## Mobile UI (SoundCloud-inspired)

- **Home tab**: recently played, artists (tap no-image artists to upload),
  playlists split into user playlists and Wrapped playlists (tap to open
  playlist overlay), recommendations (random 5 from top 15 most played)
- **Library tab**: search bar, sort pills (Title, Artist, Duration) with
  ascending/descending toggles, Reorder mode with up/down arrow buttons for
  manual library reordering, song list with "..." menu for play/queue/set
  cover/add to playlist
- **Analytics tab**: stat cards + recharts charts + yearly wrapped section
- **Sync tab**: card rows for server status, sync status, fetch songs
- **Mini player bar**: tappable, shows cover + title + play/pause + progress
- **Full-screen overlay** (tap mini player): cover art (blurred when paused),
  prev/play/next controls, seek bar, swipe left/right, shuffle/queue/repeat,
  lyrics button to open a read-only lyrics overlay.
  Repeat icon uses SVG with "1" for single-song repeat (SoundCloud style).
- **Queue overlay**: same section layout as desktop queue
- **Playlist overlay**: full-screen overlay with same functionality as desktop;
  wrapped playlists are read-only with per-song stats
- **Lyrics overlay (mobile)**: read-only synced lyrics display accessible from
  the full-screen player; no editing capability on mobile

## Shared Audio Architecture

A single `<audio>` element lives in `App.jsx` and is shared across all UIs.
The mobile mini player, full-screen overlay, and desktop player bar all
control the same audio instance via shared state and callbacks. This prevents
the double-audio bug where multiple audio elements could play simultaneously.

## Queue Model

- **Source list**: the library (all songs by sort order) or a playlist's songs,
  depending on where you start playback
- **Source index**: position of the currently playing song within the source list
- **Manual queue**: songs explicitly added via "Add to Queue"; these play before
  continuing through the source list
- **Playing from Library**: if you play Igloo from the library, the queue shows
  all library songs with Igloo highlighted as current
- **Playing from Playlist**: if you play a song from a playlist overlay, the
  queue switches to that playlist's songs
- **Shuffle**: Fisher-Yates shuffle of the source list; resets when a song is
  explicitly selected from a playlist overlay

## Resume Playback

On song change, `{ songId, position }` is saved to `localStorage`. When the
app loads, it restores the last-played song at the saved position in a
**paused** state -- no auto-play.

## Library Reordering

Songs have a `sort_order` column. On desktop, drag-and-drop rows to reorder.
On mobile, toggle "Reorder" mode and use up/down arrows. Changes persist to
the backend via `PUT /songs/order`. Column sorting (title, artist, album,
duration) with ascending/descending toggles is also available.

## Yearly Analytics (Wrapped)

The `GET /analytics/wrapped?year=YYYY` endpoint returns stats for a
Dec 1 to Nov 30 yearly window. Both UIs include a year selector dropdown
to browse yearly stats. In December, the current year's wrapped data
represents the full "Spotify Wrapped"-style annual summary.

Wrapped playlists ("Your YYYY Playback") are auto-generated from the most
played songs of a given year via `POST /wrapped/<year>/playlist`. They are
displayed in their own section beneath user playlists in both UIs.

Wrapped playlists are **read-only**: songs cannot be added, removed, or
reordered. Each song displays its play count and total listening time for
that wrapped year.

## Developer Mode

Hidden developer mode (desktop only) activated with `Ctrl+Shift+D`. Provides:
- **Generate Test Data**: create fake play logs for a selected year
- **Delete Test Data**: remove all play logs for a wrapped period
- **Create Wrapped Playlist**: generate a "Your YYYY Playback" playlist from
  actual play data
- **Create Empty Playback Playlist**: manually select and order songs to create
  a "Your YYYY Playback" playlist without needing play data, for retroactively
  adding old yearly playlists

These features are not accessible from the standard desktop UI.

## Lyrics

Songs can have `.lrc` format lyrics stored server-side. The desktop lyrics
overlay shows synced lyrics that auto-scroll and highlight line-by-line as
the song plays. Colors transition from navy blue (upcoming) to white (active/
past). The built-in editor supports tap-to-timestamp, editing/deleting
individual timestamps, and saving partially timestamped songs. Mobile shows
a read-only lyrics overlay.

## Repeat Modes (both UIs)

Cycle: no repeat -> repeat playlist -> repeat individual song

Repeat icons use SVG arrows instead of emojis. The single-song repeat icon
shows a bold "1" in the center of the repeat arrows (matching SoundCloud's
orange repeat-one style).

---

## Notes

- CORS is open, fine on a trusted home network. Do not expose publicly
  without adding auth.
- Max upload: 100 MB. Only `.mp3` and `.wav` audio. Cover images accept
  `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`.
- `data/music.db` and `storage/` are gitignored; delete them to reset.
- Shuffle uses Fisher-Yates to randomize the queue within the source list.
- Cover images can be set for existing songs via the right-click (desktop)
  or "..." menu (mobile) using the "Set Cover" option.
- When uploading a new song, existing covers can be selected to avoid
  re-uploading the same image.
- Artist images can be uploaded by clicking/tapping an artist card that has
  no image yet, or via the artist overlay.
- Image containers are sized for high-resolution display across both UIs.
