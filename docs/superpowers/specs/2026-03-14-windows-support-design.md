# Windows Support Design

## Goal

Ship a Windows 11 version of MySquad with full security parity — Windows Hello biometric unlock and Windows Credential Manager for encryption key storage — so team leads on Windows get the same experience as macOS users.

## Distribution

- NSIS `.exe` installer with auto-updates via `tauri-plugin-updater`
- No `.msi` needed — team leads install it themselves
- Code signing deferred for initial release; early users accept SmartScreen warning ("Windows protected your PC" → "More info" → "Run anyway"). Note: unsigned Rust/Tauri binaries are occasionally flagged by Windows Defender as false positives — submitting the binary to Microsoft for analysis mitigates this. Plan to obtain a code signing certificate before broader distribution.

## Architecture: Platform Abstraction Layer

### Module Design

A new `platform/` module defines matching function signatures per platform, dispatched at compile time via `#[cfg]`. This is intentionally not a dynamic-dispatch trait — just parallel module-level functions verified by convention, since all calls go through the `NativeSecurity` type alias.

```rust
// src-tauri/src/platform/mod.rs

pub trait PlatformSecurity {
    fn authenticate(reason: &str) -> Result<(), String>;
    fn store_key(key: &str) -> Result<(), String>;
    fn retrieve_key() -> Result<String, String>;
    fn delete_key() -> Result<(), String>;
}

/// Generate a new 32-byte random hex encryption key.
/// Platform-agnostic — lives here, not in platform implementations.
pub fn generate_key() -> String {
    use rand::Rng;
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
```

### File Structure

```
src-tauri/src/
├── platform/
│   ├── mod.rs          // trait + generate_key() + compile-time dispatch
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
- Returns an `IAsyncOperation<UserConsentVerificationResult>` — call `.get()` to block, matching the synchronous trait signature
- Result variants: `Verified` / `Canceled` / `DeviceNotPresent` / `NotConfiguredForUser` etc.
- If Windows Hello is not configured, return a clear error: `"Windows Hello is not set up. Please configure it in Windows Settings > Accounts > Sign-in options."`
- Direct Rust API call — no external helper binary needed

**Credential Manager (key storage):**
- API: `Windows::Security::Credentials::PasswordVault`
- `Add()` / `Retrieve()` / `Remove()` operations
- Resource: `"com.mysquad.app"`, username: `"db-encryption-key"` (matching macOS conventions)
- Credentials persist across reboots, scoped to the Windows user account
- Encrypted at rest by Windows DPAPI automatically
- Recovery: users can inspect/delete stored credentials via Windows Credential Manager GUI or `cmdkey` CLI tool

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

The `security-framework` dependency moves from shared to macOS-only. The `windows` crate is added for Windows-only builds. Note: the `windows` crate has frequent breaking changes between major versions — pin to `0.58` and test before upgrading.

## Callers

`commands.rs` and `db.rs` replace all calls to `keychain::` / `crate::keychain::` and `biometric::` / `crate::biometric::` with `NativeSecurity::` and `platform::generate_key()` calls. `lib.rs` replaces `pub mod biometric;` and `pub mod keychain;` with `pub mod platform;`. No `#[cfg]` needed outside of `platform/`.

Example:
```rust
// Before
let key = keychain::generate_key();
keychain::store_key(&key)?;
let key = crate::keychain::retrieve_key()?;
biometric::authenticate(reason)?;

// After
let key = platform::generate_key();
NativeSecurity::store_key(&key)?;
let key = NativeSecurity::retrieve_key()?;
NativeSecurity::authenticate(reason)?;
```

## Build System

### `build.rs`

Conditional Swift helper compilation:
```rust
let target = std::env::var("TARGET").unwrap_or_default();
if target.contains("apple") {
    // compile swift-helper/authenticate.swift → target/MySquadHelper
}
tauri_build::build();
```

On Windows, `build.rs` skips Swift compilation entirely.

### `beforeBundleCommand`

The current `tauri.conf.json` has `"beforeBundleCommand": "bash src-tauri/scripts/compile-icon.sh"` which uses macOS-only `actool`. Move this to `tauri.macos.conf.json` and remove it from the base config. The Windows overlay sets it to `""` (empty / no-op) or a Windows-compatible icon script if needed.

### Tauri Configuration

Split platform-specific config into overlay files (Tauri v2 merges `tauri.<platform>.conf.json` into the base config at build time):

**`tauri.conf.json`** (shared): Remove `externalBin` and `beforeBundleCommand` from base config.

**`tauri.macos.conf.json`** (new):
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
- Windows runner: May need `strawberry-perl` installed for `bundled-sqlcipher` (OpenSSL build dependency). Add a setup step if `cargo build` fails without it.

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
| **Modified** | `commands.rs` (use `NativeSecurity::` / `platform::generate_key()`), `lib.rs` (replace `mod biometric` + `mod keychain` with `mod platform`), `build.rs` (conditional Swift), `Cargo.toml` (platform-gated deps), `tauri.conf.json` (remove `externalBin` and `beforeBundleCommand` to platform overlays) |
| **CI** | Matrix strategy adding `windows-latest`, Windows artifact in release config, possible `strawberry-perl` setup step |

## What Does NOT Change

- All frontend code
- Database schema and migrations
- Lock/unlock flow logic
- macOS user experience
- Data format (standalone installs, no cross-platform portability needed)
- Export/import functionality (uses platform-agnostic file paths via `dirs` crate)

## Risks

- **SmartScreen / Defender**: Unsigned `.exe` triggers warnings and possible false-positive malware flags. Mitigate by obtaining a code signing certificate before broad rollout.
- **SQLCipher build on Windows**: `bundled-sqlcipher` compiles OpenSSL which may require Perl on Windows CI runners. Test early and add setup steps as needed.
- **`windows` crate churn**: Pin to v0.58 and avoid upgrading without testing — breaking changes are common between major versions.

## Future Considerations

- **Code signing**: EV certificate (~$200-400/year) eliminates SmartScreen warnings for broader distribution
- **Linux**: Adding a third platform implementation to the `platform/` module would be straightforward
