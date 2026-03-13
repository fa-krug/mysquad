# Optional Authentication Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make biometric authentication on startup optional while keeping the database encrypted.

**Architecture:** A tamper-proof JSON config file (`config.json`) in the app data dir stores the `require_auth` preference, HMAC-signed with the DB encryption key from the Keychain. The frontend checks this config before deciding whether to show the lock screen or auto-unlock.

**Tech Stack:** Rust (`hmac`, `sha2` crates), React, Tauri invoke

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src-tauri/src/config.rs` | Read/write/HMAC-verify the config file |
| Modify | `src-tauri/src/lib.rs` | Register new module + commands |
| Modify | `src-tauri/src/commands.rs:1701` | Make `get_app_data_dir` pub(crate) |
| Modify | `src-tauri/Cargo.toml` | Add `hmac`, `sha2`, `tempfile` dependencies |
| Modify | `src/lib/db.ts` | Add `getConfig`/`setConfig` invoke wrappers |
| Modify | `src/hooks/useAutoLock.ts` | Accept `requireAuth` to skip auto-lock |
| Modify | `src/pages/Settings.tsx` | Add "Require authentication" toggle |
| Modify | `src/App.tsx` | Check config on mount, conditional auth flow |

---

## Task 1: Add Rust dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add dependencies**

Add to `[dependencies]` in `src-tauri/Cargo.toml`:

```toml
hmac = "0.12"
sha2 = "0.10"
```

Add a new section:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add hmac, sha2, and tempfile dependencies for config signing"
```

---

## Task 2: Create `config.rs` module with HMAC-signed config file

