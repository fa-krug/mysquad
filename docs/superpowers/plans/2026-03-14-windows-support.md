# Windows Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Windows 11 support with Windows Hello biometric auth and Credential Manager key storage via a platform abstraction layer.

**Architecture:** Create a `platform/` module with a `PlatformSecurity` trait and compile-time dispatch (`#[cfg(target_os)]`). macOS implementation wraps existing `biometric.rs` + `keychain.rs` code unchanged. Windows implementation uses the `windows` crate for Windows Hello (`UserConsentVerifier`) and Credential Manager (`PasswordVault`). All callers switch from `keychain::`/`biometric::` to `NativeSecurity::`.

**Tech Stack:** Rust, `windows` crate v0.58, Tauri v2 platform config overlays, GitHub Actions matrix builds

**Spec:** `docs/superpowers/specs/2026-03-14-windows-support-design.md`

---

## Chunk 1: Platform Abstraction Layer (macOS)

This chunk creates the `platform/` module, moves existing macOS code into it, and updates all callers. macOS behavior is unchanged after this chunk — it's a pure refactor.

### Task 1: Create platform module with trait and generate_key

**Files:**
- Create: `src-tauri/src/platform/mod.rs`

- [ ] **Step 1: Create `src-tauri/src/platform/mod.rs`**

```rust
use rand::Rng;

pub trait PlatformSecurity {
    fn authenticate(reason: &str) -> Result<(), String>;
    fn store_key(key: &str) -> Result<(), String>;
    fn retrieve_key() -> Result<String, String>;
    fn delete_key() -> Result<(), String>;
}

/// Generate a new 32-byte random hex encryption key.
/// Platform-agnostic — lives here, not in platform implementations.
pub fn generate_key() -> String {
    let key: [u8; 32] = rand::rng().random();
    hex::encode(key)
}

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::MacSecurity as NativeSecurity;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::WindowsSecurity as NativeSecurity;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
compile_error!("Unsupported platform: only macOS and Windows are supported");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_key_length() {
        let key = generate_key();
        assert_eq!(key.len(), 64);
    }

    #[test]
    fn test_generate_key_uniqueness() {
        let key1 = generate_key();
        let key2 = generate_key();
        assert_ne!(key1, key2);
    }

    #[test]
    fn test_generate_key_is_hex() {
        let key = generate_key();
        assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/platform/mod.rs
git commit -m "feat: add platform module with trait and generate_key"
```

### Task 2: Create macOS platform implementation

**Files:**
- Create: `src-tauri/src/platform/macos.rs`

- [ ] **Step 1: Create `src-tauri/src/platform/macos.rs`**

Move the contents of `biometric.rs` and `keychain.rs` into this file, implementing the `PlatformSecurity` trait.

```rust
use super::PlatformSecurity;
use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};
use std::path::PathBuf;
use std::process::Command;

const SERVICE_NAME: &str = "com.mysquad.app";
const ACCOUNT_NAME: &str = "db-encryption-key";

pub struct MacSecurity;

impl PlatformSecurity for MacSecurity {
    fn authenticate(reason: &str) -> Result<(), String> {
        let helper_path = get_helper_path()?;
        let output = Command::new(&helper_path)
            .arg(reason)
            .output()
            .map_err(|e| format!("Failed to run biometric helper: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Authentication failed: {}", stderr.trim()))
        }
    }

    fn store_key(key: &str) -> Result<(), String> {
        set_generic_password(SERVICE_NAME, ACCOUNT_NAME, key.as_bytes())
            .map_err(|e| format!("Failed to store key in Keychain: {}", e))
    }

    fn retrieve_key() -> Result<String, String> {
        let password = get_generic_password(SERVICE_NAME, ACCOUNT_NAME)
            .map_err(|e| format!("Failed to retrieve key from Keychain: {}", e))?;
        String::from_utf8(password.to_vec())
            .map_err(|e| format!("Key is not valid UTF-8: {}", e))
    }

    fn delete_key() -> Result<(), String> {
        delete_generic_password(SERVICE_NAME, ACCOUNT_NAME)
            .map_err(|e| format!("Failed to delete key from Keychain: {}", e))
    }
}

fn get_helper_path() -> Result<PathBuf, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?
        .parent()
        .ok_or("Failed to get executable directory")?
        .to_path_buf();

    // In bundled app, helper is next to the executable
    let bundled_path = exe_dir.join("MySquadHelper");
    if bundled_path.exists() {
        return Ok(bundled_path);
    }

    // In dev, helper is in parent directory (target/debug/../MySquadHelper)
    if let Some(parent) = exe_dir.parent() {
        let dev_path = parent.join("MySquadHelper");
        if dev_path.exists() {
            return Ok(dev_path);
        }
    }

    Err("MySquadHelper not found. Run `cargo build` to compile the Swift helper.".to_string())
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/platform/macos.rs
git commit -m "feat: add macOS platform implementation (moved from biometric.rs + keychain.rs)"
```

