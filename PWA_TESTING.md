# PWA Testing Checklist

Everything to test for the `mobile_pwa/` app and the server changes that support it (HTTPS on port 5443, CORS headers). Check items off as you go. Items marked *(verified on desktop)* already passed in a desktop browser against `http://127.0.0.1:5000`; they still need a pass on the iPhone.

Use `<PC-IP>` for your PC's Wi-Fi address (from `ipconfig`).

---

## 1. Server

- [ ] `python app.py` without a `certs/` folder logs `HTTPS disabled` and still serves `http://localhost:5000/ping`.
- [ ] After creating `certs/cert.pem` and `certs/key.pem` with mkcert (README steps 1–2), `python app.py` logs `HTTPS listening on https://0.0.0.0:5443`.
- [ ] On the PC, `https://localhost:5443/ping` opens in a browser with no certificate warning.
- [ ] **Desktop UI still works:** `cd desktop-server && npm run dev` loads songs, plays audio, saves lyrics (it uses http :5000).
- [ ] **Expo app still works** against `http://<PC-IP>:5000` (if you still use it).
- [ ] Windows Firewall allows port 5443 on the private network (the iPhone can reach it; see section 2).

## 2. iPhone certificate trust

- [ ] `rootCA.crt` (copied from `mkcert -CAROOT`) installs under **Settings → General → VPN & Device Management**.
- [ ] Full trust is turned on under **Settings → General → About → Certificate Trust Settings**.
- [ ] Safari on the iPhone opens `https://<PC-IP>:5443/ping` with no warning and shows JSON.

## 3. Deploy to GitHub Pages

- [ ] Repo **Settings → Pages → Source** is set to **GitHub Actions**.
- [ ] Merging to `main` (or running the workflow by hand) makes "Deploy PWA to GitHub Pages" pass.
- [ ] `https://macqiu.github.io/music_player_server/` loads, with icons, fonts and styles (no 404s from a wrong base path).
- [ ] A later change under `mobile_pwa/` redeploys automatically.

## 4. First launch and install

- [ ] The setup screen appears; entering `https://<PC-IP>:5443` and tapping Connect loads the library.
- [ ] An `http://` address shows the warning in **Sync → Server Settings**.
- [ ] **Share → Add to Home Screen** shows the Spectrum icon and name.
- [ ] Launching from the Home Screen opens full screen (no Safari bars). The status bar and notch/home-indicator areas don't cover content.
- [ ] Pinch-zoom and double-tap zoom are disabled. Text inputs don't zoom the page when focused.

## 5. Screens (connected to the server)

**Home** *(verified on desktop)*
- [ ] Greeting, recently played grid, artists, playlists, wrapped and recommended sections show with covers.
- [ ] Tapping a song plays it. Tapping an artist or playlist opens it.
- [ ] Creating a new playlist from the Playlists section works.
- [ ] Pull-to-refresh works.

**Library**
- [ ] Filter chips work: All, Playlists, Artists, Wrapped, Songs. Search filters the list.
- [ ] The Songs filter shows sort pills (title, artist, duration) with ascending/descending toggles.
- [ ] The song "…" menu works: Play, Add to Queue, Set Cover (photo picker), Download/Remove download, Add to Playlist.
- [ ] Long-press enters multi-select. Select All, Add to Playlist, Download and Delete Local work. The X exits.
- [ ] Download progress (%) shows on the song row while downloading.

**Playlist**
- [ ] Hero cover, name, song count and duration are shown.
- [ ] Tap the name to rename. Add songs via the + panel (search works). Delete playlist (with confirm).
- [ ] Pencil enters reorder mode. Dragging a row by its handle reorders it, and the order survives reopening.
- [ ] The song "…" menu works: Play Now, Add to Queue, Move Up/Down, Remove (with confirm).
- [ ] Long-press multi-select works: Remove, Add to (another) playlist, Download, Delete Local.
- [ ] Wrapped playlists are read-only (no edit controls) and show plays and listening time per song.
- [ ] Play button plays the playlist from the top.

**Artist**
- [ ] Hero image, name and track count are shown. Tapping the hero uploads a new image (photo picker), and it updates.
- [ ] Popular shows the top 5. "Show all" expands to 20. The "…" button adds to queue.
- [ ] "From this artist" album row scrolls sideways. Tapping an album plays it.

**Analytics**
- [ ] Stat cards and charts render. The wrapped year selector switches years.
- [ ] Pull-to-refresh works.

