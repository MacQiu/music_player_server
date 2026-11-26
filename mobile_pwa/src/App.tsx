import { useEffect, useRef, useState, type ReactNode } from 'react';
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

const DOCKED_ROUTES = new Set(['playlist', 'artist']);

function ModalLayer({ entry, index }: { entry: StackEntry; index: number }) {
  const { back } = useNav();
  const layerRef = useRef<HTMLDivElement>(null);
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
  const docked = DOCKED_ROUTES.has(r.name);

  useEffect(() => {
    if (!docked) return;
    const layer = layerRef.current;
    if (!layer) return;
    let startY = 0;
    let startX = 0;
    let tracking = false;
    let pulled = 0;

    const atTop = () => {
      const body = layer.querySelector('.modal-body');
      return !body || body.scrollTop <= 2;
    };

    const onStart = (e: TouchEvent) => {
      if (layer.querySelector('.edit-banner, .sheet-backdrop')) return;
      const target = e.target as Element;
      if (target.closest('.selection-bar, input, textarea')) return;
      if (!atTop()) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      tracking = true;
      pulled = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      if (!atTop()) {
        tracking = false;
        layer.style.transform = '';
        return;
      }
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      if (pulled === 0 && Math.abs(dx) > Math.abs(dy)) {
        tracking = false;
        return;
      }
      if (dy <= 0) {
        pulled = 0;
        layer.style.transform = '';
        return;
      }
      pulled = dy;
      layer.style.animation = 'none';
      layer.style.transform = `translateY(${dy}px)`;
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (pulled > 90) {
        layer.classList.add('dismissing');
        layer.style.transition = 'transform .22s ease-in';
        layer.style.transform = 'translateY(100%)';
        window.setTimeout(() => back(), 180);
      } else {
        layer.style.transition = 'transform .2s ease';
        layer.style.transform = '';
        window.setTimeout(() => {
          layer.style.transition = '';
          layer.style.animation = '';
        }, 200);
      }
      pulled = 0;
    };

    layer.addEventListener('touchstart', onStart, { passive: true });
    layer.addEventListener('touchmove', onMove, { passive: false });
    layer.addEventListener('touchend', onEnd);
    layer.addEventListener('touchcancel', onEnd);
    return () => {
      layer.removeEventListener('touchstart', onStart);
      layer.removeEventListener('touchmove', onMove);
      layer.removeEventListener('touchend', onEnd);
      layer.removeEventListener('touchcancel', onEnd);
    };
  }, [docked, back]);

  return (
    <div
      ref={layerRef}
      className={`modal-layer ${docked ? 'docked' : ''} ${entry.closing ? 'closing' : ''}`}
      style={{ zIndex: 100 + index }}
    >
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

  const docked = stack.filter(entry => DOCKED_ROUTES.has(entry.route.name));
  const fullscreen = stack.filter(entry => !DOCKED_ROUTES.has(entry.route.name));

  return (
    <div className="app">
      <div className="tab-content">
        {mounted.has('index') && <div className="tab-scene" hidden={tab !== 'index'}><HomeScreen /></div>}
        {mounted.has('library') && <div className="tab-scene" hidden={tab !== 'library'}><LibraryScreen /></div>}
        {mounted.has('analytics') && <div className="tab-scene" hidden={tab !== 'analytics'}><AnalyticsScreen /></div>}
        {mounted.has('sync') && <div className="tab-scene" hidden={tab !== 'sync'}><SyncScreen /></div>}
        {docked.map(entry => <ModalLayer key={entry.key} entry={entry} index={stack.indexOf(entry)} />)}
      </div>
      <TabBar />
      {fullscreen.map(entry => <ModalLayer key={entry.key} entry={entry} index={stack.indexOf(entry)} />)}
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
