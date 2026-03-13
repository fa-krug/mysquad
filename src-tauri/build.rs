fn main() {
    // Compile the Swift biometric helper with target-triple suffix for Tauri bundling
    let swift_src = std::path::Path::new("swift-helper/authenticate.swift");
    if swift_src.exists() {
        let target = std::env::var("TARGET").unwrap_or_else(|_| {
            let output = std::process::Command::new("rustc")
                .args(["-vV"])
                .output()
                .expect("Failed to run rustc");
            let stdout = String::from_utf8(output.stdout).unwrap();
            stdout
                .lines()
                .find(|l| l.starts_with("host:"))
                .map(|l| l.trim_start_matches("host:").trim().to_string())
                .expect("Could not determine target triple")
        });

        // Compile without suffix (for dev fallback)
        let status = std::process::Command::new("swiftc")
            .args([
                "swift-helper/authenticate.swift",
                "-o",
                "target/MySquadHelper",
                "-framework",
                "LocalAuthentication",
            ])
            .status()
            .expect("Failed to compile Swift helper");
        assert!(status.success(), "Swift helper compilation failed");

        // Copy with target-triple suffix (for Tauri bundling)
        let suffixed = format!("target/MySquadHelper-{target}");
        std::fs::copy("target/MySquadHelper", &suffixed)
            .expect("Failed to copy helper with target suffix");
    }

    tauri_build::build();
}
