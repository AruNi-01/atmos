//! Provider → [`AgentContextUsage`] formulas (session context fill, not spend).
//!
//! Policy: prefer vendor-reported windows; **never invent** a model→size table.
//! Missing window → `context_window: None` (frontend hides %).

use serde_json::Value;

use crate::contract::AgentContextUsage;

fn u64_field(value: &Value, keys: &[&str]) -> Option<u64> {
    for key in keys {
        if let Some(number) = value.get(*key).and_then(Value::as_u64) {
            return Some(number);
        }
        if let Some(number) = value
            .get(*key)
            .and_then(Value::as_f64)
            .filter(|n| n.is_finite() && *n >= 0.0)
            .map(|n| n as u64)
        {
            return Some(number);
        }
    }
    None
}

fn sum_fields(value: &Value, keys: &[&str]) -> Option<u64> {
    let mut total = 0u64;
    let mut any = false;
    for key in keys {
        if let Some(n) = u64_field(value, &[key]) {
            total = total.saturating_add(n);
            any = true;
        }
    }
    any.then_some(total)
}

/// Claude native assistant `message.usage` context tokens.
///
/// `input_tokens + cache_read_input_tokens + cache_creation_input_tokens + output_tokens`.
/// Callers that see iterations must pass **last** usage only (avoid double-counting cache).
/// Amp is ACP registry (`amp-acp`) — use [`acp_context_usage`], not this helper.
pub fn claude_context_tokens(usage: &Value) -> Option<u64> {
    sum_fields(
        usage,
        &[
            "input_tokens",
            "cache_read_input_tokens",
            "cache_creation_input_tokens",
            "output_tokens",
        ],
    )
}

/// Turn-end `result.modelUsage[model].contextWindow` — take max when models disagree.
pub fn claude_context_window_from_model_usage(model_usage: &Value) -> Option<u64> {
    let map = model_usage.as_object()?;
    let mut max = 0u64;
    for entry in map.values() {
        if let Some(window) = u64_field(entry, &["contextWindow", "context_window"]) {
            max = max.max(window);
        }
    }
    (max > 0).then_some(max)
}

pub fn claude_context_usage(
    last_assistant_usage: Option<&Value>,
    result_usage: Option<&Value>,
    model_usage: Option<&Value>,
) -> Option<AgentContextUsage> {
    let used = last_assistant_usage
        .and_then(claude_context_tokens)
        .or_else(|| result_usage.and_then(claude_context_tokens))?;
    let context_window = model_usage.and_then(claude_context_window_from_model_usage);
    Some(AgentContextUsage::new(used, context_window))
}

/// Codex `thread/tokenUsage/updated`: use `last.totalTokens` (current window), not cumulative `total`.
pub fn codex_context_usage(params: &Value) -> Option<AgentContextUsage> {
    let token_usage = params
        .get("tokenUsage")
        .or_else(|| params.get("token_usage"))
        .unwrap_or(params);
    let used = token_usage
        .get("last")
        .and_then(|last| u64_field(last, &["totalTokens", "total_tokens"]))?;
    let context_window = u64_field(token_usage, &["modelContextWindow", "model_context_window"]);
    Some(AgentContextUsage::new(used, context_window))
}

/// ACP `usage_update` (Cursor / Grok / Kimi / Amp / …): `used` + window from max/limit/size/….
pub fn acp_context_usage(usage: &Value) -> Option<AgentContextUsage> {
    let used = u64_field(
        usage,
        &[
            "used",
            "usedTokens",
            "used_tokens",
            "totalTokens",
            "total_tokens",
        ],
    )?;
    let context_window = u64_field(
        usage,
        &[
            "max",
            "limit",
            "size",
            "maxTokens",
            "max_tokens",
            "contextWindow",
            "context_window",
            "contextWindowSize",
            "context_window_size",
        ],
    );
    // Coerced ACP nulls become used=0,size=0 — treat as absent.
    if used == 0 && context_window.is_none_or(|w| w == 0) {
        return None;
    }
    Some(AgentContextUsage::new(
        used,
        context_window.filter(|w| *w > 0),
    ))
}

