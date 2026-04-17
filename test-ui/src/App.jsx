import { useState, useEffect, useCallback } from 'react';
import { getSongs, getAnalytics, ping } from './api/client';

import Player from './components/Player';
import Home from './pages/Home';
import Library from './pages/Library';
import Analytics from './pages/Analytics';
import Sync from './pages/Sync';
import Dashboard from './pages/Dashboard';

const MOBILE_TABS = ['Home', 'Library', 'Analytics', 'Sync'];

export default function App() {
  const [mode, setMode] = useState('mobile'); // 'mobile' | 'desktop'
  const [tab, setTab] = useState('Home');

  const [songs, setSongs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [currentSong, setCurrentSong] = useState(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState(null);

  const refreshSongs = useCallback(async () => {
    try {
      const data = await getSongs();
      setSongs(data);
      setError(null);
    } catch (err) {
      setError(`Failed to load songs: ${err.message}`);
    }
  }, []);

  const refreshAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const data = await getAnalytics();
      setAnalytics(data);
    } catch {
      // analytics unavailable — not fatal
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const checkOnline = useCallback(async () => {
    try {
      await ping();
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    checkOnline();
    refreshSongs();
    refreshAnalytics();
    const id = setInterval(checkOnline, 15000);
    return () => clearInterval(id);
  }, [checkOnline, refreshSongs, refreshAnalytics]);

  const playSong = (song) => setCurrentSong(song);

  const renderMobileTab = () => {
    switch (tab) {
      case 'Home':
        return <Home songs={songs} analytics={analytics} onPlay={playSong} />;
      case 'Library':
        return <Library songs={songs} onPlay={playSong} />;
      case 'Analytics':
        return <Analytics analytics={analytics} loading={analyticsLoading} />;
      case 'Sync':
        return <Sync online={online} onRefreshSongs={(d) => setSongs(d)} />;
      default:
        return null;
    }
  };

  return (
    <div className="app">
      {/* Mode switcher */}
      <header className="app-header">
        <h1 className="app-header__title">Music Player Test UI</h1>
        <div className="mode-toggle">
          <button
            className={`btn ${mode === 'mobile' ? 'btn--active' : ''}`}
            onClick={() => setMode('mobile')}
          >
            Mobile
          </button>
          <button
            className={`btn ${mode === 'desktop' ? 'btn--active' : ''}`}
            onClick={() => setMode('desktop')}
          >
            Desktop
          </button>
          <span className={`header-status ${online ? 'header-status--on' : 'header-status--off'}`}>
            {online ? 'Server Online' : 'Server Offline'}
          </span>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {mode === 'mobile' ? (
        <div className="phone-frame">
          <div className="phone-frame__screen">
            <div className="phone-frame__content">
              {renderMobileTab()}
            </div>
            <Player song={currentSong} onEnded={() => {}} />
            <nav className="tab-bar">
              {MOBILE_TABS.map((t) => (
                <button
                  key={t}
                  className={`tab-bar__item ${tab === t ? 'tab-bar__item--active' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </nav>
          </div>
        </div>
      ) : (
        <Dashboard
          songs={songs}
          analytics={analytics}
          onRefreshSongs={(d) => setSongs(d)}
          onRefreshAnalytics={refreshAnalytics}
        />
      )}
    </div>
  );
}