### Task 3: Wire up platform module and update all callers

**Files:**
- Modify: `src-tauri/src/lib.rs:1-6` (module declarations)
- Modify: `src-tauri/src/commands.rs:1-3` (imports), `:11-14` (authenticate), `:16-35` (unlock_db), `:45-65` (config commands)
- Delete: `src-tauri/src/biometric.rs`
- Delete: `src-tauri/src/keychain.rs`

- [ ] **Step 1: Update `lib.rs` module declarations**

Replace:
```rust
pub mod biometric;
```
with nothing (remove line).

Replace:
```rust
pub mod keychain;
```
with:
```rust
pub mod platform;
```

- [ ] **Step 2: Update `commands.rs` imports**

Replace lines 1-3:
```rust
use crate::biometric;
```
with:
```rust
use crate::platform::{self, NativeSecurity, PlatformSecurity};
```

Remove:
```rust
use crate::keychain;
```

- [ ] **Step 3: Update `authenticate` command (line ~11-14)**

Replace:
```rust
biometric::authenticate(&reason)
```
with:
```rust
NativeSecurity::authenticate(&reason)
```

- [ ] **Step 4: Update `unlock_db` command (lines ~16-35)**

Replace:
```rust
let key = match keychain::retrieve_key() {
    Ok(k) => k,
    Err(_) => {
        let new_key = keychain::generate_key();
        keychain::store_key(&new_key)?;
        new_key
    }
};
```
with:
```rust
let key = match NativeSecurity::retrieve_key() {
    Ok(k) => k,
    Err(_) => {
        let new_key = platform::generate_key();
        NativeSecurity::store_key(&new_key)?;
        new_key
    }
};
```

- [ ] **Step 5: Update `get_config` command (line ~48)**

Replace:
```rust
crate::keychain::retrieve_key()
```
with:
```rust
NativeSecurity::retrieve_key()
```

- [ ] **Step 6: Update `set_config` command (line ~62)**

Replace:
```rust
crate::keychain::retrieve_key()
```
with:
```rust
NativeSecurity::retrieve_key()
```

- [ ] **Step 7: Delete old files**

```bash
rm src-tauri/src/biometric.rs src-tauri/src/keychain.rs
```

- [ ] **Step 8: Verify it compiles**

```bash
cd src-tauri && cargo build
```
Expected: compiles with no errors.

- [ ] **Step 9: Run tests**

```bash
cd src-tauri && cargo test
```
Expected: all existing tests pass (no behavioral changes).

- [ ] **Step 10: Commit**

```bash
git add -A src-tauri/src/
git commit -m "refactor: replace biometric + keychain modules with platform abstraction"
```

### Task 4: Conditional Swift compilation in build.rs

**Files:**
- Modify: `src-tauri/build.rs:1-38`

- [ ] **Step 1: Update `build.rs` to conditionally compile Swift helper**

Replace the entire file with:

```rust
fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();

    if target.contains("apple") {
        compile_swift_helper(&target);
    }

    tauri_build::build();
}

fn compile_swift_helper(target: &str) {
    let swift_source = std::path::Path::new("swift-helper/authenticate.swift");
    let output_path = "target/MySquadHelper";

    if !swift_source.exists() {
        println!("cargo:warning=Swift helper source not found, skipping compilation");
        return;
    }

    println!("cargo:rerun-if-changed={}", swift_source.display());

    let status = std::process::Command::new("swiftc")
        .args([
            &swift_source.to_string_lossy().to_string(),
            "-o",
            output_path,
            "-framework",
            "LocalAuthentication",
        ])
        .status()
        .expect("Failed to run swiftc. Install Xcode Command Line Tools.");

    assert!(status.success(), "Swift compilation failed");

    // Create suffixed copy for Tauri bundling
    let suffixed = format!("target/MySquadHelper-{}", target);
    std::fs::copy(output_path, &suffixed)
        .expect("Failed to copy MySquadHelper for bundling");
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd src-tauri && cargo build
```
Expected: compiles, Swift helper still built on macOS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/build.rs
git commit -m "refactor: conditionally compile Swift helper only on macOS"
```

### Task 5: Platform-gate Cargo dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml:26` (security-framework line)

