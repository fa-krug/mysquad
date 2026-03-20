import { useState, useCallback, useEffect } from "react";

interface PinnedState<T> {
  key: string;
  entry: T;
  coordinate: { x: number; y: number };
}

export function useStickyTooltip<T>(chartEl: HTMLElement | null) {
  const [pinned, setPinned] = useState<PinnedState<T> | null>(null);

  const pin = useCallback((key: string, entry: T, coordinate: { x: number; y: number }) => {
    setPinned((prev) => (prev?.key === key ? null : { key, entry, coordinate }));
  }, []);

  const unpin = useCallback(() => setPinned(null), []);

  useEffect(() => {
    if (!pinned) return;
    const handler = (e: MouseEvent) => {
      if (chartEl && !chartEl.contains(e.target as Node)) {
        setPinned(null);
      }
    };
    // Defer so the click that pinned doesn't immediately dismiss
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [pinned, chartEl]);

  return { pinned, pin, unpin };
}
