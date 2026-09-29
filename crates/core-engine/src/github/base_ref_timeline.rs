//! GitHub's issue timeline REST payload for `base_ref_changed` omits the
//! previous and current branch names. Those names live on the GraphQL
//! timeline item (`previousRefName` / `currentRefName`, or `oldBase` /
//! `newBase` for automatic changes). REST `node_id` matches GraphQL `id`.

use std::collections::HashMap;

use serde_json::{json, Value};

use super::GithubEngine;
use crate::error::EngineError;

const BASE_REF_CHANGE_EVENTS: &[&str] = &[
    "base_ref_changed",
    "automatic_base_change_succeeded",
    "automatic_base_change_failed",
];

pub fn timeline_has_base_ref_change(items: &Value) -> bool {
    items.as_array().is_some_and(|items| {
        items.iter().any(|item| {
            item.get("event")
                .and_then(Value::as_str)
                .is_some_and(|event| BASE_REF_CHANGE_EVENTS.contains(&event))
        })
    })
}

/// Write `base_ref_change: { from, to }` onto matching timeline items.
/// `graphql` is a `gh api graphql` response body. Existing non-empty names win.
pub fn attach_base_ref_changes(items: &mut Value, graphql: &Value) {
    let Some(items) = items.as_array_mut() else {
        return;
    };
    let names = base_ref_names_by_id(graphql);
    if names.is_empty() {
        return;
    }
    for item in items {
        let Some(event) = item.get("event").and_then(Value::as_str) else {
            continue;
        };
        if !BASE_REF_CHANGE_EVENTS.contains(&event) {
            continue;
        }
        if has_base_ref_change(item) {
            continue;
        }
        let Some(node_id) = item.get("node_id").and_then(Value::as_str) else {
            continue;
        };
        let Some((from, to)) = names.get(node_id) else {
            continue;
        };
        let Some(object) = item.as_object_mut() else {
            continue;
        };
        object.insert(
            "base_ref_change".to_string(),
            json!({ "from": from, "to": to }),
        );
    }
}

fn has_base_ref_change(item: &Value) -> bool {
    let Some(change) = item.get("base_ref_change") else {
        return false;
    };
    let from = change.get("from").and_then(Value::as_str).unwrap_or("");
    let to = change.get("to").and_then(Value::as_str).unwrap_or("");
    !from.is_empty() && !to.is_empty()
}

fn base_ref_names_by_id(graphql: &Value) -> HashMap<String, (String, String)> {
    let Some(nodes) = graphql
        .pointer("/data/repository/pullRequest/timelineItems/nodes")
        .and_then(Value::as_array)
    else {
        return HashMap::new();
    };
    let mut names = HashMap::new();
    for node in nodes {
        let Some(id) = node.get("id").and_then(Value::as_str) else {
            continue;
        };
        let (from, to) = match node.get("__typename").and_then(Value::as_str) {
            Some("BaseRefChangedEvent") => ("previousRefName", "currentRefName"),
            Some("AutomaticBaseChangeSucceededEvent") | Some("AutomaticBaseChangeFailedEvent") => {
                ("oldBase", "newBase")
            }
            _ => continue,
        };
        let Some(from) = node.get(from).and_then(Value::as_str) else {
            continue;
        };
        let Some(to) = node.get(to).and_then(Value::as_str) else {
            continue;
        };
        let from = from.trim();
        let to = to.trim();
        if id.is_empty() || from.is_empty() || to.is_empty() {
            continue;
        }
        names.insert(id.to_string(), (from.to_string(), to.to_string()));
    }
    names
}

