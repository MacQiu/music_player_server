import { useState, useEffect, useCallback, useRef } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import Sidebar from './Sidebar';
import DesktopPlayer from './DesktopPlayer';
import UploadModal from './UploadModal';
import ServerModal from './ServerModal';
import NowPlayingPanel from './NowPlayingPanel';
import LyricsOverlay from './LyricsOverlay';
import PlaylistView from './PlaylistView';
import ArtistView from './ArtistView';
import SearchView from './SearchView';
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
  const [view, setView] = useState({ page: 'home' });
  const [viewHistory, setViewHistory] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [rightPanel, setRightPanel] = useState(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [topbarSearch, setTopbarSearch] = useState('');
  const mainRef = useRef(null);


  const navigate = useCallback((newView) => {
    setView(prev => {
      const sameKind = prev.page === newView.page;
      if (!sameKind) {
        setViewHistory(h => [...h, prev]);
      }
      return newView;
    });
    mainRef.current?.scrollTo(0, 0);
  }, []);

  const goBack = useCallback(() => {
    setViewHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setView(prev);
      return h.slice(0, -1);
    });
  }, []);

  const navigateTo = useCallback((page) => {
    setView(prev => {
      if (prev.page === page) return prev;
      setViewHistory([]);
      return { page };
    });
    mainRef.current?.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (openPlaylistId) {
      navigate({ page: 'playlist', id: openPlaylistId });
      setOpenPlaylistId(null);
    }
  }, [openPlaylistId, navigate, setOpenPlaylistId]);

  useEffect(() => {
    if (openArtistName) {
      navigate({ page: 'artist', name: openArtistName });
      setOpenArtistName(null);
    }
  }, [openArtistName, navigate, setOpenArtistName]);

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

  const handleOpenPlaylist = useCallback((id) => {
    navigate({ page: 'playlist', id });
  }, [navigate]);

  const handleOpenArtist = useCallback((name) => {
    navigate({ page: 'artist', name });
  }, [navigate]);

  const toggleRightPanel = useCallback((mode) => {
    setRightPanel(prev => prev === mode ? null : mode);
  }, []);


  const handleTopbarSearch = useCallback((value) => {
    setTopbarSearch(value);
    if (value) {
      navigateTo('search');
    }
  }, [navigateTo]);

  const renderMain = () => {
    if (showLyrics && currentSong) {
      return <LyricsOverlay song={currentSong} onClose={() => setShowLyrics(false)}
        currentTime={currentTime} audioRef={audioRef} />;
    }

    switch (view.page) {
      case 'home':
        return <DesktopHome songs={songs} analytics={analytics} playlists={playlists} artists={artists}
          onPlay={song => playSong(song, songs)} addToQueue={addToQueue}
          onRefreshPlaylists={onRefreshPlaylists}
          onOpenPlaylist={handleOpenPlaylist} onOpenArtist={handleOpenArtist}
          refreshArtists={refreshArtists} imgVersion={imgVersion} bumpImgVersion={bumpImgVersion} />;
      case 'library':
        return <DesktopLibrary songs={songs} onPlay={song => playSong(song, songs)}
          addToQueue={addToQueue} onRefreshSongs={refreshSongs} playlists={playlists}
          manualQueue={manualQueue} removeFromQueue={removeFromQueue}
          currentSong={currentSong}
          imgVersion={imgVersion} bumpImgVersion={bumpImgVersion} />;
      case 'analytics':
        return <DesktopAnalytics analytics={analytics} />;
      case 'dev':
        return <DesktopDevTools songs={songs} onRefreshAnalytics={onRefreshAnalytics} onRefreshPlaylists={onRefreshPlaylists} />;
      case 'playlist':
        return <PlaylistView playlistId={view.id} onBack={goBack}
          songs={songs} playSong={playSong} addToQueue={addToQueue}
          currentSong={currentSong}
          refreshPlaylists={onRefreshPlaylists} refreshSongs={refreshSongs}
          imgVersion={imgVersion} />;
      case 'artist':
        return <ArtistView artistName={view.name} onBack={goBack}
          songs={songs} artists={artists} playSong={playSong} addToQueue={addToQueue}
          currentSong={currentSong}
          refreshArtists={refreshArtists} onOpenPlaylist={handleOpenPlaylist}
          imgVersion={imgVersion} bumpImgVersion={bumpImgVersion} />;
      case 'search':
        return <SearchView songs={songs} artists={artists} playlists={playlists}
          onPlay={song => playSong(song, songs)} addToQueue={addToQueue}
          onOpenPlaylist={handleOpenPlaylist} onOpenArtist={handleOpenArtist}
          imgVersion={imgVersion} initialQuery={topbarSearch} />;
      default:
        return <DesktopHome songs={songs} analytics={analytics} playlists={playlists} artists={artists}
          onPlay={song => playSong(song, songs)} addToQueue={addToQueue}
          onRefreshPlaylists={onRefreshPlaylists}
          onOpenPlaylist={handleOpenPlaylist} onOpenArtist={handleOpenArtist}
          refreshArtists={refreshArtists} imgVersion={imgVersion} bumpImgVersion={bumpImgVersion} />;
    }
  };

  return (
    <div className="desktop">
      {/* Top ribbon bar */}
      <div className="desktop__topbar">
        <span className="topbar__title">KillerTunes</span>
        <div className="topbar__center">
          <button className={`topbar__btn ${view.page === 'home' ? 'topbar__btn--active' : ''}`}
            onClick={() => navigateTo('home')} title="Home">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3l9-8z"/></svg>
          </button>
          <div className="topbar__search">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className="topbar__search-icon">
              <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input placeholder="What do you want to play?" value={topbarSearch}
              onChange={(e) => handleTopbarSearch(e.target.value)}
              onFocus={() => { if (view.page !== 'search') navigateTo('search'); }} />
          </div>
          <button className={`topbar__btn ${view.page === 'library' ? 'topbar__btn--active' : ''}`}
            onClick={() => navigateTo('library')} title="All Songs">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"/></svg>
          </button>
        </div>
        <div className="topbar__right">
          <button className={`topbar__btn ${view.page === 'analytics' ? 'topbar__btn--active' : ''}`}
            onClick={() => navigateTo('analytics')} title="Analytics">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/></svg>
          </button>
          <button className="topbar__btn" onClick={() => setShowUpload(true)} title="Upload Song">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
          </button>
          <button className="topbar__btn" onClick={() => setShowServer(true)} title="Server">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z"/></svg>
          </button>
        </div>
      </div>

      <div className="desktop__body">
        <PanelGroup orientation="horizontal">
          <Panel
            id="left"
            defaultSize={sidebarCollapsed ? 72 : "16%"}
            minSize={sidebarCollapsed ? 72 : 250}
            maxSize={sidebarCollapsed ? 72 : "28%"}
          >
            <Sidebar
              view={view} navigateTo={navigateTo}
              playlists={playlists} artists={artists} songs={songs}
              onRefreshPlaylists={onRefreshPlaylists}
              onOpenPlaylist={handleOpenPlaylist}
              onOpenArtist={handleOpenArtist}
              devMode={devMode}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(v => !v)}
              imgVersion={imgVersion}
              currentSong={currentSong}
            />
          </Panel>

          <PanelResizeHandle className="resize-handle" />

          <Panel id="center" minSize="30%">
            <main className="desktop__main" ref={mainRef}>
              {renderMain()}
            </main>
          </Panel>

          {rightPanel && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="right" defaultSize="15%" minSize="15%" maxSize="35%">
                <NowPlayingPanel
                  mode={rightPanel}
                  onModeChange={setRightPanel}
                  onClose={() => setRightPanel(null)}
                  currentSong={currentSong}
                  sourceList={sourceList}
                  sourceIndex={sourceIndex}
                  manualQueue={manualQueue}
                  removeFromQueue={removeFromQueue}
                  reorderQueue={reorderQueue}
                  jumpToQueueIndex={jumpToQueueIndex}
                  playSong={playSong}
                  imgVersion={imgVersion}
                />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      <DesktopPlayer
        song={currentSong}
        playing={playing} currentTime={currentTime} duration={duration}
        volume={volume} toggle={toggle} seek={seek} setVolume={setVolume}
        repeatMode={repeatMode} shuffleEnabled={shuffleEnabled}
        onNext={playNext} onPrevious={playPrevious}
        onToggleRepeat={toggleRepeat} onToggleShuffle={toggleShuffle}
        onToggleQueue={() => toggleRightPanel('queue')}
        onToggleDetails={() => toggleRightPanel('details')}
        onToggleLyrics={() => setShowLyrics(v => !v)}
        online={online}
        showQueue={rightPanel === 'queue'}
        showDetails={rightPanel === 'details'}
        showLyrics={showLyrics}
        imgVersion={imgVersion}
      />

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={() => { refreshSongs(); refreshArtists?.(); bumpImgVersion(); }} songs={songs} />}
      {showServer && <ServerModal onClose={() => setShowServer(false)} online={online} onRefreshSongs={onRefreshSongs} onRefreshAnalytics={onRefreshAnalytics} />}
    </div>
  );
}
