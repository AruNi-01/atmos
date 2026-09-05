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
    /// List MCP servers / resources (first-class; not generic Other).
    McpList,
    /// Invoke an MCP tool (first-class; not generic Other).
    McpCall,
    /// Generate or edit still images (Cursor generateImage, Grok image_gen/edit).
    ImageGen,
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

/// Reference to the MCP server/tool that produced an Atmos tool call (adapters only).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AgentMcpRef {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
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
    McpList {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        server: Option<String>,
    },
    McpCall {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        server: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        tool: Option<String>,
    },
    ImageGen {
        prompt: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        aspect_ratio: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        size: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        path: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reference_paths: Option<Vec<String>>,
    },
    Other {
        value: serde_json::Value,
    },
}

/// One generated/edited image — URL (http(s)/data:), workspace path, or both.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentGeneratedImage {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
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
    Images {
        images: Vec<AgentGeneratedImage>,
    },
    Other {
        value: serde_json::Value,
    },
    Error {
        message: String,
    },
    Empty,
}
