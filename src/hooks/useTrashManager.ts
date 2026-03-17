import { useState, useEffect, useCallback } from "react";

interface UseTrashManagerResult<T> {
  showTrash: boolean;
  trashedItems: T[];
  permanentDeleteId: number | null;
  toggleTrash: () => void;
  loadTrashedItems: () => Promise<void>;
  handleRestore: (id: number) => Promise<void>;
  requestPermanentDelete: (id: number) => void;
  confirmPermanentDelete: () => void;
  cancelPermanentDelete: () => void;
}

export function useTrashManager<T>(options: {
  fetchTrashed: () => Promise<T[]>;
  restoreItem: (id: number) => Promise<void>;
  permanentDeleteItem: (id: number) => Promise<void>;
  onRefresh: () => void;
  onSelectionClear: () => void;
}): UseTrashManagerResult<T> {
  const { fetchTrashed, restoreItem, permanentDeleteItem, onRefresh, onSelectionClear } = options;
  const [showTrash, setShowTrash] = useState(false);
  const [trashedItems, setTrashedItems] = useState<T[]>([]);
  const [permanentDeleteId, setPermanentDeleteId] = useState<number | null>(null);

  const loadTrashedItems = useCallback(async () => {
    const data = await fetchTrashed();
    setTrashedItems(data);
  }, [fetchTrashed]);

  // Load on mount (for badge count) and when showTrash toggles on
  useEffect(() => {
    let cancelled = false;
    fetchTrashed().then((data) => {
      if (!cancelled) setTrashedItems(data);
    });
    return () => {
      cancelled = true;
    };
  }, [showTrash, fetchTrashed]);

  const toggleTrash = useCallback(() => {
    setShowTrash((prev) => !prev);
    onSelectionClear();
  }, [onSelectionClear]);

  const handleRestore = useCallback(
    async (id: number) => {
      await restoreItem(id);
      await Promise.all([onRefresh(), loadTrashedItems()]);
      onSelectionClear();
    },
    [restoreItem, onRefresh, loadTrashedItems, onSelectionClear],
  );

  const confirmPermanentDelete = useCallback(() => {
    if (permanentDeleteId) {
      permanentDeleteItem(permanentDeleteId).then(() => {
        loadTrashedItems();
        onSelectionClear();
      });
    }
    setPermanentDeleteId(null);
  }, [permanentDeleteId, permanentDeleteItem, loadTrashedItems, onSelectionClear]);

  const cancelPermanentDelete = useCallback(() => {
    setPermanentDeleteId(null);
  }, []);

  return {
    showTrash,
    trashedItems,
    permanentDeleteId,
    toggleTrash,
    loadTrashedItems,
    handleRestore,
    requestPermanentDelete: setPermanentDeleteId,
    confirmPermanentDelete,
    cancelPermanentDelete,
  };
}
