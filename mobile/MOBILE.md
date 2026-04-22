# KillerTunes Mobile (Expo / React Native)

A native mobile port of the KillerTunes web UI, built with Expo and React Native. Designed for testing the iOS experience via Expo Go, with the goal of eventually porting to a native SwiftUI app.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Expo Go](https://expo.dev/go) installed on your iPhone
- The Flask backend server running on the same local network as your phone

## Getting Started

```bash
cd mobile
npm install
npx expo start
```

This will display a QR code in the terminal. Open the camera app on your iPhone and scan it — it will open directly in Expo Go.

### First Launch

On first launch, the app will prompt you to enter your server address. This is the LAN IP of the machine running the Flask backend, e.g.:

```
http://192.168.1.100:5000
```

To find your IP:
- **Windows**: `ipconfig` in a terminal, look for your Wi-Fi adapter's IPv4 address
- **macOS**: `ifconfig en0 | grep inet` or check System Settings > Wi-Fi > Details

Make sure your phone and computer are on the same Wi-Fi network.

You can change this later from the **Sync** tab > **Server Settings**.

## Project Structure

```
mobile/
├── app/                        # Expo Router file-based routes
│   ├── _layout.tsx             # Root: server setup, providers
│   ├── (tabs)/                 # Bottom tab navigator
│   │   ├── _layout.tsx         # Tab config + MiniPlayer
│   │   ├── index.tsx           # Home
│   │   ├── library.tsx         # Library
│   │   ├── analytics.tsx       # Analytics
│   │   └── sync.tsx            # Sync / Settings / Upload
│   ├── player.tsx              # Full-screen now playing
│   ├── queue.tsx               # Queue management
│   ├── lyrics.tsx              # Lyrics viewer + editor
│   ├── upload.tsx              # Song upload
│   ├── settings.tsx            # Server URL config
│   ├── playlist/[id].tsx       # Playlist detail
│   └── artist/[name].tsx       # Artist detail
├── components/
│   ├── MiniPlayer.tsx          # Sticky mini player bar
│   ├── CoverImage.tsx          # Cover art with fallback
│   └── SongRow.tsx             # Reusable song list row
├── contexts/
│   ├── PlayerContext.tsx        # Audio playback, queue, shuffle/repeat
│   └── DataContext.tsx          # Songs, playlists, artists, analytics
├── api/
│   └── client.ts               # All backend API calls
├── constants/
│   ├── theme.ts                # Colors, spacing, typography
│   └── colors.ts               # Lyrics singer color palette
├── app.json                    # Expo configuration
├── package.json
└── tsconfig.json
```

## Features

Everything from the web mobile UI is ported:

- **Music Player** — Play, pause, seek, skip, with background audio support
- **Queue** — Source queue + manual queue, shuffle, repeat (off / playlist / song)
- **Library** — Search, sort by title/artist/duration, per-song action menu (play, queue, set cover, download flag, add to playlist)
- **Home** — Recently played, artists, playlists, wrapped playlists, recommendations
- **Playlists** — Create, rename, delete, add/remove songs, play all, wrapped stats
- **Artists** — Artist detail page, image upload, play all
- **Analytics** — Total stats, top songs/artists charts, yearly wrapped stats
- **Lyrics** — Synced LRC display with color-coded singer segments, legend, multi-set tabs, full editor with tap-to-stamp timestamp sync
- **Upload** — Pick audio file + cover image, set metadata, upload to server
- **Sync** — Server health check, sync play logs, fetch songs, refresh analytics

## Technology

| Concern | Library |
|---------|---------|
| Navigation | `expo-router` (file-based) |
| Audio | `expo-av` |
| State | React Context + hooks |
| Styling | React Native `StyleSheet` |
| Charts | `react-native-chart-kit` |
| Icons | `@expo/vector-icons` (Ionicons) |
| File pickers | `expo-document-picker`, `expo-image-picker` |
| Seek slider | `@react-native-community/slider` |
| Persistence | `@react-native-async-storage/async-storage` |

## Relationship to the Web UI

This is a standalone React Native app that talks to the **same Flask backend** as the web UI in `test-ui/`. Both can run simultaneously — they share the same database and API.

The web UI (`test-ui/`) is a Vite + React DOM app for browser testing. This mobile app (`mobile/`) is for native iOS testing via Expo Go.

## Troubleshooting

**"Network request failed"** — Your phone can't reach the server. Check that:
1. Both devices are on the same Wi-Fi network
2. The server IP and port are correct in settings
3. The Flask backend is running (`python app.py`)
4. No firewall is blocking port 5000

**Audio doesn't play** — Make sure your phone isn't in silent mode and the volume is up. Expo Go should handle background audio automatically.

**QR code won't scan** — Try pressing `s` in the terminal to switch to Expo Go mode, or manually enter the URL shown in the terminal into the Expo Go app's search bar.
