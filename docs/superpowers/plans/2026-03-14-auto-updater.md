# Auto-Updater Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add update checking and auto-update to MySquad using `tauri-plugin-updater` with GitHub Releases.

**Architecture:** The Tauri updater plugin handles version checking against a `latest.json` manifest hosted as a GitHub Release asset, downloading signed update bundles, and replacing the app binary. The frontend triggers checks on unlock (main window only) and on-demand from Settings, showing a modal dialog for the update flow.

**Tech Stack:** `tauri-plugin-updater` v2, `tauri-plugin-process` v2, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, shadcn/ui AlertDialog

**Spec:** `docs/superpowers/specs/2026-03-14-auto-updater-design.md`

---

## Chunk 1: Backend Setup

### Task 1: Add Rust dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml:20-33` (dependencies section)

- [ ] **Step 1: Add tauri-plugin-updater and tauri-plugin-process to Cargo.toml**

In `src-tauri/Cargo.toml`, add these two lines under `[dependencies]` (after the existing `tauri-plugin-dialog = "2"` line):

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors (warnings OK)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: add tauri-plugin-updater and tauri-plugin-process dependencies"
```

### Task 2: Register plugins in Tauri builder

**Files:**
- Modify: `src-tauri/src/lib.rs:16-44`

- [ ] **Step 1: Add tauri-plugin-process to the builder chain**

In `src-tauri/src/lib.rs`, add `.plugin(tauri_plugin_process::init())` after the existing `.plugin(tauri_plugin_dialog::init())` line (line 17):

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_process::init())
    .manage(AppDb::new())
```

- [ ] **Step 2: Add tauri-plugin-updater inside .setup()**

The updater plugin uses a Builder pattern and must be registered inside `.setup()` via `app.handle().plugin()`. Add this at the top of the existing `.setup()` closure, before the menu code (before line 20):

```rust
.setup(|app| {
    #[cfg(desktop)]
    app.handle()
        .plugin(tauri_plugin_updater::Builder::new().build())?;

    let new_window = MenuItemBuilder::new("New Window")
    // ... rest of existing setup code
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: register updater and process plugins in Tauri builder"
```

### Task 3: Add updater config and capabilities

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add updater plugin config to tauri.conf.json**

Add a `"plugins"` key at the top level of `src-tauri/tauri.conf.json` (after the `"bundle"` section, before the closing `}`):

```json
  "plugins": {
    "updater": {
      "pubkey": "UPDATER_PUBKEY_PLACEHOLDER",
      "endpoints": [
        "https://github.com/fa-krug/mysquad/releases/latest/download/latest.json"
      ]
    }
  }
```

Note: The `UPDATER_PUBKEY_PLACEHOLDER` will be replaced with the real public key after running `tauri signer generate`. This is done manually outside the plan.

- [ ] **Step 2: Add updater and process permissions to capabilities**

In `src-tauri/capabilities/default.json`, add `"updater:default"` and `"process:allow-restart"` to the `permissions` array:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "updater:default",
    "process:allow-restart"
  ]
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat: add updater config and capabilities"
```

## Chunk 2: Frontend Dependencies and Update Dialog

### Task 4: Add frontend dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the frontend plugin packages**

Run: `npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process`
Expected: Packages install successfully, `package.json` updated

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @tauri-apps/plugin-updater and @tauri-apps/plugin-process"
```

### Task 5: Add Progress component

**Files:**
- Create: `src/components/ui/progress.tsx`

The app doesn't have a Progress component yet. Add one for the download progress bar.

- [ ] **Step 1: Add shadcn Progress component**