/// Prefer live catalog [`totalContextTokens`](grok_model_context_windows_from_catalog)
/// from `session/new` / `_x.ai/models/update` / initialize `modelState`.
/// There is **no** model→window hardcode table — if the vendor has not reported a
/// window yet, leave `context_window` as `None` (UI hides %).
///
/// `grok models` CLI text does **not** include window sizes.
pub fn grok_model_context_windows_from_catalog(
    value: &Value,
) -> std::collections::HashMap<String, u64> {
    let mut out = std::collections::HashMap::new();
    ingest_grok_available_models(&mut out, value.get("availableModels"));
    if let Some(models) = value.get("models") {
        ingest_grok_available_models(&mut out, models.get("availableModels"));
    }
    if let Some(state) = value.get("modelState") {
        ingest_grok_available_models(&mut out, state.get("availableModels"));
    }
    if let Some(meta) = value.get("_meta") {
        if let Some(state) = meta.get("modelState") {
            ingest_grok_available_models(&mut out, state.get("availableModels"));
        }
    }
    out
}

fn ingest_grok_available_models(
    out: &mut std::collections::HashMap<String, u64>,
    items: Option<&Value>,
) {
    let Some(items) = items.and_then(Value::as_array) else {
        return;
    };
    for item in items {
        let Some(id) = item
            .get("modelId")
            .or_else(|| item.get("id"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|id| !id.is_empty())
        else {
            continue;
        };
        let meta = item.get("_meta").unwrap_or(item);
        let Some(window) = u64_field(
            meta,
            &[
                "totalContextTokens",
                "total_context_tokens",
                "contextWindow",
                "context_window",
            ],
        )
        .filter(|w| *w > 0) else {
            continue;
        };
        out.insert(id.to_string(), window);
    }
}

/// Grok session occupancy: ACP `usage_update` / synthesized `{used}`, then window
/// from (1) usage payload fields, (2) live catalog `known_window`. Never invent.
pub fn grok_context_usage(usage: &Value, known_window: Option<u64>) -> Option<AgentContextUsage> {
    let mut context = acp_context_usage(usage)?;
    if context.context_window.is_none() {
        context.context_window = known_window.filter(|w| *w > 0);
    }
    Some(context)
}

/// Live Grok context fill rides `session/update` `_meta.totalTokens` (not
/// `usage_update`, which Grok typically never emits). `0` is a placeholder.
pub fn context_tokens_from_acp_meta(meta: Option<&Value>) -> Option<u64> {
    let meta = meta?;
    u64_field(meta, &["totalTokens", "total_tokens"]).filter(|n| *n > 0)
}

/// OpenCode assistant `info.tokens`: prefer `total`, else sum input+output+cache.
pub fn opencode_tokens_used(tokens: &Value) -> Option<u64> {
    if let Some(total) = u64_field(tokens, &["total"]) {
        return Some(total);
    }
    sum_fields(
        tokens,
        &[
            "input",
            "output",
            "cache",
            "read",
            "cacheRead",
            "cache_read",
            "write",
            "cacheWrite",
            "cache_write",
        ],
    )
    .or_else(|| {
        // Nested cache object: { read, write }
        let cache = tokens.get("cache")?;
        let input = u64_field(tokens, &["input"]).unwrap_or(0);
        let output = u64_field(tokens, &["output"]).unwrap_or(0);
        let read = u64_field(cache, &["read", "cacheRead"]).unwrap_or(0);
        let write = u64_field(cache, &["write", "cacheWrite"]).unwrap_or(0);
        Some(
            input
                .saturating_add(output)
                .saturating_add(read)
                .saturating_add(write),
        )
    })
}

/// OpenCode model catalog entry `/limit/context` (or camelCase variants).
pub fn opencode_context_window_from_model(model: &Value) -> Option<u64> {
    model
        .pointer("/limit/context")
        .and_then(Value::as_u64)
        .or_else(|| u64_field(model, &["context", "contextWindow", "context_window"]))
        .or_else(|| {
            model
                .get("limit")
                .and_then(|limit| u64_field(limit, &["context", "contextWindow", "context_window"]))
        })
}

pub fn opencode_context_usage(
    tokens: &Value,
    model_catalog_entry: Option<&Value>,
) -> Option<AgentContextUsage> {
    let used = opencode_tokens_used(tokens)?;
    let context_window = model_catalog_entry.and_then(opencode_context_window_from_model);
    Some(AgentContextUsage::new(used, context_window))
}

/// Match OpenCode `providerID`/`modelID` (or combined `provider/model`) in `/config/providers`.
#[allow(dead_code)] // used by overlays / future restore paths
pub fn opencode_find_model<'a>(
    providers_body: &'a Value,
    provider_id: &str,
    model_id: &str,
) -> Option<&'a Value> {
    let providers = providers_body.get("providers")?.as_array()?;
    for provider in providers {
        let id = provider.get("id").and_then(Value::as_str)?;
        if id != provider_id {
            continue;
        }
        return provider.get("models")?.get(model_id);
    }
    None
}

