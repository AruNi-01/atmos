//! `GET /api/cli/actions` — list callable wire action names.

use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{app_state::AppState, error::ApiResult};

/// Compiled catalog kept in sync with `packages/api-types/fixtures/actions.server.json`
/// plus APP-063 terminal session actions. Prefer this over shipping a second runtime file.
const ACTION_CATALOG: &str =
    include_str!("../../../../../packages/api-types/fixtures/actions.server.json");

#[derive(Debug, Deserialize)]
pub struct ListActionsQuery {
    #[serde(default)]
    pub filter: Option<String>,
}

pub async fn list_actions(
    State(_state): State<AppState>,
    Query(query): Query<ListActionsQuery>,
) -> ApiResult<Json<Value>> {
    let mut actions: Vec<String> = serde_json::from_str(ACTION_CATALOG).unwrap_or_default();

    // APP-063 actions may not be in the fixture until extract-actions is re-run.
    for extra in [
        "terminal_session_create",
        "terminal_session_list",
        "terminal_session_close",
        "terminal_session_destroy",
    ] {
        if !actions.iter().any(|a| a == extra) {
            actions.push(extra.to_string());
        }
    }

    actions.sort();
    actions.dedup();

    if let Some(filter) = query
        .filter
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let f = filter.to_ascii_lowercase();
        actions.retain(|a| a.to_ascii_lowercase().contains(&f));
    }

    Ok(Json(json!({
        "success": true,
        "data": {
            "actions": actions,
            "count": actions.len(),
        }
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_includes_project_list() {
        let actions: Vec<String> = serde_json::from_str(ACTION_CATALOG).expect("fixture json");
        assert!(actions.iter().any(|a| a == "project_list"));
        assert!(actions.iter().any(|a| a == "workspace_create"));
    }
}
