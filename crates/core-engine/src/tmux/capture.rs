use crate::error::Result;

use super::{TmuxEngine, TmuxPaneCapturePage, TmuxPaneSnapshot};

#[derive(Debug, Clone, Copy)]
pub(super) struct PaneMetadata {
    pub cursor_x: u32,
    pub cursor_y: u32,
    pub cols: u32,
    pub rows: u32,
    pub alternate: bool,
}

pub(super) fn parse_pane_metadata(raw: &str) -> PaneMetadata {
    let parts = raw.split('|').collect::<Vec<_>>();
    let parse_part = |idx: usize| -> u32 {
        parts
            .get(idx)
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(0)
    };

    PaneMetadata {
        cursor_x: parse_part(0),
        cursor_y: parse_part(1),
        cols: parse_part(2),
        rows: parse_part(3),
        alternate: parts.get(4).is_some_and(|value| value.trim() == "1"),
    }
}

pub(super) fn capture_segment_bounds(
    skip_from_bottom: i32,
    take: i32,
    alternate: bool,
) -> (String, String) {
    let take = take.max(1);
    let skip = skip_from_bottom.max(0);

    if alternate {
        ("0".to_string(), "-".to_string())
    } else if skip == 0 {
        (format!("-{}", take), "-".to_string())
    } else {
        (
            format!("-{}", skip.saturating_add(take)),
            format!("-{}", skip.saturating_add(1)),
        )
    }
}

pub(super) fn trim_single_trailing_newline(content: &mut String) {
    if content.ends_with('\n') {
        content.pop();
    }
}

pub(super) fn count_returned_lines(data: &str) -> u32 {
    if data.is_empty() {
        0
    } else {
        data.matches('\n').count() as u32 + 1
    }
}

impl TmuxEngine {
    /// Capture pane content (scrollback + visible) for reconnection.
    ///
    /// Uses `-e` to preserve ANSI escape sequences (colors, formatting) and
    /// `-N` to preserve trailing spaces. The trailing spaces matter for TUIs:
    /// many of them paint panels by writing background-coloured spaces all the
    /// way to the end of a row.
    /// Returns both scrollback history and visible pane content as a single
    /// string, used by the frontend to restore terminal state after reconnect.
    pub fn capture_pane(
        &self,
        session_name: &str,
        window_index: u32,
        lines: Option<i32>,
        alternate: bool,
    ) -> Result<String> {
        if alternate {
            return self.capture_pane_segment(
                session_name,
                window_index,
                0,
                lines.unwrap_or(1),
                true,
            );
        }
        if let Some(take) = lines {
            return self.capture_pane_segment(session_name, window_index, 0, take, false);
        }

        let target = format!("{}:{}.0", session_name, window_index);
        let args = vec![
            "capture-pane",
            "-t",
            &target,
            "-p",
            "-e",
            "-N",
            "-S",
            "-",
            "-E",
            "-",
        ];
        let mut content = self.run_tmux_raw(&args)?;
        trim_single_trailing_newline(&mut content);
        Ok(content)
    }

    /// Capture a slice of scrollback counting from the bottom of the pane history.
    ///
    /// `skip_from_bottom` — lines already consumed (0 = newest page).
    /// `take` — max lines to read older than the skip boundary.
    pub fn capture_pane_segment(
        &self,
        session_name: &str,
        window_index: u32,
        skip_from_bottom: i32,
        take: i32,
        alternate: bool,
    ) -> Result<String> {
        let target = format!("{}:{}.0", session_name, window_index);
        let take = take.max(1);
        let skip = skip_from_bottom.max(0);
        let (start_line, end_line) = capture_segment_bounds(skip, take, alternate);

        let args = vec![
            "capture-pane".to_string(),
            "-t".to_string(),
            target,
            "-p".to_string(),
            "-e".to_string(),
            "-N".to_string(),
            "-S".to_string(),
            start_line,
            "-E".to_string(),
            end_line,
        ];
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();

        let mut content = self.run_tmux_raw(&arg_refs)?;
        trim_single_trailing_newline(&mut content);

        Ok(content)
    }

    /// Scrollback depth for a pane (lines retained by tmux).
    pub fn get_pane_history_size(&self, session_name: &str, window_index: u32) -> Result<u32> {
        let target = format!("{}:{}.0", session_name, window_index);
        let raw = self.run_tmux(&["display-message", "-t", &target, "-p", "#{history_size}"])?;
        Ok(raw.trim().parse::<u32>().unwrap_or(0))
    }

    /// Paginated pane capture with scrollback cursor metadata.
    pub fn capture_pane_page(
        &self,
        session_name: &str,
        window_index: u32,
        skip_from_bottom: i32,
        take_lines: i32,
    ) -> Result<TmuxPaneCapturePage> {
        let target = format!("{}:{}.0", session_name, window_index);
        let metadata = self.run_tmux(&[
            "display-message",
            "-t",
            &target,
            "-p",
            "#{cursor_x}|#{cursor_y}|#{pane_width}|#{pane_height}|#{alternate_on}",
        ])?;
        let metadata = parse_pane_metadata(&metadata);
        let take = take_lines.max(1);
        let skip = skip_from_bottom.max(0);

        let data = if metadata.alternate {
            self.capture_pane_segment(
                session_name,
                window_index,
                0,
                metadata.rows.max(1) as i32,
                true,
            )?
        } else {
            self.capture_pane_segment(session_name, window_index, skip, take, false)?
        };

        let lines_returned = count_returned_lines(&data);

        let history_size = self
            .get_pane_history_size(session_name, window_index)
            .unwrap_or(0);
        let consumed = skip.saturating_add(lines_returned as i32);
        let has_more_older = !metadata.alternate
            && lines_returned > 0
            && lines_returned >= take as u32
            && (history_size == 0 || consumed < history_size as i32);

        Ok(TmuxPaneCapturePage {
            snapshot: TmuxPaneSnapshot {
                data,
                cursor_x: metadata.cursor_x,
                cursor_y: metadata.cursor_y,
                cols: metadata.cols,
                rows: metadata.rows,
                alternate: metadata.alternate,
            },
            skip_from_bottom: skip,
            lines_returned,
            has_more_older,
            next_skip_from_bottom: if has_more_older { Some(consumed) } else { None },
        })
    }

    /// Capture pane content and cursor metadata for initial hydration.
    pub fn capture_pane_snapshot(
        &self,
        session_name: &str,
        window_index: u32,
        lines: Option<i32>,
    ) -> Result<TmuxPaneSnapshot> {
        let target = format!("{}:{}.0", session_name, window_index);
        let metadata = self.run_tmux(&[
            "display-message",
            "-t",
            &target,
            "-p",
            "#{cursor_x}|#{cursor_y}|#{pane_width}|#{pane_height}|#{alternate_on}",
        ])?;
        let metadata = parse_pane_metadata(&metadata);
        let capture_lines = if metadata.alternate {
            Some(metadata.rows.max(1) as i32)
        } else {
            lines
        };
        let data = self.capture_pane(
            session_name,
            window_index,
            capture_lines,
            metadata.alternate,
        )?;

        Ok(TmuxPaneSnapshot {
            data,
            cursor_x: metadata.cursor_x,
            cursor_y: metadata.cursor_y,
            cols: metadata.cols,
            rows: metadata.rows,
            alternate: metadata.alternate,
        })
    }
}
