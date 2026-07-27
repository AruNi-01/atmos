//! CLI helper for Electron (APP-045): list profiles / extract cookies via Keychain.
//!
//! Usage:
//!   atmos-browser-cookies list
//!   atmos-browser-cookies extract --handle <profile_handle>
//!
//! stdout: JSON only. Errors as JSON `{"error":{"code":"..."}}` with non-zero exit.

use browser_cookies::{extract, list_profiles, ExtractError, ProfileHandle};
use serde::Serialize;
use std::env;
use std::process::ExitCode;

#[derive(Serialize)]
struct ErrorBody {
    code: String,
    message: String,
}

#[derive(Serialize)]
struct ErrorEnvelope {
    error: ErrorBody,
}

fn error_code(err: &ExtractError) -> &'static str {
    match err {
        ExtractError::UnsupportedPlatform => "UnsupportedPlatform",
        ExtractError::ProfileNotFound => "ProfileNotFound",
        ExtractError::BrowserRunning => "BrowserRunning",
        ExtractError::KeychainDenied => "KeychainDenied",
        ExtractError::KeychainUnavailable => "KeychainUnavailable",
        ExtractError::DatabaseBusy => "DatabaseBusy",
        ExtractError::InvalidSchema(_) => "InvalidSchema",
        ExtractError::Io(_) => "Io",
    }
}

fn emit_err(err: ExtractError) -> ExitCode {
    let body = ErrorEnvelope {
        error: ErrorBody {
            code: error_code(&err).to_string(),
            message: err.to_string(),
        },
    };
    if let Ok(s) = serde_json::to_string(&body) {
        println!("{s}");
    }
    ExitCode::from(1)
}

fn browser_kind_str(k: browser_cookies::BrowserKind) -> &'static str {
    match k {
        browser_cookies::BrowserKind::Chrome => "Chrome",
        browser_cookies::BrowserKind::Edge => "Edge",
        browser_cookies::BrowserKind::Brave => "Brave",
        browser_cookies::BrowserKind::Firefox => "Firefox",
    }
}

fn main() -> ExitCode {
    let mut args = env::args().skip(1).collect::<Vec<_>>();
    if args.is_empty() {
        eprintln!("usage: atmos-browser-cookies list | extract --handle <handle>");
        return ExitCode::from(2);
    }
    let cmd = args.remove(0);
    match cmd.as_str() {
        "list" => {
            let profiles = list_profiles();
            let dtos: Vec<serde_json::Value> = profiles
                .into_iter()
                .map(|p| {
                    serde_json::json!({
                        "profile_handle": p.handle.0,
                        "browser": browser_kind_str(p.browser),
                        "display_name": p.display_name,
                        "running": p.running,
                    })
                })
                .collect();
            println!(
                "{}",
                serde_json::to_string(&dtos).unwrap_or_else(|_| "[]".into())
            );
            ExitCode::SUCCESS
        }
        "extract" => {
            let mut handle: Option<String> = None;
            let mut i = 0;
            while i < args.len() {
                if args[i] == "--handle" && i + 1 < args.len() {
                    handle = Some(args[i + 1].clone());
                    i += 2;
                    continue;
                }
                i += 1;
            }
            let Some(h) = handle else {
                eprintln!("extract requires --handle");
                return ExitCode::from(2);
            };
            match extract(&ProfileHandle(h)) {
                Ok(result) => {
                    println!("{}", serde_json::to_string(&result).unwrap_or_else(|_| "{}".into()));
                    ExitCode::SUCCESS
                }
                Err(e) => emit_err(e),
            }
        }
        other => {
            eprintln!("unknown command: {other}");
            ExitCode::from(2)
        }
    }
}
