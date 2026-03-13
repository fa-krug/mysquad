# Optional Authentication on Startup

## Summary

Make biometric authentication (Touch ID) on startup optional via a Settings toggle. When disabled, the app skips the lock screen and opens directly — but the database remains encrypted with the same Keychain-stored key. Auto-lock is disabled when auth is off.

## Problem

Currently, Touch ID is always required on startup. Some users may prefer convenience over the extra auth gate, especially on a personal machine already protected by macOS login.

## Design

### Config Storage

A JSON config file (`config.json`) stored in the Tauri app data directory, **separate from the encrypted DB**. This is necessary because the setting must be readable before the DB is unlocked.

**File format:**
```json
{
  "require_auth": true,
  "hmac": "hex-encoded-hmac-sha256"
}
```

**Tamper protection:** The config is HMAC-SHA256 signed using the DB encryption key from the macOS Keychain. On read, the HMAC is verified — if it fails (file was manually edited), the app defaults to `require_auth = true`. An attacker would need Keychain access (requires macOS login) to forge a valid signature.

### Rust Backend Changes

**New module: `config.rs`**

- `get_config_path()` — returns `{app_data_dir}/config.json`
- `read_config(key: &str) -> Option<String>` — reads and HMAC-verifies the config file, returns the value for the given key. Returns `None` if file missing, corrupt, or HMAC invalid.
- `write_config(key: &str, value: &str)` — reads existing config (or creates new), sets the key, computes HMAC with the Keychain key, writes the file.

**New Tauri commands in `commands.rs`:**

- `get_config(key: String) -> Result<Option<String>, String>` — wraps `config::read_config`
- `set_config(key: String, value: String) -> Result<(), String>` — wraps `config::write_config`

**Register in `lib.rs`.**

### Frontend Changes

**`src/lib/db.ts`:**
- Add `getConfig(key)` and `setConfig(key, value)` invoke wrappers.

**`src/App.tsx`:**
- On mount, call `getConfig("require_auth")`.
  - If `"false"`: call `unlockDb()` directly (no `authenticate()`, no lock screen).
  - If `"true"` or `null` (default): current behavior (show LockScreen, require Touch ID).
- Pass `requireAuth` state down to determine auto-lock behavior.

**`src/components/layout/LockScreen.tsx`:**
- No changes needed — it simply won't be rendered when auth is disabled.

**`src/hooks/useAutoLock.ts`:**
- Accept a new condition: skip auto-lock when `requireAuth` is false.

**`src/pages/Settings.tsx`:**
- Add a "Require authentication" toggle above the auto-lock setting.
- When toggled off: set auto-lock to "Never" and disable the auto-lock dropdown.
- When toggled on: re-enable the auto-lock dropdown.
- Persist via `setConfig("require_auth", "true" | "false")`.

### Startup Flow

```
App mounts
  → getConfig("require_auth")
  → if false:
      → unlockDb() (uses Keychain key, no biometric)
      → show app content
      → auto-lock disabled
  → if true / null:
      → show LockScreen
      → user taps Unlock → authenticate() → unlockDb()
      → auto-lock enabled per setting
```

### Edge Cases

- **First launch (no config file):** Defaults to `require_auth = true` (current behavior).
- **Tampered config file:** HMAC verification fails → defaults to `require_auth = true`.
- **No Keychain key yet (first launch + auth disabled):** Not possible — the key is created on first `unlockDb()` call, and the config can only be written from Settings (which requires the app to be unlocked first).
- **User disables auth, then re-enables:** Lock screen returns on next launch. Auto-lock dropdown re-enabled.

### Dependencies

- `hmac` and `sha2` Rust crates (for HMAC-SHA256)
- Tauri `app_data_dir` API for config file path

## Out of Scope

- Password-based auth as an alternative to biometrics
- Per-session "remember me" options
- Remote lock/wipe
