use super::PlatformSecurity;
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
            .map_err(|e| format!("Failed to run authentication helper: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Authentication failed: {}", stderr.trim()))
        }
    }

    fn store_key(key: &str) -> Result<(), String> {
        // Use the `security` CLI for all builds. The Keychain ACL is tied to the
        // calling binary's code signature — when the app is updated the signature
        // changes and macOS prompts for credentials again.  `security` is signed
        // by Apple and has permanent Keychain access, avoiding the re-auth prompt.
        let status = Command::new("security")
            .args([
                "add-generic-password",
                "-U",
                "-s",
                SERVICE_NAME,
                "-a",
                ACCOUNT_NAME,
                "-w",
                key,
            ])
            .status()
            .map_err(|e| format!("Failed to run security CLI: {}", e))?;
        if status.success() {
            Ok(())
        } else {
            Err("Failed to store key via security CLI".into())
        }
    }

    fn retrieve_key() -> Result<String, String> {
        let output = Command::new("security")
            .args([
                "find-generic-password",
                "-s",
                SERVICE_NAME,
                "-a",
                ACCOUNT_NAME,
                "-w",
            ])
            .output()
            .map_err(|e| format!("Failed to run security CLI: {}", e))?;
        if output.status.success() {
            let key = String::from_utf8(output.stdout)
                .map_err(|e| format!("Key is not valid UTF-8: {}", e))?;
            Ok(key.trim().to_string())
        } else {
            Err("Key not found in Keychain".into())
        }
    }

    fn delete_key() -> Result<(), String> {
        let status = Command::new("security")
            .args([
                "delete-generic-password",
                "-s",
                SERVICE_NAME,
                "-a",
                ACCOUNT_NAME,
            ])
            .status()
            .map_err(|e| format!("Failed to run security CLI: {}", e))?;
        if status.success() {
            Ok(())
        } else {
            Err("Failed to delete key via security CLI".into())
        }
    }
}

fn get_helper_path() -> Result<PathBuf, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Cannot find executable path: {}", e))?
        .parent()
        .ok_or("Cannot find executable directory")?
        .to_path_buf();

    // Bundled app: helper is next to the main executable (via externalBin)
    let helper = exe_dir.join("MySquadHelper");
    if helper.exists() {
        return Ok(helper);
    }

    // Development: helper is in target/ (compiled by build.rs), exe is in target/debug/
    if let Some(target_dir) = exe_dir.parent() {
        let dev_helper = target_dir.join("MySquadHelper");
        if dev_helper.exists() {
            return Ok(dev_helper);
        }
    }

    Err("Authentication helper not found. Ensure the app was built with `cargo build` or `npm run tauri build`.".into())
}