**Sync** *(verified on desktop)*
- [ ] Server status reads Online.
- [ ] Sync shows the pending play-log count and clears it.
- [ ] Fetch Songs and Refresh All work.
- [ ] **Download All for Offline** asks to confirm, shows progress and ends with "N downloaded".
- [ ] The **Device Storage** card shows usage and quota, and "persistent" once installed to the Home Screen.

**Upload**
- [ ] Pick a cover (preview shows) and an audio file (.mp3/.wav), fill in metadata, and upload. The song appears in the library with its cover.

**Settings**
- [ ] Test Connection reports success or failure without changing the saved address.
- [ ] Save switches servers and the status updates.

## 6. Player and playback (iPhone)

- [ ] The first tap on a song starts audio. Next/previous and auto-advance keep playing without another tap.
- [ ] Mini player shows the cover, title and progress. Play/pause works. Tapping it opens the full player.
- [ ] Full player: cover pans while playing, the seek slider drags smoothly, swipe down dismisses it.
- [ ] Previous restarts the song if more than 3 s in; otherwise it goes to the previous song.
- [ ] Shuffle on/off. Repeat cycles off → playlist → song (shows the "1"), and each mode behaves correctly at song end.
- [ ] **Queue:** Previously in Queue, Now Playing, Added to Queue and Playing Next show. Dragging reorders Added to Queue, X removes, tapping jumps.
- [ ] **Lock screen / Control Center** shows title, artist and artwork. Play/pause, next, previous and scrubbing work.
- [ ] Audio keeps playing with the screen locked and while using another app.
- [ ] AirPods/Bluetooth play/pause and skip work.
- [ ] After an interruption (phone call, Siri, another app's audio), playback can be resumed.
- [ ] Play counts go up on the server (check desktop Analytics) after listening.

## 7. Lyrics

- [ ] Synced lyrics highlight the current line and auto-scroll. Tapping a line seeks there. *(verified on desktop)*
- [ ] Set tabs switch between sets. The legend (i) shows singer colors. *(verified on desktop)*
- [ ] Plain (untimed) lyrics display as text.
- [ ] A song with no lyrics shows "No lyrics available" with an Add Lyrics button.
- [ ] **Edit:** Edit Text → Apply Text, Sync Timestamps → Stamp each line → Save. Reopening shows the new timestamps (desktop too).
- [ ] **+ New** set with a label creates the set with timestamps auto-copied from the primary set.

## 8. Offline (PC off, or iPhone on cellular / airplane mode)

- [ ] **Cold launch offline:** force-quit the app, turn the server off, and relaunch from the Home Screen. The app opens. *(verified on desktop)*
- [ ] Server status shows Offline. Library, playlists, artists and analytics show cached data with covers. *(verified on desktop)*
- [ ] Downloaded songs play. Seeking works. Auto-advance moves to the next downloaded song. *(verified on desktop)*
- [ ] Non-downloaded songs are skipped automatically. With nothing downloaded in the queue, it stops instead of looping forever.
- [ ] Playlists open offline, even ones you never opened while online. *(verified on desktop)*
- [ ] Artist pages and their hero images work offline. *(verified on desktop)*
- [ ] Synced lyrics for downloaded songs work offline. *(verified on desktop)*
- [ ] Server-only actions (upload, rename, playlist edits, lyric save, artist image) show an "offline" message instead of hanging.
- [ ] Delete Local on a downloaded song frees space (Device Storage card drops) and the song stops playing offline.
- [ ] Lock-screen controls and background audio also work offline.

## 9. Persistence

- [ ] Force-quit mid-song and relaunch. The same song, position and queue (including manual queue, shuffle and repeat) are restored, paused. *(verified on desktop via reload)*
- [ ] Downloads, library and server address survive a force-quit, an iPhone restart, and a few days without opening the app.
- [ ] Device Storage says the storage is persistent.

## 10. Reconnect and sync

- [ ] Listen to songs offline, then turn the server back on with the phone on home Wi-Fi. Within about 15 s (or when you reopen the app) the status goes Online and pending play logs reach 0.
- [ ] The offline plays show in the server's Analytics with the correct times.
- [ ] Changes made on desktop while the phone was away (new song, new cover, renamed playlist) appear after reconnecting.

## 11. Updates and edge cases

- [ ] After a new deploy, closing and reopening the app loads the new version without losing downloads.
- [ ] If the PC's IP changes: regenerate the cert for the new IP, update the address in Settings, and it reconnects.
- [ ] Large libraries: Download All on many songs finishes. If storage fills up, failures are reported rather than crashing.
- [ ] Leaving the app mid-download, then returning: the partial batch reports failures, and rerunning Download All finishes the rest.
