# Auto-Updater Design

## Overview

Add update checking and auto-update functionality to MySquad using `tauri-plugin-updater` with GitHub Releases as the update source. The app checks for updates on launch and provides a manual check in Settings. Updates show a modal dialog with version info and release notes.

## Architecture

Three layers:

1. **Tauri Plugin** — `tauri-plugin-updater` + `tauri-plugin-process` registered in the Rust backend. Handles checking GitHub Releases for a newer version, downloading the signed update bundle, verifying its ed25519 signature, and replacing the app binary.
2. **Frontend update check** — On app launch (after unlock), calls `check()` from `@tauri-apps/plugin-updater`. If an update exists, shows a modal dialog. A "Check for Updates" button in Settings triggers the same flow on demand.
3. **CI/CD** — GitHub Actions generates signed update bundles and a `latest.json` manifest alongside existing DMG/EXE release assets.

No new Rust commands needed — the plugin's JS bindings handle everything from the frontend. The Rust side just registers the plugin.

## Update Flow

### On launch (after unlock)

1. App calls `check()` from `@tauri-apps/plugin-updater`
2. Plugin fetches `latest.json` from GitHub Releases, compares versions
3. If no update — nothing happens, silent
4. If update available — show modal dialog with:
   - Title: "Update Available"
   - Current version vs new version
   - Release notes body (from `update.body`)
   - Two buttons: **"Update Now"** and **"Later"**
5. "Later" — dismiss, continue using the app normally
6. "Update Now" — show progress bar while downloading, install, prompt to relaunch

### From Settings ("Check for Updates" button)

Same flow as above, except if no update is found, show a brief "You're up to date" message.

### Error handling

- Network failure on check — silent on launch, show error message if triggered from Settings
- Download failure — show error in the modal with a "Retry" option

## Update Dialog Component

New `UpdateDialog` component using the existing `AlertDialog` from shadcn/ui. Three states:

- **Update available** — Version comparison, scrollable release notes area, "Update Now" and "Later" buttons
- **Downloading** — Progress bar with percentage, dialog not dismissable
- **Error** — Error message with "Retry" and "Cancel" buttons

Location: `src/components/layout/UpdateDialog.tsx` (alongside AppLayout, Sidebar, LockScreen).

### Settings integration

New "About" section at the bottom of Settings page:

- Current version display (via `getVersion()` from `@tauri-apps/api/app`)
- "Check for Updates" button triggering the same check/dialog flow
- "You're up to date" / error feedback inline

## Dependencies

### Rust (src-tauri/Cargo.toml)

```toml
[target."cfg(not(any(target_os = \"android\", target_os = \"ios\")))".dependencies]
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

### Frontend (package.json)

```
@tauri-apps/plugin-updater
@tauri-apps/plugin-process
```

### Plugin registration (src-tauri/src/lib.rs)

Register both plugins in the Tauri builder:

```rust
app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
app.handle().plugin(tauri_plugin_process::init())?;
```

## Configuration

### tauri.conf.json

```json
{
  "plugins": {
    "updater": {
      "pubkey": "<ed25519-public-key>",
      "endpoints": [
        "https://github.com/fa-krug/mysquad/releases/latest/download/latest.json"
      ]
    }
  }
}
```

### Capabilities (src-tauri/capabilities/default.json)

Add to the existing permissions array:

```json
"updater:default",
"process:allow-restart"
```

## CI/CD & Signing

### Key generation

Generate an ed25519 key pair:

```bash
tauri signer generate -w ~/.tauri/myapp.key
```

### GitHub Actions secrets

- `TAURI_SIGNING_PRIVATE_KEY` — the private key content
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password for the key

### Workflow changes (.github/workflows/release.yml)

1. Add `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as env vars during the build step
2. Tauri automatically generates signed update bundles (`.tar.gz` on macOS, `.nsis.zip` on Windows) and `latest.json` when these env vars are present
3. Upload `latest.json` as an additional release asset via `@semantic-release/github`
4. Add the update bundle artifacts to the semantic-release assets list

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-updater` and `tauri-plugin-process` dependencies |
| `package.json` | Add `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` |
| `src-tauri/src/lib.rs` | Register updater and process plugins |
| `src-tauri/tauri.conf.json` | Add updater plugin config (pubkey, endpoints) |
| `src-tauri/capabilities/default.json` | Add `updater:default` and `process:allow-restart` permissions |
| `src/components/layout/UpdateDialog.tsx` | New — modal dialog for update available/downloading/error states |
| `src/pages/Settings.tsx` | Add "About" section with version display and "Check for Updates" button |
| `src/App.tsx` (or wherever post-unlock init lives) | Trigger update check after unlock |
| `.github/workflows/release.yml` | Add signing env vars, upload `latest.json` and update bundles |
