import { useRef, useCallback, useEffect, useState } from "react";

// Global registry for flush callbacks (auto-save hooks register here)
// Used by App.tsx to flush all pending saves before auto-lock
export const flushRegistry: Set<() => Promise<void>> = new Set();

interface UseAutoSaveOptions {
  delay?: number;
  onSave: (value: string | null) => Promise<void>;
}

export function useAutoSave({ delay = 500, onSave }: UseAutoSaveOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Track the latest pending value so flush can execute it
  const pendingValueRef = useRef<string | null | undefined>(undefined);

  const save = useCallback(
    (value: string | null) => {
      setError(null);
      setSaved(false);
      pendingValueRef.current = value;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        pendingValueRef.current = undefined;
        setSaving(true);
        try {
          await onSaveRef.current(value);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setSaving(false);
        }
      }, delay);
    },
    [delay],
  );

  // Flush pending saves (used before auto-lock)
  const flush = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      if (pendingValueRef.current !== undefined) {
        try {
          await onSaveRef.current(pendingValueRef.current);
        } catch {
          // Best effort on flush
        }
        pendingValueRef.current = undefined;
      }
    }
  }, []);

  // Register/unregister flush with global registry
  useEffect(() => {
    flushRegistry.add(flush);
    return () => {
      flushRegistry.delete(flush);
    };
  }, [flush]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { save, flush, saving, saved, error };
}
