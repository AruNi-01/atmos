use async_trait::async_trait;
use sea_orm::{
    ActiveModelBehavior, ActiveModelTrait, DatabaseConnection, EntityTrait,
    IntoActiveModel, ModelTrait,
};

/// BaseRepo trait 提供通用的数据库访问能力
/// 
/// 所有 Repository 都应该实现这个 trait 来获得统一的数据库连接访问
/// 各个 repo 可以在此基础上实现自己的业务方法
/// 
/// 注意：由于 SeaORM 的泛型约束复杂，通用的 CRUD 方法需要在各个 Repo 中具体实现
/// BaseRepo 主要提供：
/// 1. 统一的 db() 访问方法
/// 2. 统一的 trait 约束，确保所有 Repo 遵循相同的模式
/// 
/// 推荐的实现模式：
/// ```rust,ignore
/// impl<'a> BaseRepo<Entity, Model, ActiveModel> for MyRepo<'a> {
///     fn db(&self) -> &DatabaseConnection {
///         self.db
///     }
/// }
/// 
/// impl<'a> MyRepo<'a> {
///     pub fn new(db: &'a DatabaseConnection) -> Self {
///         Self { db }
///     }
///     
///     // 实现具体的业务方法
///     pub async fn find_by_guid(&self, guid: String) -> Result<Option<Model>> {
///         Ok(Entity::find_by_id(guid).one(self.db).await?)
///     }
///     
///     pub async fn list(&self) -> Result<Vec<Model>> {
///         Ok(Entity::find().all(self.db).await?)
///     }
///     
///     pub async fn delete(&self, guid: String) -> Result<()> {
///         Entity::delete_by_id(guid).exec(self.db).await?;
///         Ok(())
///     }
/// }
/// ```
#[async_trait]
pub trait BaseRepo<E, M, A>
where
    E: EntityTrait<Model = M>,
    M: ModelTrait<Entity = E> + IntoActiveModel<A> + Send + Sync,
    A: ActiveModelTrait<Entity = E> + ActiveModelBehavior + Send + Sync,
{
    /// 返回数据库连接引用（必须由各 Repo 实现）
    fn db(&self) -> &DatabaseConnection;
}


