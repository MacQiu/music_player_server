# Spectrum Mobile (Progressive Web App)

A browser-based port of the `mobile_expo/` app, built with Vite + React DOM and hosted on GitHub Pages. Install it to your iPhone's Home Screen and it behaves like a native app: it opens full screen, and it keeps working with no connection to the server for any songs you've downloaded.

The UI matches `mobile_expo/` screen for screen. The data comes from the same Flask backend (`app.py`).

## How it fits together

```
iPhone (Safari / Home Screen app)
   │  loads the app shell from  https://<user>.github.io/music_player_server/
   │  talks to the API at       https://<PC-IP>:5443   (home Wi-Fi only, while syncing)
   ▼
Flask server on your PC  (http :5000 for desktop/Expo, https :5443 for the PWA)
```

GitHub Pages is HTTPS-only, and Safari refuses to call a plain `http://192.168.x.x:5000` server from an HTTPS page. That is called mixed content. So `app.py` also serves HTTPS on port 5443 using a certificate from [mkcert](https://github.com/FiloSottile/mkcert), whose authority you trust once on the iPhone. The server only needs to be reachable while you download or sync; everything you've downloaded plays with the PC off.

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or newer (only needed for local development)
- mkcert on the PC (`winget install FiloSottile.mkcert`)
- The iPhone and PC on the same Wi-Fi network when syncing

## Running the server for the phone

Follow the one-time certificate steps in the README section "Progressive Web App (GitHub Pages)". After that it's just:

```bash
python app.py      # http :5000 and https :5443
```

The log line `HTTPS listening on https://0.0.0.0:5443` confirms HTTPS is on. If it says `HTTPS disabled`, `certs/cert.pem` or `certs/key.pem` is missing.

## Local development

```bash
cd mobile_pwa
npm install
npm run dev        # http://localhost:5173/music_player_server/ (also exposed on your LAN)
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally, including the service worker
```

The dev server runs over http, so in a desktop browser you can point it at `http://localhost:5000` directly. On the phone, use the GitHub Pages build with `https://<PC-IP>:5443`.

The base path defaults to `/music_player_server/`. You can override it with the `PWA_BASE` environment variable, e.g. `PWA_BASE=/ npm run build`.

## Deploying to GitHub Pages

The workflow at `.github/workflows/deploy-pwa.yml` builds `mobile_pwa/` and publishes `dist/` to Pages. It runs automatically on pushes to `main` that touch `mobile_pwa/**`, and you can also run it by hand from the Actions tab.

One-time setup: go to the repo's **Settings → Pages**, then under **Build and deployment** set **Source** to **GitHub Actions**.

The workflow sets `PWA_BASE` to `/<repo name>/`, so a renamed repo or a fork still deploys correctly.

## Installing on the iPhone

1. Open `https://<user>.github.io/music_player_server/` in **Safari**.
2. Enter the server URL (`https://<PC-IP>:5443`, e.g. `https://192.168.1.42:5443`) on the setup screen. You can change it later under **Sync → Server Settings**.
3. Tap **Share → Add to Home Screen**, then launch Spectrum from the Home Screen icon.

Install it to the Home Screen and always launch it from there. Safari can evict the storage of sites that aren't installed after about 7 days without a visit. An installed web app, with persistent storage granted, keeps its data.

## Offline and persistence design

Everything is stored in IndexedDB (database `spectrum`), and the app asks the browser for persistent storage (`navigator.storage.persist()`) at startup.

| Data | Where | Notes |
|------|-------|-------|
| App shell (HTML/JS/CSS/fonts/icons) | Service worker precache (Workbox) | The app opens with no network at all |
| Server URL, songs, playlists, artists, analytics, wrapped | `kv` store | Shown instantly at launch; refreshed whenever the server is reachable |
| Playlist details | `kv` store (`mp_cached_playlist_<id>`) | Any playlist you've opened once works offline |
| Downloaded audio | `audio` store (Blobs) | Played through an object URL, with no network involved |
| Covers and artist images | `images` store | Cached the first time each image is shown; refreshed once per session |
| Lyrics (sets, text, colors, legend) | `lyrics` store | Cached when a song is downloaded and whenever lyrics are viewed online |
| Play logs | `playlogs` store | Queued offline; flushed in batches to `POST /sync` on reconnect |
| Playback position + full queue | `kv` (`mp_resume`) | Saved continuously; restored (paused) on the next launch |

**Downloading:** use **Sync → Download All for Offline**, or select songs in Library or a playlist and tap **Download**. You must be connected to the server while downloading. The **Device Storage** card on the Sync tab shows how much space is used and whether storage is persistent.

**Offline playback:** when the server isn't reachable, only downloaded songs can play. Songs that aren't downloaded are skipped automatically. Server-side actions are disabled while offline, including uploads, edits, playlist changes and lyric edits.

**Reconnect:** the app pings the server every 15 seconds, and also when the app comes back to the foreground. Once the server is reachable again it flushes queued play logs, refreshes all data, and re-caches covers and lyrics for downloaded songs.

## Project structure

```
mobile_pwa/
├── index.html                  # iOS meta tags (standalone, status bar, safe areas)
├── vite.config.ts              # base path + vite-plugin-pwa manifest/service worker
├── public/                     # app icons
└── src/
    ├── main.tsx                # fonts, theme, persistent-storage request
    ├── App.tsx                 # server setup, tab shell, modal layer
    ├── theme.css               # all styling (mirrors mobile_expo/constants/theme.ts)
    ├── api/client.ts           # backend API calls
    ├── contexts/
    │   ├── DataContext.tsx     # songs/playlists/artists/analytics, online state, downloads
    │   └── PlayerContext.tsx   # <audio> playback, queue, shuffle/repeat, Media Session, resume
    ├── navigation/Navigator.tsx# tabs + modal stack wired to browser history (swipe back works)
    ├── storage/                # IndexedDB: db, songStorage, lyricsCache, playlogQueue
    ├── components/             # MiniPlayer, CoverImage, SongRow, SelectionBar, Sheet, ...
    ├── hooks/                  # useMultiSelect, usePress (long-press), useCachedImage
    └── screens/                # Home, Library, Analytics, Sync, Player, Queue, Lyrics,
                                # Upload, Settings, Playlist, Artist
```

## Differences from the Expo app

| Expo | PWA |
|------|-----|
| `expo-router` | State-based tabs + a modal stack synced with `history` |
| `expo-audio` | One persistent `HTMLAudioElement` + Media Session API |
| AsyncStorage / `expo-file-system` | IndexedDB (`idb`) |
| `react-native-chart-kit` | `recharts` |
| `react-native-draggable-flatlist` | `@dnd-kit` |
| Document/image pickers | `<input type="file">` |
| Slider | `<input type="range">` |
| Ionicons | `react-icons/io5` (same icon set) |

## iOS limitations

- **Background audio** works when you lock the phone or switch apps. Lock-screen controls and artwork come from the Media Session API. If you **force-quit** the app, audio stops; the next launch restores the song, position and queue, paused.
- **Autoplay:** iOS only allows audio that a tap started. The app unlocks its audio element on your first tap, so after that, skipping to the next song and auto-advancing work normally.
- **Storage quota:** Safari gives an installed web app a large share of free disk space, but it is not unlimited. Check the Device Storage card if downloads start failing.
- **Downloads need the server:** a download can't continue in the background once you leave the app, so keep the app open until a batch finishes.

## Troubleshooting

**"Connection failed" with an `http://` URL.** The page is HTTPS, so Safari blocks http servers. Use `https://<PC-IP>:5443`.

**Connection fails with the https URL.** Check these in order:
1. The phone is on the same Wi-Fi as the PC (not cellular, not a guest network).
2. `python app.py` is running and logged `HTTPS listening on https://0.0.0.0:5443`.
3. Open `https://<PC-IP>:5443/ping` in Safari. A certificate warning means the mkcert authority isn't fully trusted on the phone (check **Certificate Trust Settings**), or the certificate wasn't made for this IP (rerun the `mkcert -cert-file …` step). A timeout means Windows Firewall is blocking port 5443:
   ```powershell
   New-NetFirewallRule -DisplayName "Spectrum HTTPS" -Direction Inbound -LocalPort 5443 -Protocol TCP -Action Allow -Profile Private
   ```
4. The PC's IP hasn't changed since you made the certificate (`ipconfig`).

**The app shows an old version after a deploy.** The service worker updates in the background. Close the app fully and reopen it, and the new version loads.

**Downloads disappeared.** This usually means the app was used from a Safari tab instead of the Home Screen icon, and Safari evicted the site's storage. Install it to the Home Screen and download again.
