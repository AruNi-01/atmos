//! Map CLI drive subcommands → `DriveRequest` and invoke the crate.

use super::args::*;
use desktop_use::{drive, CoordSpace, DesktopUseManager, DriveAction, DriveRequest, HighlightMode};
use serde_json::{json, Value};

pub(super) fn drive_cmd(command: DriveCommand) -> Result<Value, String> {
    let mgr = DesktopUseManager::new();
    let req = match command {
        DriveCommand::Screenshot(a) => DriveRequest {
            action: DriveAction::Screenshot,
            out_path: a.out.map(Into::into),
            ..Default::default()
        },
        DriveCommand::Click(a) => click_like(DriveAction::Click, a)?,
        DriveCommand::DoubleClick(a) => click_like(DriveAction::DoubleClick, a)?,
        DriveCommand::RightClick(a) => click_like(DriveAction::RightClick, a)?,
        DriveCommand::Drag(a) => DriveRequest {
            action: DriveAction::Drag,
            from_x: Some(a.from_x),
            from_y: Some(a.from_y),
            to_x: Some(a.to_x),
            to_y: Some(a.to_y),
            pid: a.pid,
            window_id: a.window_id,
            delivery_mode: Some(a.delivery_mode),
            highlight: HighlightMode::Auto,
            ..Default::default()
        },
        DriveCommand::Scroll(a) => DriveRequest {
            action: DriveAction::Scroll,
            direction: Some(a.direction),
            amount: a.amount,
            scroll_by: a.by,
            x: a.x,
            y: a.y,
            pid: a.pid,
            window_id: a.window_id,
            element_token: a.element_token,
            delivery_mode: Some(a.delivery_mode),
            highlight: HighlightMode::Auto,
            ..Default::default()
        },
        DriveCommand::Hotkey(a) => {
            let keys: Vec<String> = a
                .keys
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            DriveRequest {
                action: DriveAction::Hotkey,
                keys: Some(json!(keys)),
                pid: a.pid,
                window_id: a.window_id,
                delivery_mode: Some(a.delivery_mode),
                highlight: HighlightMode::Off,
                ..Default::default()
            }
        }
        DriveCommand::Key(a) => DriveRequest {
            action: DriveAction::PressKey,
            key: Some(a.key),
            pid: a.pid,
            window_id: a.window_id,
            delivery_mode: Some(a.delivery_mode),
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Move(a) => {
            let coord_space = CoordSpace::parse(&a.coord_space)
                .ok_or_else(|| format!("invalid --coord-space {:?}", a.coord_space))?;
            DriveRequest {
                action: DriveAction::MoveCursor,
                x: Some(a.x),
                y: Some(a.y),
                coord_space,
                session: a.session,
                highlight: HighlightMode::Off,
                ..Default::default()
            }
        }
        DriveCommand::Apps => DriveRequest {
            action: DriveAction::ListApps,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Launch(a) => DriveRequest {
            action: DriveAction::LaunchApp,
            bundle_id: a.bundle_id,
            app_name: a.name,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Quit(a) => DriveRequest {
            action: DriveAction::KillApp,
            pid: Some(a.pid),
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Clipboard { command } => match command {
            ClipboardCommand::Get(_) => DriveRequest {
                action: DriveAction::ClipboardRead,
                highlight: HighlightMode::Off,
                ..Default::default()
            },
            ClipboardCommand::Set(a) => DriveRequest {
                action: DriveAction::ClipboardWrite,
                text: Some(a.text),
                highlight: HighlightMode::Off,
                ..Default::default()
            },
        },
        DriveCommand::Screen => DriveRequest {
            action: DriveAction::GetScreenSize,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Cursor => DriveRequest {
            action: DriveAction::GetCursorPosition,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Menu(a) => {
            let path: serde_json::Value = serde_json::from_str(&a.path)
                .map_err(|e| format!("menu --path must be JSON array: {e}"))?;
            DriveRequest {
                action: DriveAction::InvokeMenu,
                pid: Some(a.pid),
                window_id: a.window_id,
                menu_path: Some(path),
                highlight: HighlightMode::Auto,
                ..Default::default()
            }
        }
        DriveCommand::AxTree => DriveRequest {
            action: DriveAction::GetAccessibilityTree,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Type(a) => {
            let highlight = HighlightMode::parse(&a.highlight).ok_or_else(|| {
                format!(
                    "invalid --highlight {:?} (use auto, desktop, clear, off)",
                    a.highlight
                )
            })?;
            let coord_space = CoordSpace::parse(&a.coord_space)
                .ok_or_else(|| format!("invalid --coord-space {:?}", a.coord_space))?;
            DriveRequest {
                action: DriveAction::Type,
                text: Some(a.text),
                x: a.x,
                y: a.y,
                pid: a.pid,
                window_id: a.window_id,
                delivery_mode: Some(a.delivery_mode),
                coord_space,
                element_token: a.element_token,
                element_index: a.element_index,
                snapshot_id: a.snapshot_id,
                highlight,
                status_label: a.status,
                agent_name: a.agent_name,
                ..Default::default()
            }
        }
        DriveCommand::Verify => DriveRequest {
            action: DriveAction::Verify,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::WindowState(a) => DriveRequest {
            action: DriveAction::WindowState,
            pid: Some(a.pid),
            window_id: Some(a.window_id),
            include_screenshot: a.screenshot,
            max_elements: a.max_elements,
            max_depth: a.max_depth,
            query: a.query,
            highlight: HighlightMode::Auto,
            ..Default::default()
        },
        DriveCommand::Highlight(a) => {
            let mode = a.mode.to_ascii_lowercase();
            let highlight = match mode.as_str() {
                "clear" | "off" => HighlightMode::Clear,
                "desktop" => HighlightMode::Desktop,
                "window" | "auto" => HighlightMode::Auto,
                other => {
                    return Err(format!(
                        "invalid highlight --mode {:?} (use desktop, window, clear)",
                        other
                    ));
                }
            };
            DriveRequest {
                action: DriveAction::Highlight,
                x: a.x,
                y: a.y,
                width: a.width,
                height: a.height,
                window_id: a.window_id,
                highlight,
                status_label: a.status,
                agent_name: a.agent_name,
                ..Default::default()
            }
        }
        DriveCommand::SessionEnd => DriveRequest {
            action: DriveAction::SessionEnd,
            highlight: HighlightMode::Clear,
            ..Default::default()
        },
        DriveCommand::Front(a) => DriveRequest {
            action: DriveAction::BringToFront,
            pid: Some(a.pid),
            window_id: a.window_id,
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::SetValue(a) => DriveRequest {
            action: DriveAction::SetValue,
            text: Some(a.text),
            pid: a.pid,
            window_id: a.window_id,
            element_token: a.element_token,
            element_index: a.element_index,
            snapshot_id: a.snapshot_id,
            highlight: HighlightMode::Auto,
            ..Default::default()
        },
        DriveCommand::WindowFrame(a) => DriveRequest {
            action: DriveAction::SetWindowFrame,
            pid: Some(a.pid),
            window_id: Some(a.window_id),
            x: Some(a.x),
            y: Some(a.y),
            width: Some(a.width),
            height: Some(a.height),
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::Zoom(a) => DriveRequest {
            action: DriveAction::Zoom,
            window_id: Some(a.window_id),
            pid: a.pid,
            x1: Some(a.x1),
            y1: Some(a.y1),
            x2: Some(a.x2),
            y2: Some(a.y2),
            highlight: HighlightMode::Off,
            ..Default::default()
        },
        DriveCommand::VerifyState(a) => {
            let expect_json = match a.expect.as_ref() {
                Some(s) => Some(
                    serde_json::from_str(s)
                        .map_err(|e| format!("verify-state --expect JSON: {e}"))?,
                ),
                None => None,
            };
            DriveRequest {
                action: DriveAction::VerifyState,
                pid: Some(a.pid),
                window_id: Some(a.window_id),
                expect_json,
                highlight: HighlightMode::Off,
                ..Default::default()
            }
        }
    };
    let result = drive(&mgr, req);
    serde_json::to_value(result).map_err(|e| e.to_string())
}

fn click_like(action: DriveAction, a: ClickArgs) -> Result<DriveRequest, String> {
    let coord_space = CoordSpace::parse(&a.coord_space).ok_or_else(|| {
        format!(
            "invalid --coord-space {:?} (use png or points)",
            a.coord_space
        )
    })?;
    let highlight = HighlightMode::parse(&a.highlight).ok_or_else(|| {
        format!(
            "invalid --highlight {:?} (use auto, desktop, clear, off)",
            a.highlight
        )
    })?;
    let has_element =
        a.element_token.is_some() || (a.element_index.is_some() && a.snapshot_id.is_some());
    // Engine 0.17: double_click/right_click require pid. click may use scope=desktop without pid.
    let needs_pid = matches!(action, DriveAction::DoubleClick | DriveAction::RightClick);
    if needs_pid && a.pid.is_none() {
        return Err(
            "double-click/right-click require --pid (engine 0.17 has no desktop-scope path)".into(),
        );
    }
    let pid = if needs_pid || has_element || a.window_id.is_some() {
        a.pid
    } else {
        // Strip bare --pid on screen-absolute click so coords stay desktop-scope.
        None
    };
    Ok(DriveRequest {
        action,
        x: a.x,
        y: a.y,
        pid,
        window_id: a.window_id,
        delivery_mode: Some(a.delivery_mode),
        coord_space,
        session: a.session,
        element_token: a.element_token,
        element_index: a.element_index,
        snapshot_id: a.snapshot_id,
        highlight,
        status_label: a.status,
        agent_name: a.agent_name,
        ..Default::default()
    })
}
