use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TokenUsageGroupBy {
    Model,
    #[default]
    ClientModel,
    ClientProviderModel,
}

impl TokenUsageGroupBy {
    pub(crate) fn to_tokscale(&self) -> tokscale_core::GroupBy {
        match self {
            Self::Model => tokscale_core::GroupBy::Model,
            Self::ClientModel => tokscale_core::GroupBy::ClientModel,
            Self::ClientProviderModel => tokscale_core::GroupBy::ClientProviderModel,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct TokenUsageQuery {
    #[serde(default)]
    pub clients: Option<Vec<String>>,
    #[serde(default)]
    pub since: Option<String>,
    #[serde(default)]
    pub until: Option<String>,
    #[serde(default)]
    pub year: Option<String>,
    #[serde(default)]
    pub group_by: TokenUsageGroupBy,
}

impl TokenUsageQuery {
    pub fn normalized(&self) -> Self {
        let clients = self.clients.as_ref().and_then(|values| {
            let mut normalized = values
                .iter()
                .map(|value| value.trim().to_lowercase())
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>();
            normalized.sort();
            normalized.dedup();
            if normalized.is_empty() {
                None
            } else {
                Some(normalized)
            }
        });

        Self {
            clients,
            since: self
                .since
                .as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            until: self
                .until
                .as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            year: self
                .year
                .as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            group_by: self.group_by.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TokenUsageSummary {
    pub total_tokens: i64,
    pub total_cost_usd: Option<f64>,
    pub total_messages: i32,
    pub active_days: i32,
    pub range_start: Option<String>,
    pub range_end: Option<String>,
    pub processing_time_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClientTokenUsage {
    pub client_id: String,
    pub total_tokens: i64,
    pub total_cost_usd: Option<f64>,
    pub message_count: i32,
    pub model_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelTokenUsage {
    pub client_id: String,
    pub provider_id: String,
    pub model_id: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub reasoning_tokens: i64,
    pub total_tokens: i64,
    pub cost_usd: Option<f64>,
    pub message_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TokenBreakdown {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub reasoning_tokens: i64,
    pub total_tokens: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DailyClientTokenUsage {
    pub client_id: String,
    pub model_id: String,
    pub provider_id: String,
    pub breakdown: TokenBreakdown,
    pub total_tokens: i64,
    pub cost_usd: Option<f64>,
    pub message_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DailyTokenUsage {
    pub date: String,
    pub breakdown: TokenBreakdown,
    pub total_tokens: i64,
    pub total_cost_usd: Option<f64>,
    pub message_count: i32,
    pub by_client: Vec<DailyClientTokenUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MonthlyTokenUsage {
    pub month: String,
    pub breakdown: TokenBreakdown,
    pub total_tokens: i64,
    pub total_cost_usd: Option<f64>,
    pub message_count: i32,
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TokenUsageOverview {
    pub query: TokenUsageQuery,
    pub summary: TokenUsageSummary,
    pub by_client: Vec<ClientTokenUsage>,
    pub by_model: Vec<ModelTokenUsage>,
    pub by_day: Vec<DailyTokenUsage>,
    pub by_month: Vec<MonthlyTokenUsage>,
    pub available_years: Vec<String>,
    pub generated_at: u64,
    pub partial_warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TokenUsageUpdate {
    pub overview: TokenUsageOverview,
}
