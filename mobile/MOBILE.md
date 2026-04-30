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

You can also use `npm run start` instead of `npx expo start` -- they do the same thing.

> **Common mistake:** `npm expo start` will not work. `expo` is not an npm subcommand. You need either `npx expo start` (npx runs the expo binary from node_modules) or `npm run start` (npm runs the "start" script from package.json, which calls expo).

This will display a QR code in the terminal. Open the camera app on your iPhone and scan it -- it will open directly in Expo Go.

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

### Install issues

**`npm install` fails with ERESOLVE peer dependency conflict** -- This happens when npm's strict dependency resolver finds mismatched peer dependencies between React and React DOM versions in the Expo ecosystem. The `.npmrc` file in this project is set to `legacy-peer-deps=true` to handle this automatically. If you deleted `.npmrc` or are seeing this error:

1. Make sure `mobile/.npmrc` exists and contains `legacy-peer-deps=true`
2. Delete `node_modules` and `package-lock.json`
3. Run `npm install` again

This is standard practice for Expo/React Native projects -- the ecosystem frequently has minor version mismatches in peer deps that don't cause actual problems.

**"Unknown command: expo"** -- You probably ran `npm expo start`. The correct command is `npx expo start` or `npm run start`. See the Getting Started section above.

### Build / Babel errors

**`Cannot find module 'react-native-worklets/plugin'`** -- `react-native-reanimated` v4.x extracted its Babel plugin into a separate `react-native-worklets` package. If this package is missing, Metro will fail to bundle immediately. Fix:

```bash
npx expo install react-native-worklets@0.5.1
npx expo start -c
```

The version must be `0.5.1` for Expo SDK 54 / Expo Go -- newer versions (0.6+) will cause a native/JS mismatch error because Expo Go ships with precompiled native code matching 0.5.x. Do **not** add `react-native-worklets/plugin` to `babel.config.js` manually; `babel-preset-expo` already includes it automatically, and duplicating it causes a "Duplicate plugin" error.

### Runtime issues

**"Network request failed"** -- Your phone can't reach the server. Check that:
1. Both devices are on the same Wi-Fi network
2. The server IP and port are correct in settings
3. The Flask backend is running (`python app.py`)
4. No firewall is blocking port 5000

**Audio doesn't play** -- Make sure your phone isn't in silent mode and the volume is up. Expo Go should handle background audio automatically.

**QR code won't scan** -- Try pressing `s` in the terminal to switch to Expo Go mode, or manually enter the URL shown in the terminal into the Expo Go app's search bar.

### LAN connectivity ("internet connection appears to be offline")

If you scan the QR code in Expo Go and it says the internet connection appears to be offline (or times out), but the Metro server is running and accessible via `localhost` in a browser, the issue is that your phone can't reach the computer over the local network.

**Quick workaround -- use tunnel mode:**

```bash
npx expo start --tunnel
```

This routes traffic through Expo's cloud servers, bypassing local network issues entirely. It's slower but always works.

**Diagnosing the LAN issue:**

1. **Find your computer's LAN IP** -- Run `ipconfig` (Windows) or `ifconfig` (macOS). Look for your Wi-Fi adapter's IPv4 address (e.g. `10.0.0.122` or `192.168.1.x`).

2. **Test from the phone** -- Open `http://<YOUR_LAN_IP>:8081` in your phone's browser while Metro is running. If you get a JSON response, the network path is open. If it times out, something is blocking it.

3. **Check Windows Firewall** -- Node.js usually gets inbound allow rules automatically (you may have seen a prompt the first time you ran it). Verify in PowerShell (requires admin):
   ```powershell
   Get-NetFirewallRule -DisplayName "*node*" | Select DisplayName, Enabled, Direction, Action
   ```
   If no rules exist, create one:
   ```powershell
   New-NetFirewallRule -DisplayName "Expo Metro Bundler" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow
   ```

4. **AP / Client Isolation (most common cause)** -- Many routers (especially on 5GHz bands or guest networks) enable client isolation, which prevents devices on the same network from communicating with each other. Check your router admin panel (typically `http://10.0.0.1` or `http://192.168.1.1`) and look for settings like:
   - "AP Isolation" / "Client Isolation" / "Station Isolation"
   - "Guest Network" mode (always has isolation)
   - Separate 2.4GHz and 5GHz networks with different subnets

5. **Same network, same band** -- Make sure both devices are connected to the exact same SSID. Some routers create separate 2.4GHz and 5GHz networks (e.g. `MyNetwork` vs `MyNetwork-5G`) that use different subnets.

6. **Try phone hotspot** -- As a definitive test, have your **phone** create a Wi-Fi hotspot and connect your **computer** to it. Then run `npx expo start --host lan`. If it works over hotspot, the issue is your router's configuration.

7. **VPN/proxy** -- Any VPN or proxy on either device can intercept or block local network traffic. Disable them and try again.

## npm audit vulnerabilities

Running `npm audit` will report moderate severity vulnerabilities. These are **safe to ignore** -- here's why:

- **postcss < 8.5.10** (XSS in CSS stringify output) -- This is inside `@expo/metro-config`, which is the Metro bundler used at build time only. The vulnerability requires processing untrusted CSS input, which Metro does not do. It has no runtime or production impact on your app.

- **uuid < 14.0.0** (buffer bounds check in v3/v5/v6) -- This is inside `xcode`, a build tool used by `@expo/config-plugins` for native iOS project generation. The vulnerability only triggers when calling `uuid.v5()` with a user-supplied buffer argument, which the Expo toolchain does not do.

Both are deep transitive dependencies in Expo's build tools, not in your app code. **Do not run `npm audit fix --force`** -- it will suggest downgrading Expo from v54 to v49, which would break the entire project. This is a well-known limitation of `npm audit` in the React Native ecosystem where build-time tooling deps get flagged despite having no actual attack surface in a mobile app.
