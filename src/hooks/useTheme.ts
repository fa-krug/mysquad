import { useEffect, useState, useCallback } from "react";
import { getSetting, setSetting } from "@/lib/db";

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme(dbReady: boolean) {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    if (!dbReady) {
      applyTheme("system");
      return;
    }
    getSetting("theme").then((saved) => {
      const t = (saved as Theme) || "system";
      setThemeState(t);
      applyTheme(t);
    });
  }, [dbReady]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      applyTheme(t);
      if (dbReady) setSetting("theme", t);
    },
    [dbReady],
  );

  return { theme, setTheme };
}
