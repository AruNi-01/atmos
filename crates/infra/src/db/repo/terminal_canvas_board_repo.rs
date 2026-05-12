use chrono::Utc;
use sea_orm::sea_query::{Expr, OnConflict};
use sea_orm::*;

use crate::db::entities::base::BaseFields;
use crate::db::entities::terminal_canvas_board;
use crate::db::repo::base::BaseRepo;
use crate::error::{InfraError, Result};

pub struct TerminalCanvasBoardRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> BaseRepo<
    terminal_canvas_board::Entity,
    terminal_canvas_board::Model,
    terminal_canvas_board::ActiveModel,
> for TerminalCanvasBoardRepo<'a>
{
    fn db(&self) -> &DatabaseConnection {
        self.db
    }
}

impl<'a> TerminalCanvasBoardRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn get_by_slug(&self, slug: &str) -> Result<Option<terminal_canvas_board::Model>> {
        Ok(terminal_canvas_board::Entity::find()
            .filter(terminal_canvas_board::Column::Slug.eq(slug))
            .filter(terminal_canvas_board::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    pub async fn upsert_default(
        &self,
        name: &str,
        document_json: String,
    ) -> Result<terminal_canvas_board::Model> {
        let base = BaseFields::new();
        let updated_at = Utc::now().naive_utc();
        let model = terminal_canvas_board::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(updated_at),
            is_deleted: Set(false),
            slug: Set("default".to_string()),
            name: Set(name.to_string()),
            document_json: Set(document_json),
        };

        terminal_canvas_board::Entity::insert(model)
            .on_conflict(
                OnConflict::column(terminal_canvas_board::Column::Slug)
                    .update_columns([
                        terminal_canvas_board::Column::Name,
                        terminal_canvas_board::Column::DocumentJson,
                        terminal_canvas_board::Column::UpdatedAt,
                        terminal_canvas_board::Column::IsDeleted,
                    ])
                    .to_owned(),
            )
            .exec(self.db)
            .await?;

        self.get_by_slug("default")
            .await?
            .ok_or_else(|| InfraError::Custom("Failed to load terminal canvas board after upsert".to_string()))
    }

    #[allow(dead_code)]
    pub async fn soft_delete_by_slug(&self, slug: &str) -> Result<()> {
        terminal_canvas_board::Entity::update_many()
            .col_expr(terminal_canvas_board::Column::IsDeleted, Expr::value(true))
            .col_expr(
                terminal_canvas_board::Column::UpdatedAt,
                Expr::value(Utc::now().naive_utc()),
            )
            .filter(terminal_canvas_board::Column::Slug.eq(slug))
            .exec(self.db)
            .await?;
        Ok(())
    }
}
