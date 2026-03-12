import { useState, useEffect } from "react";
import { getSetting, setSetting } from "@/lib/db";

interface SettingsPageProps {
  theme?: string;
  onThemeChange?: (theme: "light" | "dark" | "system") => void;
}

const AUTO_LOCK_OPTIONS = [
  { value: "0", label: "Immediately" },
  { value: "60", label: "1 minute" },
  { value: "300", label: "5 minutes" },
  { value: "-1", label: "Never" },
];

export function SettingsPage({ theme, onThemeChange }: SettingsPageProps) {
  const [autoLockTimeout, setAutoLockTimeout] = useState<string>("60");
  const [autoLockError, setAutoLockError] = useState<string | null>(null);
  const [autoLockSaved, setAutoLockSaved] = useState(false);

  useEffect(() => {
    getSetting("auto_lock_timeout")
      .then((value) => {
        if (value !== null) {
          setAutoLockTimeout(value);
        }
      })
      .catch((e) => {
        setAutoLockError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  async function handleAutoLockChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setAutoLockTimeout(value);
    setAutoLockError(null);
    setAutoLockSaved(false);
    try {
      await setSetting("auto_lock_timeout", value);
      setAutoLockSaved(true);
      setTimeout(() => setAutoLockSaved(false), 1500);
    } catch (err) {
      setAutoLockError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleThemeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as "light" | "dark" | "system";
    onThemeChange?.(value);
    try {
      await setSetting("theme", value);
    } catch {
      // Best effort — theme already applied in memory
    }
  }

  const currentTheme = theme ?? "system";

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Theme */}
        <div className="space-y-1.5">
          <label htmlFor="theme-select" className="text-sm font-medium">
            Theme
          </label>
          <select
            id="theme-select"
            value={currentTheme}
            onChange={handleThemeChange}
            className="block w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </div>

        {/* Auto-lock timeout */}
        <div className="space-y-1.5">
          <label htmlFor="auto-lock-select" className="text-sm font-medium">
            Auto-lock timeout
          </label>
          <select
            id="auto-lock-select"
            value={autoLockTimeout}
            onChange={handleAutoLockChange}
            className="block w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {AUTO_LOCK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {autoLockError && (
            <p className="text-sm text-destructive">{autoLockError}</p>
          )}
          {autoLockSaved && (
            <p className="text-sm text-green-600">Saved</p>
          )}
        </div>
      </div>
    </div>
  );
}
