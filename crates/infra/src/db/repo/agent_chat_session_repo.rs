use sea_orm::sea_query::Expr;
use sea_orm::{Condition, *};

use crate::db::entities::agent_chat_session;
use crate::db::entities::base::BaseFields;
use crate::db::repo::base::BaseRepo;
use crate::error::Result;

pub struct AgentChatSessionRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> BaseRepo<
    agent_chat_session::Entity,
    agent_chat_session::Model,
    agent_chat_session::ActiveModel,
> for AgentChatSessionRepo<'a>
{
    fn db(&self) -> &DatabaseConnection {
        self.db
    }
}

impl<'a> AgentChatSessionRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn create(
        &self,
        guid: &str,
        context_type: &str,
        context_guid: Option<&str>,
        registry_id: &str,
        cwd: &str,
        allow_file_access: bool,
    ) -> Result<agent_chat_session::Model> {
        let base = BaseFields::new();
        let model = agent_chat_session::ActiveModel {
            guid: Set(guid.to_string()),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            context_type: Set(context_type.to_string()),
            context_guid: Set(context_guid.map(String::from)),
            registry_id: Set(registry_id.to_string()),
            cwd: Set(cwd.to_string()),
            allow_file_access: Set(allow_file_access),
            status: Set("active".to_string()),
            title: Set(None),
            title_source: Set(None),
        };
        let result = model.insert(self.db).await?;
        Ok(result)
    }

    pub async fn find_by_guid(&self, guid: &str) -> Result<Option<agent_chat_session::Model>> {
        let model = agent_chat_session::Entity::find_by_id(guid.to_string())
            .filter(agent_chat_session::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?;
        Ok(model)
    }

    pub async fn mark_closed(&self, guid: &str) -> Result<()> {
        let now = chrono::Utc::now().naive_utc();
        agent_chat_session::Entity::update_many()
            .col_expr(agent_chat_session::Column::Status, Expr::value("closed"))
            .col_expr(agent_chat_session::Column::UpdatedAt, Expr::value(now))
            .filter(agent_chat_session::Column::Guid.eq(guid))
            .filter(agent_chat_session::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub async fn mark_active(&self, guid: &str) -> Result<()> {
        let now = chrono::Utc::now().naive_utc();
        agent_chat_session::Entity::update_many()
            .col_expr(agent_chat_session::Column::Status, Expr::value("active"))
            .col_expr(agent_chat_session::Column::UpdatedAt, Expr::value(now))
            .filter(agent_chat_session::Column::Guid.eq(guid))
            .filter(agent_chat_session::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub async fn update_title(&self, guid: &str, title: &str, source: &str) -> Result<()> {
        let now = chrono::Utc::now().naive_utc();
        agent_chat_session::Entity::update_many()
            .col_expr(agent_chat_session::Column::Title, Expr::value(Some(title.to_string())))
            .col_expr(agent_chat_session::Column::TitleSource, Expr::value(Some(source.to_string())))
            .col_expr(agent_chat_session::Column::UpdatedAt, Expr::value(now))
            .filter(agent_chat_session::Column::Guid.eq(guid))
            .filter(agent_chat_session::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        Ok(())
    }

    /// List sessions with cursor pagination. Returns (items, next_cursor, has_more).
    /// cursor is (updated_at, guid) encoded as base64 or similar - for simplicity we use offset-based first.
    /// For proper cursor: use (updated_at DESC, guid) and pass last item's (updated_at, guid).
    pub async fn list_with_cursor(
        &self,
        context_type: Option<&str>,
        context_guid: Option<&str>,
        limit: u64,
        cursor: Option<&str>,
    ) -> Result<(Vec<agent_chat_session::Model>, Option<String>, bool)> {
        let limit = limit.min(50).max(1);
        let limit_plus_one = limit + 1;

        let mut query = agent_chat_session::Entity::find()
            .filter(agent_chat_session::Column::IsDeleted.eq(false))
            .order_by_desc(agent_chat_session::Column::UpdatedAt)
            .limit(limit_plus_one);

        if let Some(ct) = context_type {
            query = query.filter(agent_chat_session::Column::ContextType.eq(ct));
        }
        if let Some(cg) = context_guid {
            query = query.filter(agent_chat_session::Column::ContextGuid.eq(cg));
        }

        // Cursor: "updated_at_ts:guid" - filter rows before cursor (older in DESC order)
        if let Some(c) = cursor {
            if let Some((ts_str, guid)) = c.split_once(':') {
                if let Ok(ts) = ts_str.parse::<i64>() {
                    let cursor_dt = chrono::DateTime::from_timestamp(ts, 0)
                        .map(|dt| dt.naive_utc())
                        .unwrap_or_else(|| chrono::Utc::now().naive_utc());
                    query = query.filter(
                        Condition::any()
                            .add(agent_chat_session::Column::UpdatedAt.lt(cursor_dt))
                            .add(
                                Condition::all()
                                    .add(agent_chat_session::Column::UpdatedAt.eq(cursor_dt))
                                    .add(agent_chat_session::Column::Guid.lt(guid.to_string())),
                            ),
                    );
                }
            }
        }

        let rows = query.all(self.db).await?;
        let has_more = rows.len() as u64 > limit;
        let items: Vec<_> = rows.into_iter().take(limit as usize).collect();
        let next_cursor = items.last().and_then(|m| {
            if has_more {
                let ts = m.updated_at.and_utc().timestamp();
                Some(format!("{}:{}", ts, m.guid))
            } else {
                None
            }
        });

        Ok((items, next_cursor, has_more))
    }

    /// Check if session has no title (or only default) and user has not edited - safe to auto-generate
    pub async fn can_auto_set_title(&self, guid: &str) -> Result<bool> {
        let model = self.find_by_guid(guid).await?;
        Ok(model
            .map(|m| {
                if m.title_source.as_deref() == Some("user") {
                    false
                } else {
                    m.title.is_none() || m.title.as_deref() == Some("新会话")
                }
            })
            .unwrap_or(false))
    }
}
