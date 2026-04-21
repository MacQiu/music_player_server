import { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar';
import DesktopPlayer from './DesktopPlayer';
import UploadModal from './UploadModal';
import ServerModal from './ServerModal';
import QueueSidebar from './QueueSidebar';
import LyricsOverlay from './LyricsOverlay';
import PlaylistOverlay from './PlaylistOverlay';
import ArtistOverlay from './ArtistOverlay';
import DesktopHome from '../pages/DesktopHome';
import DesktopLibrary from '../pages/DesktopLibrary';
import DesktopAnalytics from '../pages/DesktopAnalytics';
import DesktopDevTools from '../pages/DesktopDevTools';

export default function DesktopLayout({
  songs, analytics, playlists, artists, online,
  onRefreshSongs, onRefreshAnalytics, onRefreshPlaylists, onRefreshArtists,
  refreshSongs, refreshArtists,
  openPlaylistId, setOpenPlaylistId,
  openArtistName, setOpenArtistName,
  imgVersion, bumpImgVersion,
  audioRef,
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
  const [devMode, setDevMode] = useState(false);

  const toggleDevMode = useCallback(() => setDevMode(v => !v), []);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        toggleDevMode();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleDevMode]);

  const renderMain = () => {
    switch (view) {
      case 'home':
        return <DesktopHome songs={songs} analytics={analytics} playlists={playlists} artists={artists}
          onPlay={song => playSong(song, songs)} addToQueue={addToQueue}
          onRefreshPlaylists={onRefreshPlaylists} setView={setView}
          onOpenPlaylist={setOpenPlaylistId} onOpenArtist={setOpenArtistName}
          refreshArtists={refreshArtists} imgVersion={imgVersion} bumpImgVersion={bumpImgVersion} />;
      case 'library':
        return <DesktopLibrary songs={songs} onPlay={song => playSong(song, songs)}
          addToQueue={addToQueue} onRefreshSongs={refreshSongs} playlists={playlists}
          manualQueue={manualQueue} removeFromQueue={removeFromQueue}
          imgVersion={imgVersion} bumpImgVersion={bumpImgVersion} />;
      case 'analytics':
        return <DesktopAnalytics analytics={analytics} />;
      case 'dev':
        return <DesktopDevTools songs={songs} onRefreshAnalytics={onRefreshAnalytics} onRefreshPlaylists={onRefreshPlaylists} />;
      default:
        return <DesktopHome songs={songs} analytics={analytics} playlists={playlists} artists={artists}
          onPlay={song => playSong(song, songs)} addToQueue={addToQueue}
          onRefreshPlaylists={onRefreshPlaylists} setView={setView}
          onOpenPlaylist={setOpenPlaylistId} onOpenArtist={setOpenArtistName}
          refreshArtists={refreshArtists} imgVersion={imgVersion} bumpImgVersion={bumpImgVersion} />;
    }
  };

  return (
    <div className="desktop">
      <div className="desktop__body">
        <Sidebar view={view} setView={setView} playlists={playlists}
          onOpenUpload={() => setShowUpload(true)} onOpenServer={() => setShowServer(true)}
          onRefreshPlaylists={onRefreshPlaylists} onOpenPlaylist={setOpenPlaylistId}
          devMode={devMode} toggleDevMode={toggleDevMode} />
        <main className={`desktop__main ${showQueue ? 'desktop__main--queue-open' : ''}`}>
          {showLyrics && currentSong ? (
            <LyricsOverlay song={currentSong} onClose={() => setShowLyrics(false)}
              currentTime={currentTime} audioRef={audioRef} />
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
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={() => { refreshSongs(); refreshArtists?.(); bumpImgVersion(); }} songs={songs} />}
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
      {openArtistName && (
        <div className="modal-backdrop" onClick={() => setOpenArtistName(null)}>
          <div className="playlist-overlay-desktop" onClick={e => e.stopPropagation()}>
            <ArtistOverlay artistName={openArtistName} songs={songs} artists={artists}
              onClose={() => setOpenArtistName(null)} playSong={playSong}
              addToQueue={addToQueue} refreshArtists={refreshArtists}
              imgVersion={imgVersion} />
          </div>
        </div>
      )}
    </div>
  );
}
