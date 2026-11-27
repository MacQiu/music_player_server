import React, { useRef, useState } from 'react';

const TRIGGER = 60;
const MAX_PULL = 90;

/** Vertical scroll container with pull-to-refresh (stand-in for ScrollView + RefreshControl). */
export default function ScrollPage({ onRefresh, className, children }: {
  onRefresh?: () => Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!onRefresh || refreshing) return;
    startY.current = (ref.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && (ref.current?.scrollTop ?? 0) <= 0) setPull(Math.min(dy * 0.5, MAX_PULL));
    else setPull(0);
  };
  const onTouchEnd = async () => {
    if (startY.current === null) return;
    startY.current = null;
    if (pull >= TRIGGER && onRefresh) {
      setRefreshing(true);
      setPull(TRIGGER);
      try { await onRefresh(); } catch { }
      setRefreshing(false);
    }
    setPull(0);
  };

  return (
    <div
      ref={ref}
      className={`scroll-page ${className || ''}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {onRefresh && (
        <div className="ptr" style={{ height: refreshing ? TRIGGER : pull }}>
          <div className={`spinner ${refreshing ? 'spinning' : ''}`}
            style={{ opacity: Math.min(pull / TRIGGER, 1), transform: `rotate(${pull * 4}deg)` }} />
        </div>
      )}
      {children}
    </div>
  );
}
