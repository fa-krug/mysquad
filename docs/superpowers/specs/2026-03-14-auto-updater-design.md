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

1. Guard: only run in the main window (`getCurrent().label === 'main'`), skip in secondary windows
2. App calls `check()` from `@tauri-apps/plugin-updater`
2. Plugin fetches `latest.json` from GitHub Releases, compares versions
3. If no update — nothing happens, silent
4. If update available — show modal dialog with:
   - Title: "Update Available"
   - Current version vs new version
   - Release notes body (from `update.body`)
   - Two buttons: **"Update Now"** and **"Later"**
5. "Later" — dismiss, continue using the app normally
6. "Update Now" → transition to **Downloading** state:
   - Show progress bar with percentage (via `downloadAndInstall` progress callback)
   - Dialog is not dismissable during download
7. Download + install completes → transition to **Ready to Relaunch** state:
   - Message: "Update installed successfully"
   - Single button: **"Relaunch Now"**
   - Clicking calls `relaunch()` from `@tauri-apps/plugin-process`

### From Settings ("Check for Updates" button)

Same flow as above, except if no update is found, show a brief "You're up to date" message.

### Error handling

- Network failure on check — silent on launch, show error message if triggered from Settings
- Download failure — show error in the modal with a "Retry" option

## Update Dialog Component

New `UpdateDialog` component using the existing `AlertDialog` from shadcn/ui. Four states:

- **Update available** — Version comparison, scrollable release notes area, "Update Now" and "Later" buttons
- **Downloading** — Progress bar with percentage, dialog not dismissable
- **Ready to relaunch** — "Update installed successfully" message with "Relaunch Now" button
- **Error** — Error message with "Retry" and "Cancel" buttons

Location: `src/components/layout/UpdateDialog.tsx` (alongside AppLayout, Sidebar, LockScreen).

### Settings integration

New "About" section at the bottom of Settings page:

- Current version display (via `getVersion()` from `@tauri-apps/api/app`)
- "Check for Updates" button triggering the same check/dialog flow
- "You're up to date" / error feedback inline

## Dependencies

### Rust (src-tauri/Cargo.toml)

Add under `[dependencies]` (consistent with existing dependency style — no mobile-exclusion gate needed since this app targets desktop only):

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

### Frontend (package.json)

```
@tauri-apps/plugin-updater
@tauri-apps/plugin-process
```

### Plugin registration (src-tauri/src/lib.rs)

Register `tauri-plugin-process` as a `.plugin()` call on the builder chain (like existing `tauri_plugin_dialog::init()`). Register `tauri-plugin-updater` inside the existing `.setup()` block via `app.handle().plugin()` — the updater uses a Builder pattern that requires this:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_process::init())
    // ...
    .setup(|app| {
        #[cfg(desktop)]
        app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
        // ... existing menu setup code ...
        Ok(())
    })
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

The capabilities are scoped to `"windows": ["main"]`. Update checks will only work from the primary window. Secondary windows (opened via Cmd+N) do not need update capabilities since the check is triggered once on unlock in the main window.

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
2. Tauri automatically generates signed update bundles and per-platform `latest.json` when these env vars are present:
   - macOS: `.app.tar.gz` + `.app.tar.gz.sig` + `latest.json`
   - Windows: `.nsis.zip` + `.nsis.zip.sig` + `latest.json`
3. Add a post-build step to merge the per-platform `latest.json` files into a single manifest. Each platform's `latest.json` contains a `platforms` object keyed by target triple (e.g., `darwin-aarch64`, `windows-x86_64`). The merge script combines these into one `latest.json` with all platform entries.
4. Expand the `upload-artifact` step in each platform build job to include update bundle directories (macOS: `src-tauri/target/release/bundle/macos/*.tar.gz*`, Windows: `src-tauri/target/release/bundle/nsis/*.nsis.zip*`) alongside the existing DMG/NSIS paths, plus each platform's `latest.json`
5. In the release job, upload the merged `latest.json` and all update bundles (`.app.tar.gz`, `.app.tar.gz.sig`, `.nsis.zip`, `.nsis.zip.sig`) as release assets via `@semantic-release/github`

### macOS code signing note

The ed25519 signature is for the Tauri updater's own verification. If the app is distributed with macOS code signing (e.g., Developer ID), the update bundle must also be code-signed separately. This is handled by the existing Tauri build process when `APPLE_SIGNING_IDENTITY` and related env vars are set in CI. This spec does not add macOS code signing — it is a separate concern.

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-updater` and `tauri-plugin-process` dependencies |
| `Cargo.lock` | Auto-updated by cargo |
| `package.json` | Add `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` |
| `package-lock.json` | Auto-updated by npm |
| `src-tauri/src/lib.rs` | Register updater and process plugins on builder chain |
| `src-tauri/tauri.conf.json` | Add updater plugin config (pubkey, endpoints) |
| `src-tauri/capabilities/default.json` | Add `updater:default` and `process:allow-restart` permissions |
| `src/components/layout/UpdateDialog.tsx` | New — modal dialog for update available/downloading/relaunch/error states |
| `src/pages/Settings.tsx` | Add "About" section with version display and "Check for Updates" button |
| `src/App.tsx` | Trigger update check in `useEffect` when `unlocked` transitions to `true`, guarded by window label check (`getCurrent().label === 'main'`) to avoid errors in secondary windows |
| `.github/workflows/release.yml` | Add signing env vars, merge `latest.json`, upload update bundles |
