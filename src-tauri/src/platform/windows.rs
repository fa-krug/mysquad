use super::PlatformSecurity;
use windows::core::HSTRING;
use windows::Security::Credentials::UI::{UserConsentVerificationResult, UserConsentVerifier};
use windows::Security::Credentials::{PasswordCredential, PasswordVault};

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
            .Retrieve(&HSTRING::from(RESOURCE_NAME), &HSTRING::from(USER_NAME))
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
        .Retrieve(&HSTRING::from(RESOURCE_NAME), &HSTRING::from(USER_NAME))
        .map_err(|e| format!("Failed to find credential to delete: {}", e))?;

    vault
        .Remove(&credential)
        .map_err(|e| format!("Failed to delete key from Credential Manager: {}", e))
}
