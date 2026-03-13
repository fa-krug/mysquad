import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";

// Global registry so App.tsx can cancel all pending deletes on lock
export const pendingDeleteRegistry: Set<() => void> = new Set();

interface ScheduleDeleteOptions {
  id: number;
  label: string;
  onConfirm: () => Promise<void>;
  onUndo?: () => void;
}

export function usePendingDelete() {
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const timersRef = useRef<Map<number, { toastId: string | number; onUndo?: () => void }>>(
    new Map(),
  );

  const cancelAll = useCallback(() => {
    for (const [, entry] of timersRef.current) {
      toast.dismiss(entry.toastId);
      entry.onUndo?.();
    }
    timersRef.current.clear();
    setPendingIds(new Set());
  }, []);

  useEffect(() => {
    pendingDeleteRegistry.add(cancelAll);
    return () => {
      pendingDeleteRegistry.delete(cancelAll);
      cancelAll();
    };
  }, [cancelAll]);

  const scheduleDelete = useCallback(
    ({ id, label, onConfirm, onUndo: onUndoCallback }: ScheduleDeleteOptions) => {
      if (timersRef.current.has(id)) return;

      setPendingIds((prev) => new Set(prev).add(id));

      const execute = async () => {
        if (!timersRef.current.has(id)) return;
        timersRef.current.delete(id);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        try {
          await onConfirm();
        } catch {
          toast.error(`Failed to delete ${label}`);
        }
      };

      const undo = () => {
        timersRef.current.delete(id);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        onUndoCallback?.();
      };

      const toastId = toast(`${label} deleted`, {
        action: { label: "Undo", onClick: () => undo() },
        duration: 5000,
        onAutoClose: () => execute(),
        onDismiss: () => execute(),
      });

      timersRef.current.set(id, { toastId: toastId as string | number, onUndo: onUndoCallback });
    },
    [],
  );

  return { scheduleDelete, pendingIds };
}
