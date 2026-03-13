import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const VIRTUALIZE_THRESHOLD = 30;

interface UseVirtualListOptions {
  count: number;
  estimateSize: number;
  enabled?: boolean;
}

export function useVirtualList({ count, estimateSize, enabled = true }: UseVirtualListOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = enabled && count > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    enabled: shouldVirtualize,
  });

  return {
    scrollRef,
    shouldVirtualize,
    virtualizer,
    totalSize: virtualizer.getTotalSize(),
    virtualItems: virtualizer.getVirtualItems(),
  };
}
