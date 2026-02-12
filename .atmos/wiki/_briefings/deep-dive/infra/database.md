# Research Briefing: 数据库设计与迁移

## Involved Concepts
- infra

## Role in the Project
数据库模块负责 Atmos 的持久化存储。基于 SeaORM，它定义了项目、工作区、用户设置等核心实体，并管理数据库模式的演进。

## Relevant Git History
- (请参考 _metadata/commit_details.txt 中关于 migration 的提交)

## Research Questions
1. 核心实体（Project, Workspace）之间的关联关系是如何建模的？
2. 迁移脚本是如何组织和执行的？
3. 如何在 Repository 层封装数据库操作以支持单元测试？
4. 数据库连接池的配置策略是什么？

## Required Source Files
- `crates/infra/src/db/mod.rs`
- `crates/infra/src/db/entities/mod.rs`
- `crates/infra/src/db/migration/mod.rs`
- `crates/infra/src/db/repo/mod.rs`
- `crates/infra/src/db/connection.rs`
