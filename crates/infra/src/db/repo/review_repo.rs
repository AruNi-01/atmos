use sea_orm::DatabaseConnection;

use crate::db::entities::review_session;
use crate::db::repo::base::BaseRepo;

mod agent_run;
mod comment;
mod file;
mod revision;
mod session;

pub struct ReviewRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> BaseRepo<review_session::Entity, review_session::Model, review_session::ActiveModel>
    for ReviewRepo<'a>
{
    fn db(&self) -> &DatabaseConnection {
        self.db
    }
}

impl<'a> ReviewRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }
}
