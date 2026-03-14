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