/// Build `providerID/modelID` → context window map from `/config/providers`.
pub fn opencode_model_context_windows(
    providers_body: &Value,
) -> std::collections::HashMap<String, u64> {
    let mut out = std::collections::HashMap::new();
    let Some(providers) = providers_body.get("providers").and_then(Value::as_array) else {
        return out;
    };
    for provider in providers {
        let Some(provider_id) = provider.get("id").and_then(Value::as_str) else {
            continue;
        };
        let Some(models) = provider.get("models").and_then(Value::as_object) else {
            continue;
        };
        for (model_id, model) in models {
            if let Some(window) = opencode_context_window_from_model(model) {
                out.insert(format!("{provider_id}/{model_id}"), window);
            }
        }
    }
    out
}

#[allow(dead_code)]
pub fn opencode_split_model_ref(model_ref: &str) -> Option<(&str, &str)> {
    let (provider, model) = model_ref.split_once('/')?;
    if provider.is_empty() || model.is_empty() {
        return None;
    }
    Some((provider, model))
}

/// Pi `get_session_stats` / model change / message.usage.
pub fn pi_context_usage_from_stats(data: &Value) -> Option<AgentContextUsage> {
    if let Some(ctx) = data
        .get("contextUsage")
        .or_else(|| data.get("context_usage"))
    {
        let used = u64_field(ctx, &["tokens", "used", "totalTokens", "total_tokens"])?;
        let context_window = u64_field(ctx, &["contextWindow", "context_window", "size"]);
        return Some(AgentContextUsage::new(used, context_window));
    }
    let context_window = data
        .pointer("/model/contextWindow")
        .and_then(Value::as_u64)
        .or_else(|| u64_field(data, &["contextWindow", "context_window"]));
    context_window.map(|window| AgentContextUsage::new(0, Some(window)))
}

pub fn pi_tokens_from_message_usage(usage: &Value) -> Option<u64> {
    u64_field(usage, &["totalTokens", "total_tokens"]).or_else(|| {
        sum_fields(
            usage,
            &[
                "input",
                "output",
                "cacheRead",
                "cacheWrite",
                "cache_read",
                "cache_write",
            ],
        )
    })
}

pub fn pi_context_usage_from_message(
    usage: &Value,
    known_window: Option<u64>,
) -> Option<AgentContextUsage> {
    let used = pi_tokens_from_message_usage(usage)?;
    Some(AgentContextUsage::new(used, known_window))
}

