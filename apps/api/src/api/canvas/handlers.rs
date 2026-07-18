use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::Utc;
use serde_json::{json, Value};

use crate::{
    api::dto::{
        ApiResponse, AtmosCanvasFilePayload, CanvasDocumentFileResponse, CanvasDocumentListItemDto,
        CanvasDocumentListResponse, CanvasDocumentWriteResponse,
    },
    app_state::AppState,
    error::ApiResult,
};
use core_service::{AtmosCanvasFile, AtmosCanvasScript, DEFAULT_PIN_DOCUMENT_FILE};

fn decode_name(file_name: String) -> String {
    urlencoding::decode(&file_name)
        .map(|s| s.into_owned())
        .unwrap_or(file_name)
}

fn item_dto(item: core_service::CanvasDocumentListItem) -> CanvasDocumentListItemDto {
    CanvasDocumentListItemDto {
        file_name: item.file_name,
        title: item.title,
        modified_at: item.modified_at,
        size_bytes: item.size_bytes,
    }
}

pub async fn list_documents(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<CanvasDocumentListResponse>>> {
    let dir = state.canvas_service.canvas_dir()?;
    let items = state.canvas_service.list_documents()?;
    Ok(Json(ApiResponse::success(CanvasDocumentListResponse {
        dir: dir.display().to_string(),
        items: items.into_iter().map(item_dto).collect(),
    })))
}

pub async fn get_document(
    State(state): State<AppState>,
    Path(file_name): Path<String>,
) -> ApiResult<Json<ApiResponse<CanvasDocumentFileResponse>>> {
    let file_name = decode_name(file_name);
    let doc = state.canvas_service.read_document(&file_name)?;
    let abs = state
        .canvas_service
        .absolute_path(&file_name)
        .map(|p| p.display().to_string())
        .ok();
    Ok(Json(ApiResponse::success(CanvasDocumentFileResponse {
        file_name: doc.file_name,
        title: doc.title,
        modified_at: doc.modified_at,
        size_bytes: doc.size_bytes,
        absolute_path: abs,
        body: AtmosCanvasFilePayload {
            schema: doc.body.schema,
            title: doc.body.title,
            tldraw_document: doc.body.tldraw_document,
            session: doc.body.session,
            script: doc.body.script.map(|s| crate::api::dto::AtmosCanvasScriptPayload {
                entry: s.entry,
                files: s.files,
            }),
        },
    })))
}

#[derive(Debug, Default, serde::Deserialize)]
pub struct PutDocumentQuery {
    /// When true, allow replacing an existing file (normal Save of the open doc).
    /// When false/omitted, refuse if the file already exists (Save As / create).
    #[serde(default)]
    pub overwrite: bool,
}

pub async fn put_document(
    State(state): State<AppState>,
    Path(file_name): Path<String>,
    Query(query): Query<PutDocumentQuery>,
    Json(payload): Json<AtmosCanvasFilePayload>,
) -> ApiResult<Json<ApiResponse<CanvasDocumentWriteResponse>>> {
    let file_name = decode_name(file_name);
    let body = AtmosCanvasFile {
        schema: payload.schema,
        title: payload.title,
        tldraw_document: payload.tldraw_document,
        session: payload.session,
        script: payload.script.map(|s| AtmosCanvasScript {
            entry: s.entry,
            files: s.files,
        }),
    };
    let item = state
        .canvas_service
        .write_document(&file_name, &body, query.overwrite)?;
    Ok(Json(ApiResponse::success(CanvasDocumentWriteResponse {
        item: item_dto(item),
    })))
}

pub async fn delete_document(
    State(state): State<AppState>,
    Path(file_name): Path<String>,
) -> ApiResult<Json<ApiResponse<DeleteDocumentResponse>>> {
    let file_name = decode_name(file_name);
    state.canvas_service.delete_document(&file_name)?;
    Ok(Json(ApiResponse::success(DeleteDocumentResponse {
        deleted: file_name,
    })))
}

pub async fn rename_document(
    State(state): State<AppState>,
    Path(file_name): Path<String>,
    Json(payload): Json<RenameDocumentPayload>,
) -> ApiResult<Json<ApiResponse<CanvasDocumentWriteResponse>>> {
    let file_name = decode_name(file_name);
    let item = state
        .canvas_service
        .rename_document(&file_name, &payload.name)?;
    Ok(Json(ApiResponse::success(CanvasDocumentWriteResponse {
        item: item_dto(item),
    })))
}

pub async fn duplicate_document(
    State(state): State<AppState>,
    Path(file_name): Path<String>,
    Json(payload): Json<DuplicateDocumentPayload>,
) -> ApiResult<Json<ApiResponse<CanvasDocumentWriteResponse>>> {
    let file_name = decode_name(file_name);
    let item = state
        .canvas_service
        .duplicate_document(&file_name, payload.name.as_deref())?;
    Ok(Json(ApiResponse::success(CanvasDocumentWriteResponse {
        item: item_dto(item),
    })))
}

pub async fn sanitize_name(
    State(_state): State<AppState>,
    Json(payload): Json<SanitizeNamePayload>,
) -> ApiResult<Json<ApiResponse<SanitizeNameResponse>>> {
    let file_name = core_service::CanvasDocumentService::sanitize_file_name(&payload.name)?;
    Ok(Json(ApiResponse::success(SanitizeNameResponse {
        file_name,
    })))
}

/// POST /api/canvas/documents/new — create Untitled / Untitled-1 / … and return it.
pub async fn create_new_document(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<CanvasDocumentWriteResponse>>> {
    let item = state.canvas_service.create_untitled_document()?;
    Ok(Json(ApiResponse::success(CanvasDocumentWriteResponse {
        item: item_dto(item),
    })))
}

#[derive(Debug, serde::Deserialize)]
pub struct SanitizeNamePayload {
    pub name: String,
}

#[derive(Debug, serde::Serialize)]
pub struct SanitizeNameResponse {
    pub file_name: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct RenameDocumentPayload {
    pub name: String,
}

#[derive(Debug, serde::Deserialize, Default)]
pub struct DuplicateDocumentPayload {
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct DeleteDocumentResponse {
    pub deleted: String,
}

// ─── Legacy `/api/canvas/default` (pre-APP-037 clients) ─────────────────────
// Old web/desktop bundles still GET/PUT this path. Map to `Default.atmos.tldr`
// with a synthetic board DTO so mixed versions do not hard-fail with 404.

#[derive(Debug, serde::Serialize)]
pub struct LegacyCanvasBoardResponse {
    pub guid: String,
    pub slug: String,
    pub name: String,
    pub document_json: String,
    pub updated_at: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct LegacyUpdateCanvasBoardPayload {
    pub document_json: String,
}

/// GET /api/canvas/default — compatibility for stale frontends.
pub async fn get_default_board_compat(
    State(state): State<AppState>,
) -> ApiResult<Json<ApiResponse<LegacyCanvasBoardResponse>>> {
    let (title, tldraw_document, session, modified_at) =
        match state.canvas_service.read_document(DEFAULT_PIN_DOCUMENT_FILE) {
            Ok(doc) => (
                doc.body.title,
                doc.body.tldraw_document,
                doc.body.session,
                doc.modified_at,
            ),
            Err(_) => (
                "Canvas".to_string(),
                None,
                None,
                Utc::now().to_rfc3339(),
            ),
        };

    // Old clients parse `canvas.v1` + `boardSlug` + `tldrawDocument`.
    let document_json = json!({
        "schema": "canvas.v1",
        "boardSlug": "default",
        "tldrawDocument": tldraw_document,
        "session": session,
    })
    .to_string();

    Ok(Json(ApiResponse::success(LegacyCanvasBoardResponse {
        guid: DEFAULT_PIN_DOCUMENT_FILE.to_string(),
        slug: "default".to_string(),
        name: title,
        document_json,
        updated_at: modified_at,
    })))
}

/// PUT /api/canvas/default — compatibility write into Default.atmos.tldr.
pub async fn update_default_board_compat(
    State(state): State<AppState>,
    Json(payload): Json<LegacyUpdateCanvasBoardPayload>,
) -> ApiResult<Json<ApiResponse<LegacyCanvasBoardResponse>>> {
    let parsed: Value = serde_json::from_str(&payload.document_json).map_err(|e| {
        core_service::ServiceError::Validation(format!("Invalid canvas document JSON: {e}"))
    })?;

    let title = parsed
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Canvas")
        .to_string();

    // Accept either canvas.v1 wrapper or raw atmos-canvas-file.1-ish bodies.
    let tldraw_document = parsed
        .get("tldrawDocument")
        .cloned()
        .or_else(|| {
            parsed
                .get("tldrawSnapshot")
                .and_then(|snap| snap.get("document"))
                .cloned()
        });
    let session = parsed.get("session").cloned().or_else(|| {
        parsed
            .get("tldrawSnapshot")
            .and_then(|snap| snap.get("session"))
            .cloned()
    });

    let body = AtmosCanvasFile {
        schema: core_service::ATMOS_CANVAS_FILE_SCHEMA.to_string(),
        title,
        tldraw_document,
        session,
        script: None,
    };
    let item = state
        .canvas_service
        .write_document(DEFAULT_PIN_DOCUMENT_FILE, &body, true)?;

    let document_json = json!({
        "schema": "canvas.v1",
        "boardSlug": "default",
        "tldrawDocument": body.tldraw_document,
        "session": body.session,
    })
    .to_string();

    Ok(Json(ApiResponse::success(LegacyCanvasBoardResponse {
        guid: item.file_name.clone(),
        slug: "default".to_string(),
        name: item.title,
        document_json,
        updated_at: item.modified_at,
    })))
}