- [ ] **Step 1: Move `security-framework` to macOS-only dependency**

Remove `security-framework = "3"` from the `[dependencies]` section (line 26).

Add at the end of the file:

```toml
[target.'cfg(target_os = "macos")'.dependencies]
security-framework = "3"
```

- [ ] **Step 2: Verify it compiles and tests pass**

```bash
cd src-tauri && cargo build && cargo test
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "refactor: gate security-framework dependency to macOS only"
```

### Task 6: Split Tauri config into platform overlays

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `src-tauri/tauri.macos.conf.json`
- Create: `src-tauri/tauri.windows.conf.json`

- [ ] **Step 1: Remove `externalBin` and `beforeBundleCommand` from base config**

In `src-tauri/tauri.conf.json`:
- Remove `"beforeBundleCommand": "bash src-tauri/scripts/compile-icon.sh"` from the `"build"` section
- Remove `"externalBin": ["target/MySquadHelper"]` from the `"bundle"` section

- [ ] **Step 2: Create `src-tauri/tauri.macos.conf.json`**

```json
{
  "build": {
    "beforeBundleCommand": "bash src-tauri/scripts/compile-icon.sh"
  },
  "bundle": {
    "externalBin": ["target/MySquadHelper"]
  }
}
```

- [ ] **Step 3: Create `src-tauri/tauri.windows.conf.json`**

```json
{
  "bundle": {
    "targets": ["nsis"],
    "windows": {
      "certificateThumbprint": null,
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

- [ ] **Step 4: Verify macOS build still works**

```bash
npm run tauri build
```
Expected: builds `.dmg` successfully. Verify MySquadHelper is included:
```bash
ls -la src-tauri/target/release/bundle/macos/MySquad.app/Contents/MacOS/MySquadHelper
```
Expected: file exists. If missing, the platform overlay is not being merged — check that Tauri v2 recognizes `tauri.macos.conf.json`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/tauri.macos.conf.json src-tauri/tauri.windows.conf.json
git commit -m "refactor: split Tauri config into platform overlays"
```

---

## Chunk 2: Windows Implementation

This chunk adds the Windows-specific code. Since you don't have a Windows machine, this code is written to compile and run on Windows CI — you'll verify it works when the CI pipeline runs on `windows-latest`.

### Task 7: Add Windows dependencies to Cargo.toml

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add Windows-only dependencies**

Add at the end of the file (after the macOS section):

```toml
[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.58", features = [
    "Security_Credentials_UI",
    "Security_Credentials",
    "Foundation",
] }
```

- [ ] **Step 2: Verify macOS build is unaffected**

```bash
cd src-tauri && cargo build
```
Expected: compiles normally — `windows` crate is not pulled on macOS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "feat: add windows crate dependency for Windows Hello + Credential Manager"
```

### Task 8: Create Windows platform implementation

**Files:**
- Create: `src-tauri/src/platform/windows.rs`

- [ ] **Step 1: Create `src-tauri/src/platform/windows.rs`**

```rust
use super::PlatformSecurity;
use windows::Security::Credentials::UI::{UserConsentVerificationResult, UserConsentVerifier};
use windows::Security::Credentials::{PasswordCredential, PasswordVault};
use windows::core::HSTRING;

const RESOURCE_NAME: &str = "com.mysquad.app";
const USER_NAME: &str = "db-encryption-key";

pub struct WindowsSecurity;

