use std::collections::HashSet;

use chrono::{DateTime, Utc};
use sea_orm::sea_query::OnConflict;
use sea_orm::{
    ActiveModelTrait, ActiveValue::NotSet, ColumnTrait, Condition, ConnectionTrait,
    DatabaseConnection, DatabaseTransaction, DbBackend, DbErr, EntityTrait, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, Set, Statement, TransactionTrait,
};
use uuid::Uuid;

use crate::db::entities::{
    host_session, host_session_search, host_session_search_cursor, host_session_sync,
};
use crate::error::InfraError;

const SYNC_GUID: &str = "host_session_sync";
const INSERT_CHUNK: usize = 40;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostSessionSortField {
    StartedAt,
    LastActiveAt,
    ByteSize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostSessionSortOrder {
    Asc,
    Desc,
}

#[derive(Debug, Clone)]
pub struct HostSessionIndexQuery {
    pub provider_id: Option<String>,
    pub project: Option<String>,
    pub query: Option<String>,
    pub sort_field: HostSessionSortField,
    pub sort_order: HostSessionSortOrder,
    pub updated_after: Option<DateTime<Utc>>,
    pub updated_before: Option<DateTime<Utc>>,
    pub limit: u32,
    pub offset: u32,
    pub roots_only: bool,
    pub session_keys: Option<Vec<String>>,
}

impl Default for HostSessionIndexQuery {
    fn default() -> Self {
        Self {
            provider_id: None,
            project: None,
            query: None,
            sort_field: HostSessionSortField::LastActiveAt,
            sort_order: HostSessionSortOrder::Desc,
            updated_after: None,
            updated_before: None,
            limit: 10_000,
            offset: 0,
            roots_only: true,
            session_keys: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostSessionSearchMatch {
    pub session_key: String,
    pub root_session_key: String,
    pub kind: String,
    pub message_id: Option<String>,
    pub seq: i32,
    pub chunk: i32,
    pub text: String,
}

pub fn host_session_fts_match_query(raw: &str) -> Option<String> {
    let terms: Vec<String> = raw
        .split_whitespace()
        .filter(|term| !term.is_empty())
        .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
        .collect();
    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" AND "))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostSessionIndexRow {
    pub session_key: String,
    pub provider_id: String,
    pub native_id: String,
    pub title: String,
    pub cwd: String,
    pub project_name: String,
    pub started_at: DateTime<Utc>,
    pub last_active_at: DateTime<Utc>,
    pub message_count: Option<u32>,
    pub byte_size: Option<u64>,
    pub model: Option<String>,
    pub source_path: String,
    pub parent_native_id: Option<String>,
    pub source_mtime_ms: i64,
    pub source_size: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostSessionIndexPage {
    pub sessions: Vec<HostSessionIndexRow>,
    pub total: u32,
}

pub struct HostSessionRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> HostSessionRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn last_synced_at(&self) -> Result<Option<DateTime<Utc>>, InfraError> {
        let Some(row) = host_session_sync::Entity::find_by_id(SYNC_GUID)
            .one(self.db)
            .await?
        else {
            return Ok(None);
        };
        Ok(Some(DateTime::<Utc>::from_naive_utc_and_offset(
            row.last_synced_at,
            Utc,
        )))
    }

    pub async fn get(&self, session_key: &str) -> Result<Option<HostSessionIndexRow>, InfraError> {
        let row = host_session::Entity::find()
            .filter(host_session::Column::SessionKey.eq(session_key))
            .filter(host_session::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?;
        Ok(row.map(into_row))
    }

    pub async fn list_all(&self) -> Result<Vec<HostSessionIndexRow>, InfraError> {
        Ok(self
            .query(&HostSessionIndexQuery {
                roots_only: false,
                limit: 50_000,
                ..Default::default()
            })
            .await?
            .sessions)
    }

    pub async fn index_revision(&self) -> Result<i32, InfraError> {
        let Some(row) = host_session_sync::Entity::find_by_id(SYNC_GUID)
            .one(self.db)
            .await?
        else {
            return Ok(0);
        };
        Ok(row.index_revision)
    }

    pub async fn query(
        &self,
        query: &HostSessionIndexQuery,
    ) -> Result<HostSessionIndexPage, InfraError> {
        let mut finder =
            host_session::Entity::find().filter(host_session::Column::IsDeleted.eq(false));
        if query.roots_only {
            finder = finder.filter(
                Condition::any()
                    .add(host_session::Column::ParentNativeId.is_null())
                    .add(host_session::Column::ParentNativeId.eq("")),
            );
        }
        if let Some(keys) = query.session_keys.as_ref() {
            if keys.is_empty() {
                return Ok(HostSessionIndexPage {
                    sessions: Vec::new(),
                    total: 0,
                });
            }
            finder = finder.filter(host_session::Column::SessionKey.is_in(keys.clone()));
        }
        if let Some(provider_id) = query
            .provider_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            finder = finder.filter(host_session::Column::ProviderId.eq(provider_id));
        }
        if let Some(project) = query
            .project
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            finder = finder.filter(
                Condition::any()
                    .add(host_session::Column::ProjectName.contains(project))
                    .add(host_session::Column::Cwd.contains(project)),
            );
        }
        if let Some(needle) = query
            .query
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            finder = finder.filter(
                Condition::any()
                    .add(host_session::Column::Title.contains(needle))
                    .add(host_session::Column::Cwd.contains(needle))
                    .add(host_session::Column::ProjectName.contains(needle))
                    .add(host_session::Column::NativeId.contains(needle))
                    .add(host_session::Column::SessionKey.contains(needle)),
            );
        }
        if let Some(after) = query.updated_after {
            finder = finder.filter(host_session::Column::LastActiveAt.gte(after.naive_utc()));
        }
        if let Some(before) = query.updated_before {
            finder = finder.filter(host_session::Column::LastActiveAt.lt(before.naive_utc()));
        }

        let order = match query.sort_order {
            HostSessionSortOrder::Asc => sea_orm::Order::Asc,
            HostSessionSortOrder::Desc => sea_orm::Order::Desc,
        };
        let sort_col = match query.sort_field {
            HostSessionSortField::StartedAt => host_session::Column::StartedAt,
            HostSessionSortField::LastActiveAt => host_session::Column::LastActiveAt,
            HostSessionSortField::ByteSize => host_session::Column::ByteSize,
        };
        finder = finder
            .order_by(sort_col, order)
            .order_by(host_session::Column::SessionKey, sea_orm::Order::Asc);

        let total = finder.clone().count(self.db).await? as u32;
        let sessions = finder
            .limit(query.limit.max(1) as u64)
            .offset(query.offset as u64)
            .all(self.db)
            .await?
            .into_iter()
            .map(into_row)
            .collect();

        Ok(HostSessionIndexPage { sessions, total })
    }

    pub async fn replace_all(&self, rows: &[HostSessionIndexRow]) -> Result<(), InfraError> {
        let txn = self.db.begin().await?;
        replace_all_in_txn(&txn, rows).await?;
        txn.commit().await?;
        Ok(())
    }

    pub async fn sync_index(
        &self,
        rows: &[HostSessionIndexRow],
        index_revision: i32,
    ) -> Result<(), InfraError> {
        let txn = self.db.begin().await?;
        sync_index_in_txn(&txn, rows, index_revision).await?;
        txn.commit().await?;
        Ok(())
    }

    pub async fn set_message_count(
        &self,
        session_key: &str,
        message_count: Option<u32>,
    ) -> Result<(), InfraError> {
        let Some(existing) = host_session::Entity::find()
            .filter(host_session::Column::SessionKey.eq(session_key))
            .one(self.db)
            .await?
        else {
            return Ok(());
        };
        let mut model: host_session::ActiveModel = existing.into();
        model.message_count = Set(message_count.map(|n| n as i32));
        model.updated_at = Set(Utc::now().naive_utc());
        model.update(self.db).await?;
        Ok(())
    }

    pub async fn invalidate_search_bodies(&self) -> Result<(), InfraError> {
        self.db
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                "UPDATE host_session_search_cursor SET body_ready = 0".to_owned(),
            ))
            .await?;
        Ok(())
    }

    pub async fn prune_search_orphans(&self) -> Result<(), InfraError> {
        self.db
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                "DELETE FROM host_session_search WHERE session_key NOT IN (SELECT session_key FROM host_session WHERE is_deleted = 0)".to_owned(),
            ))
            .await?;
        self.db
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                "DELETE FROM host_session_search_cursor WHERE session_key NOT IN (SELECT session_key FROM host_session WHERE is_deleted = 0)".to_owned(),
            ))
            .await?;
        Ok(())
    }

    pub async fn upsert_title_docs(&self, rows: &[HostSessionIndexRow]) -> Result<(), InfraError> {
        let now = Utc::now().naive_utc();
        let models: Vec<host_session_search::ActiveModel> = rows
            .iter()
            .filter(|row| !row.title.trim().is_empty())
            .map(|row| search_active_model(title_doc(row), now))
            .collect();
        insert_search_models(self.db, models).await
    }

    pub async fn replace_session_docs(
        &self,
        session_key: &str,
        docs: &[HostSessionSearchDoc],
    ) -> Result<(), InfraError> {
        host_session_search::Entity::delete_many()
            .filter(host_session_search::Column::SessionKey.eq(session_key))
            .exec(self.db)
            .await?;
        let now = Utc::now().naive_utc();
        let models: Vec<host_session_search::ActiveModel> = docs
            .iter()
            .filter(|doc| !doc.text.trim().is_empty())
            .map(|doc| search_active_model(doc.clone(), now))
            .collect();
        insert_search_models(self.db, models).await
    }

    pub async fn search_text(
        &self,
        raw_query: &str,
    ) -> Result<Vec<HostSessionSearchMatch>, InfraError> {
        let terms: Vec<&str> = raw_query
            .split_whitespace()
            .filter(|term| !term.is_empty())
            .collect();
        if terms.is_empty() {
            return Ok(Vec::new());
        }
        // FTS5 trigram cannot MATCH terms shorter than 3 unicode characters (CJK 2-grams).
        let short = terms.iter().any(|term| term.chars().count() < 3);
        if !short {
            if let Ok(rows) = self.search_fts(raw_query).await {
                if !rows.is_empty() {
                    return Ok(rows);
                }
            }
        }
        self.search_like(&terms).await
    }

    async fn search_fts(&self, raw_query: &str) -> Result<Vec<HostSessionSearchMatch>, InfraError> {
        let Some(match_query) = host_session_fts_match_query(raw_query) else {
            return Ok(Vec::new());
        };
        let rows = self
            .db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                r#"
                SELECT
                  s.session_key,
                  s.root_session_key,
                  s.kind,
                  s.message_id,
                  s.seq,
                  s.chunk,
                  s.text
                FROM host_session_fts
                JOIN host_session_search s ON s.id = host_session_fts.rowid
                WHERE host_session_fts MATCH ?
                ORDER BY rank
                LIMIT 200
                "#,
                [match_query.into()],
            ))
            .await?;
        map_search_rows(rows)
    }

    async fn search_like(&self, terms: &[&str]) -> Result<Vec<HostSessionSearchMatch>, InfraError> {
        let mut sql = String::from(
            r#"
            SELECT
              s.session_key,
              s.root_session_key,
              s.kind,
              s.message_id,
              s.seq,
              s.chunk,
              s.text
            FROM host_session_search s
            WHERE 1=1
            "#,
        );
        let mut values: Vec<sea_orm::Value> = Vec::new();
        for term in terms.iter().take(8) {
            sql.push_str(" AND instr(lower(s.text), lower(?)) > 0");
            values.push((*term).into());
        }
        sql.push_str(" LIMIT 200");
        let rows = self
            .db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                sql,
                values,
            ))
            .await?;
        map_search_rows(rows)
    }

    pub async fn search_cursor(
        &self,
        session_key: &str,
    ) -> Result<Option<HostSessionSearchCursor>, InfraError> {
        let row = host_session_search_cursor::Entity::find_by_id(session_key)
            .one(self.db)
            .await?;
        Ok(row.map(|model| HostSessionSearchCursor {
            session_key: model.session_key,
            source_mtime_ms: model.source_mtime_ms,
            source_size: model.source_size,
            body_ready: model.body_ready != 0,
        }))
    }

    pub async fn set_search_cursor(
        &self,
        session_key: &str,
        source_mtime_ms: i64,
        source_size: i64,
        body_ready: bool,
    ) -> Result<(), InfraError> {
        let now = Utc::now().naive_utc();
        match host_session_search_cursor::Entity::find_by_id(session_key)
            .one(self.db)
            .await?
        {
            Some(existing) => {
                let mut model: host_session_search_cursor::ActiveModel = existing.into();
                model.source_mtime_ms = Set(source_mtime_ms);
                model.source_size = Set(source_size);
                model.body_ready = Set(if body_ready { 1 } else { 0 });
                model.updated_at = Set(now);
                model.update(self.db).await?;
            }
            None => {
                host_session_search_cursor::ActiveModel {
                    session_key: Set(session_key.to_string()),
                    source_mtime_ms: Set(source_mtime_ms),
                    source_size: Set(source_size),
                    body_ready: Set(if body_ready { 1 } else { 0 }),
                    updated_at: Set(now),
                }
                .insert(self.db)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn search_body_pending(&self) -> Result<bool, InfraError> {
        let (indexed, total) = self.search_body_counts().await?;
        Ok(total > indexed)
    }

    pub async fn search_body_counts(&self) -> Result<(u32, u32), InfraError> {
        let row = self
            .db
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                r#"
                SELECT
                  COUNT(*) AS total,
                  CAST(COALESCE(SUM(CASE WHEN c.body_ready = 1 THEN 1 ELSE 0 END), 0) AS INTEGER) AS indexed
                FROM host_session h
                LEFT JOIN host_session_search_cursor c
                  ON c.session_key = h.session_key
                WHERE h.is_deleted = 0
                "#
                .to_owned(),
            ))
            .await?;
        let total: i64 = row
            .as_ref()
            .map(|row| row.try_get("", "total"))
            .transpose()?
            .unwrap_or(0);
        let indexed: i64 = row
            .map(|row| row.try_get("", "indexed"))
            .transpose()?
            .unwrap_or(0);
        Ok((indexed.max(0) as u32, total.max(0) as u32))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostSessionSearchDoc {
    pub session_key: String,
    pub root_session_key: String,
    pub kind: String,
    pub message_id: Option<String>,
    pub seq: i32,
    pub chunk: i32,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostSessionSearchCursor {
    pub session_key: String,
    pub source_mtime_ms: i64,
    pub source_size: i64,
    pub body_ready: bool,
}

fn title_doc(row: &HostSessionIndexRow) -> HostSessionSearchDoc {
    HostSessionSearchDoc {
        session_key: row.session_key.clone(),
        root_session_key: root_session_key(row),
        kind: "title".into(),
        message_id: None,
        seq: -1,
        chunk: 0,
        text: row.title.clone(),
    }
}

pub fn host_session_root_key(row: &HostSessionIndexRow) -> String {
    root_session_key(row)
}

fn root_session_key(row: &HostSessionIndexRow) -> String {
    match row
        .parent_native_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(parent) => format!("{}:{parent}", row.provider_id),
        None => row.session_key.clone(),
    }
}

fn search_active_model(
    doc: HostSessionSearchDoc,
    now: chrono::NaiveDateTime,
) -> host_session_search::ActiveModel {
    host_session_search::ActiveModel {
        id: NotSet,
        guid: Set(Uuid::new_v4().to_string()),
        session_key: Set(doc.session_key),
        root_session_key: Set(doc.root_session_key),
        kind: Set(doc.kind),
        message_id: Set(doc.message_id),
        seq: Set(doc.seq),
        chunk: Set(doc.chunk),
        text: Set(doc.text),
        created_at: Set(now),
        updated_at: Set(now),
    }
}

async fn insert_search_models(
    db: &DatabaseConnection,
    models: Vec<host_session_search::ActiveModel>,
) -> Result<(), InfraError> {
    for chunk in models.chunks(INSERT_CHUNK) {
        if chunk.is_empty() {
            continue;
        }
        host_session_search::Entity::insert_many(chunk.to_vec())
            .on_conflict(
                OnConflict::columns([
                    host_session_search::Column::SessionKey,
                    host_session_search::Column::Kind,
                    host_session_search::Column::Seq,
                    host_session_search::Column::Chunk,
                ])
                .update_columns([
                    host_session_search::Column::RootSessionKey,
                    host_session_search::Column::MessageId,
                    host_session_search::Column::Text,
                    host_session_search::Column::UpdatedAt,
                ])
                .to_owned(),
            )
            .exec(db)
            .await?;
    }
    Ok(())
}

fn map_search_rows(
    rows: Vec<sea_orm::QueryResult>,
) -> Result<Vec<HostSessionSearchMatch>, InfraError> {
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(HostSessionSearchMatch {
            session_key: row.try_get("", "session_key")?,
            root_session_key: row.try_get("", "root_session_key")?,
            kind: row.try_get("", "kind")?,
            message_id: row.try_get("", "message_id")?,
            seq: row.try_get("", "seq")?,
            chunk: row.try_get("", "chunk")?,
            text: row.try_get("", "text")?,
        });
    }
    Ok(out)
}

async fn replace_all_in_txn(
    txn: &DatabaseTransaction,
    rows: &[HostSessionIndexRow],
) -> Result<(), InfraError> {
    host_session::Entity::delete_many().exec(txn).await?;
    let now = Utc::now().naive_utc();
    insert_index_chunks(txn, rows, now).await?;
    upsert_sync_row(txn, now, 0).await?;
    Ok(())
}

async fn sync_index_in_txn(
    txn: &DatabaseTransaction,
    rows: &[HostSessionIndexRow],
    index_revision: i32,
) -> Result<(), InfraError> {
    let existing: Vec<String> = host_session::Entity::find()
        .all(txn)
        .await?
        .into_iter()
        .map(|model| model.session_key)
        .collect();
    let keep: HashSet<&str> = rows.iter().map(|row| row.session_key.as_str()).collect();
    let stale: Vec<String> = existing
        .into_iter()
        .filter(|key| !keep.contains(key.as_str()))
        .collect();
    for chunk in stale.chunks(INSERT_CHUNK) {
        host_session::Entity::delete_many()
            .filter(host_session::Column::SessionKey.is_in(chunk.to_vec()))
            .exec(txn)
            .await?;
    }
    let now = Utc::now().naive_utc();
    upsert_index_chunks(txn, rows, now).await?;
    upsert_sync_row(txn, now, index_revision).await?;
    Ok(())
}

fn index_active_model(
    row: &HostSessionIndexRow,
    now: chrono::NaiveDateTime,
) -> host_session::ActiveModel {
    host_session::ActiveModel {
        guid: Set(Uuid::new_v4().to_string()),
        created_at: Set(now),
        updated_at: Set(now),
        is_deleted: Set(false),
        session_key: Set(row.session_key.clone()),
        provider_id: Set(row.provider_id.clone()),
        native_id: Set(row.native_id.clone()),
        title: Set(row.title.clone()),
        cwd: Set(row.cwd.clone()),
        project_name: Set(row.project_name.clone()),
        started_at: Set(row.started_at.naive_utc()),
        last_active_at: Set(row.last_active_at.naive_utc()),
        message_count: Set(row.message_count.map(|n| n as i32)),
        byte_size: Set(row.byte_size.and_then(|n| i64::try_from(n).ok())),
        model: Set(row.model.clone()),
        source_path: Set(row.source_path.clone()),
        parent_native_id: Set(row.parent_native_id.clone()),
        source_mtime_ms: Set(row.source_mtime_ms),
        source_size: Set(row.source_size),
    }
}

async fn insert_index_chunks(
    txn: &DatabaseTransaction,
    rows: &[HostSessionIndexRow],
    now: chrono::NaiveDateTime,
) -> Result<(), InfraError> {
    for chunk in rows.chunks(INSERT_CHUNK) {
        let models: Vec<host_session::ActiveModel> = chunk
            .iter()
            .map(|row| index_active_model(row, now))
            .collect();
        if !models.is_empty() {
            host_session::Entity::insert_many(models).exec(txn).await?;
        }
    }
    Ok(())
}

async fn upsert_index_chunks(
    txn: &DatabaseTransaction,
    rows: &[HostSessionIndexRow],
    now: chrono::NaiveDateTime,
) -> Result<(), InfraError> {
    for chunk in rows.chunks(INSERT_CHUNK) {
        let models: Vec<host_session::ActiveModel> = chunk
            .iter()
            .map(|row| index_active_model(row, now))
            .collect();
        if models.is_empty() {
            continue;
        }
        host_session::Entity::insert_many(models)
            .on_conflict(
                OnConflict::column(host_session::Column::SessionKey)
                    .update_columns([
                        host_session::Column::UpdatedAt,
                        host_session::Column::IsDeleted,
                        host_session::Column::ProviderId,
                        host_session::Column::NativeId,
                        host_session::Column::Title,
                        host_session::Column::Cwd,
                        host_session::Column::ProjectName,
                        host_session::Column::StartedAt,
                        host_session::Column::LastActiveAt,
                        host_session::Column::MessageCount,
                        host_session::Column::ByteSize,
                        host_session::Column::Model,
                        host_session::Column::SourcePath,
                        host_session::Column::ParentNativeId,
                        host_session::Column::SourceMtimeMs,
                        host_session::Column::SourceSize,
                    ])
                    .to_owned(),
            )
            .exec(txn)
            .await?;
    }
    Ok(())
}

async fn upsert_sync_row(
    txn: &DatabaseTransaction,
    now: chrono::NaiveDateTime,
    index_revision: i32,
) -> Result<(), DbErr> {
    match host_session_sync::Entity::find_by_id(SYNC_GUID)
        .one(txn)
        .await?
    {
        Some(existing) => {
            let mut model: host_session_sync::ActiveModel = existing.into();
            model.last_synced_at = Set(now);
            model.updated_at = Set(now);
            model.is_deleted = Set(false);
            model.index_revision = Set(index_revision);
            model.update(txn).await?;
        }
        None => {
            host_session_sync::ActiveModel {
                guid: Set(SYNC_GUID.to_string()),
                created_at: Set(now),
                updated_at: Set(now),
                is_deleted: Set(false),
                last_synced_at: Set(now),
                index_revision: Set(index_revision),
            }
            .insert(txn)
            .await?;
        }
    }
    Ok(())
}

fn into_row(model: host_session::Model) -> HostSessionIndexRow {
    HostSessionIndexRow {
        session_key: model.session_key,
        provider_id: model.provider_id,
        native_id: model.native_id,
        title: model.title,
        cwd: model.cwd,
        project_name: model.project_name,
        started_at: DateTime::<Utc>::from_naive_utc_and_offset(model.started_at, Utc),
        last_active_at: DateTime::<Utc>::from_naive_utc_and_offset(model.last_active_at, Utc),
        message_count: model.message_count.and_then(|n| u32::try_from(n).ok()),
        byte_size: model.byte_size.and_then(|n| u64::try_from(n).ok()),
        model: model.model,
        source_path: model.source_path,
        parent_native_id: model
            .parent_native_id
            .filter(|value| !value.trim().is_empty()),
        source_mtime_ms: model.source_mtime_ms,
        source_size: model.source_size,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migration::Migrator;
    use chrono::TimeZone;
    use sea_orm::Database;
    use sea_orm_migration::MigratorTrait;

    fn row(key: &str, provider: &str, title: &str, active: i64) -> HostSessionIndexRow {
        HostSessionIndexRow {
            session_key: key.to_string(),
            provider_id: provider.to_string(),
            native_id: key.split(':').nth(1).unwrap_or(key).to_string(),
            title: title.to_string(),
            cwd: format!("/tmp/{title}"),
            project_name: title.to_string(),
            started_at: Utc.timestamp_opt(active - 10, 0).unwrap(),
            last_active_at: Utc.timestamp_opt(active, 0).unwrap(),
            message_count: Some(2),
            byte_size: Some((active as u64) * 10),
            model: None,
            source_path: format!("/tmp/{key}.jsonl"),
            parent_native_id: None,
            source_mtime_ms: 0,
            source_size: 0,
        }
    }

    async fn mem_db() -> DatabaseConnection {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        Migrator::up(&db, None).await.unwrap();
        db
    }

    #[tokio::test]
    async fn replace_all_marks_sync_even_when_empty() {
        let db = mem_db().await;
        let repo = HostSessionRepo::new(&db);
        assert!(repo.last_synced_at().await.unwrap().is_none());
        repo.replace_all(&[]).await.unwrap();
        assert!(repo.last_synced_at().await.unwrap().is_some());
        assert_eq!(
            repo.query(&HostSessionIndexQuery::default())
                .await
                .unwrap()
                .total,
            0
        );
    }

    #[tokio::test]
    async fn query_filters_sorts_and_pages() {
        let db = mem_db().await;
        let repo = HostSessionRepo::new(&db);
        repo.replace_all(&[
            row("claude:a", "claude", "alpha", 30),
            row("codex:b", "codex", "beta", 50),
            row("claude:c", "claude", "gamma", 40),
        ])
        .await
        .unwrap();

        let page = repo
            .query(&HostSessionIndexQuery {
                provider_id: Some("claude".into()),
                project: Some("alpha".into()),
                query: Some("alpha".into()),
                sort_field: HostSessionSortField::LastActiveAt,
                sort_order: HostSessionSortOrder::Desc,
                limit: 10,
                offset: 0,
                roots_only: true,
                session_keys: None,
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.sessions[0].session_key, "claude:a");

        let paged = repo
            .query(&HostSessionIndexQuery {
                sort_field: HostSessionSortField::LastActiveAt,
                sort_order: HostSessionSortOrder::Desc,
                limit: 1,
                offset: 1,
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(paged.total, 3);
        assert_eq!(paged.sessions[0].session_key, "claude:c");

        let got = repo.get("codex:b").await.unwrap().unwrap();
        assert_eq!(got.source_path, "/tmp/codex:b.jsonl");
        assert_eq!(got.byte_size, Some(500));

        let by_size = repo
            .query(&HostSessionIndexQuery {
                sort_field: HostSessionSortField::ByteSize,
                sort_order: HostSessionSortOrder::Desc,
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(
            by_size
                .sessions
                .iter()
                .map(|row| row.session_key.as_str())
                .collect::<Vec<_>>(),
            vec!["codex:b", "claude:c", "claude:a"]
        );

        let ranged = repo
            .query(&HostSessionIndexQuery {
                updated_after: Some(Utc.timestamp_opt(35, 0).unwrap()),
                updated_before: Some(Utc.timestamp_opt(45, 0).unwrap()),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(ranged.total, 1);
        assert_eq!(ranged.sessions[0].session_key, "claude:c");
    }

    #[tokio::test]
    async fn query_hides_child_sessions_by_default() {
        let db = mem_db().await;
        let repo = HostSessionRepo::new(&db);
        let mut child = row("claude:child", "claude", "child", 20);
        child.parent_native_id = Some("a".into());
        repo.replace_all(&[row("claude:a", "claude", "alpha", 30), child])
            .await
            .unwrap();

        let roots = repo.query(&HostSessionIndexQuery::default()).await.unwrap();
        assert_eq!(roots.total, 1);
        assert_eq!(roots.sessions[0].session_key, "claude:a");

        let all = repo
            .query(&HostSessionIndexQuery {
                roots_only: false,
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(all.total, 2);
        assert_eq!(
            repo.get("claude:child")
                .await
                .unwrap()
                .unwrap()
                .parent_native_id
                .as_deref(),
            Some("a")
        );
    }

    #[tokio::test]
    async fn fts_matches_english_and_cjk_and_survives_replace_all() {
        let db = mem_db().await;
        let repo = HostSessionRepo::new(&db);
        let mut child = row("claude:child", "claude", "child", 20);
        child.parent_native_id = Some("a".into());
        repo.replace_all(&[row("claude:a", "claude", "alpha title", 30), child])
            .await
            .unwrap();
        repo.upsert_title_docs(
            &repo
                .query(&HostSessionIndexQuery {
                    roots_only: false,
                    ..Default::default()
                })
                .await
                .unwrap()
                .sessions,
        )
        .await
        .unwrap();

        let by_title = repo.search_text("alpha title").await.unwrap();
        assert_eq!(by_title[0].session_key, "claude:a");
        assert_eq!(by_title[0].kind, "title");

        repo.replace_session_docs(
            "claude:a",
            &[
                HostSessionSearchDoc {
                    session_key: "claude:a".into(),
                    root_session_key: "claude:a".into(),
                    kind: "title".into(),
                    message_id: None,
                    seq: -1,
                    chunk: 0,
                    text: "alpha title".into(),
                },
                HostSessionSearchDoc {
                    session_key: "claude:a".into(),
                    root_session_key: "claude:a".into(),
                    kind: "user".into(),
                    message_id: Some("u1".into()),
                    seq: 0,
                    chunk: 0,
                    text: "hello from host 你好世界".into(),
                },
            ],
        )
        .await
        .unwrap();
        repo.replace_session_docs(
            "claude:child",
            &[HostSessionSearchDoc {
                session_key: "claude:child".into(),
                root_session_key: "claude:a".into(),
                kind: "assistant".into(),
                message_id: Some("a1".into()),
                seq: 1,
                chunk: 0,
                text: "nested child answer".into(),
            }],
        )
        .await
        .unwrap();
        repo.set_search_cursor("claude:a", 1, 2, true)
            .await
            .unwrap();

        let english = repo.search_text("hello from").await.unwrap();
        assert_eq!(english[0].session_key, "claude:a");
        assert_eq!(english[0].kind, "user");
        assert_eq!(english[0].message_id.as_deref(), Some("u1"));
        assert_eq!(english[0].seq, 0);

        let cjk = repo.search_text("你好").await.unwrap();
        assert_eq!(cjk[0].session_key, "claude:a");
        let cjk_phrase = repo.search_text("你好世界").await.unwrap();
        assert_eq!(cjk_phrase[0].session_key, "claude:a");

        let child_hit = repo.search_text("nested child").await.unwrap();
        assert_eq!(child_hit[0].session_key, "claude:child");
        assert_eq!(child_hit[0].root_session_key, "claude:a");

        repo.replace_all(&[row("claude:a", "claude", "alpha title", 30)])
            .await
            .unwrap();
        repo.prune_search_orphans().await.unwrap();
        let after_prune = repo.search_text("nested child").await.unwrap();
        assert!(after_prune.is_empty());
        let kept = repo.search_text("hello from").await.unwrap();
        assert_eq!(kept[0].session_key, "claude:a");
        assert!(!repo.search_body_pending().await.unwrap());
        assert_eq!(repo.search_body_counts().await.unwrap(), (1, 1));
    }

    #[tokio::test]
    async fn search_body_counts_tracks_ready_cursors() {
        let db = mem_db().await;
        let repo = HostSessionRepo::new(&db);
        repo.sync_index(
            &[
                row("claude:a", "claude", "alpha", 30),
                row("claude:b", "claude", "beta", 40),
            ],
            1,
        )
        .await
        .unwrap();
        assert_eq!(repo.search_body_counts().await.unwrap(), (0, 2));
        assert!(repo.search_body_pending().await.unwrap());

        repo.set_search_cursor("claude:a", 1, 2, true)
            .await
            .unwrap();
        assert_eq!(repo.search_body_counts().await.unwrap(), (1, 2));
        assert!(repo.search_body_pending().await.unwrap());

        repo.set_search_cursor("claude:b", 1, 2, true)
            .await
            .unwrap();
        assert_eq!(repo.search_body_counts().await.unwrap(), (2, 2));
        assert!(!repo.search_body_pending().await.unwrap());
    }

    #[test]
    fn fts_query_quotes_terms_and_escapes_quotes() {
        assert_eq!(
            host_session_fts_match_query("  hello   世界 "),
            Some("\"hello\" AND \"世界\"".into())
        );
        assert_eq!(
            host_session_fts_match_query(r#"say "hi""#),
            Some(r#""say" AND """hi""""#.into())
        );
        assert_eq!(host_session_fts_match_query("   "), None);
    }

    #[tokio::test]
    async fn sync_index_upserts_deletes_and_keeps_search_for_remaining() {
        let db = mem_db().await;
        let repo = HostSessionRepo::new(&db);
        let mut alpha = row("claude:a", "claude", "alpha", 30);
        alpha.source_mtime_ms = 10;
        alpha.source_size = 100;
        repo.sync_index(&[alpha.clone(), row("claude:b", "claude", "beta", 40)], 1)
            .await
            .unwrap();
        assert_eq!(repo.index_revision().await.unwrap(), 1);
        repo.replace_session_docs(
            "claude:a",
            &[HostSessionSearchDoc {
                session_key: "claude:a".into(),
                root_session_key: "claude:a".into(),
                kind: "user".into(),
                message_id: Some("u1".into()),
                seq: 0,
                chunk: 0,
                text: "kept body".into(),
            }],
        )
        .await
        .unwrap();
        repo.replace_session_docs(
            "claude:b",
            &[HostSessionSearchDoc {
                session_key: "claude:b".into(),
                root_session_key: "claude:b".into(),
                kind: "user".into(),
                message_id: Some("u2".into()),
                seq: 0,
                chunk: 0,
                text: "gone body".into(),
            }],
        )
        .await
        .unwrap();

        let mut updated = alpha;
        updated.title = "alpha renamed".into();
        updated.message_count = Some(9);
        repo.sync_index(&[updated], 1).await.unwrap();
        repo.prune_search_orphans().await.unwrap();

        let page = repo
            .query(&HostSessionIndexQuery {
                roots_only: false,
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.sessions[0].title, "alpha renamed");
        assert_eq!(page.sessions[0].message_count, Some(9));
        assert_eq!(page.sessions[0].source_mtime_ms, 10);
        let kept = repo.search_text("kept body").await.unwrap();
        assert_eq!(kept[0].session_key, "claude:a");
        assert!(repo.search_text("gone body").await.unwrap().is_empty());
    }
}
