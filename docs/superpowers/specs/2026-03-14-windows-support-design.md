# Windows Support Design

## Goal

Ship a Windows 11 version of MySquad with full security parity — Windows Hello biometric unlock and Windows Credential Manager for encryption key storage — so team leads on Windows get the same experience as macOS users.

## Distribution

- NSIS `.exe` installer with auto-updates via `tauri-plugin-updater`
- No `.msi` needed — team leads install it themselves
- Code signing deferred; initial users accept SmartScreen warning

## Architecture: Platform Abstraction Layer

### Trait Definition

A new `platform/` module defines the security contract. All platform-specific code lives behind this boundary — the rest of the codebase is platform-agnostic.

```rust
// src-tauri/src/platform/mod.rs

pub trait PlatformSecurity {
    fn authenticate(reason: &str) -> Result<(), String>;
    fn store_key(key: &str) -> Result<(), String>;
    fn retrieve_key() -> Result<String, String>;
    fn delete_key() -> Result<(), String>;
    fn is_available() -> bool;
}

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::MacSecurity as NativeSecurity;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::WindowsSecurity as NativeSecurity;
```

### File Structure

```
src-tauri/src/
├── platform/
│   ├── mod.rs          // trait + compile-time dispatch
│   ├── macos.rs        // existing biometric.rs + keychain.rs logic
│   └── windows.rs      // Windows Hello + Credential Manager
├── biometric.rs        // removed (contents moved to platform/macos.rs)
├── keychain.rs         // removed (contents moved to platform/macos.rs)
└── ...
```

### macOS Implementation (`platform/macos.rs`)

Moves existing code from `biometric.rs` and `keychain.rs` into a single file implementing the `PlatformSecurity` trait.

- **Biometric**: Unchanged — Swift helper (`MySquadHelper`) using `LocalAuthentication` framework
- **Keychain**: Unchanged — `security-framework` crate with service `"com.mysquad.app"`, account `"db-encryption-key"`

No behavioral changes for macOS users.

### Windows Implementation (`platform/windows.rs`)

Uses Microsoft's official `windows` crate for both features.

**Windows Hello (biometric auth):**
- API: `Windows::Security::Credentials::UI::UserConsentVerifier`
- `RequestVerificationAsync()` prompts for fingerprint, face, or PIN
- Returns `Verified` / `Canceled` / `DeviceNotPresent` etc.
- Direct Rust API call — no external helper binary needed

**Credential Manager (key storage):**
- API: `Windows::Security::Credentials::PasswordVault`
- `Add()` / `Retrieve()` / `Remove()` operations
- Resource: `"com.mysquad.app"`, username: `"db-encryption-key"` (matching macOS conventions)
- Credentials persist across reboots, scoped to the Windows user account
- Encrypted at rest by Windows DPAPI automatically

### Crate Changes in `Cargo.toml`

```toml
[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.58", features = [
    "Security_Credentials_UI",
    "Security_Credentials",
    "Foundation",
] }

[target.'cfg(target_os = "macos")'.dependencies]
security-framework = "3"
```

The `security-framework` dependency moves from shared to macOS-only. The `windows` crate is added for Windows-only builds.

## Callers

`commands.rs` and `db.rs` replace direct calls to `keychain::` and `biometric::` with `NativeSecurity::` calls. No `#[cfg]` needed outside of `platform/`.

Example:
```rust
// Before
let key = keychain::retrieve_key()?;
biometric::authenticate(reason)?;

// After
let key = NativeSecurity::retrieve_key()?;
NativeSecurity::authenticate(reason)?;
```

## Build System

### `build.rs`

Conditional Swift helper compilation:
- Check the target triple environment variable at build time
- Only compile `swift-helper/authenticate.swift` when targeting macOS
- On Windows, `build.rs` just calls `tauri_build::build()`

### Tauri Configuration

Split platform-specific config into overlay files (Tauri v2 feature):

**`tauri.conf.json`** (shared): Remove `externalBin` from base config.

**`tauri.macos.conf.json`** (new):
```json
{
  "bundle": {
    "externalBin": ["target/MySquadHelper"]
  }
}
```

**`tauri.windows.conf.json`** (new):
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

Icons: `icon.ico` already exists in the icons directory.

## CI/CD

### GitHub Actions Matrix Build

Update `.github/workflows/release.yml`:

```yaml
jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            artifact: dmg
          - os: windows-latest
            artifact: nsis
    runs-on: ${{ matrix.os }}
```

- macOS runner: Xcode CLT pre-installed, produces `.dmg`
- Windows runner: No special setup, produces `.exe`

### Release Artifacts

Update semantic-release config in `package.json` to include both:
- macOS: `src-tauri/target/release/bundle/dmg/*.dmg`
- Windows: `src-tauri/target/release/bundle/nsis/*.exe`

### Auto-Updater

Add `tauri-plugin-updater` to serve updates. The updater checks a JSON manifest (hosted as a GitHub Release asset) and downloads the correct installer per platform.

## Testing

- Tests do not call biometric or credential storage APIs (same as current macOS behavior)
- Tests focus on database logic, commands, and migrations — all platform-agnostic
- CI runs `cargo test` on both macOS and Windows runners
- Platform-specific code is tested manually during development

## Frontend

No changes. The frontend is already fully platform-agnostic:
- `LockScreen.tsx` uses generic `Fingerprint` icon and "Authenticate..." / "Unlock" labels
- `db.ts` invoke calls are platform-neutral
- No conditional platform logic exists in the frontend

## What Changes

| Area | Change |
|------|--------|
| **New files** | `platform/mod.rs`, `platform/macos.rs`, `platform/windows.rs`, `tauri.macos.conf.json`, `tauri.windows.conf.json` |
| **Moved** | `biometric.rs` contents → `platform/macos.rs`, `keychain.rs` contents → `platform/macos.rs` |
| **Modified** | `commands.rs` (use `NativeSecurity::`), `build.rs` (conditional Swift), `Cargo.toml` (platform-gated deps), `tauri.conf.json` (remove `externalBin`) |
| **CI** | Matrix strategy adding `windows-latest`, Windows artifact in release config |

## What Does NOT Change

- All frontend code
- Database schema and migrations
- Lock/unlock flow logic
- macOS user experience
- Data format (standalone installs, no cross-platform portability needed)

## Future Considerations

- **Code signing**: EV certificate (~$200-400/year) eliminates SmartScreen warnings for broader distribution
- **Linux**: Adding a third platform implementation to the trait would be straightforward