impl PlatformSecurity for WindowsSecurity {
    fn authenticate(reason: &str) -> Result<(), String> {
        let reason = HSTRING::from(reason);
        let result = UserConsentVerifier::RequestVerificationAsync(&reason)
            .map_err(|e| format!("Failed to request Windows Hello: {}", e))?
            .get()
            .map_err(|e| format!("Windows Hello verification failed: {}", e))?;

        match result {
            UserConsentVerificationResult::Verified => Ok(()),
            UserConsentVerificationResult::DeviceNotPresent => {
                Err("No biometric device found. Please ensure Windows Hello is configured in Settings > Accounts > Sign-in options.".to_string())
            }
            UserConsentVerificationResult::NotConfiguredForUser => {
                Err("Windows Hello is not set up. Please configure it in Settings > Accounts > Sign-in options.".to_string())
            }
            UserConsentVerificationResult::DisabledByPolicy => {
                Err("Windows Hello has been disabled by your organization's policy.".to_string())
            }
            UserConsentVerificationResult::Canceled => {
                Err("Authentication was canceled.".to_string())
            }
            _ => Err("Authentication failed.".to_string()),
        }
    }

    fn store_key(key: &str) -> Result<(), String> {
        let vault = PasswordVault::new()
            .map_err(|e| format!("Failed to open Credential Manager: {}", e))?;

        let credential = PasswordCredential::CreatePasswordCredential(
            &HSTRING::from(RESOURCE_NAME),
            &HSTRING::from(USER_NAME),
            &HSTRING::from(key),
        )
        .map_err(|e| format!("Failed to create credential: {}", e))?;

        // Remove existing credential if present (PasswordVault throws if duplicate)
        let _ = delete_credential_from_vault(&vault);

        vault
            .Add(&credential)
            .map_err(|e| format!("Failed to store key in Credential Manager: {}", e))
    }

    fn retrieve_key() -> Result<String, String> {
        let vault = PasswordVault::new()
            .map_err(|e| format!("Failed to open Credential Manager: {}", e))?;

        let credential = vault
            .Retrieve(
                &HSTRING::from(RESOURCE_NAME),
                &HSTRING::from(USER_NAME),
            )
            .map_err(|e| format!("Failed to retrieve key from Credential Manager: {}", e))?;

        credential
            .Password()
            .map_err(|e| format!("Failed to read credential password: {}", e))
            .map(|p| p.to_string_lossy())
    }

    fn delete_key() -> Result<(), String> {
        let vault = PasswordVault::new()
            .map_err(|e| format!("Failed to open Credential Manager: {}", e))?;

        delete_credential_from_vault(&vault)
    }
}

fn delete_credential_from_vault(vault: &PasswordVault) -> Result<(), String> {
    let credential = vault
        .Retrieve(
            &HSTRING::from(RESOURCE_NAME),
            &HSTRING::from(USER_NAME),
        )
        .map_err(|e| format!("Failed to find credential to delete: {}", e))?;

    vault
        .Remove(&credential)
        .map_err(|e| format!("Failed to delete key from Credential Manager: {}", e))
}
```

- [ ] **Step 2: Verify macOS build is unaffected**

```bash
cd src-tauri && cargo build
```
Expected: compiles — `windows.rs` is gated by `#[cfg(target_os = "windows")]` in `mod.rs`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/platform/windows.rs
git commit -m "feat: add Windows Hello + Credential Manager platform implementation"
```

---

## Chunk 3: CI/CD and Release Pipeline

### Task 9: Update GitHub Actions for matrix builds

The CI pipeline needs three jobs: `checks` (matrix), `build` (matrix, uploads artifacts), `release` (single runner, downloads all artifacts, runs semantic-release once). This is because semantic-release must run a single time after both platforms have built — it can't run per-matrix-entry.

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `package.json` (semantic-release config)

- [ ] **Step 1: Update checks job to use matrix strategy**

Add a matrix strategy so checks run on both platforms:

```yaml
jobs:
  checks:
    strategy:
      matrix:
        include:
          - os: macos-latest
          - os: windows-latest
    runs-on: ${{ matrix.os }}
```

Keep the existing check steps. Add a conditional for the formatting check since it's platform-independent and only needs to run once:

```yaml
    - name: Check formatting
      if: matrix.os == 'macos-latest'
      run: cd src-tauri && cargo fmt -- --check
