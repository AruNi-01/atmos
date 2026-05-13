use std::sync::Arc;

use infra::db::repo::CanvasBoardRepo;
use sea_orm::DatabaseConnection;
use serde_json::{json, Value};

use crate::error::{Result, ServiceError};

pub const DEFAULT_CANVAS_SLUG: &str = "default";
pub const DEFAULT_CANVAS_NAME: &str = "Canvas";
const CANVAS_SCHEMA_V1: &str = "canvas.v1";

pub struct CanvasService {
    db: Arc<DatabaseConnection>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CanvasBoardDto {
    pub guid: String,
    pub slug: String,
    pub name: String,
    pub document_json: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct SaveCanvasBoardReq {
    pub document_json: String,
}

impl CanvasService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    pub async fn get_default_board(&self) -> Result<CanvasBoardDto> {
        let repo = CanvasBoardRepo::new(&self.db);
        let model = match repo.get_by_slug(DEFAULT_CANVAS_SLUG).await? {
            Some(model) => model,
            None => {
                repo.upsert_default(DEFAULT_CANVAS_NAME, default_canvas_document_json())
                    .await?
            }
        };

        Ok(map_board_dto(model))
    }

    pub async fn save_default_board(&self, req: SaveCanvasBoardReq) -> Result<CanvasBoardDto> {
        validate_canvas_document(&req.document_json)?;
        let repo = CanvasBoardRepo::new(&self.db);
        let model = repo
            .upsert_default(DEFAULT_CANVAS_NAME, req.document_json)
            .await?;
        Ok(map_board_dto(model))
    }
}

fn map_board_dto(model: infra::db::entities::canvas_board::Model) -> CanvasBoardDto {
    CanvasBoardDto {
        guid: model.guid,
        slug: model.slug,
        name: model.name,
        document_json: model.document_json,
        updated_at: model.updated_at.to_string(),
    }
}

fn default_canvas_document_json() -> String {
    json!({
        "schema": CANVAS_SCHEMA_V1,
        "boardSlug": DEFAULT_CANVAS_SLUG,
        "tldrawSnapshot": null,
    })
    .to_string()
}

fn validate_canvas_document(document_json: &str) -> Result<()> {
    let parsed: Value = serde_json::from_str(document_json)
        .map_err(|e| ServiceError::Validation(format!("Invalid canvas JSON: {e}")))?;

    let schema = parsed.get("schema").and_then(Value::as_str).ok_or_else(|| {
        ServiceError::Validation("Canvas document is missing `schema`".to_string())
    })?;
    if schema != CANVAS_SCHEMA_V1 {
        return Err(ServiceError::Validation(format!(
            "Unsupported canvas schema `{schema}`"
        )));
    }

    let board_slug = parsed
        .get("boardSlug")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            ServiceError::Validation("Canvas document is missing `boardSlug`".to_string())
        })?;
    if board_slug != DEFAULT_CANVAS_SLUG {
        return Err(ServiceError::Validation(format!(
            "Unsupported canvas board slug `{board_slug}`"
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{validate_canvas_document, DEFAULT_CANVAS_SLUG};

    #[test]
    fn validates_expected_document_wrapper() {
        let document = format!(
            r#"{{"schema":"canvas.v1","boardSlug":"{DEFAULT_CANVAS_SLUG}","tldrawSnapshot":null}}"#
        );
        assert!(validate_canvas_document(&document).is_ok());
    }

    #[test]
    fn rejects_invalid_document_wrapper() {
        let document = r#"{"schema":"canvas.v2","boardSlug":"wrong"}"#;
        assert!(validate_canvas_document(document).is_err());
    }
}
