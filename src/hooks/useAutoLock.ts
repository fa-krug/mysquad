import { useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { getSetting } from "@/lib/db";

interface UseAutoLockOptions {
  onLock: () => void;
  enabled: boolean;
  requireAuth: boolean;
}

export function useAutoLock({ onLock, enabled, requireAuth }: UseAutoLockOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLockRef = useRef(onLock);
  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  const clearIdleTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startIdleTimer = useCallback(async () => {
    clearIdleTimer();
    try {
      const timeout = await getSetting("auto_lock_timeout");
      if (!timeout || timeout === "never") return;

      const ms = parseInt(timeout, 10) * 1000;
      if (isNaN(ms) || ms <= 0) return;

      timeoutRef.current = setTimeout(() => {
        onLockRef.current();
      }, ms);
    } catch {
      // DB might not be open yet
    }
  }, [clearIdleTimer]);

  useEffect(() => {
    if (!enabled || !requireAuth) return;

    const handleBlur = () => startIdleTimer();
    const handleFocus = () => clearIdleTimer();

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    const unlisteners: (() => void)[] = [];
    listen("system-sleep", () => onLockRef.current()).then((u) => unlisteners.push(u));
    listen("screen-lock", () => onLockRef.current()).then((u) => unlisteners.push(u));

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      clearIdleTimer();
      unlisteners.forEach((u) => u());
    };
  }, [enabled, requireAuth, startIdleTimer, clearIdleTimer]);
}