**Files:**
- Create: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands.rs`

**Context:**
- `get_app_data_dir()` is currently a private fn in `commands.rs` at line 1701. It returns `~/Library/Application Support/com.mysquad.app/`. It needs to be accessible from `config.rs` too, so make it `pub(crate)`.
- The Keychain key is retrieved via `keychain::retrieve_key()` which returns `Result<String, String>`.
- **IMPORTANT:** Use `BTreeMap` (not `HashMap`) throughout this module. `HashMap` has non-deterministic iteration order, which would cause HMAC verification to fail intermittently when serialized with `serde_json`. `BTreeMap` guarantees sorted key order.

- [ ] **Step 1: Make `get_app_data_dir` accessible**

In `src-tauri/src/commands.rs`, change line 1701 from:

```rust
fn get_app_data_dir() -> Result<std::path::PathBuf, String> {
```

to:

```rust
pub(crate) fn get_app_data_dir() -> Result<std::path::PathBuf, String> {
```

- [ ] **Step 2: Write failing tests for config module**

Create `src-tauri/src/config.rs` with stub functions and tests:

```rust
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::collections::BTreeMap;
use std::path::PathBuf;

type HmacSha256 = Hmac<Sha256>;

/// Compute HMAC-SHA256 of config data using the given key.
fn compute_hmac(_key: &str, _data: &str) -> String {
    todo!()
}

/// Read a value from the config file, verifying HMAC integrity.
/// Returns None if file missing, corrupt, or HMAC invalid.
pub fn read_config(_config_path: &PathBuf, _keychain_key: &str, _key: &str) -> Option<String> {
    todo!()
}

/// Write a key-value pair to the config file with HMAC signature.
pub fn write_config(
    _config_path: &PathBuf,
    _keychain_key: &str,
    _key: &str,
    _value: &str,
) -> Result<(), String> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn config_path(dir: &std::path::Path) -> PathBuf {
        dir.join("config.json")
    }

    #[test]
    fn test_read_missing_file_returns_none() {
        let dir = tempdir().unwrap();
        let path = config_path(dir.path());
        let result = read_config(&path, "test-key", "require_auth");
        assert_eq!(result, None);
    }

    #[test]
    fn test_write_then_read_returns_value() {
        let dir = tempdir().unwrap();
        let path = config_path(dir.path());
        write_config(&path, "test-key", "require_auth", "false").unwrap();
        let result = read_config(&path, "test-key", "require_auth");
        assert_eq!(result, Some("false".to_string()));
    }

    #[test]
    fn test_tampered_value_returns_none() {
        let dir = tempdir().unwrap();
        let path = config_path(dir.path());
        write_config(&path, "test-key", "require_auth", "false").unwrap();

        // Tamper with the file: change "false" to "true" without updating HMAC
        let content = fs::read_to_string(&path).unwrap();
        let tampered = content.replace("\"false\"", "\"true\"");
        fs::write(&path, tampered).unwrap();

        let result = read_config(&path, "test-key", "require_auth");
        assert_eq!(result, None);
    }

    #[test]
    fn test_tampered_hmac_returns_none() {
        let dir = tempdir().unwrap();
        let path = config_path(dir.path());
        write_config(&path, "test-key", "require_auth", "false").unwrap();

        // Deserialize, replace the hmac value, re-serialize
        let content = fs::read_to_string(&path).unwrap();
        let mut parsed: BTreeMap<String, String> = serde_json::from_str(&content).unwrap();
        parsed.insert(
            "hmac".to_string(),
            "0000000000000000000000000000000000000000000000000000000000000000".to_string(),
        );
        let tampered = serde_json::to_string_pretty(&parsed).unwrap();
        fs::write(&path, tampered).unwrap();

        let result = read_config(&path, "test-key", "require_auth");
        assert_eq!(result, None);
    }

    #[test]
    fn test_wrong_key_returns_none() {
        let dir = tempdir().unwrap();
        let path = config_path(dir.path());
        write_config(&path, "correct-key", "require_auth", "false").unwrap();
        let result = read_config(&path, "wrong-key", "require_auth");
        assert_eq!(result, None);
    }

    #[test]
    fn test_missing_key_returns_none() {
        let dir = tempdir().unwrap();
        let path = config_path(dir.path());
        write_config(&path, "test-key", "require_auth", "false").unwrap();
        let result = read_config(&path, "test-key", "other_key");
        assert_eq!(result, None);
    }

    #[test]
    fn test_multiple_keys() {
        let dir = tempdir().unwrap();
        let path = config_path(dir.path());
        write_config(&path, "test-key", "require_auth", "false").unwrap();
        write_config(&path, "test-key", "another_setting", "yes").unwrap();
        assert_eq!(
            read_config(&path, "test-key", "require_auth"),
            Some("false".to_string())
        );
        assert_eq!(
            read_config(&path, "test-key", "another_setting"),
            Some("yes".to_string())
        );
    }

    #[test]
    fn test_overwrite_existing_key() {
        let dir = tempdir().unwrap();
        let path = config_path(dir.path());
        write_config(&path, "test-key", "require_auth", "true").unwrap();
        write_config(&path, "test-key", "require_auth", "false").unwrap();
        assert_eq!(
            read_config(&path, "test-key", "require_auth"),
            Some("false".to_string())
        );
    }

    #[test]
    fn test_compute_hmac_deterministic() {
        let h1 = compute_hmac("key", "data");
        let h2 = compute_hmac("key", "data");
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_compute_hmac_different_keys() {
        let h1 = compute_hmac("key1", "data");
        let h2 = compute_hmac("key2", "data");
        assert_ne!(h1, h2);
    }
}
```

- [ ] **Step 3: Register module in `lib.rs`**

Add `pub mod config;` to `src-tauri/src/lib.rs` (after the existing `pub mod commands;` line).

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd src-tauri && cargo test config::tests`
Expected: All tests FAIL with `not yet implemented`

- [ ] **Step 5: Implement `compute_hmac`**

Replace the `compute_hmac` function body:

```rust
fn compute_hmac(key: &str, data: &str) -> String {
    let mut mac =
        HmacSha256::new_from_slice(key.as_bytes()).expect("HMAC can take key of any size");
    mac.update(data.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}
```

- [ ] **Step 6: Implement `read_config`**

Replace the `read_config` function body:

```rust
pub fn read_config(config_path: &PathBuf, keychain_key: &str, key: &str) -> Option<String> {
    let content = std::fs::read_to_string(config_path).ok()?;
    let parsed: BTreeMap<String, String> = serde_json::from_str(&content).ok()?;

    let stored_hmac = parsed.get("hmac")?;

    // Rebuild the data portion (everything except hmac)
    let mut data_map: BTreeMap<String, String> = BTreeMap::new();
    for (k, v) in &parsed {
        if k != "hmac" {
            data_map.insert(k.clone(), v.clone());
        }
    }
    let data_json = serde_json::to_string(&data_map).ok()?;
    let expected_hmac = compute_hmac(keychain_key, &data_json);

    if stored_hmac != &expected_hmac {
        return None;
    }

    parsed.get(key).cloned()
}
```

- [ ] **Step 7: Implement `write_config`**

Replace the `write_config` function body:

```rust
pub fn write_config(
    config_path: &PathBuf,
    keychain_key: &str,
    key: &str,
    value: &str,
) -> Result<(), String> {
    // Read existing config or start fresh
    let mut data_map: BTreeMap<String, String> = if config_path.exists() {
        let content =
            std::fs::read_to_string(config_path).map_err(|e| format!("Read error: {}", e))?;
        let mut parsed: BTreeMap<String, String> =
            serde_json::from_str(&content).unwrap_or_default();
        parsed.remove("hmac");
        parsed
    } else {
        BTreeMap::new()
    };

    data_map.insert(key.to_string(), value.to_string());

    // Compute HMAC over the data (BTreeMap ensures sorted key order for determinism)
    let data_json =
        serde_json::to_string(&data_map).map_err(|e| format!("Serialize error: {}", e))?;
    let hmac_hex = compute_hmac(keychain_key, &data_json);

    // Build final map with hmac included
    data_map.insert("hmac".to_string(), hmac_hex);

    let output =
        serde_json::to_string_pretty(&data_map).map_err(|e| format!("Serialize error: {}", e))?;
    std::fs::write(config_path, output).map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd src-tauri && cargo test config::tests`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/config.rs src-tauri/src/lib.rs src-tauri/src/commands.rs src-tauri/Cargo.toml
git commit -m "feat: add config module with HMAC-signed config file"
```

---

## Task 3: Add Tauri commands for config read/write

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Context:**
- Config commands need `get_app_data_dir()` (now `pub(crate)` in `commands.rs`) and `keychain::retrieve_key()`.
- The `get_config` command must work **before** the DB is unlocked, so it cannot require `State<AppDb>`. It only needs the Keychain key and config file path.
- The `set_config` command is called from Settings (app is unlocked), so Keychain key is available.

- [ ] **Step 1: Add `get_config` command**

Add to `src-tauri/src/commands.rs` after the existing auth commands (after `lock_db` at line 41):

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn get_config(key: String) -> Result<Option<String>, String> {
    let config_path = get_app_data_dir()?.join("config.json");
    let keychain_key = match crate::keychain::retrieve_key() {
        Ok(k) => k,
        Err(_) => return Ok(None), // No key yet = first launch, default behavior
    };
    Ok(crate::config::read_config(&config_path, &keychain_key, &key))
}
```

- [ ] **Step 2: Add `set_config` command**

Add right after `get_config`:

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn set_config(key: String, value: String) -> Result<(), String> {
    let config_path = get_app_data_dir()?.join("config.json");
    let keychain_key = crate::keychain::retrieve_key()
        .map_err(|_| "Cannot save config: encryption key not found".to_string())?;
    crate::config::write_config(&config_path, &keychain_key, &key, &value)
}
```

- [ ] **Step 3: Register commands in `lib.rs`**

Add `commands::get_config` and `commands::set_config` to the `generate_handler!` macro in `src-tauri/src/lib.rs`, after `commands::lock_db`:

```rust
commands::lock_db,
commands::get_config,
commands::set_config,
```

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add get_config and set_config Tauri commands"
```

---

## Task 4: Add frontend config invoke wrappers

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add `getConfig` and `setConfig` to `db.ts`**

Add after the existing Auth section (after line 20 `export const lockDb = ...`):

```typescript
// Config (file-based, read before DB unlock)
export const getConfig = (key: string) => invoke<string | null>("get_config", { key });
export const setConfig = (key: string, value: string) =>
  invoke<void>("set_config", { key, value });
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add getConfig/setConfig invoke wrappers"
```

---

## Task 5: Update `useAutoLock` to respect `requireAuth`

**Files:**
- Modify: `src/hooks/useAutoLock.ts`

**Context:**
- Currently accepts `{ onLock, enabled }`.
- When `requireAuth` is false, auto-lock should be completely disabled — no idle timers, no system-sleep/screen-lock listeners.
- This must be done **before** updating App.tsx so the build doesn't break.

- [ ] **Step 1: Add `requireAuth` to the hook interface**

Replace the full contents of `src/hooks/useAutoLock.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAutoLock.ts
git commit -m "feat: disable auto-lock when auth is not required"
```

---

## Task 6: Add "Require authentication" toggle to Settings

**Files:**
- Modify: `src/pages/Settings.tsx`

**Context:**
- Settings currently has Theme and Auto-lock timeout selects.
- Add a checkbox for "Require authentication on startup" above the auto-lock setting.
- When auth is disabled: force auto-lock to "Never" and disable the auto-lock dropdown.
- Uses `setConfig` (file-based) not `setSetting` (DB-based).
- This must be done **before** updating App.tsx so the build doesn't break.

- [ ] **Step 1: Update Settings component**

Replace the full contents of `src/pages/Settings.tsx`:

```typescript
import { useState, useEffect } from "react";
import { getSetting, setSetting, setConfig } from "@/lib/db";

interface SettingsPageProps {
  theme?: string;
  onThemeChange?: (theme: "light" | "dark" | "system") => void;
  requireAuth: boolean;
  onRequireAuthChange: (value: boolean) => void;
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
}: SettingsPageProps) {
  const [autoLockTimeout, setAutoLockTimeout] = useState<string>("60");
  const [autoLockError, setAutoLockError] = useState<string | null>(null);
  const [autoLockSaved, setAutoLockSaved] = useState(false);
  const [authSaved, setAuthSaved] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: add require-auth toggle to Settings page"
```

---

## Task 7: Update `App.tsx` to conditionally skip auth

**Files:**
- Modify: `src/App.tsx`

**Context:**
- Current flow: `App` renders `<LockScreen>` which calls `handleUnlock` → `authenticate()` → `unlockDb()`.
- New flow: on mount, check `getConfig("require_auth")`. If `"false"`, call `unlockDb()` directly. Otherwise show `LockScreen` as before.
- Pass `requireAuth` to `useAutoLock` and `Settings`.
- Tasks 5 and 6 must be completed first so `useAutoLock` and `Settings` accept the new props.

- [ ] **Step 1: Add config check and conditional unlock**

Replace the contents of `src/App.tsx`:

```typescript
import { useState, useCallback, useEffect, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { LockScreen } from "./components/layout/LockScreen";
import { useTheme } from "./hooks/useTheme";

const TeamMembers = lazy(() =>
  import("@/pages/TeamMembers").then((m) => ({ default: m.TeamMembers })),
);
const Titles = lazy(() => import("@/pages/Titles").then((m) => ({ default: m.Titles })));
const SalaryPlanner = lazy(() =>
  import("@/pages/SalaryPlanner").then((m) => ({ default: m.SalaryPlanner })),
);
const Projects = lazy(() => import("@/pages/Projects").then((m) => ({ default: m.Projects })));
const Reports = lazy(() => import("@/pages/Reports").then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.SettingsPage })));
import { useAutoLock } from "./hooks/useAutoLock";
import { flushRegistry } from "./hooks/useAutoSave";
import { pendingDeleteRegistry } from "./hooks/usePendingDelete";
import { authenticate, unlockDb, lockDb, getConfig } from "./lib/db";

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [requireAuth, setRequireAuth] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);
  const { theme, setTheme } = useTheme(unlocked);

  // Check config on mount to decide auth flow
  useEffect(() => {
    getConfig("require_auth")
      .then((value) => {
        const authRequired = value !== "false";
        setRequireAuth(authRequired);
        setConfigLoaded(true);

        if (!authRequired) {
          unlockDb()
            .then(() => setUnlocked(true))
            .catch(() => {
              // If auto-unlock fails, fall back to requiring auth
              setRequireAuth(true);
            });
        }
      })
      .catch(() => {
        setConfigLoaded(true); // Default to requiring auth
      });
  }, []);

  const handleUnlock = useCallback(async () => {
    await authenticate("Unlock MySquad");
    await unlockDb();
    setUnlocked(true);
  }, []);

  const handleLock = useCallback(async () => {
    for (const cancel of pendingDeleteRegistry) cancel();
    await Promise.all([...flushRegistry].map((flush) => flush()));
    await lockDb();
    setUnlocked(false);
  }, []);

  useAutoLock({ onLock: handleLock, enabled: unlocked, requireAuth });

  // Show nothing while checking config
  if (!configLoaded) return null;

  if (!unlocked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<TeamMembers />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/titles" element={<Titles />} />
          <Route path="/salary" element={<SalaryPlanner />} />
          <Route path="/reports" element={<Reports />} />
          <Route
            path="/settings"
            element={
              <Settings
                theme={theme}
                onThemeChange={setTheme}
                requireAuth={requireAuth}
                onRequireAuthChange={setRequireAuth}
              />
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 2: Verify full build passes**

Run: `npm run build`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: check config on startup for optional auth flow"
```

---

## Task 8: End-to-end manual verification

- [ ] **Step 1: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass

- [ ] **Step 2: Start the app**

Run: `npm run tauri dev`

- [ ] **Step 3: Verify default behavior (auth required)**

Expected: Lock screen appears, Touch ID required as before.

- [ ] **Step 4: Disable authentication in Settings**

Go to Settings -> uncheck "Require authentication on startup".
Verify: auto-lock dropdown shows "Never" and is disabled.

- [ ] **Step 5: Restart the app**

Close and re-open.
Expected: App opens directly — no lock screen, no Touch ID prompt.

- [ ] **Step 6: Re-enable authentication**

Go to Settings -> check "Require authentication on startup".
Restart.
Expected: Lock screen appears again.

- [ ] **Step 7: Test tamper protection**

Find `config.json` in `~/Library/Application Support/com.mysquad.app/`.
Manually change `require_auth` from `"true"` to `"false"`.
Restart.
Expected: Lock screen still appears (HMAC mismatch -> defaults to requiring auth).
