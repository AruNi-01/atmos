use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AgentToolKind {
    Read,
    Edit,
    Delete,
    Move,
    Search,
    WebSearch,
    Execute,
    Fetch,
    Skill,
    Subagent,
    #[default]
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AgentToolStatus {
    #[default]
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentTool {
    pub tool_call_id: String,
    pub name: String,
    #[serde(default)]
    pub title: Option<String>,
    pub kind: AgentToolKind,
    pub status: AgentToolStatus,
    pub params: AgentToolParams,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<AgentToolResult>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentToolParams {
    Read {
        path: String,
        offset: Option<i64>,
        limit: Option<i64>,
    },
    Edit {
        path: String,
    },
    Delete {
        path: String,
    },
    Move {
        from: String,
        to: String,
    },
    Search {
        query: String,
        path: Option<String>,
        glob: Option<String>,
    },
    WebSearch {
        query: String,
    },
    Execute {
        command: String,
        cwd: Option<String>,
        background: bool,
        task_id: Option<String>,
    },
    Fetch {
        url: String,
    },
    Skill {
        skill: String,
    },
    Subagent {
        description: String,
        agent_type: Option<String>,
    },
    Other {
        value: serde_json::Value,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebSearchLink {
    pub url: String,
    pub title: String,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchHit {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentToolResult {
    Text {
        text: String,
    },
    FileContent {
        path: String,
        text: String,
    },
    DiffStats {
        path: String,
        additions: u32,
        deletions: u32,
    },
    Execute {
        output: String,
        exit_code: Option<i32>,
    },
    WebSearch {
        query: String,
        links: Vec<WebSearchLink>,
    },
    SearchHits {
        query: String,
        hits: Vec<SearchHit>,
    },
    WebFetch {
        url: String,
        title: Option<String>,
        markdown: Option<String>,
        text: Option<String>,
    },
    Other {
        value: serde_json::Value,
    },
    Error {
        message: String,
    },
    Empty,
}
