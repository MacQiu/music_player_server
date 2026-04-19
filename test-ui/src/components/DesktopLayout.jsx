import { useState } from 'react';
import Sidebar from './Sidebar';
import DesktopPlayer from './DesktopPlayer';
import UploadModal from './UploadModal';
import ServerModal from './ServerModal';
import QueueSidebar from './QueueSidebar';
import LyricsOverlay from './LyricsOverlay';
import PlaylistOverlay from './PlaylistOverlay';
import DesktopHome from '../pages/DesktopHome';
import DesktopLibrary from '../pages/DesktopLibrary';
import DesktopAnalytics from '../pages/DesktopAnalytics';

export default function DesktopLayout({
  songs, analytics, playlists, artists, online,
  onRefreshSongs, onRefreshAnalytics, onRefreshPlaylists, onRefreshArtists,
  refreshSongs, refreshArtists,
  openPlaylistId, setOpenPlaylistId,
  playing, currentTime, duration, volume, toggle, seek, setVolume,
  currentSong, sourceList, sourceIndex, manualQueue,
  repeatMode, shuffleEnabled,
  playSong, playNext, playPrevious, addToQueue, removeFromQueue,
  reorderQueue, toggleRepeat, toggleShuffle, handleSongEnd, jumpToQueueIndex,
}) {
  const [view, setView] = useState('home');
  const [showUpload, setShowUpload] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

  const renderMain = () => {
    switch (view) {
      case 'home':
        return <DesktopHome songs={songs} analytics={analytics} playlists={playlists} artists={artists}
          onPlay={song => playSong(song, songs)} addToQueue={addToQueue}
          onRefreshPlaylists={onRefreshPlaylists} setView={setView}
          onOpenPlaylist={setOpenPlaylistId} refreshArtists={refreshArtists} />;
      case 'library':
        return <DesktopLibrary songs={songs} onPlay={song => playSong(song, songs)}
          addToQueue={addToQueue} onRefreshSongs={refreshSongs} playlists={playlists}
          manualQueue={manualQueue} removeFromQueue={removeFromQueue} />;
      case 'analytics':
        return <DesktopAnalytics analytics={analytics} />;
      default:
        return <DesktopHome songs={songs} analytics={analytics} playlists={playlists} artists={artists}
          onPlay={song => playSong(song, songs)} addToQueue={addToQueue}
          onRefreshPlaylists={onRefreshPlaylists} setView={setView}
          onOpenPlaylist={setOpenPlaylistId} refreshArtists={refreshArtists} />;
    }
  };

  return (
    <div className="desktop">
      <div className="desktop__body">
        <Sidebar view={view} setView={setView} playlists={playlists}
          onOpenUpload={() => setShowUpload(true)} onOpenServer={() => setShowServer(true)}
          onRefreshPlaylists={onRefreshPlaylists} onOpenPlaylist={setOpenPlaylistId} />
        <main className={`desktop__main ${showQueue ? 'desktop__main--queue-open' : ''}`}>
          {showLyrics && currentSong ? (
            <LyricsOverlay song={currentSong} onClose={() => setShowLyrics(false)} />
          ) : renderMain()}
        </main>
        {showQueue && (
          <QueueSidebar currentSong={currentSong} sourceList={sourceList} sourceIndex={sourceIndex}
            manualQueue={manualQueue} onClose={() => setShowQueue(false)}
            removeFromQueue={removeFromQueue} reorderQueue={reorderQueue}
            jumpToQueueIndex={jumpToQueueIndex} playSong={playSong} />
        )}
      </div>
      <DesktopPlayer
        song={currentSong}
        playing={playing} currentTime={currentTime} duration={duration}
        volume={volume} toggle={toggle} seek={seek} setVolume={setVolume}
        repeatMode={repeatMode} shuffleEnabled={shuffleEnabled}
        onNext={playNext} onPrevious={playPrevious}
        onToggleRepeat={toggleRepeat} onToggleShuffle={toggleShuffle}
        onToggleQueue={() => setShowQueue(v => !v)}
        onToggleLyrics={() => setShowLyrics(v => !v)}
        online={online} showQueue={showQueue} showLyrics={showLyrics}
      />
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={() => { refreshSongs(); refreshArtists?.(); }} />}
      {showServer && <ServerModal onClose={() => setShowServer(false)} online={online} onRefreshSongs={onRefreshSongs} onRefreshAnalytics={onRefreshAnalytics} />}
      {openPlaylistId && (
        <div className="modal-backdrop" onClick={() => setOpenPlaylistId(null)}>
          <div className="playlist-overlay-desktop" onClick={e => e.stopPropagation()}>
            <PlaylistOverlay playlistId={openPlaylistId} onClose={() => setOpenPlaylistId(null)}
              songs={songs} playSong={playSong} addToQueue={addToQueue}
              refreshPlaylists={onRefreshPlaylists} refreshSongs={refreshSongs} />
          </div>
        </div>
      )}
    </div>
  );
}