/// DeepSeek Harness ACP overlays: `request.context.contextWindow` + pressure tokens.
pub fn deepseek_context_usage(update: &Value) -> Option<AgentContextUsage> {
    let context_window = update
        .pointer("/request/context/contextWindow")
        .and_then(Value::as_u64)
        .or_else(|| {
            update
                .get("request")
                .and_then(|r| r.get("context"))
                .and_then(|c| u64_field(c, &["contextWindow", "context_window"]))
        })
        .or_else(|| {
            u64_field(
                update,
                &["contextWindow", "context_window", "size", "max", "limit"],
            )
        });

    let pressure = update
        .get("contextPressure")
        .or_else(|| update.get("context_pressure"));
    let used = pressure
        .and_then(|p| {
            u64_field(
                p,
                &[
                    "projectedTokens",
                    "pressureTokens",
                    "projected_tokens",
                    "pressure_tokens",
                ],
            )
        })
        .or_else(|| {
            pressure.and_then(|p| {
                sum_fields(
                    p,
                    &[
                        "input",
                        "output",
                        "cacheRead",
                        "cacheWrite",
                        "cache_read",
                        "cache_write",
                    ],
                )
            })
        })
        .or_else(|| u64_field(update, &["used"]))
        .or_else(|| {
            sum_fields(
                update,
                &[
                    "input",
                    "output",
                    "cacheRead",
                    "cacheWrite",
                    "cache_read",
                    "cache_write",
                ],
            )
        })?;

    Some(AgentContextUsage::new(used, context_window))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn claude_sums_cache_fields_last_only() {
        let usage = json!({
            "input_tokens": 100,
            "cache_read_input_tokens": 50,
            "cache_creation_input_tokens": 10,
            "output_tokens": 20
        });
        assert_eq!(claude_context_tokens(&usage), Some(180));
    }

    #[test]
    fn claude_window_takes_max_model_usage() {
        let model_usage = json!({
            "claude-sonnet-4": { "contextWindow": 200000 },
            "claude-sonnet-4[1m]": { "contextWindow": 1000000 }
        });
        assert_eq!(
            claude_context_window_from_model_usage(&model_usage),
            Some(1_000_000)
        );
    }

    #[test]
    fn codex_uses_last_not_cumulative_total() {
        let params = json!({
            "tokenUsage": {
                "total": { "totalTokens": 9000 },
                "last": { "totalTokens": 5168 },
                "modelContextWindow": 258400
            }
        });
        let usage = codex_context_usage(&params).expect("codex");
        assert_eq!(usage.used, 5168);
        assert_eq!(usage.context_window, Some(258_400));
    }

    #[test]
    fn acp_prefers_max_over_size() {
        let usage = acp_context_usage(&json!({ "used": 57, "max": 100, "size": 50 })).unwrap();
        assert_eq!(usage.used, 57);
        assert_eq!(usage.context_window, Some(100));
    }

    #[test]
    fn acp_accepts_cursor_style_token_aliases() {
        let usage = acp_context_usage(&json!({
            "usedTokens": 18432,
            "maxTokens": 200000
        }))
        .unwrap();
        assert_eq!(usage.used, 18_432);
        assert_eq!(usage.context_window, Some(200_000));
    }

    #[test]
    fn opencode_total_and_catalog_window() {
        let tokens = json!({ "total": 1200, "input": 1000, "output": 200 });
        let model = json!({ "limit": { "context": 200000 } });
        let usage = opencode_context_usage(&tokens, Some(&model)).unwrap();
        assert_eq!(usage.used, 1200);
        assert_eq!(usage.context_window, Some(200_000));
    }

    #[test]
    fn pi_stats_and_message_usage() {
        let stats = json!({
            "contextUsage": { "tokens": 800, "contextWindow": 128000 }
        });
        let usage = pi_context_usage_from_stats(&stats).unwrap();
        assert_eq!(usage.used, 800);
        assert_eq!(usage.context_window, Some(128_000));

        let msg = json!({ "input": 10, "output": 5, "cacheRead": 2, "cacheWrite": 1 });
        assert_eq!(pi_tokens_from_message_usage(&msg), Some(18));
        assert_eq!(
            pi_tokens_from_message_usage(&json!({ "totalTokens": 42 })),
            Some(42)
        );
    }

    #[test]
    fn deepseek_pressure_and_request_window() {
        let update = json!({
            "request": { "context": { "contextWindow": 128000 } },
            "contextPressure": { "projectedTokens": 4096 }
        });
        let usage = deepseek_context_usage(&update).unwrap();
        assert_eq!(usage.used, 4096);
        assert_eq!(usage.context_window, Some(128_000));
    }

    #[test]
    fn grok_fills_window_from_catalog_when_usage_has_used_only() {
        let usage = grok_context_usage(&json!({ "used": 39810 }), Some(500_000)).expect("grok");
        assert_eq!(usage.used, 39_810);
        assert_eq!(usage.context_window, Some(500_000));
    }

    #[test]
    fn grok_leaves_window_none_without_catalog() {
        let usage = grok_context_usage(&json!({ "used": 100 }), None).expect("grok");
        assert_eq!(usage.used, 100);
        assert_eq!(usage.context_window, None);
    }

    #[test]
    fn grok_prefers_usage_payload_window_over_catalog() {
        let usage = grok_context_usage(&json!({ "used": 100, "size": 99_000 }), Some(500_000))
            .expect("grok");
        assert_eq!(usage.context_window, Some(99_000));
    }

    #[test]
    fn grok_catalog_reads_total_context_tokens() {
        let catalog = json!({
            "availableModels": [
                {
                    "modelId": "grok-4.6",
                    "_meta": { "totalContextTokens": 500000 }
                },
                {
                    "modelId": "grok-4.5",
                    "_meta": { "totalContextTokens": 500000 }
                }
            ]
        });
        let map = grok_model_context_windows_from_catalog(&catalog);
        assert_eq!(map.get("grok-4.6"), Some(&500_000));
        assert_eq!(map.get("grok-4.5"), Some(&500_000));
    }

    #[test]
    fn acp_meta_total_tokens_ignores_placeholder_zero() {
        assert_eq!(
            context_tokens_from_acp_meta(Some(&json!({ "totalTokens": 1670 }))),
            Some(1670)
        );
        assert_eq!(
            context_tokens_from_acp_meta(Some(&json!({ "totalTokens": 0 }))),
            None
        );
    }
}
