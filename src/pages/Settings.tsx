import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getSetting, setSetting, setConfig, exportData, importData } from "@/lib/db";
import { save, open } from "@tauri-apps/plugin-dialog";

interface SettingsPageProps {
  theme?: string;
  onThemeChange?: (theme: "light" | "dark" | "system") => void;
  requireAuth: boolean;
  onRequireAuthChange: (value: boolean) => void;
  onShowWelcome?: () => void;
  onCheckForUpdate: (options?: { silent?: boolean }) => Promise<boolean>;
}

const AUTO_LOCK_OPTIONS = [
  { value: "0", label: "Immediately" },
  { value: "60", label: "1 minute" },
  { value: "300", label: "5 minutes" },
  { value: "-1", label: "Never" },
];

export function SettingsPage({
  theme,
  onThemeChange,
  requireAuth,
  onRequireAuthChange,
  onShowWelcome,
  onCheckForUpdate,
}: SettingsPageProps) {
  const [autoLockTimeout, setAutoLockTimeout] = useState<string>("60");
  const [autoLockError, setAutoLockError] = useState<string | null>(null);
  const [autoLockSaved, setAutoLockSaved] = useState(false);
  const [authSaved, setAuthSaved] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportImportMessage, setExportImportMessage] = useState<string | null>(null);
  const [exportImportError, setExportImportError] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFilePath, setImportFilePath] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const [upToDate, setUpToDate] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [showRangesInPresentation, setShowRangesInPresentation] = useState(false);

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    getSetting("show_ranges_in_presentation").then((value) => {
      if (value !== null) setShowRangesInPresentation(value === "true");
    });
  }, []);

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

  async function handleRequireAuthChange(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setAuthError(null);
    setAuthSaved(false);
    try {
      await setConfig("require_auth", checked ? "true" : "false");
      onRequireAuthChange(checked);
      if (!checked) {
        // Force auto-lock to Never when auth is disabled
        setAutoLockTimeout("-1");
        await setSetting("auto_lock_timeout", "-1");
      }
      setAuthSaved(true);
      setTimeout(() => setAuthSaved(false), 1500);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    }
  }

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

  async function handleShowRangesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setShowRangesInPresentation(checked);
    try {
      await setSetting("show_ranges_in_presentation", checked ? "true" : "false");
    } catch {
      // Best effort
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

  async function handleCheckForUpdate() {
    setChecking(true);
    setUpToDate(false);
    setCheckError(null);
    try {
      const found = await onCheckForUpdate();
      if (!found) {
        setUpToDate(true);
        setTimeout(() => setUpToDate(false), 3000);
      }
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  function clearExportImportMessage() {
    setTimeout(() => {
      setExportImportMessage(null);
      setExportImportError(false);
    }, 3000);
  }

  async function handleExport() {
    setExportImportMessage(null);
    setExportImportError(false);
    try {
      const filePath = await save({
        defaultPath: "mysquad-export.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;
      setExporting(true);
      await exportData(filePath);
      setExportImportMessage("Data exported successfully");
      clearExportImportMessage();
    } catch (err) {
      setExportImportMessage(err instanceof Error ? err.message : String(err));
      setExportImportError(true);
    } finally {
      setExporting(false);
    }
  }

  async function handleImportClick() {
    setExportImportMessage(null);
    setExportImportError(false);
    try {
      const filePath = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!filePath) return;
      setImportFilePath(filePath);
      setShowImportDialog(true);
    } catch (err) {
      setExportImportMessage(err instanceof Error ? err.message : String(err));
      setExportImportError(true);
    }
  }

  async function handleImport(mode: string) {
    setShowImportDialog(false);
    if (!importFilePath) return;
    setImporting(true);
    setExportImportMessage(null);
    setExportImportError(false);
    try {
      await importData(importFilePath, mode);
      setExportImportMessage("Data imported successfully");
      clearExportImportMessage();
    } catch (err) {
      setExportImportMessage(err instanceof Error ? err.message : String(err));
      setExportImportError(true);
    } finally {
      setImporting(false);
      setImportFilePath(null);
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

        {/* Require authentication */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="require-auth-toggle"
              checked={requireAuth}
              onChange={handleRequireAuthChange}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="require-auth-toggle" className="text-sm font-medium">
              Require authentication on startup
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            When disabled, the app opens without Touch ID. Your data is still encrypted.
          </p>
          {authError && <p className="text-sm text-destructive">{authError}</p>}
          {authSaved && <p className="text-sm text-green-600">Saved</p>}
        </div>

        {/* Auto-lock timeout */}
        <div className="space-y-1.5">
          <label htmlFor="auto-lock-select" className="text-sm font-medium">
            Auto-lock timeout
          </label>
          <select
            id="auto-lock-select"
            value={requireAuth ? autoLockTimeout : "-1"}
            onChange={handleAutoLockChange}
            disabled={!requireAuth}
            className="block w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {AUTO_LOCK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {!requireAuth && (
            <p className="text-xs text-muted-foreground">
              Auto-lock is disabled when authentication is not required.
            </p>
          )}
          {autoLockError && <p className="text-sm text-destructive">{autoLockError}</p>}
          {autoLockSaved && <p className="text-sm text-green-600">Saved</p>}
        </div>

        {/* Presentation: show salary ranges */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="presentation-ranges-toggle"
              checked={showRangesInPresentation}
              onChange={handleShowRangesChange}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="presentation-ranges-toggle" className="text-sm font-medium">
              Show salary ranges in presentation mode
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, salary range indicators are visible while presenting.
          </p>
        </div>

        {/* Welcome Screen */}
        <div className="space-y-1.5">
          <h2 className="text-sm font-medium">Welcome Screen</h2>
          <p className="text-xs text-muted-foreground">Show the introductory walkthrough again.</p>
          <button
            onClick={onShowWelcome}
            className="rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            Show Welcome Screen
          </button>
        </div>

        {/* Data Management */}
        <div className="space-y-1.5">
          <h2 className="text-sm font-medium">Data Management</h2>
          <p className="text-xs text-muted-foreground">
            Export all your data to a JSON file, or import data from a previous export.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? "Exporting…" : "Export Data"}
            </button>
            <button
              onClick={handleImportClick}
              disabled={importing}
              className="rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? "Importing…" : "Import Data"}
            </button>
          </div>
          {exportImportMessage && (
            <p className={`text-sm ${exportImportError ? "text-destructive" : "text-green-600"}`}>
              {exportImportMessage}
            </p>
          )}
        </div>

        {/* Import Mode Dialog */}
        {showImportDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background border rounded-xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-lg">
              <h3 className="text-lg font-semibold">Import Mode</h3>
              <p className="text-sm text-muted-foreground">How should imported data be handled?</p>
              <div className="space-y-2">
                <button
                  onClick={() => handleImport("overwrite")}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm text-left transition-colors hover:bg-muted"
                >
                  <span className="font-medium">Overwrite</span>
                  <span className="block text-xs text-muted-foreground">
                    Replace all existing data with the imported data
                  </span>
                </button>
                <button
                  onClick={() => handleImport("update")}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm text-left transition-colors hover:bg-muted"
                >
                  <span className="font-medium">Update</span>
                  <span className="block text-xs text-muted-foreground">
                    Add new records and update existing ones
                  </span>
                </button>
              </div>
              <button
                onClick={() => {
                  setShowImportDialog(false);
                  setImportFilePath(null);
                }}
                className="w-full rounded-lg border border-input px-3 py-1.5 text-sm transition-colors hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* About */}
        <div className="space-y-1.5">
          <h2 className="text-sm font-medium">About</h2>
          <p className="text-xs text-muted-foreground">MySquad v{appVersion}</p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleCheckForUpdate}
              disabled={checking}
              className="rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checking ? "Checking..." : "Check for Updates"}
            </button>
            {upToDate && <span className="text-sm text-green-600">You're up to date</span>}
            {checkError && <span className="text-sm text-destructive">{checkError}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
