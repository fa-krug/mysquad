use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};

const SERVICE_NAME: &str = "com.mysquad.app";
const ACCOUNT_NAME: &str = "db-encryption-key";

pub fn store_key(key: &str) -> Result<(), String> {
    set_generic_password(SERVICE_NAME, ACCOUNT_NAME, key.as_bytes())
        .map_err(|e| format!("Failed to store key in Keychain: {}", e))
}

pub fn retrieve_key() -> Result<String, String> {
    let bytes = get_generic_password(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| format!("Failed to retrieve key from Keychain: {}", e))?;
    String::from_utf8(bytes)
        .map_err(|e| format!("Key is not valid UTF-8: {}", e))
}

pub fn delete_key() -> Result<(), String> {
    delete_generic_password(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| format!("Failed to delete key from Keychain: {}", e))
}

pub fn generate_key() -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    let key_bytes: [u8; 32] = rng.random();
    hex::encode(key_bytes)
}

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
}
