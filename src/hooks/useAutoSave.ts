import { useRef, useCallback, useEffect, useState } from "react";

// Global registry for flush callbacks (auto-save hooks register here)
// Used by App.tsx to flush all pending saves before auto-lock
export const flushRegistry: Set<() => Promise<void>> = new Set();

interface UseAutoSaveOptions {
  delay?: number;
  onSave: (value: string | null) => Promise<void>;
  validate?: (value: string | null) => string | null;
}

export function useAutoSave({ delay = 500, onSave, validate }: UseAutoSaveOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });
  const validateRef = useRef(validate);
  useEffect(() => {
    validateRef.current = validate;
  });

  // Track the latest pending value so flush can execute it
  const pendingValueRef = useRef<string | null | undefined>(undefined);

  const save = useCallback(
    (value: string | null) => {
      // Run validation immediately
      if (validateRef.current) {
        const validationError = validateRef.current(value);
        setError(validationError);
        if (validationError) {
          // Cancel any pending save
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          pendingValueRef.current = undefined;
          return;
        }
      } else {
        setError(null);
      }

      pendingValueRef.current = value;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        pendingValueRef.current = undefined;
        try {
          await onSaveRef.current(value);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
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

  return { save, flush, error };
}