Run: `npx shadcn@latest add progress`
Expected: Creates `src/components/ui/progress.tsx`

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/progress.tsx
git commit -m "feat: add shadcn Progress component"
```

### Task 6: Create UpdateDialog component

**Files:**
- Create: `src/components/layout/UpdateDialog.tsx`

- [ ] **Step 1: Create the UpdateDialog component**

Create `src/components/layout/UpdateDialog.tsx` with the following content. The dialog has four states: `available`, `downloading`, `ready`, and `error`.

```tsx
import { useState, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";

type DialogState =
  | { kind: "available"; update: Update }
  | { kind: "downloading"; progress: number }
  | { kind: "ready" }
  | { kind: "error"; message: string; update: Update };

interface UpdateDialogProps {
  state: DialogState | null;
  onDismiss: () => void;
  onStateChange: (state: DialogState | null) => void;
}

export function UpdateDialog({ state, onDismiss, onStateChange }: UpdateDialogProps) {
  if (!state) return null;

  async function handleUpdate(update: Update) {
    onStateChange({ kind: "downloading", progress: 0 });
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        }
        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            onStateChange({
              kind: "downloading",
              progress: Math.round((downloadedBytes / totalBytes) * 100),
            });
          }
        }
      });
      onStateChange({ kind: "ready" });
    } catch (err) {
      onStateChange({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
        update,
      });
    }
  }

  async function handleRelaunch() {
    await relaunch();
  }

  const isOpen = state !== null;
  const canDismiss = state.kind === "available" || state.kind === "error";

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && canDismiss) onDismiss();
      }}
    >
      <AlertDialogContent>
        {state.kind === "available" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Update Available</AlertDialogTitle>
              <AlertDialogDescription>
                Version {state.update.version} is available.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {state.update.body && (
              <div className="max-h-48 overflow-y-auto rounded-md border p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                {state.update.body}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Later</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleUpdate(state.update)}>
                Update Now
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}

        {state.kind === "downloading" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Downloading Update</AlertDialogTitle>
              <AlertDialogDescription>
                Please wait while the update is downloaded and installed...
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Progress value={state.progress} className="w-full" />
            <p className="text-center text-sm text-muted-foreground">{state.progress}%</p>
          </>
        )}

        {state.kind === "ready" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Update Installed</AlertDialogTitle>
              <AlertDialogDescription>
                The update has been installed successfully. Relaunch to start using the new version.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={handleRelaunch}>Relaunch Now</AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}

        {state.kind === "error" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Update Failed</AlertDialogTitle>
              <AlertDialogDescription>{state.message}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleUpdate(state.update)}>
                Retry
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useUpdateCheck() {
  const [dialogState, setDialogState] = useState<DialogState | null>(null);

  const checkForUpdate = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const update = await check();
      if (update) {
        setDialogState({ kind: "available", update });
        return true;
      }
      return false;
    } catch {
      if (!options?.silent) {
        throw new Error("Failed to check for updates. Please check your internet connection.");
      }
      return false;
    }
  }, []);

  const dismiss = useCallback(() => setDialogState(null), []);

  return { dialogState, setDialogState, checkForUpdate, dismiss };
}
```

- [ ] **Step 2: Verify the file has no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors (or only pre-existing errors unrelated to this file)

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/UpdateDialog.tsx
git commit -m "feat: add UpdateDialog component with download progress and relaunch"
```

## Chunk 3: Integration (App.tsx + Settings)

### Task 7: Trigger update check on unlock in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports**

Add these imports at the top of `src/App.tsx`:

```tsx
import { getCurrent } from "@tauri-apps/api/webviewWindow";
import { UpdateDialog, useUpdateCheck } from "./components/layout/UpdateDialog";
```

- [ ] **Step 2: Add the update hook and effect**

Inside the `App` function, after the existing `useAutoLock` call (line 63), add:

```tsx
const { dialogState, setDialogState, checkForUpdate, dismiss } = useUpdateCheck();

// Check for updates after unlock (main window only)
useEffect(() => {
  if (unlocked && getCurrent().label === "main") {
    checkForUpdate({ silent: true });
  }
}, [unlocked, checkForUpdate]);
```

- [ ] **Step 3: Render the UpdateDialog**

Add the `<UpdateDialog>` component just before the `<BrowserRouter>` in the return statement. Wrap both in a fragment:

```tsx
return (
  <>
    <UpdateDialog state={dialogState} onDismiss={dismiss} onStateChange={setDialogState} />
    <BrowserRouter>
      {/* ... existing routes ... */}
    </BrowserRouter>
  </>
);
```

- [ ] **Step 4: Pass checkForUpdate to Settings**

Update the Settings route to pass `checkForUpdate` as a prop:

```tsx
<Route
  path="/settings"
  element={
    <Settings
      theme={theme}
      onThemeChange={setTheme}
      requireAuth={requireAuth}
      onRequireAuthChange={setRequireAuth}
      onCheckForUpdate={checkForUpdate}
    />
  }
/>
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors in Settings.tsx about the new prop (expected — we fix that in the next task)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: trigger update check on unlock and wire UpdateDialog"
```

### Task 8: Add "About" section to Settings page

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Add imports**

Add these imports at the top of `src/pages/Settings.tsx`:

```tsx
import { getVersion } from "@tauri-apps/api/app";
```

- [ ] **Step 2: Add the onCheckForUpdate prop and version state**

Update the `SettingsPageProps` interface to include the new prop:

```tsx
interface SettingsPageProps {
  theme?: string;
  onThemeChange?: (theme: "light" | "dark" | "system") => void;
  requireAuth: boolean;
  onRequireAuthChange: (value: boolean) => void;
  onCheckForUpdate: (options?: { silent?: boolean }) => Promise<boolean>;
}
```

Destructure it in the function signature:

```tsx
export function SettingsPage({
  theme,
  onThemeChange,
  requireAuth,
  onRequireAuthChange,
  onCheckForUpdate,
}: SettingsPageProps) {
```

Add state for version and update check feedback inside the component:

```tsx
const [appVersion, setAppVersion] = useState<string>("");
const [checking, setChecking] = useState(false);
const [upToDate, setUpToDate] = useState(false);
const [checkError, setCheckError] = useState<string | null>(null);
```

- [ ] **Step 3: Add useEffect to load the version**

After the existing `useEffect` for `auto_lock_timeout` (around line 47), add:

```tsx
useEffect(() => {
  getVersion().then(setAppVersion);
}, []);
```

- [ ] **Step 4: Add the check handler**

Add this function inside the component (after `clearExportImportMessage`):

```tsx
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
```

- [ ] **Step 5: Add the About section to the JSX**

After the Data Management section (after the `{showImportDialog && ...}` block, before the closing `</div>` of `space-y-6`), add:

```tsx
{/* About */}
<div className="space-y-1.5">
  <h2 className="text-sm font-medium">About</h2>
  <p className="text-xs text-muted-foreground">
    MySquad v{appVersion}
  </p>
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
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: add About section with version display and update check to Settings"
```

## Chunk 4: CI/CD Changes

### Task 9: Update GitHub Actions workflow for updater artifacts

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `package.json` (semantic-release assets)

- [ ] **Step 1: Add signing env vars to the build step**

In `.github/workflows/release.yml`, update the "Build Tauri app" step (line 78-79) to include the signing environment variables:

```yaml
      - name: Build Tauri app
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        run: npx tauri build
```

- [ ] **Step 2: Upload updater artifacts alongside existing bundles**

After the existing "Upload artifacts" step (lines 85-89), add a second upload step for the updater-specific files. The macOS updater bundle is at `bundle/macos/` and Windows at `bundle/nsis/` (the `.nsis.zip` files are in the same nsis directory):

```yaml
      - name: Upload updater artifacts (macOS)
        if: runner.os == 'macOS'
        uses: actions/upload-artifact@v4
        with:
          name: updater-macos
          path: |
            src-tauri/target/release/bundle/macos/*.tar.gz
            src-tauri/target/release/bundle/macos/*.tar.gz.sig
            src-tauri/target/release/bundle/macos/latest.json

      - name: Upload updater artifacts (Windows)
        if: runner.os == 'Windows'
        uses: actions/upload-artifact@v4
        with:
          name: updater-windows
          path: |
            src-tauri/target/release/bundle/nsis/*.nsis.zip
            src-tauri/target/release/bundle/nsis/*.nsis.zip.sig
            src-tauri/target/release/bundle/nsis/latest.json
```

- [ ] **Step 3: Download updater artifacts in the release job**

After the existing "Download Windows artifacts" step (lines 118-122), add:

```yaml
      - name: Download macOS updater artifacts
        uses: actions/download-artifact@v4
        with:
          name: updater-macos
          path: src-tauri/target/release/bundle/macos/

      - name: Download Windows updater artifacts
        uses: actions/download-artifact@v4
        with:
          name: updater-windows
          path: src-tauri/target/release/bundle/nsis/
```

