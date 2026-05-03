# Spectrum iOS (Native Swift / SwiftUI)

A native iOS port of the Spectrum music player, built with Swift and SwiftUI. Designed to be compiled in Xcode and run on a physical iPhone as a private, personal music app -- no App Store or Expo required.

## Prerequisites

- [Xcode](https://developer.apple.com/xcode/) 15.0 or later
- iOS 17.0+ deployment target
- An Apple Developer account (free tier works for personal device testing)
- The Flask backend server running on the same local network as your phone

## Getting Started

1. Open `Spectrum.xcodeproj` in Xcode
2. Select your development team under **Signing & Capabilities** (your personal Apple ID)
3. Connect your iPhone and select it as the build target
4. Press **Cmd+R** to build and run

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
mobile_ios/
├── MOBILE_IOS.md                  # This file
├── Spectrum.xcodeproj/            # Xcode project file
├── Spectrum/
│   ├── SpectrumApp.swift          # @main entry, environment setup
│   ├── Info.plist                 # Background audio, local networking
│   ├── Assets.xcassets/           # App icon, accent color
│   ├── Models/
│   │   ├── Song.swift             # Song data model
│   │   ├── Playlist.swift         # Playlist data model
│   │   ├── Artist.swift           # Artist data model
│   │   ├── Analytics.swift        # Analytics and wrapped data models
│   │   └── PlaylogEntry.swift     # Play log queue entry
│   ├── Services/
│   │   ├── APIClient.swift        # All REST API calls (URLSession, 3s timeout)
│   │   ├── AudioEngine.swift      # AVPlayer wrapper, background audio, lock screen
│   │   ├── StorageManager.swift   # Local file storage (songs, covers, images)
│   │   ├── PlaylogQueue.swift     # Offline play log queue with batch sync
│   │   └── LyricsCache.swift      # Filesystem cache for lyrics data
│   ├── ViewModels/
│   │   ├── PlayerViewModel.swift  # Playback state, queue, shuffle, repeat
│   │   └── DataViewModel.swift    # Library data, caching, online detection
│   ├── Views/
│   │   ├── ContentView.swift      # Server URL gate
│   │   ├── ServerSetupView.swift  # Initial server configuration
│   │   ├── MainTabView.swift      # Tab navigation + MiniPlayer
│   │   ├── HomeView.swift         # Home screen
│   │   ├── LibraryView.swift      # Library with filters and search
│   │   ├── AnalyticsView.swift    # Stats and charts
│   │   ├── SyncView.swift         # Server sync controls
│   │   ├── PlayerView.swift       # Full-screen player
│   │   ├── QueueView.swift        # Queue management
│   │   ├── LyricsView.swift       # Synced lyrics display and editor
│   │   ├── UploadView.swift       # Song upload
│   │   ├── SettingsView.swift     # Server URL settings
│   │   ├── PlaylistDetailView.swift
│   │   └── ArtistDetailView.swift
│   ├── Components/
│   │   ├── MiniPlayerView.swift   # Compact player bar
│   │   ├── CoverImageView.swift   # Cover art with offline fallback
│   │   ├── SongRowView.swift      # Song list row
│   │   └── SelectionBarView.swift # Multi-select action bar
│   └── Theme/
│       └── Theme.swift            # Colors, spacing, typography
```

## Features

Full feature parity with the Expo/React Native version:

- **Music Player** -- Play, pause, seek, skip, with background audio support and lock screen controls via `MPNowPlayingInfoCenter`. Cover art, song info, and playback controls appear on the lock screen and in Control Center.
- **Queue** -- Source queue + manual queue, shuffle (Fisher-Yates), repeat (off / playlist / song)
- **Library** -- Unified view with filter chips (All, Playlists, Artists, Wrapped, Songs). Songs filter has sort pills (Title, Artist, Duration) with toggle direction. Per-song action menu. Long-press for multi-select with batch actions (download, delete local). Pull-to-refresh.
- **Home** -- Top tracks, artists, playlists, wrapped playlists, recommendations. Create new playlists. Pull-to-refresh.
- **Playlists** -- Create, rename, delete, add/remove songs, play all, wrapped stats. Multi-select with batch remove.
- **Artists** -- Artist detail page with hero banner, image upload via PhotosPicker, play all, album groupings.
- **Analytics** -- Total stats, top songs/artists bar charts (Swift Charts), yearly wrapped stats with year picker. Pull-to-refresh.
- **Lyrics** -- Synced LRC display with auto-scrolling, color-coded singer segments, legend panel, multi-set tabs. Lyrics editor with tap-to-stamp timestamping.
- **Upload** -- Pick audio file via document picker + cover image via PhotosPicker, set metadata, upload to server.
- **Sync** -- Server health check, sync play logs, fetch songs, refresh analytics. Pull-to-refresh.
- **Offline-first** -- All data cached in UserDefaults. Cover images, songs, and lyrics cached to filesystem. Auto-syncs on reconnect.

## Technology

| Concern | Framework |
|---------|-----------|
| UI | SwiftUI |
| Navigation | `TabView` + `NavigationStack` |
| Audio | `AVPlayer` + `AVAudioSession` |
| Lock Screen | `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter` |
| State | `@Observable` + `@Environment` |
| Networking | `URLSession` (async/await) |
| Charts | Swift Charts |
| Icons | SF Symbols |
| File Pickers | `.fileImporter()` + `PhotosPicker` (PhotosUI) |
| Persistence | `UserDefaults` + `FileManager` |

## Relationship to the Expo App

This is a native Swift rewrite of the Expo/React Native app in `mobile_expo/`. Both apps talk to the **same Flask backend** and can run simultaneously -- they share the same database and API. The native app provides:

- True background audio playback (lock screen controls, Control Center)
- No dependency on Expo Go or any JavaScript runtime
- Native iOS performance and feel
- Direct compilation to your device via Xcode

## Background Playback

Background audio is configured natively:
- `Info.plist` includes `UIBackgroundModes: audio`
- `AVAudioSession` is set to `.playback` category
- `MPRemoteCommandCenter` handles lock screen play/pause/seek/skip

This works immediately on a physical device -- no development build or EAS Build required (unlike the Expo version).

## Local Song Storage

Songs are downloaded to the app's Documents directory and persist across app launches. When a song is marked as "downloaded" in the library, the audio file is stored locally and playback uses the local copy instead of streaming.

Files are stored at: `Documents/songs/{songId}.{ext}`

## Offline-First Architecture

The app caches all data locally so it works without the server:

| Data | Cache Location | Mechanism |
|------|---------------|-----------|
| Songs, playlists, artists, analytics | `UserDefaults` | Loaded on launch; refreshed when server reachable |
| Cover images | `Documents/covers/` and `Documents/images/` | Downloaded on first load; used directly when offline |
| Lyrics (sets, text, colors, legend) | `Documents/lyrics/{songId}/` | Filesystem cache; skips server when offline |
| Play logs | `UserDefaults` queue | Batched and synced when server becomes reachable |

### Auto-Sync on Reconnect

When `DataViewModel` detects the server coming back online (via the 15-second ping interval), it automatically:
1. Flushes the offline play log queue via `POST /sync`
2. Refreshes all data (songs, playlists, artists, analytics)
3. Re-downloads covers and lyrics for all downloaded songs

## Troubleshooting

**"Network request failed"** -- Your phone can't reach the server. Check that:
1. Both devices are on the same Wi-Fi network
2. The server IP and port are correct in settings
3. The Flask backend is running (`python app.py`)
4. No firewall is blocking port 5000

**Build fails with signing error** -- Make sure you've selected a development team in Xcode's Signing & Capabilities tab. A free Apple Developer account works for personal device testing.

**Audio doesn't play in background** -- Make sure the `UIBackgroundModes: audio` key is present in Info.plist. If running in the Simulator, background audio may not work reliably; test on a physical device.

**App Transport Security error** -- The app is configured with `NSAllowsLocalNetworking: true` in Info.plist to allow `http://` connections to LAN servers. If you're connecting to a non-local server, you may need to add additional ATS exceptions.
