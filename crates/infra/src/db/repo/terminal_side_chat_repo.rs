use chrono::Utc;
use sea_orm::sea_query::{Expr, OnConflict};
use sea_orm::*;

use crate::db::entities::base::BaseFields;
use crate::db::entities::terminal_side_chat;
use crate::db::repo::base::BaseRepo;
use crate::error::Result;

pub struct TerminalSideChatRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a>
    BaseRepo<terminal_side_chat::Entity, terminal_side_chat::Model, terminal_side_chat::ActiveModel>
    for TerminalSideChatRepo<'a>
{
    fn db(&self) -> &DatabaseConnection {
        self.db
    }
}

pub struct UpsertTerminalSideChatInput {
    pub side_chat_id: String,
    pub workspace_guid: String,
    pub project_name: Option<String>,
    pub workspace_name: Option<String>,
    pub source_pane_id: String,
    pub source_tmux_window_name: String,
    pub source_surface_kind: String,
    pub source_surface_ref_json: Option<String>,
    pub side_tmux_window_name: String,
    pub agent_ref_json: Option<String>,
    pub color_hex: String,
    pub status: String,
}

impl<'a> TerminalSideChatRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn upsert_active(
        &self,
        input: UpsertTerminalSideChatInput,
    ) -> Result<terminal_side_chat::Model> {
        let base = BaseFields::new();
        let now = Utc::now().naive_utc();
        let side_chat_id = input.side_chat_id.clone();

        let model = terminal_side_chat::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(now),
            is_deleted: Set(false),
            workspace_guid: Set(input.workspace_guid),
            project_name: Set(input.project_name),
            workspace_name: Set(input.workspace_name),
            side_chat_id: Set(input.side_chat_id),
            source_pane_id: Set(input.source_pane_id),
            source_tmux_window_name: Set(input.source_tmux_window_name),
            source_surface_kind: Set(input.source_surface_kind),
            source_surface_ref_json: Set(input.source_surface_ref_json),
            side_tmux_window_name: Set(input.side_tmux_window_name),
            agent_ref_json: Set(input.agent_ref_json),
            color_hex: Set(input.color_hex),
            status: Set(input.status),
            closed_at: Set(None),
        };

        terminal_side_chat::Entity::insert(model)
            .on_conflict(
                OnConflict::column(terminal_side_chat::Column::SideChatId)
                    .update_columns([
                        terminal_side_chat::Column::UpdatedAt,
                        terminal_side_chat::Column::IsDeleted,
                        terminal_side_chat::Column::WorkspaceGuid,
                        terminal_side_chat::Column::ProjectName,
                        terminal_side_chat::Column::WorkspaceName,
                        terminal_side_chat::Column::SourcePaneId,
                        terminal_side_chat::Column::SourceTmuxWindowName,
                        terminal_side_chat::Column::SourceSurfaceKind,
                        terminal_side_chat::Column::SourceSurfaceRefJson,
                        terminal_side_chat::Column::SideTmuxWindowName,
                        terminal_side_chat::Column::AgentRefJson,
                        terminal_side_chat::Column::ColorHex,
                        terminal_side_chat::Column::Status,
                        terminal_side_chat::Column::ClosedAt,
                    ])
                    .to_owned(),
            )
            .exec(self.db)
            .await?;

        Ok(terminal_side_chat::Entity::find()
            .filter(terminal_side_chat::Column::SideChatId.eq(side_chat_id))
            .one(self.db)
            .await?
            .expect("terminal_side_chat upserted row should exist"))
    }

    pub async fn list_active_by_workspace(
        &self,
        workspace_guid: &str,
    ) -> Result<Vec<terminal_side_chat::Model>> {
        Ok(terminal_side_chat::Entity::find()
            .filter(terminal_side_chat::Column::WorkspaceGuid.eq(workspace_guid))
            .filter(terminal_side_chat::Column::IsDeleted.eq(false))
            .order_by_asc(terminal_side_chat::Column::CreatedAt)
            .all(self.db)
            .await?)
    }

    pub async fn list_active_by_source(
        &self,
        workspace_guid: &str,
        source_tmux_window_name: &str,
    ) -> Result<Vec<terminal_side_chat::Model>> {
        Ok(terminal_side_chat::Entity::find()
            .filter(terminal_side_chat::Column::WorkspaceGuid.eq(workspace_guid))
            .filter(terminal_side_chat::Column::SourceTmuxWindowName.eq(source_tmux_window_name))
            .filter(terminal_side_chat::Column::IsDeleted.eq(false))
            .all(self.db)
            .await?)
    }

    pub async fn get_active_by_side_chat_id(
        &self,
        side_chat_id: &str,
    ) -> Result<Option<terminal_side_chat::Model>> {
        Ok(terminal_side_chat::Entity::find()
            .filter(terminal_side_chat::Column::SideChatId.eq(side_chat_id))
            .filter(terminal_side_chat::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    pub async fn update_status_in_workspace(
        &self,
        workspace_guid: &str,
        side_chat_id: &str,
        status: &str,
    ) -> Result<Option<terminal_side_chat::Model>> {
        terminal_side_chat::Entity::update_many()
            .col_expr(
                terminal_side_chat::Column::UpdatedAt,
                Expr::value(Utc::now().naive_utc()),
            )
            .col_expr(terminal_side_chat::Column::Status, Expr::value(status))
            .filter(terminal_side_chat::Column::WorkspaceGuid.eq(workspace_guid))
            .filter(terminal_side_chat::Column::SideChatId.eq(side_chat_id))
            .filter(terminal_side_chat::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;

        Ok(terminal_side_chat::Entity::find()
            .filter(terminal_side_chat::Column::WorkspaceGuid.eq(workspace_guid))
            .filter(terminal_side_chat::Column::SideChatId.eq(side_chat_id))
            .filter(terminal_side_chat::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    pub async fn soft_delete(&self, side_chat_id: &str) -> Result<()> {
        let now = Utc::now().naive_utc();
        terminal_side_chat::Entity::update_many()
            .col_expr(terminal_side_chat::Column::IsDeleted, Expr::value(true))
            .col_expr(terminal_side_chat::Column::UpdatedAt, Expr::value(now))
            .col_expr(terminal_side_chat::Column::ClosedAt, Expr::value(Some(now)))
            .filter(terminal_side_chat::Column::SideChatId.eq(side_chat_id))
            .filter(terminal_side_chat::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub async fn soft_delete_by_source(
        &self,
        workspace_guid: &str,
        source_tmux_window_name: &str,
    ) -> Result<Vec<terminal_side_chat::Model>> {
        let records = self
            .list_active_by_source(workspace_guid, source_tmux_window_name)
            .await?;
        let now = Utc::now().naive_utc();
        terminal_side_chat::Entity::update_many()
            .col_expr(terminal_side_chat::Column::IsDeleted, Expr::value(true))
            .col_expr(terminal_side_chat::Column::UpdatedAt, Expr::value(now))
            .col_expr(terminal_side_chat::Column::ClosedAt, Expr::value(Some(now)))
            .filter(terminal_side_chat::Column::WorkspaceGuid.eq(workspace_guid))
            .filter(terminal_side_chat::Column::SourceTmuxWindowName.eq(source_tmux_window_name))
            .filter(terminal_side_chat::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        Ok(records)
    }
}
