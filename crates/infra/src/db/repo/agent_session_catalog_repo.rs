//! Inbox catalog rows keyed by pane or chat id.

use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::{
    ColumnTrait, ConnectionTrait, DatabaseConnection, DbBackend, EntityTrait, QueryFilter,
    Statement,
};

use crate::db::entities::agent_session_catalog;
use crate::error::Result;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentSessionCatalogRow {
    pub session_id: String,
    pub context_id: Option<String>,
    pub surface: String,
    pub tool: Option<String>,
    pub project_path: Option<String>,
    pub updated_at: String,
}

pub struct AgentSessionCatalogRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> AgentSessionCatalogRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    /// Insert or refresh the row when `updated_at` is newer or equal.
    /// An older write does not move `updated_at` backwards.
    /// `archived_at` is left untouched.
    pub async fn upsert(&self, row: &AgentSessionCatalogRow) -> Result<()> {
        let stmt = Statement::from_sql_and_values(
            DbBackend::Sqlite,
            r#"
            INSERT INTO agent_session_catalog (
                session_id, context_id, surface, tool, project_path, updated_at, archived_at
            ) VALUES (?, ?, ?, ?, ?, ?, NULL)
            ON CONFLICT(session_id) DO UPDATE SET
                context_id = excluded.context_id,
                surface = excluded.surface,
                tool = excluded.tool,
                project_path = excluded.project_path,
                updated_at = excluded.updated_at
            WHERE excluded.updated_at >= agent_session_catalog.updated_at
            "#,
            [
                row.session_id.clone().into(),
                row.context_id.clone().into(),
                row.surface.clone().into(),
                row.tool.clone().into(),
                row.project_path.clone().into(),
                row.updated_at.clone().into(),
            ],
        );
        self.db.execute(stmt).await?;
        Ok(())
    }

    pub async fn list_open(&self) -> Result<Vec<AgentSessionCatalogRow>> {
        let models = agent_session_catalog::Entity::find()
            .filter(agent_session_catalog::Column::ArchivedAt.is_null())
            .all(self.db)
            .await?;
        Ok(models.into_iter().map(row_from_model).collect())
    }

    pub async fn list_archived_ids(&self) -> Result<Vec<String>> {
        let models = agent_session_catalog::Entity::find()
            .filter(agent_session_catalog::Column::ArchivedAt.is_not_null())
            .all(self.db)
            .await?;
        Ok(models.into_iter().map(|model| model.session_id).collect())
    }

    pub async fn get(&self, session_id: &str) -> Result<Option<agent_session_catalog::Model>> {
        Ok(
            agent_session_catalog::Entity::find_by_id(session_id.to_string())
                .one(self.db)
                .await?,
        )
    }

    /// Sets `archived_at` when the row exists and is not already archived.
    /// Unknown ids and repeat archives are success.
    pub async fn archive(&self, session_id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        agent_session_catalog::Entity::update_many()
            .col_expr(agent_session_catalog::Column::ArchivedAt, Expr::value(now))
            .filter(agent_session_catalog::Column::SessionId.eq(session_id))
            .filter(agent_session_catalog::Column::ArchivedAt.is_null())
            .exec(self.db)
            .await?;
        Ok(())
    }
}

fn row_from_model(model: agent_session_catalog::Model) -> AgentSessionCatalogRow {
    AgentSessionCatalogRow {
        session_id: model.session_id,
        context_id: model.context_id,
        surface: model.surface,
        tool: model.tool,
        project_path: model.project_path,
        updated_at: model.updated_at,
    }
}