```

- [ ] **Step 2: Create a `build` job that builds and uploads artifacts per platform**

```yaml
  build:
    needs: checks
    strategy:
      matrix:
        include:
          - os: macos-latest
            artifact_name: macos-build
            artifact_path: src-tauri/target/release/bundle/dmg
          - os: windows-latest
            artifact_name: windows-build
            artifact_path: src-tauri/target/release/bundle/nsis
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Install Perl (Windows, for SQLCipher)
        if: matrix.os == 'windows-latest'
        run: choco install strawberryperl -y
      - run: npm ci
      - name: Build Tauri app
        run: npx tauri build
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact_name }}
          path: ${{ matrix.artifact_path }}
```

- [ ] **Step 3: Create a `release` job that downloads all artifacts and runs semantic-release once**

```yaml
  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - name: Download macOS artifact
        uses: actions/download-artifact@v4
        with:
          name: macos-build
          path: src-tauri/target/release/bundle/dmg
      - name: Download Windows artifact
        uses: actions/download-artifact@v4
        with:
          name: windows-build
          path: src-tauri/target/release/bundle/nsis
      - name: Release
        run: npx semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Make `tauri:build` script platform-aware**

The current `package.json` has `"tauri:build": "tauri build && bash src-tauri/scripts/inject-icon.sh"`. The `inject-icon.sh` script is macOS-only and will fail on Windows. Update to:

```json
"tauri:build": "tauri build"
```

Move the `inject-icon.sh` call to the macOS `beforeBundleCommand` in `tauri.macos.conf.json` (already handled in Task 6), or make the script exit early on non-macOS.

- [ ] **Step 5: Update semantic-release assets in `package.json`**

In the `@semantic-release/github` plugin config, add the Windows artifact:

```json
"assets": [
  {
    "path": "src-tauri/target/release/bundle/dmg/*.dmg",
    "label": "MySquad-${nextRelease.version}.dmg"
  },
  {
    "path": "src-tauri/target/release/bundle/nsis/*.exe",
    "label": "MySquad-${nextRelease.version}-Setup.exe"
  }
]
```

- [ ] **Step 6: Update semantic-release `prepareCmd` to skip Tauri build**

The `prepareCmd` currently runs `npm run tauri:build`, but building now happens in the `build` job, not during semantic-release. Update the `@semantic-release/exec` config:

```json
"prepareCmd": "node scripts/sync-version.js ${nextRelease.version}"
```

Remove the `&& npm run tauri:build` part — builds happen in the matrix job.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/release.yml package.json
git commit -m "ci: restructure pipeline for multi-platform builds and single release"
```

### Task 10: Verify Windows CI build

- [ ] **Step 1: Push branch and verify CI**

Push the branch and check that:
1. macOS checks pass (formatting, lint, TypeScript, Rust tests)
2. Windows checks pass (lint, TypeScript, Rust tests — no formatting check)
3. macOS build produces `.dmg`
4. Windows build produces `.exe`

If `bundled-sqlcipher` fails on Windows, the Strawberry Perl step may need adjustments. Check the CI logs for specific errors.

- [ ] **Step 2: Download and test the Windows `.exe`** (manual, on a Windows 11 machine or VM when available)

Verify:
- Installer runs and installs the app
- App launches and shows the lock screen
- Windows Hello prompt appears on unlock
- Database is created and encrypted
- All features work (team members, titles, salary planner, settings)

---

## Task Dependency Summary

```
Task 1 (platform/mod.rs)
  └─► Task 2 (platform/macos.rs)
       └─► Task 3 (wire up callers, delete old files)
            ├─► Task 4 (build.rs)          ─┐
            ├─► Task 5 (Cargo.toml macOS)   ├─► Task 7 (Cargo.toml Windows)
            └─► Task 6 (Tauri overlays)    ─┘        └─► Task 8 (platform/windows.rs)
                                                           └─► Task 9 (CI/CD pipeline)
                                                                └─► Task 10 (verify)
```

Tasks 4, 5, and 6 can be done in parallel after Task 3. Tasks 7 and 8 can start once Task 5 is done.

## Out of Scope (Deferred)

- **Auto-updater (`tauri-plugin-updater`)**: The spec mentions this but it's a separate feature. Add it as a follow-up after Windows builds are verified working.
- **Code signing**: Deferred per spec — obtain EV certificate before broad rollout.
