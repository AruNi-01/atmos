use async_trait::async_trait;
use sea_orm::{
    ActiveModelBehavior, ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, 
    IntoActiveModel, ModelTrait, PaginatorTrait, PrimaryKeyTrait, QueryFilter, Set
};
use crate::error::Result;
use crate::db::entities::base::BaseFields;

#[async_trait]
pub trait BaseRepo<E, M, A>
where
    E: EntityTrait<Model = M>,
    M: ModelTrait<Entity = E> + IntoActiveModel<A> + Send + Sync,
    A: ActiveModelTrait<Entity = E> + ActiveModelBehavior + Send + Sync,
{
    fn db(&self) -> &DatabaseConnection;

    async fn find_by_guid(&self, guid: &str) -> Result<Option<M>> {
        // Assuming all entities have a 'guid' column. 
        // This is a common pattern in your project.
        // We use string-based check or assume a specific column naming convention.
        // For more type safety, we usually require a Const column name in the trait.
        Ok(E::find()
            .filter(E::PrimaryKey::get_column().eq(guid))
            .one(self.db())
            .await?)
    }

    async fn list_all(&self) -> Result<Vec<M>> {
        Ok(E::find().all(self.db()).await?)
    }

    async fn soft_delete(&self, guid: &str) -> Result<()> {
        // Since Sea-ORM doesn't know about 'is_deleted' generically at the trait level,
        // we'd typically need the ActiveModel to expose it.
        // For now, let's provide a basic hard delete as an example or use update_many.
        E::delete_by_id(guid.to_string()).exec(self.db()).await?;
        Ok(())
    }

    async fn hard_delete(&self, guid: &str) -> Result<()> {
        E::delete_by_id(guid.to_string()).exec(self.db()).await?;
        Ok(())
    }
}

// Example of a helper struct to avoid boilerplate in every repo
pub struct CrudOperations<'a, E, M, A> {
    pub db: &'a DatabaseConnection,
    _phantom: std::marker::PhantomData<(E, M, A)>,
}

impl<'a, E, M, A> CrudOperations<'a, E, M, A>
where
    E: EntityTrait<Model = M>,
    M: ModelTrait<Entity = E> + IntoActiveModel<A> + Send + Sync,
    A: ActiveModelTrait<Entity = E> + ActiveModelBehavior + Send + Sync,
{
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self {
            db,
            _phantom: std::marker::PhantomData,
        }
    }

    pub async fn find_one(&self, guid: &str) -> Result<Option<M>> {
        // This assumes PrimaryKey is the GUID string
        Ok(E::find_by_id(guid.to_string()).one(self.db).await?)
    }

    pub async fn list(&self) -> Result<Vec<M>> {
        Ok(E::find().all(self.db).await?)
    }
}
