use reqwest::redirect::Policy;
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};

use crate::error::{LocalModelError, Result};
use crate::manifest::ModelEntry;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum HfResolveResult {
    Model { model: ModelEntry },
    Choices { choices: Vec<HfModelChoice> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HfModelChoice {
    pub repo_id: String,
    pub filename: String,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ram_footprint_mb: Option<u64>,
    #[serde(default)]
    pub discovered: bool,
}

#[derive(Debug, Clone)]
struct HfFileRef {
    repo_id: String,
    revision: String,
    path: String,
}

#[derive(Debug, Clone)]
struct HfFileMetadata {
    sha256: String,
    size_bytes: u64,
}

#[derive(Debug, Deserialize)]
struct HfModelInfo {
    #[serde(default)]
    siblings: Vec<HfSibling>,
}

#[derive(Debug, Deserialize)]
struct HfSibling {
    rfilename: String,
}

#[derive(Debug, Deserialize)]
struct HfSearchModel {
    #[serde(default, rename = "modelId")]
    model_id: Option<String>,
    #[serde(default)]
    id: Option<String>,
}

pub async fn resolve_hf_model_url(client: &Client, raw_url: &str) -> Result<HfResolveResult> {
    let parsed = parse_hf_url(raw_url)?;
    match parsed {
        ParsedHfUrl::File(file_ref) => {
            let model = resolve_file(file_ref).await?;
            Ok(HfResolveResult::Model { model })
        }
        ParsedHfUrl::Repo {
            repo_id,
            revision,
            prefix,
        } => {
            let choices =
                list_gguf_choices(client, &repo_id, &revision, prefix.as_deref(), None).await?;
            if choices.len() == 1 {
                let file_ref = HfFileRef {
                    repo_id,
                    revision,
                    path: choices[0].filename.clone(),
                };
                let model = resolve_file(file_ref).await?;
                Ok(HfResolveResult::Model { model })
            } else if choices.is_empty() {
                let discovered = discover_gguf_choices(client, &repo_id).await?;
                if discovered.is_empty() {
                    Err(LocalModelError::Runtime(
                        "No GGUF files found for this Hugging Face model".to_string(),
                    ))
                } else {
                    Ok(HfResolveResult::Choices {
                        choices: discovered,
                    })
                }
            } else {
                Ok(HfResolveResult::Choices { choices })
            }
        }
    }
}

enum ParsedHfUrl {
    File(HfFileRef),
    Repo {
        repo_id: String,
        revision: String,
        prefix: Option<String>,
    },
}

fn parse_hf_url(raw_url: &str) -> Result<ParsedHfUrl> {
    let url = Url::parse(raw_url.trim())
        .map_err(|e| LocalModelError::Runtime(format!("Invalid Hugging Face URL: {e}")))?;
    if url.scheme() != "https" {
        return Err(LocalModelError::Runtime(
            "Only HTTPS Hugging Face URLs are supported".to_string(),
        ));
    }
    if url.host_str() != Some("huggingface.co") {
        return Err(LocalModelError::Runtime(
            "Only huggingface.co URLs are supported".to_string(),
        ));
    }

    let segments = url
        .path_segments()
        .map(|segments| {
            segments
                .filter(|segment| !segment.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if segments.len() < 2 {
        return Err(LocalModelError::Runtime(
            "Expected a Hugging Face model URL like https://huggingface.co/owner/repo".to_string(),
        ));
    }

    let repo_id = format!("{}/{}", segments[0], segments[1]);
    if segments.len() >= 5 && matches!(segments[2], "blob" | "resolve") {
        let revision = segments[3].to_string();
        let path = segments[4..].join("/");
        validate_gguf_path(&path)?;
        return Ok(ParsedHfUrl::File(HfFileRef {
            repo_id,
            revision,
            path,
        }));
    }

    if segments.len() >= 4 && segments[2] == "tree" {
        let revision = segments[3].to_string();
        let prefix = if segments.len() > 4 {
            Some(segments[4..].join("/"))
        } else {
            None
        };
        return Ok(ParsedHfUrl::Repo {
            repo_id,
            revision,
            prefix,
        });
    }

    Ok(ParsedHfUrl::Repo {
        repo_id,
        revision: "main".to_string(),
        prefix: None,
    })
}

async fn list_gguf_choices(
    client: &Client,
    repo_id: &str,
    revision: &str,
    prefix: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<HfModelChoice>> {
    let api_url = format!("https://huggingface.co/api/models/{repo_id}/revision/{revision}");
    let info = client
        .get(api_url)
        .send()
        .await?
        .error_for_status()?
        .json::<HfModelInfo>()
        .await?;

    let mut choices = info
        .siblings
        .into_iter()
        .filter(|sibling| is_gguf_path(&sibling.rfilename))
        .filter(|sibling| {
            prefix
                .map(|prefix| sibling.rfilename.starts_with(prefix))
                .unwrap_or(true)
        })
        .map(|sibling| {
            let url = format!(
                "https://huggingface.co/{repo_id}/blob/{revision}/{}",
                sibling.rfilename
            );
            HfModelChoice {
                repo_id: repo_id.to_string(),
                filename: sibling.rfilename,
                url,
                size_bytes: None,
                ram_footprint_mb: None,
                discovered: false,
            }
        })
        .collect::<Vec<_>>();
    sort_choices(&mut choices);
    if let Some(limit) = limit {
        choices.truncate(limit);
    }
    enrich_choice_metadata(&mut choices, revision).await;
    sort_choices(&mut choices);
    Ok(choices)
}

async fn discover_gguf_choices(
    client: &Client,
    source_repo_id: &str,
) -> Result<Vec<HfModelChoice>> {
    let source_name = source_repo_id
        .rsplit('/')
        .next()
        .unwrap_or(source_repo_id)
        .trim();
    let mut url = Url::parse("https://huggingface.co/api/models")
        .map_err(|e| LocalModelError::Runtime(format!("Invalid Hugging Face API URL: {e}")))?;
    url.query_pairs_mut()
        .append_pair("search", &format!("{source_name} GGUF"))
        .append_pair("limit", "20");

    let results = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json::<Vec<HfSearchModel>>()
        .await?;

    let mut choices = Vec::new();
    for repo_id in results
        .into_iter()
        .filter_map(|model| model.model_id.or(model.id))
        .filter(|repo_id| repo_id.to_ascii_lowercase().contains("gguf"))
        .take(8)
    {
        if repo_id == source_repo_id {
            continue;
        }
        let mut repo_choices = list_gguf_choices(client, &repo_id, "main", None, Some(6))
            .await
            .unwrap_or_default();
        for choice in &mut repo_choices {
            choice.discovered = true;
        }
        choices.extend(repo_choices);
        if choices.len() >= 30 {
            break;
        }
    }

    sort_choices(&mut choices);
    choices.truncate(30);
    Ok(choices)
}

async fn resolve_file(file_ref: HfFileRef) -> Result<ModelEntry> {
    validate_gguf_path(&file_ref.path)?;
    let download_url = format!(
        "https://huggingface.co/{}/resolve/{}/{}",
        file_ref.repo_id, file_ref.revision, file_ref.path
    );
    let metadata = resolve_file_metadata(&file_ref).await?;

    let filename = file_ref
        .path
        .rsplit('/')
        .next()
        .unwrap_or(file_ref.path.as_str());
    let display_name = display_name_from_filename(filename);
    let ram_footprint_mb = ram_footprint_mb(metadata.size_bytes);

    Ok(ModelEntry {
        id: custom_model_id(&file_ref.repo_id, filename),
        display_name,
        description: format!("Custom Hugging Face GGUF model from {}", file_ref.repo_id),
        license: "Custom".to_string(),
        license_url: format!("https://huggingface.co/{}", file_ref.repo_id),
        ram_footprint_mb,
        recommended_context_size: 4096,
        gguf_url: download_url.clone(),
        mirror_urls: Vec::new(),
        sha256: metadata.sha256,
        size_bytes: metadata.size_bytes,
        tags: vec!["custom".to_string(), "GGUF".to_string()],
        recommended: false,
        custom: true,
        source_url: Some(download_url),
    })
}

async fn resolve_file_metadata(file_ref: &HfFileRef) -> Result<HfFileMetadata> {
    let download_url = format!(
        "https://huggingface.co/{}/resolve/{}/{}",
        file_ref.repo_id, file_ref.revision, file_ref.path
    );
    let metadata_client = Client::builder().redirect(Policy::none()).build()?;
    let response = metadata_client
        .head(&download_url)
        .send()
        .await?
        .error_for_status()?;
    let headers = response.headers();

    let sha256 = header_value(headers, "x-linked-etag")
        .map(clean_etag)
        .filter(|value| is_sha256_hex(value))
        .ok_or_else(|| {
            LocalModelError::Runtime(
                "Could not resolve SHA-256 for this Hugging Face GGUF file".to_string(),
            )
        })?;

    let size_bytes = header_value(headers, "x-linked-size")
        .and_then(|value| value.parse::<u64>().ok())
        .ok_or_else(|| {
            LocalModelError::Runtime(
                "Could not resolve file size for this Hugging Face GGUF file".to_string(),
            )
        })?;

    Ok(HfFileMetadata { sha256, size_bytes })
}

async fn enrich_choice_metadata(choices: &mut [HfModelChoice], revision: &str) {
    for choice in choices.iter_mut() {
        let file_ref = HfFileRef {
            repo_id: choice.repo_id.clone(),
            revision: revision.to_string(),
            path: choice.filename.clone(),
        };
        if let Ok(metadata) = resolve_file_metadata(&file_ref).await {
            choice.size_bytes = Some(metadata.size_bytes);
            choice.ram_footprint_mb = Some(ram_footprint_mb(metadata.size_bytes));
        }
    }
}

fn ram_footprint_mb(size_bytes: u64) -> u64 {
    ((size_bytes + 1024 * 1024 - 1) / (1024 * 1024)).max(1)
}

fn sort_choices(choices: &mut [HfModelChoice]) {
    choices.sort_by(|a, b| {
        choice_score(b)
            .cmp(&choice_score(a))
            .then_with(|| a.repo_id.cmp(&b.repo_id))
            .then_with(|| a.filename.cmp(&b.filename))
    });
}

fn choice_score(choice: &HfModelChoice) -> i32 {
    let repo = choice.repo_id.to_ascii_lowercase();
    let filename = choice.filename.to_ascii_lowercase();
    let mut score = 0;
    if repo.starts_with("unsloth/") {
        score += 30;
    } else if repo.starts_with("bartowski/") {
        score += 25;
    } else if repo.starts_with("lmstudio-community/") {
        score += 20;
    }
    if filename.contains("q4_k_m") {
        score += 40;
    } else if filename.contains("q5_k_m") {
        score += 25;
    } else if filename.contains("q4_0") {
        score += 15;
    }
    if filename.contains("instruct") {
        score += 5;
    }
    score
}

fn validate_gguf_path(path: &str) -> Result<()> {
    if !is_gguf_path(path) {
        return Err(LocalModelError::Runtime(
            "Only .gguf model files are supported".to_string(),
        ));
    }
    Ok(())
}

fn is_gguf_path(path: &str) -> bool {
    path.to_ascii_lowercase().ends_with(".gguf")
}

fn header_value(headers: &reqwest::header::HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
}

fn clean_etag(value: String) -> String {
    value
        .trim_matches('"')
        .trim_start_matches("sha256:")
        .to_string()
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|ch| ch.is_ascii_hexdigit())
}

fn display_name_from_filename(filename: &str) -> String {
    filename.trim_end_matches(".gguf").to_string()
}

fn custom_model_id(repo_id: &str, filename: &str) -> String {
    let raw = format!(
        "custom-{}-{}",
        repo_id.replace('/', "-"),
        filename.trim_end_matches(".gguf")
    );
    let mut id = String::new();
    let mut last_was_dash = false;
    for ch in raw.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            id.push(ch);
            last_was_dash = false;
        } else if !last_was_dash {
            id.push('-');
            last_was_dash = true;
        }
    }
    id.trim_matches('-').to_string()
}
