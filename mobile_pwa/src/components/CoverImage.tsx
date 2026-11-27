import React, { useEffect, useRef, useState } from 'react';
import { imageKeyFor } from '../storage/songStorage';
import { useCachedImage } from '../hooks/useCachedImage';

interface Props {
  coverUrl?: string | null;
  songId?: string;
  cacheKey?: string;
  size?: number | string;
  round?: boolean;
  placeholder?: React.ReactNode;
  imgVersion?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function CoverImage({
  coverUrl, songId, cacheKey, size = 48, round = false, placeholder = '\u266A',
  imgVersion = 0, className, style,
}: Props) {
  const key = imageKeyFor(coverUrl, songId, cacheKey);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [uri, setUri] = useCachedImage(key, coverUrl, imgVersion, visible);

  // Only resolve images that are on (or near) screen; long libraries stay cheap.
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const dim = typeof size === 'number' ? `${size}px` : size;
  const radius = round ? '50%' : 'var(--radius-sm)';

  return (
    <div
      ref={ref}
      className={`cover ${className || ''}`}
      style={{ width: dim, height: dim, borderRadius: radius, ...style }}
    >
      {uri ? (
        <img src={uri} alt="" draggable={false} onError={() => setUri(null)} />
      ) : (
        <span className="cover-placeholder" style={{ fontSize: typeof size === 'number' ? size * 0.35 : 32 }}>
          {placeholder}
        </span>
      )}
    </div>
  );
}
