# Music Player Server

A local-first Flask backend + React desktop UI + Expo mobile app for a
personal music player. The desktop server (`desktop-server/`) is the central
hub for uploading songs, managing lyrics, and tracking statistics. The mobile
app (`mobile/`) connects to the server for syncing and can store songs locally
for offline playback.

Desktop UI is Spotify-inspired (sidebar, bottom player bar, queue, lyrics).
Mobile UI is SoundCloud-inspired (overlay player, swipe controls, simplified sync).

No external services. SQLite only.

---

## Layout

```
app.py                # Flask app + all routes
db.py                 # SQLite connection + schema + idempotent upsert
utils.py              # filename safety, UUIDs, mutagen metadata
requirements.txt
data/
  music.db            # created on first run
storage/
  songs/              # uploaded audio files (Title - Artist.ext naming)
  covers/             # song cover images (content-hash naming for dedup)
  artists/            # artist profile images
  lyrics/             # per-song directories with lyric sets and color maps
    Shut Down - BLACKPINK/
      Lyrics - Original.lrc
      Lyrics - Original.colors.json
      Lyrics - Romanized.lrc
      legend.json
desktop-server/       # Vite + React SPA (desktop hub UI)
  src/
    api/client.js     # API client wrapper
    constants/
      colors.js       # Singer color palette (15 colors)
    components/       # DesktopLayout, Sidebar, DesktopPlayer, Player,
                      # UploadModal, ServerModal, QueueSidebar, LyricsOverlay,
                      # LyricsEditor, MobilePlayerOverlay, MobileQueueOverlay,
                      # PlaylistOverlay, ArtistOverlay
    pages/            # Home, Library, Analytics, Sync (mobile)
                      # DesktopHome, DesktopLibrary, DesktopAnalytics,
                      # DesktopDevTools (desktop)
    App.jsx           # Root: mode toggle, shared audio, queue state, resume
    index.css         # All styles
mobile/               # Expo + React Native app (iOS)
  app/                # Expo Router file-based routes
  components/         # MiniPlayer, CoverImage, SongRow
  contexts/           # PlayerContext, DataContext
  utils/              # songStorage, playlogQueue, lyricsCache
  api/client.ts       # Mobile API client (3s timeout)
  constants/          # theme, colors
```

---

## Setup

### Backend

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

### Desktop UI

```bash
cd desktop-server
npm install
npm run dev
```

The React dev server runs on `http://localhost:3000` and proxies `/api/*` to
Flask. To access from a phone on the same network, run `npm run dev -- --host`.

### Mobile App

```bash
cd mobile
npm install
npx expo start
```

See [`mobile/MOBILE.md`](mobile/MOBILE.md) for full setup instructions.

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

The desktop UI lives in `desktop-server/` and serves as the central hub for
managing your music library -- uploading songs, editing lyrics, tracking
statistics, and creating wrapped playlists.

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

The mobile app lives in `mobile/` and is built with Expo + React Native. It
connects to the desktop server for syncing and can download songs locally
for offline playback.

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
- **Mini player bar**: sits above the tab bar in a custom tab bar layout;
  tappable, shows cover + title + play/pause + progress strip.
- **Full-screen player** (tap mini player): cover art with blurred background,
  close button (down-chevron in black circle, top-right), swipe down to
  dismiss. Song info, seek bar, prev/play/next controls, and bottom row
  with shuffle/lyrics/queue/repeat. Repeat icon uses "1" for single-song
  repeat (SoundCloud style). When playing, the cover image fills the
  background and pans left-to-right over the song duration; control buttons
  get translucent dark circles. All buttons maintain fixed dimensions in
  both play and pause states to prevent layout shift. Dragging the seek bar
  smoothly drags the panning image in real-time.
- **Queue overlay**: same section layout as desktop queue
- **Playlist overlay**: full-screen overlay with same functionality as desktop;
  wrapped playlists are read-only with per-song stats
- **Lyrics overlay (mobile)**: synced lyrics display with set switching, color
  rendering, and legend; includes lyrics editor with timestamping on mobile.
  Lyrics data is memory-cached so reopening the overlay for the same song
  is instant.

