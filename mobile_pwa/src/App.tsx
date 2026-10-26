import { useEffect, useState, type ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { IoHome, IoMusicalNotes, IoBarChart, IoSync } from 'react-icons/io5';
import { PlayerProvider } from './contexts/PlayerContext';
import { DataProvider } from './contexts/DataContext';
import { NavigationProvider, useNav, type TabName, type StackEntry } from './navigation/Navigator';
import { loadServerUrl, saveServerUrl } from './api/client';
import MiniPlayer from './components/MiniPlayer';
import HomeScreen from './screens/Home';
import LibraryScreen from './screens/Library';
import AnalyticsScreen from './screens/Analytics';
import SyncScreen from './screens/Sync';
import PlayerScreen from './screens/Player';
import QueueScreen from './screens/Queue';
import LyricsScreen from './screens/Lyrics';
import UploadScreen from './screens/Upload';
import SettingsScreen from './screens/Settings';
import PlaylistScreen from './screens/Playlist';
import ArtistScreen from './screens/Artist';

const TABS: { name: TabName; label: string; icon: IconType }[] = [
  { name: 'index', label: 'Home', icon: IoHome },
  { name: 'library', label: 'Library', icon: IoMusicalNotes },
  { name: 'analytics', label: 'Analytics', icon: IoBarChart },
  { name: 'sync', label: 'Sync', icon: IoSync },
];

function ServerSetup({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState('');

  const submit = async () => {
    if (!url.trim()) return;
    await saveServerUrl(url.trim());
    onDone();
  };

  return (
    <div className="setup">
      <div className="setup-title">Spectrum</div>
      <div className="setup-sub">Enter your server address</div>
      <input
        className="setup-input"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder="https://192.168.1.42:5443"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="url"
      />
      <button className="setup-btn" disabled={!url.trim()} onClick={submit}>Connect</button>
      <div className="setup-hint">
        Use your PC's Wi-Fi address with <b>https://</b> and port <b>5443</b>.
        Safari blocks plain http:// servers from this page.
      </div>
    </div>
  );
}

function TabBar() {
  const { tab, setTab, push } = useNav();
  return (
    <div className="tab-footer">
      <MiniPlayer onPress={() => push({ name: 'player' })} />
      <nav className="tab-bar">
        {TABS.map(t => {
          const focused = tab === t.name;
          const Icon = t.icon;
          return (
            <button key={t.name} className={`tab-item ${focused ? 'focused' : ''}`} onClick={() => setTab(t.name)}>
              <Icon size={22} />
              <span className="tab-label">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function ModalLayer({ entry, index }: { entry: StackEntry; index: number }) {
  const r = entry.route;
  let content: ReactNode = null;
  switch (r.name) {
    case 'player': content = <PlayerScreen />; break;
    case 'queue': content = <QueueScreen />; break;
    case 'lyrics': content = <LyricsScreen />; break;
    case 'upload': content = <UploadScreen />; break;
    case 'settings': content = <SettingsScreen />; break;
    case 'playlist': content = <PlaylistScreen id={r.id} />; break;
    case 'artist': content = <ArtistScreen artistName={r.artist} />; break;
  }
  return (
    <div className={`modal-layer ${entry.closing ? 'closing' : ''}`} style={{ zIndex: 100 + index }}>
      {content}
    </div>
  );
}

function Shell() {
  const { tab, stack } = useNav();
  const [mounted, setMounted] = useState<Set<TabName>>(new Set(['index']));

  useEffect(() => {
    setMounted(prev => (prev.has(tab) ? prev : new Set([...prev, tab])));
  }, [tab]);

  return (
    <div className="app">
      <div className="tab-content">
        {mounted.has('index') && <div className="tab-scene" hidden={tab !== 'index'}><HomeScreen /></div>}
        {mounted.has('library') && <div className="tab-scene" hidden={tab !== 'library'}><LibraryScreen /></div>}
        {mounted.has('analytics') && <div className="tab-scene" hidden={tab !== 'analytics'}><AnalyticsScreen /></div>}
        {mounted.has('sync') && <div className="tab-scene" hidden={tab !== 'sync'}><SyncScreen /></div>}
      </div>
      <TabBar />
      {stack.map((entry, i) => <ModalLayer key={entry.key} entry={entry} index={i} />)}
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [hasServer, setHasServer] = useState(false);

  useEffect(() => {
    loadServerUrl().then(url => {
      setHasServer(!!url);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return <div className="boot"><div className="spinner spinning" /></div>;
  }

  if (!hasServer) {
    return <ServerSetup onDone={() => setHasServer(true)} />;
  }

  return (
    <PlayerProvider>
      <DataProvider>
        <NavigationProvider>
          <Shell />
        </NavigationProvider>
      </DataProvider>
    </PlayerProvider>
  );
}
