import { useEffect, useState } from 'react';
import { getBaseUrl } from '../api/client';
import { getMemImageUrl, getLocalImageUrl, fetchImage, needsImageRefresh } from '../storage/songStorage';
import { useData } from '../contexts/DataContext';

/**
 * Resolve an image to a blob URL: local IndexedDB copy first, then (when online)
 * refresh from the server once per session and persist it for offline use.
 */
export function useCachedImage(key: string | null, coverUrl?: string | null, imgVersion = 0, enabled = true) {
  const { online } = useData();
  const [uri, setUri] = useState<string | null>(key ? getMemImageUrl(key) : null);

  useEffect(() => {
    if (!key) { setUri(null); return; }
    let cancelled = false;
    const mem = getMemImageUrl(key);
    setUri(mem);
    if (!enabled) return;

    (async () => {
      const local = mem || await getLocalImageUrl(key);
      if (cancelled) return;
      setUri(local);
      const base = getBaseUrl();
      if (online && coverUrl && base && needsImageRefresh(key, imgVersion)) {
        const fresh = await fetchImage(key, `${base}${coverUrl}`, imgVersion);
        if (!cancelled && fresh) setUri(fresh);
      }
    })();
    return () => { cancelled = true; };
  }, [key, coverUrl, online, imgVersion, enabled]);

  return [uri, setUri] as const;
}
