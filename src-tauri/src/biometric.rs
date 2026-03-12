use std::path::PathBuf;
use std::process::Command;

pub fn authenticate(reason: &str) -> Result<(), String> {
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

fn get_helper_path() -> Result<PathBuf, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Cannot find executable path: {}", e))?
        .parent()
        .ok_or("Cannot find executable directory")?
        .to_path_buf();

    let helper = exe_dir.join("MySquad");
    if helper.exists() {
        return Ok(helper);
    }

    // Fallback: check target directory (development)
    let dev_helper = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/MySquad");
    if dev_helper.exists() {
        return Ok(dev_helper);
    }

    Err("Authentication helper not found".into())
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_module_compiles() {
        assert!(true);
    }
}
