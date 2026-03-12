fn main() {
    // Compile the Swift biometric helper
    let swift_src = std::path::Path::new("swift-helper/authenticate.swift");
    if swift_src.exists() {
        let status = std::process::Command::new("swiftc")
            .args([
                "swift-helper/authenticate.swift",
                "-o",
                "target/authenticate-helper",
                "-framework",
                "LocalAuthentication",
            ])
            .status()
            .expect("Failed to compile Swift helper");
        assert!(status.success(), "Swift helper compilation failed");
    }

    tauri_build::build();
}
