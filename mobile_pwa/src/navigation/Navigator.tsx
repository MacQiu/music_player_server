import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type TabName = 'index' | 'library' | 'analytics' | 'sync';

export type Route =
  | { name: 'player' }
  | { name: 'queue' }
  | { name: 'lyrics' }
  | { name: 'upload' }
  | { name: 'settings' }
  | { name: 'playlist'; id: string }
  | { name: 'artist'; artist: string };

export interface StackEntry {
  key: number;
  route: Route;
  closing: boolean;
}

interface NavContextType {
  tab: TabName;
  setTab: (tab: TabName) => void;
  stack: StackEntry[];
  push: (route: Route) => void;
  back: () => void;
}

const NavContext = createContext<NavContextType | null>(null);

export const CLOSE_MS = 260;

/**
 * Tabs plus a stack of full-screen modals. Each push adds a history entry so the
 * browser/OS back action closes the top modal instead of leaving the app.
 */
export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<TabName>('index');
  const [stack, setStack] = useState<StackEntry[]>([]);
  const keyRef = useRef(0);
  const depthRef = useRef(0);

  const popTop = useCallback(() => {
    setStack(prev => {
      const idx = [...prev].reverse().findIndex(e => !e.closing);
      if (idx < 0) return prev;
      const realIdx = prev.length - 1 - idx;
      const entry = prev[realIdx];
      setTimeout(() => setStack(s => s.filter(e => e.key !== entry.key)), CLOSE_MS);
      return prev.map((e, i) => (i === realIdx ? { ...e, closing: true } : e));
    });
  }, []);

  useEffect(() => {
    history.replaceState({ depth: 0 }, '');
    const onPop = (e: PopStateEvent) => {
      const depth = (e.state && typeof e.state.depth === 'number') ? e.state.depth : 0;
      while (depthRef.current > depth) {
        depthRef.current -= 1;
        popTop();
      }
      depthRef.current = depth;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [popTop]);

  const push = useCallback((route: Route) => {
    depthRef.current += 1;
    history.pushState({ depth: depthRef.current }, '');
    setStack(prev => [...prev, { key: ++keyRef.current, route, closing: false }]);
  }, []);

  const back = useCallback(() => {
    if (depthRef.current > 0) history.back();
  }, []);

  return (
    <NavContext.Provider value={{ tab, setTab, stack, push, back }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within NavigationProvider');
  return ctx;
}
