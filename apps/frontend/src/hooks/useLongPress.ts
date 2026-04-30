import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void;
  threshold?: number;
}

export function useLongPress({ onLongPress, threshold = 500 }: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      isLongPress.current = false;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      startPos.current = { x: clientX, y: clientY };

      timerRef.current = setTimeout(() => {
        isLongPress.current = true;
        onLongPress(e);
      }, threshold);
    },
    [onLongPress, threshold]
  );

  const move = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!startPos.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const dx = clientX - startPos.current.x;
      const dy = clientY - startPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    },
    []
  );

  const end = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      startPos.current = null;
      // On touch devices, prevent the synthetic click after a long press
      if (isLongPress.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    []
  );

  const bind = useCallback(
    () => ({
      onTouchStart: start,
      onTouchMove: move,
      onTouchEnd: end,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        onLongPress(e);
      },
    }),
    [start, end, move, onLongPress]
  );

  return { bind, isLongPress };
}
