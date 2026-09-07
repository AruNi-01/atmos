use super::types::HelperKind;

pub fn serve_sim_args(port: u16, udid: &str) -> Vec<String> {
    vec![
        "--host".into(),
        "127.0.0.1".into(),
        "-p".into(),
        port.to_string(),
        udid.into(),
    ]
}

pub fn serve_emu_args(port: u16, device: &str, as_serial: bool) -> Vec<String> {
    let mut args = vec![
        "--host".into(),
        "127.0.0.1".into(),
        "-p".into(),
        port.to_string(),
    ];
    if as_serial {
        args.push("-s".into());
    } else {
        args.push("--avd".into());
    }
    args.push(device.into());
    args
}

pub fn helper_args(kind: HelperKind, port: u16, device: &str, android_serial: bool) -> Vec<String> {
    match kind {
        HelperKind::ServeSim => serve_sim_args(port, device),
        HelperKind::ServeEmu => serve_emu_args(port, device, android_serial),
    }
}

pub fn args_contain_global_kill(args: &[String]) -> bool {
    args.iter().any(|arg| arg == "--kill" || arg == "-k")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helper_argv_is_loopback_without_kill() {
        let sim = serve_sim_args(3200, "UDID");
        assert_eq!(sim, vec!["--host", "127.0.0.1", "-p", "3200", "UDID"]);
        assert!(!args_contain_global_kill(&sim));
        let emu = serve_emu_args(3300, "Pixel_8", false);
        assert_eq!(
            emu,
            vec!["--host", "127.0.0.1", "-p", "3300", "--avd", "Pixel_8"]
        );
        assert!(!args_contain_global_kill(&emu));
        let serial = serve_emu_args(3300, "emulator-5554", true);
        assert_eq!(
            serial,
            vec!["--host", "127.0.0.1", "-p", "3300", "-s", "emulator-5554"]
        );
        assert!(!args_contain_global_kill(&serial));
        assert!(!emu.iter().any(|a| a.contains("npx")));
        assert!(!emu.iter().any(|a| a.contains("serve-avd")));
    }
}
