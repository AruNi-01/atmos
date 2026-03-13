use sea_orm::{Database, DatabaseConnection};
use std::path::{Path, PathBuf};
use tracing::info;

use crate::error::{InfraError, Result};

pub struct DbConnection {
    conn: DatabaseConnection,
}

impl DbConnection {
    pub async fn new() -> Result<Self> {
        let db_path = Self::get_db_path()?;
        Self::connect(&db_path).await
    }

    pub async fn connect(db_path: &Path) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let db_url = format!("sqlite://{}?mode=rwc", db_path.display());
        info!("Connecting to database: {}", db_url);

        let conn = Database::connect(&db_url).await?;
        info!("Database connected successfully");

        Ok(Self { conn })
    }

    fn get_db_path() -> Result<PathBuf> {
        let home = dirs::home_dir().ok_or(InfraError::HomeDirNotFound)?;
        Ok(home.join(".atmos").join("db").join("atmos.db"))
    }

    pub fn connection(&self) -> &DatabaseConnection {
        &self.conn
    }
}
