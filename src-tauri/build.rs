fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();

    if target.contains("apple") {
        compile_swift_helper(&target);
    }

    tauri_build::build();
}

fn compile_swift_helper(target: &str) {
    let swift_source = std::path::Path::new("swift-helper/authenticate.swift");
    let output_path = "target/MySquadHelper";

    if !swift_source.exists() {
        println!("cargo:warning=Swift helper source not found, skipping compilation");
        return;
    }

    println!("cargo:rerun-if-changed={}", swift_source.display());

    let status = std::process::Command::new("swiftc")
        .args([
            swift_source.to_string_lossy().as_ref(),
            "-o",
            output_path,
            "-framework",
            "LocalAuthentication",
        ])
        .status()
        .expect("Failed to run swiftc. Install Xcode Command Line Tools.");

    assert!(status.success(), "Swift compilation failed");

    // Create suffixed copy for Tauri bundling
    let suffixed = format!("target/MySquadHelper-{}", target);
    std::fs::copy(output_path, &suffixed).expect("Failed to copy MySquadHelper for bundling");
}
