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
  songs/            # uploaded audio files (Title - Artist.ext naming)
  covers/           # song cover images (content-hash naming for dedup)
  artists/          # artist profile images
  lyrics/           # per-song directories with lyric sets and color maps
    Shut Down - BLACKPINK/
      Lyrics - Original.lrc
      Lyrics - Original.colors.json
      Lyrics - Romanized.lrc
      legend.json
test-ui/            # Vite + React SPA
  src/
    api/client.js   # API client wrapper
    constants/
      colors.js     # Singer color palette (15 colors)
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
Flask. To access from a phone on the same network, run `npm run dev -- --host`.

---

## Data Model

- `songs(id, title, artist, album, duration, file_path, cover_path, date_added, sort_order, downloaded)`
- `analytics(song_id PK, play_count, total_time, last_played)`
- `playlogs(id PK, song_id, duration, timestamp, received_at)`
- `playlists(id PK, name, created_at)`
- `playlist_songs(playlist_id, song_id, position)` -- composite PK, FK cascade
- `artists(name PK, image_path, created_at)`
- `lyric_sets(id PK, song_id, label, position)` -- FK cascade on songs

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
| `GET` | `/songs` | List all songs (ordered by `sort_order`, then newest first; includes `cover_url` and `downloaded` flag) |
| `POST` | `/upload` | Multipart upload: `file` (required), `cover` (optional image), `title`, `artist`, `album`, `duration` |
| `GET` | `/download/<song_id>` | Stream audio file |
| `DELETE` | `/songs/<song_id>` | Delete song, analytics, cover (if not shared), and audio file |
| `PUT` | `/songs/order` | Reorder library: `{"song_ids": ["id1", "id2", ...]}` |

### Cover Images

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/covers/<song_id>` | Serve cover image |
| `POST` | `/songs/<song_id>/cover` | Upload/replace cover image (`cover` file field) |
| `DELETE` | `/covers/file/<filename>` | Delete a cover file from the library and unlink it from all songs |

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

### Lyrics (Multi-Set)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/lyrics/<song_id>` | List all lyric sets for a song: `{ sets: [{ id, label, position }] }` |
| `POST` | `/lyrics/<song_id>` | Create a new lyric set: `{ label, lyrics, auto_sync_from? }` |
| `GET` | `/lyrics/<song_id>/<set_id>` | Get LRC text for a specific lyric set |
| `PUT` | `/lyrics/<song_id>/<set_id>` | Update lyrics text and/or label |
| `DELETE` | `/lyrics/<song_id>/<set_id>` | Delete a lyric set |
| `GET` | `/lyrics/<song_id>/legend` | Get color-to-singer legend JSON |
| `PUT` | `/lyrics/<song_id>/legend` | Save legend: `{ "red": "Jisoo", "blue": "Jennie" }` |
| `GET` | `/lyrics/<song_id>/<set_id>/colors` | Get per-line color map for a lyric set |
| `PUT` | `/lyrics/<song_id>/<set_id>/colors` | Save per-line color map |

### Download Flag

| Method | Path | Description |
|--------|------|-------------|
| `PUT` | `/songs/<song_id>/download` | Toggle download status: `{ "downloaded": true/false }` |

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
  and highlight as the song plays. Supports multiple lyric sets (e.g. Original,
  Romanized, Translated) with a tab bar to switch between them. Color-coded
  singer highlighting with a toggleable legend sidebar. Includes a lyrics
  editor with line-level timestamping, color assignment, and set management.
- **Upload modal**: audio file + cover image upload with preview. Includes a
  picker to select from existing cover images to avoid re-uploading duplicates.
  Covers can be deleted from the library via a delete button on each thumbnail.
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
  playlist overlay), recommendations (random 5 from top 15 most played).
  Non-downloaded songs appear greyed out with "Not Downloaded" label.
- **Library tab**: search bar, sort pills (Title, Artist, Duration) with
  ascending/descending toggles, Reorder mode with up/down arrow buttons for
  manual library reordering, song list with "..." menu for play/queue/set
  cover/download toggle/add to playlist. Non-downloaded songs are dimmed
  with a "Not Downloaded" subtitle.
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
- **Lyrics overlay (mobile)**: read-only synced lyrics display with set
  switching and color rendering; no editing capability on mobile

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

## File Naming

- **Song audio files**: stored as `Title - Artist.ext` (e.g. `Shut Down - BLACKPINK.mp3`).
  Falls back to `Title.ext` if no artist. Collisions are resolved by appending
  ` (2)`, ` (3)`, etc.
- **Cover images**: stored using a SHA-256 content hash as the filename
  (e.g. `a1b2c3...d4.jpg`). Identical images point to the same file on disk.
  Covers are only deleted from disk when explicitly removed via the cover
  library in the upload modal, and only if no songs still reference them.
- **Lyrics directories**: stored as `Title - Artist/` under `storage/lyrics/`.
  Each lyric set is a file named `Lyrics - {label}.lrc`. Color maps are stored
  as `Lyrics - {label}.colors.json` alongside their LRC file.

## Multi-Set Lyrics

Songs can have multiple sets of lyrics (e.g. Original, Romanized, Translated).
Each set is stored as its own `.lrc` file within the song's lyrics directory.
The `lyric_sets` table tracks metadata (id, song_id, label, position).

- **Set switching**: both the overlay and editor have a tab bar to switch sets
- **Auto-sync timestamps**: when creating a new set, timestamps from the primary
  set (position 0) can be auto-applied line-by-line to the new set
- **Independent editing**: after creation, each set's timestamps are independent

## Color-Coded Lyrics (Singer Assignment)

Colors are assigned per-line (or per character range within a line) and stored
in a separate `.colors.json` file alongside the LRC, keeping the lyrics text
clean. This supports color-coding lines to identify which group member is
singing.

**15-color palette**: red, maroon, orange, yellow, lime green, forest green,
teal, cyan, blue, navy blue, magenta, purple, violet, peach, light grey.
Default (unassigned) text is white when active and dim grey when upcoming.

**Color map format** (stored in `colors.json`):
- Whole line: `{ "0": "magenta" }` (line index → color name)
- Partial line: `{ "1": [{"s": 0, "e": 10, "c": "red"}, {"s": 10, "e": 25, "c": "blue"}] }`

**Legend**: a per-song color-to-singer-name mapping (`legend.json`) that can be
toggled on as a sidebar panel in the lyrics overlay.

**Editor workflow**:
1. Click the palette icon on any line
2. Pick a color, then "Color Whole Line" or select a portion and "Apply to Selection"
3. Set up the legend via the "Legend" button to map colors to singer names
4. Save -- lyrics and colors are saved to separate files

## Selective Download (Mobile)

All songs from the server appear in the mobile library regardless of download
status. Songs can be marked as "downloaded" or "not downloaded" via the context
menu. Non-downloaded songs are greyed out with a "Not Downloaded" subtitle but
can still be played (streaming from server), added to playlists, and reordered.

This is a server-side flag (`downloaded` column in `songs` table) designed as
scaffolding for a future native iOS app or Jellyfin integration, where the flag
will determine which songs to cache locally on the device.

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
- Database migrations run automatically on startup (cover dedup, sort_order
  backfill, artist backfill, lyrics directory restructuring, download column).
