use super::PlatformSecurity;
use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};
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
        set_generic_password(SERVICE_NAME, ACCOUNT_NAME, key.as_bytes())
            .map_err(|e| format!("Failed to store key in Keychain: {}", e))
    }

    fn retrieve_key() -> Result<String, String> {
        let bytes = get_generic_password(SERVICE_NAME, ACCOUNT_NAME)
            .map_err(|e| format!("Failed to retrieve key from Keychain: {}", e))?;
        String::from_utf8(bytes).map_err(|e| format!("Key is not valid UTF-8: {}", e))
    }

    fn delete_key() -> Result<(), String> {
        delete_generic_password(SERVICE_NAME, ACCOUNT_NAME)
            .map_err(|e| format!("Failed to delete key from Keychain: {}", e))
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
