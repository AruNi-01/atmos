# Repository 层设计说明

## BaseRepo Trait

`BaseRepo` 是所有 Repository 的基础 trait，提供统一的数据库访问模式。

### 设计理念

由于 SeaORM 的泛型约束比较复杂，`BaseRepo` 采用简洁设计：

1. **只提供必需的抽象**：`db()` 方法返回数据库连接
2. **各 Repo 自行实现 CRUD**：根据具体的业务需求实现方法
3. **保持灵活性**：不强制通用方法，避免类型系统冲突

### 使用方式

#### 1. 定义 Repository 结构体

```rust
pub struct MyRepo<'a> {
    db: &'a DatabaseConnection,
}
```

#### 2. 实现 BaseRepo Trait

```rust
impl<'a> BaseRepo<my_entity::Entity, my_entity::Model, my_entity::ActiveModel> for MyRepo<'a> {
    fn db(&self) -> &DatabaseConnection {
        self.db
    }
}
```

#### 3. 实现具体的业务方法

```rust
impl<'a> MyRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }
    
    /// 根据 GUID 查询单条记录
    pub async fn find_by_guid(&self, guid: String) -> Result<Option<my_entity::Model>> {
        Ok(my_entity::Entity::find_by_id(guid)
            .one(self.db)
            .await?)
    }
    
    /// 查询所有记录
    pub async fn list(&self) -> Result<Vec<my_entity::Model>> {
        Ok(my_entity::Entity::find()
            .all(self.db)
            .await?)
    }
    
    /// 创建新记录
    pub async fn create(&self, data: CreateData) -> Result<my_entity::Model> {
        let base = BaseFields::new();
        
        let model = my_entity::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            // ... 其他字段
        };
        
        Ok(model.insert(self.db).await?)
    }
    
    /// 删除记录（硬删除）
    pub async fn delete(&self, guid: String) -> Result<()> {
        my_entity::Entity::delete_by_id(guid)
            .exec(self.db)
            .await?;
        Ok(())
    }
    
    /// 软删除（将 is_deleted 设置为 true）
    pub async fn soft_delete(&self, guid: String) -> Result<()> {
        my_entity::Entity::update_many()
            .col_expr(my_entity::Column::IsDeleted, Expr::value(true))
            .col_expr(
                my_entity::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(my_entity::Column::Guid.eq(guid))
            .exec(self.db)
            .await?;
        Ok(())
    }
}
```

## 常见 CRUD 模式

### 查询操作

```rust
// 根据主键查询
let record = Entity::find_by_id(guid).one(self.db).await?;

// 查询所有
let records = Entity::find().all(self.db).await?;

// 条件查询
let records = Entity::find()
    .filter(Column::IsDeleted.eq(false))
    .filter(Column::Name.contains("keyword"))
    .all(self.db)
    .await?;

// 排序
let records = Entity::find()
    .order_by_asc(Column::CreatedAt)
    .all(self.db)
    .await?;

// 分页
let (records, total) = Entity::find()
    .paginate(self.db, page_size)
    .fetch_page_and_total(page)
    .await?;
```

### 创建操作

```rust
let base = BaseFields::new();

let model = entity::ActiveModel {
    guid: Set(base.guid),
    created_at: Set(base.created_at),
    updated_at: Set(base.updated_at),
    is_deleted: Set(base.is_deleted),
    name: Set(data.name),
    // ... 其他字段
};

let result = model.insert(self.db).await?;
```

### 更新操作

```rust
// 更新单个字段
Entity::update_many()
    .col_expr(Column::Name, Expr::value(new_name))
    .col_expr(Column::UpdatedAt, Expr::value(chrono::Utc::now().naive_utc()))
    .filter(Column::Guid.eq(guid))
    .exec(self.db)
    .await?;

// 更新多个字段
Entity::update_many()
    .col_expr(Column::Name, Expr::value(new_name))
    .col_expr(Column::Status, Expr::value(new_status))
    .col_expr(Column::UpdatedAt, Expr::value(chrono::Utc::now().naive_utc()))
    .filter(Column::Guid.eq(guid))
    .exec(self.db)
    .await?;
```

### 删除操作

```rust
// 硬删除
Entity::delete_by_id(guid).exec(self.db).await?;

// 软删除
Entity::update_many()
    .col_expr(Column::IsDeleted, Expr::value(true))
    .filter(Column::Guid.eq(guid))
    .exec(self.db)
    .await?;
```

## 参考实现

- `project_repo.rs` - 项目仓库实现
- `workspace_repo.rs` - 工作区仓库实现
- `test_message_repo.rs` - 测试消息仓库实现

## 注意事项

1. **导入必要的 SeaORM 类型**：
   ```rust
   use sea_orm::*;
   use sea_orm::sea_query::Expr;
   ```

2. **使用 BaseFields 生成基础字段**：
   ```rust
   use crate::db::entities::base::BaseFields;
   let base = BaseFields::new();
   ```

3. **错误处理**：
   ```rust
   use crate::error::Result;
   ```

4. **更新时间**：
   更新操作时记得同时更新 `updated_at` 字段

5. **软删除查询**：
   查询时记得过滤 `is_deleted = false`