impl GithubEngine {
    /// Branch names for base-ref timeline events on this pull request.
    pub async fn pull_request_base_ref_changes(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<Value, EngineError> {
        let query = concat!(
            "query($owner:String!,$name:String!,$number:Int!){",
            "repository(owner:$owner,name:$name){",
            "pullRequest(number:$number){",
            "timelineItems(itemTypes:[BASE_REF_CHANGED_EVENT,",
            "AUTOMATIC_BASE_CHANGE_SUCCEEDED_EVENT,AUTOMATIC_BASE_CHANGE_FAILED_EVENT],first:100){",
            "nodes{__typename ",
            "... on BaseRefChangedEvent{id previousRefName currentRefName} ",
            "... on AutomaticBaseChangeSucceededEvent{id oldBase newBase} ",
            "... on AutomaticBaseChangeFailedEvent{id oldBase newBase}",
            "}}}}"
        );
        let query_arg = format!("query={query}");
        let owner_arg = format!("owner={owner}");
        let name_arg = format!("name={repo}");
        let number_arg = format!("number={number}");
        let output = self
            .run_gh(&[
                "api",
                "graphql",
                "-f",
                &query_arg,
                "-f",
                &owner_arg,
                "-f",
                &name_arg,
                "-F",
                &number_arg,
            ])
            .await?;

        if let Some(errors) = output.get("errors").and_then(Value::as_array) {
            let has_repository = output.pointer("/data/repository").is_some();
            if !errors.is_empty() && !has_repository {
                let message = errors
                    .iter()
                    .filter_map(|error| error.get("message").and_then(Value::as_str))
                    .collect::<Vec<_>>()
                    .join("; ");
                return Err(EngineError::Git(format!(
                    "GitHub GraphQL base ref names for {owner}/{repo}#{number}: {message}"
                )));
            }
        }

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::{attach_base_ref_changes, timeline_has_base_ref_change};
    use serde_json::json;

    #[test]
    fn detects_base_ref_change_events_only() {
        assert!(!timeline_has_base_ref_change(&json!([{"event": "closed"}])));
        assert!(timeline_has_base_ref_change(&json!([
            {"event": "closed"},
            {"event": "base_ref_changed"}
        ])));
        assert!(timeline_has_base_ref_change(
            &json!([{"event": "automatic_base_change_failed"}])
        ));
    }

    #[test]
    fn attaches_previous_and_current_branch_names() {
        let mut items = json!([
            {"id": 1, "node_id": "CLOSED", "event": "closed"},
            {"id": 9, "node_id": "BRCE_1", "event": "base_ref_changed"},
            {"id": 10, "node_id": "ABCSE_1", "event": "automatic_base_change_succeeded"},
            {
                "id": 11,
                "node_id": "ABCFE_1",
                "event": "automatic_base_change_failed",
                "base_ref_change": {"from": "kept", "to": "kept-too"}
            }
        ]);
        let graphql = json!({
            "data": {
                "repository": {
                    "pullRequest": {
                        "timelineItems": {
                            "nodes": [
                                {
                                    "__typename": "BaseRefChangedEvent",
                                    "id": "BRCE_1",
                                    "previousRefName": "feature",
                                    "currentRefName": "main"
                                },
                                {
                                    "__typename": "AutomaticBaseChangeSucceededEvent",
                                    "id": "ABCSE_1",
                                    "oldBase": "old",
                                    "newBase": "new"
                                },
                                {
                                    "__typename": "AutomaticBaseChangeFailedEvent",
                                    "id": "ABCFE_1",
                                    "oldBase": "overwrite",
                                    "newBase": "me"
                                }
                            ]
                        }
                    }
                }
            }
        });

        attach_base_ref_changes(&mut items, &graphql);

        assert!(items[0].get("base_ref_change").is_none());
        assert_eq!(
            items[1]["base_ref_change"],
            json!({"from": "feature", "to": "main"})
        );
        assert_eq!(
            items[2]["base_ref_change"],
            json!({"from": "old", "to": "new"})
        );
        assert_eq!(
            items[3]["base_ref_change"],
            json!({"from": "kept", "to": "kept-too"})
        );
    }

    #[test]
    fn ignores_graphql_without_a_pull_request() {
        let mut items = json!([{"id": 9, "node_id": "BRCE_1", "event": "base_ref_changed"}]);
        attach_base_ref_changes(
            &mut items,
            &json!({"data": {"repository": {"pullRequest": null}}}),
        );
        assert!(items[0].get("base_ref_change").is_none());
    }
}
