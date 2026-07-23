#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskAnalyzerStartScanRequest {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub max_children: Option<usize>,
    /// When true, scan user home (+ Applications). Default false = Atmos-related paths only.
    #[serde(default)]
    pub scan_all: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskAnalyzerCancelScanRequest {
    pub scan_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskAnalyzerGetTreeRequest {
    pub scan_id: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub max_children: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskAnalyzerDeleteRequest {
    pub scan_id: String,
    pub path: String,
    #[serde(default)]
    pub permanent: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskAnalyzerDiskInfoRequest {
    #[serde(default)]
    pub path: Option<String>,
}
