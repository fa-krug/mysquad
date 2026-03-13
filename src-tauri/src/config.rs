use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::collections::BTreeMap;
use std::path::PathBuf;

type HmacSha256 = Hmac<Sha256>;

/// Compute HMAC-SHA256 of config data using the given key.
fn compute_hmac(key: &str, data: &str) -> String {
    let mut mac =
        HmacSha256::new_from_slice(key.as_bytes()).expect("HMAC can take key of any size");
    mac.update(data.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Read a value from the config file, verifying HMAC integrity.
/// Returns None if file missing, corrupt, or HMAC invalid.
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

/// Write a key-value pair to the config file with HMAC signature.
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
