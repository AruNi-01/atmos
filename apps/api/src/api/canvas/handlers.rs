use axum::{
    extract::{Path, Query, State},
    Json,
};

use crate::{
    api::dto::{
        ApiResponse, AtmosCanvasFilePayload, CanvasDocumentFileResponse, CanvasDocumentListItemDto,
        CanvasDocumentListResponse, CanvasDocumentWriteResponse,
    },
    app_state::AppState,
    error::ApiResult,
};
use core_service::{AtmosCanvasFile, AtmosCanvasScript};

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
    // Axum Path is already percent-decoded — do not decode again.
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