- [ ] **Step 4: Add a step to merge per-platform latest.json files**

Each platform's Tauri build generates a `latest.json` in the bundle output. These need to be merged into a single `latest.json`. Add this step in the release job, after downloading all artifacts but before the `npx semantic-release` step.

Note: The exact path where Tauri v2 generates `latest.json` may vary (could be `bundle/macos/`, `bundle/nsis/`, or `bundle/` root). The paths in the upload steps and merge script may need adjustment after verifying the first CI build output.

```yaml
      - name: Merge updater manifests
        run: |
          node -e "
          const fs = require('fs');
          const path = require('path');
          const merged = { version: '', notes: '', pub_date: '', platforms: {} };
          const dirs = [
            'src-tauri/target/release/bundle/macos',
            'src-tauri/target/release/bundle/nsis'
          ];
          for (const dir of dirs) {
            const f = path.join(dir, 'latest.json');
            if (fs.existsSync(f)) {
              const data = JSON.parse(fs.readFileSync(f, 'utf8'));
              merged.version = data.version || merged.version;
              merged.notes = data.notes || merged.notes;
              merged.pub_date = data.pub_date || merged.pub_date;
              Object.assign(merged.platforms, data.platforms || {});
            }
          }
          fs.writeFileSync('latest.json', JSON.stringify(merged, null, 2));
          console.log('Merged latest.json:', JSON.stringify(merged, null, 2));
          "
```

- [ ] **Step 5: Add updater assets to semantic-release config in package.json**

In `package.json`, update the `@semantic-release/github` assets array to include the updater artifacts and `latest.json`:

```json
[
  "@semantic-release/github",
  {
    "assets": [
      {
        "path": "src-tauri/target/release/bundle/dmg/*.dmg",
        "label": "MySquad-${nextRelease.version}.dmg"
      },
      {
        "path": "src-tauri/target/release/bundle/nsis/*.exe",
        "label": "MySquad-${nextRelease.version}-Setup.exe"
      },
      {
        "path": "src-tauri/target/release/bundle/macos/*.tar.gz",
        "label": "MySquad-${nextRelease.version}-macos-update.tar.gz"
      },
      {
        "path": "src-tauri/target/release/bundle/macos/*.tar.gz.sig",
        "label": "MySquad-${nextRelease.version}-macos-update.tar.gz.sig"
      },
      {
        "path": "src-tauri/target/release/bundle/nsis/*.nsis.zip",
        "label": "MySquad-${nextRelease.version}-windows-update.nsis.zip"
      },
      {
        "path": "src-tauri/target/release/bundle/nsis/*.nsis.zip.sig",
        "label": "MySquad-${nextRelease.version}-windows-update.nsis.zip.sig"
      },
      {
        "path": "latest.json",
        "label": "latest.json"
      }
    ]
  }
]
```

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/release.yml package.json
git commit -m "feat: add updater signing, artifact upload, and latest.json merge to CI"
```

## Chunk 5: Manual Setup Steps (Reference)

### Task 10: Document manual setup steps

These steps must be done manually by the developer and are not automatable in this plan.

- [ ] **Step 1: Generate signing keys**

Run locally (one-time):

```bash
npx tauri signer generate -w ~/.tauri/mysquad.key
```

This outputs a public key and creates a private key file. Save the public key.

- [ ] **Step 2: Set the public key in tauri.conf.json**

Replace `UPDATER_PUBKEY_PLACEHOLDER` in `src-tauri/tauri.conf.json` with the public key from step 1.

- [ ] **Step 3: Add GitHub Actions secrets**

In the GitHub repo settings (Settings > Secrets and variables > Actions), add:

- `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/mysquad.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password you chose during generation

- [ ] **Step 4: Commit the pubkey change**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat: add updater signing public key"
```

- [ ] **Step 5: Test end-to-end**

1. Push to main to trigger a release build
2. Verify the release includes `latest.json`, `.tar.gz`/`.nsis.zip` update bundles, and `.sig` files
3. On the next version bump, verify the app shows the update dialog on launch
