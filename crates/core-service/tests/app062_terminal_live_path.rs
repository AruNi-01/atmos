//! APP-062 S12 / S13 / S15 / S21: live path must not use control mode.

use std::fs;
use std::path::PathBuf;

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read(rel: &str) -> String {
    fs::read_to_string(workspace_root().join(rel)).unwrap_or_else(|e| {
        panic!("failed to read {rel}: {e}");
    })
}

#[test]
fn s21_live_path_does_not_start_control_mode() {
    let files = [
        "crates/core-service/src/service/terminal.rs",
        "crates/core-service/src/service/terminal/runtime.rs",
        "crates/core-service/src/service/terminal/management.rs",
        "crates/core-service/src/service/terminal/io.rs",
        "apps/api/src/api/ws/terminal_handler.rs",
        "apps/api/src/relay/terminal.rs",
    ];
    for rel in files {
        let src = read(rel);
        assert!(
            !src.contains("run_control_mode_tmux_session"),
            "{rel} must not spawn a control-mode client"
        );
        assert!(
            !src.contains("encode_send_keys_hex_commands"),
            "{rel} must not hex-encode send-keys on the live path"
        );
        assert!(
            !src.contains("refresh-client -C") && !src.contains("refresh-client -r"),
            "{rel} must not use refresh-client"
        );
        assert!(
            !src.contains("atmos_mousewatch_"),
            "{rel} must not start a mousewatch control client"
        );
        assert!(
            !src.contains("format!(\"atmos_client_") && !src.contains("atmos_client_{"),
            "{rel} must not mint grouped atmos_client_* sessions"
        );
        assert!(
            !src.contains("ATMOS_TERMINAL_IO") && !src.contains("enum IoMode"),
            "{rel} must not reintroduce a control-mode kill-switch"
        );
    }

    let protocol = read("packages/shared/src/terminal/protocol.ts");
    assert!(
        protocol.contains("terminal_input")
            && protocol.contains("terminal_report")
            && protocol.contains("terminal_resize")
            && protocol.contains("terminal_destroy")
    );
    assert!(
        !protocol.contains("io_mode") && !protocol.contains("ATMOS_TERMINAL_IO"),
        "shared protocol must not grow an io_mode field"
    );
}
