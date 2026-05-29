use crate::appshot::types::AppshotWindowBounds;

pub(super) struct FrontmostWindow {
    pub(super) app_name: String,
    pub(super) bundle_id: Option<String>,
    pub(super) process_id: Option<u32>,
    pub(super) window_title: Option<String>,
    pub(super) window_id: Option<String>,
    pub(super) x: Option<i32>,
    pub(super) y: Option<i32>,
    pub(super) width: Option<i32>,
    pub(super) height: Option<i32>,
}

pub(super) struct FrontmostApp {
    pub(super) app_name: String,
    pub(super) bundle_id: Option<String>,
    pub(super) process_id: Option<u32>,
}

#[derive(Clone)]
pub(super) struct WindowCandidate {
    pub(super) app_name: String,
    pub(super) process_id: Option<u32>,
    pub(super) window_title: Option<String>,
    pub(super) window_id: Option<String>,
    pub(super) x: Option<i32>,
    pub(super) y: Option<i32>,
    pub(super) width: Option<i32>,
    pub(super) height: Option<i32>,
}

pub(super) fn window_bounds(frontmost: &FrontmostWindow) -> Option<AppshotWindowBounds> {
    let (Some(x), Some(y), Some(width), Some(height)) =
        (frontmost.x, frontmost.y, frontmost.width, frontmost.height)
    else {
        return None;
    };
    if width <= 0 || height <= 0 {
        return None;
    }
    Some(AppshotWindowBounds {
        x,
        y,
        width: u32::try_from(width).ok()?,
        height: u32::try_from(height).ok()?,
    })
}