## Font

Both UIs use **Nunito** (Google Fonts) as the global typeface. On desktop, it
is loaded via a `<link>` tag and set as the primary `--font` CSS variable. On
mobile, `@expo-google-fonts/nunito` is loaded in the root layout and applied
globally to all `Text` components via a render override.

## Shared Audio Architecture

### Desktop
A single `<audio>` element lives in `App.jsx` and is shared across all UIs.
The mobile mini player, full-screen overlay, and desktop player bar all
control the same audio instance via shared state and callbacks.

### Mobile
A single `expo-audio` `AudioPlayer` instance lives in `PlayerContext.tsx`.
It is configured for background playback (`shouldPlayInBackground: true`).
The player resolves local files first (if downloaded) and falls back to
streaming from the server.

**Background playback** (lock screen / app switch) requires a development
build -- it does not work in Expo Go. See `mobile/MOBILE.md` for setup
instructions.

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

On song change, `{ songId, position }` is saved to `localStorage` (desktop)
or `AsyncStorage` (mobile). When the app loads, it restores the last-played
song at the saved position in a **paused** state -- no auto-play.

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
- Whole line: `{ "0": "magenta" }` (line index -> color name)
- Partial line: `{ "1": [{"s": 0, "e": 10, "c": "red"}, {"s": 10, "e": 25, "c": "blue"}] }`

**Legend**: a per-song color-to-singer-name mapping (`legend.json`) that can be
toggled on as a sidebar panel in the lyrics overlay.

## Local Song Storage (Mobile)

Songs can be downloaded to the device's document directory using
`expo-file-system`. Downloaded songs persist across app relaunches and carry
over to production iOS builds. The player automatically uses the local copy
when available, falling back to server streaming.

Files are stored at: `{documentDirectory}songs/{songId}.{ext}`

The library UI shows "Downloading..." during active downloads and "Not
Downloaded" for songs that are only available via streaming.

## Offline-First Data (Mobile)

The mobile app caches all data locally so it works without the server:

- **Library metadata** (songs, playlists, artists, analytics) is cached in
  `AsyncStorage` and loaded on app launch before any network call.
- **Cover images** (song covers, artist images, playlist images) are cached
  to the local filesystem via `expo-file-system`. The `CoverImage` component
  checks the `online` flag from `DataContext` and skips server URLs entirely
  when offline, loading directly from local cache with zero network delay.
- **Lyrics** (sets, text, colors, legend) are cached to the filesystem in
  `{documentDirectory}lyrics/{songId}/`. A module-level memory cache in
  `lyrics.tsx` keeps lyrics in RAM so reopening the overlay is instant.
  When offline, all server API calls are skipped; data loads from filesystem
  cache directly.
- **Player cover images** use a module-level `coverCache` Map so the cover
  persists across overlay open/close without re-fetching. When offline,
  the player skips the server URI and resolves from local cache immediately.
- **Auto-sync on reconnect**: when the app detects the server coming back
  online (via the 15-second ping interval), it automatically refreshes all
  data and re-downloads covers/lyrics for all downloaded songs.
- **Pull-to-refresh**: all tabs (Home, Library, Analytics, Sync) support
  pull-to-refresh to manually trigger a data refresh.
- **API timeout**: all server requests use a 3-second `AbortController`
  timeout so the app fails fast when the server is unreachable.

## Offline Play Log Queue (Mobile)

Play logs are stored in a local AsyncStorage-backed queue
(`mobile/utils/playlogQueue.ts`) instead of being sent directly to the server.
Each log entry includes a client-generated UUID for idempotency.

When the server becomes reachable (detected via the 15-second ping interval
in `DataContext`), the queue is automatically flushed in batches of 50 via
the `POST /sync` endpoint. This ensures analytics and wrapped stats are
accurately tracked even when playing locally stored songs offline.

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
- Background audio on mobile requires a development build (not Expo Go).
- The mobile app is fully functional offline for downloaded songs, including
  playback, cover images, lyrics, and analytics display.
