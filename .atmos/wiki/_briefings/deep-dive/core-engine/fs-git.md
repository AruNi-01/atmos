# Research Briefing: PTY, Git 与文件系统

## Involved Concepts
- core-engine
- layered-architecture

## Role in the Project
该模块是 Atmos 的底层技术支撑，负责直接与操作系统交互。它提供了伪终端 (PTY) 的创建与管理、Git 仓库的自动化操作以及对工作区文件系统的安全访问。它是所有终端模拟和代码管理功能的基础。

## Relevant Git History
- f5182af: Initial core-engine implementation
- (更多提交请参考 _metadata/commit_details.txt)

## Research Questions
1. Atmos 是如何使用 `portable-pty` 或类似库来管理 PTY 进程的？
2. Git 模块支持哪些核心操作（clone, pull, commit 等），它是如何处理认证的？
3. 文件系统模块如何确保只能访问工作区范围内的路径？
4. 如何处理 PTY 的窗口大小调整 (winsize)？

## Required Source Files
- `crates/core-engine/src/pty/mod.rs`
- `crates/core-engine/src/git/mod.rs`
- `crates/core-engine/src/fs/mod.rs`
- `crates/core-engine/src/lib.rs`
- `crates/core-engine/src/error.rs`
