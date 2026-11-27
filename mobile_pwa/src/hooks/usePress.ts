import { useRef } from 'react';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

/**
 * Tap + long-press handlers for touch and mouse (the web has no onLongPress).
 * A long press suppresses the click that follows it.
 */
export function usePress(onPress?: () => void, onLongPress?: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      if (!onLongPress) return;
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        if (navigator.vibrate) navigator.vibrate(10);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current) return;
      if (Math.abs(e.clientX - start.current.x) > MOVE_TOLERANCE || Math.abs(e.clientY - start.current.y) > MOVE_TOLERANCE) {
        clear();
      }
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => { if (onLongPress) e.preventDefault(); },
    onClick: () => {
      if (fired.current) { fired.current = false; return; }
      onPress?.();
    },
  };
}
