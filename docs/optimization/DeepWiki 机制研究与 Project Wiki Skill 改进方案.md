# DeepWiki 机制研究与 Project Wiki Skill 改进方案

**作者**: Manus AI  
**日期**: 2026-02-12  
**研究对象**: DeepWiki 的 Repository Wiki 生成机制及其与 Project Wiki Skill 的差异分析

---

## 执行摘要

本报告通过深入研究 DeepWiki 的工作原理，发现其核心优势在于采用了"概念研究"范式而非"代码总结"范式。DeepWiki 通过充分利用 Git 元数据、构建语义图谱、使用研究型 Agent 等技术，能够生成具有深度洞察的项目文档。相比之下，您当前的 `project-wiki` skill 虽然强调深度代码阅读，但缺少元数据利用、概念提取、语义图谱构建和研究型 Agent 等关键环节，导致生成的文档内容较为简单。本报告提出了一套可操作的改进方案，旨在将 DeepWiki 的核心思想融入您的 skill 中。

---

## 一、DeepWiki 的核心工作机制

通过对 Cognition AI 官方博客、Russell Kaplan 的演讲视频以及开源项目 `deepwiki-open` 的分析，我们总结出 DeepWiki 的核心工作流程如下：

### 1.1 四步生成流程

DeepWiki 的文档生成遵循一个精心设计的四步流程，每一步都有明确的目标和技术支撑：

**步骤 1：提取核心概念 (Concept Extraction)**

DeepWiki 的第一步不是直接分析代码，而是提取项目的核心概念 (Key Principles)。这些概念是项目的"灵魂"，代表了项目要解决的问题、采用的设计模式和关键的技术决策。概念的来源非常丰富，包括：

- **Pull Request 信息**：谁提交了什么功能？PR 中有哪些讨论？团队成员对这个功能有什么争论？
- **Git Commit 历史**：代码是如何演进的？哪些模块经常一起修改？
- **Issue 讨论**：用户报告了哪些问题？团队如何回应？
- **代码注释和文档**：开发者留下了哪些设计说明？
- **配置文件**：项目使用了哪些技术栈？有哪些环境变量？

Russell Kaplan 在演讲中强调："**元数据往往比代码本身更能揭示设计意图**"。这是 DeepWiki 能够生成深度内容的第一个关键。

**步骤 2：连接概念到代码 (Concepts to Code)**

在提取出核心概念后，DeepWiki 将这些抽象的概念映射到具体的代码实现。例如，如果项目的核心概念是"插件化架构"，那么 DeepWiki 会识别出哪些文件、类和函数实现了这个架构。这一步建立了"概念"与"代码"之间的桥梁。

**步骤 3：连接代码到代码 (Code to Code)**

DeepWiki 使用多种图结构来分析代码之间的关系：

- **Symbol Graph (符号图)**：展示类、函数、变量之间的定义和引用关系
- **Call Graph (调用图)**：展示函数之间的调用关系
- **文件使用关系**：哪些文件倾向于一起修改？哪些模块紧密耦合？

这些图结构形成了一个"语义图谱"，为后续的深度分析提供了全局上下文。

**步骤 4：Agent 研究概念并生成 Wiki (Agentic Research)**

对于每一个核心概念，DeepWiki 会启动一个独立的 Agent 进行深度研究。Russell Kaplan 在演讲中说："**对于每个概念，我们使用一个 Agent 在特定代码库的上下文中进行研究**"。这个 Agent 不是简单地"写文档"，而是像研究员一样工作：

1. 阅读与该概念相关的所有代码文件
2. 查看相关的 PR 和 Issue 讨论
3. 分析 Git 历史中的演进过程
4. 利用 RAG (Retrieval-Augmented Generation) 机制检索相关的上下文信息
5. 形成对该概念的深刻理解
6. 生成一篇包含"是什么"、"为什么"和"如何演进"的深度文章

### 1.2 关键技术支撑

DeepWiki 的成功依赖于以下关键技术：

| 技术 | 作用 | 实现方式 |
| :--- | :--- | :--- |
| **多语言 AST 解析** | 将代码解析为抽象语法树 | 为每种语言实现 AST 解析器 |
| **语义图谱构建** | 建立代码实体之间的关系网络 | 借鉴 Graphbrain 的知识建图方法 |
| **向量化检索 (Embedding)** | 将代码和文档转换为向量，支持语义搜索 | 使用 BERT、RoBERTa 等深度嵌入模型 |
| **RAG (检索增强生成)** | 在生成时动态检索相关上下文 | 查询向量 + 相似度计算 + LLM 生成 |
| **Devin 模型系列** | 专门针对代码和文档优化的 LLM | 多层 Transformer 编码器-解码器结构 |
| **Prompt Templates** | 引导模型生成符合要求的内容 | 精心设计的提示模板，包含引导性问题 |

---

## 二、您的 Project Wiki Skill 为何生成内容简单？

通过对比 DeepWiki 和您的 `project-wiki` skill，我们发现了四个关键的缺失环节：

### 2.1 缺失 1：元数据这一信息金矿

**DeepWiki 的做法**：将 Git 历史、PR、Issue、Commit Message 视为与源代码同等重要的信息来源。

**您的 skill 的现状**：主要关注源代码本身，虽然要求读取 README、CONTRIBUTING 等文件，但没有系统性地利用 Git 元数据。

**影响**：您的 skill 只能看到代码"是什么"，但无法回答"为什么这样设计"和"如何演变至今"。这直接导致生成的文档缺乏设计意图和历史背景的解释。

### 2.2 缺失 2：概念提取这一关键步骤

**DeepWiki 的做法**：在分析代码之前，先提取核心概念，然后围绕这些概念组织文档结构。

**您的 skill 的现状**：直接从代码的目录结构生成文档的 `_catalog.json`，导致文档结构机械地反映代码结构。

**影响**：文档的组织方式不符合人类的认知习惯。读者需要先理解代码的物理结构，才能理解项目的逻辑结构。而 DeepWiki 的文档是从业务逻辑和设计概念出发的，更容易理解。

### 2.3 缺失 3：语义图谱这一上下文骨架

**DeepWiki 的做法**：构建 Symbol Graph、Call Graph 等语义图谱，为 Agent 提供全局上下文。

**您的 skill 的现状**：虽然要求"Trace data flow"，但没有系统化地构建关系图。Agent 在生成内容时是孤立地看待每个文件的。

**影响**：生成的文档缺乏对模块间关系的深入分析。例如，无法清晰地解释"模块 A 如何通过模块 B 和模块 C 的协作来实现某个功能"。

### 2.4 缺失 4：研究型 Agent 这一核心动力

**DeepWiki 的做法**：Agent 的任务是"研究概念"，它会主动探索、多轮提问、利用 RAG 检索相关信息。

**您的 skill 的现状**：虽然支持并行生成，但 Agent 的任务是"生成文档"，主要是为了提高效率。

**影响**：Agent 倾向于快速完成任务，而不是深入探索。生成的内容往往是对代码的直译和总结，缺乏洞察力和分析深度。

下表总结了这四个缺失环节的对比：

| 环节 | DeepWiki | Project Wiki Skill (当前) | 导致的问题 |
| :--- | :--- | :--- | :--- |
| **元数据利用** | Git 历史、PR、Issue 等 | 主要依赖源代码 | 缺少设计意图和演进历史 |
| **概念提取** | 先提取核心概念，再组织文档 | 直接从代码结构生成目录 | 文档结构不符合认知习惯 |
| **语义图谱** | 构建多层次关系图 | 缺少系统化的关系建模 | 缺乏对模块间关系的深入分析 |
| **Agent 角色** | 研究型 Agent (深度探索) | 生成型 Agent (快速完成) | 内容缺乏洞察力和分析深度 |

---

## 三、改进方案：将 DeepWiki 的思想融入您的 Skill

为了让您的 `project-wiki` skill 能够生成媲美 DeepWiki 的深度内容，我设计了一套可操作的改进方案。核心思路是：**在保留您现有 skill 框架的基础上，引入元数据分析、概念提取、语义图谱和研究型 Agent 等关键环节**。

### 3.1 新的生成流程

我建议将您的 skill 升级为以下流程：

**步骤 0：创建 `_todo.md`**（保持不变）

**步骤 1：元数据分析 (新增)**

在研究代码之前，首先使用 `git` 和 `gh` 命令抓取项目的元数据：

- 使用 `git log --all --oneline --graph` 查看提交历史
- 使用 `gh pr list --state all --limit 100` 获取 PR 列表
- 使用 `gh issue list --state all --limit 100` 获取 Issue 列表
- 使用 `git log --all --pretty=format:"%h - %an, %ar : %s" --numstat` 分析文件修改频率

将这些信息保存到 `.atmos/wiki/_metadata/` 目录下，供后续步骤使用。

**步骤 2：概念提取与目录设计 (升级)**

不再直接从代码结构生成目录，而是：

1. 使用 LLM 分析步骤 1 收集的元数据和项目的 README、CONTRIBUTING 等文档
2. 提炼出项目的 5-10 个核心概念（例如："反应式状态管理"、"插件化架构"、"多租户隔离"等）
3. 基于这些核心概念设计文档的 `_catalog.json`，确保文档结构反映业务逻辑而非代码结构

**步骤 3：生成 `_catalog.json` 并验证**（保持不变，但内容来源于步骤 2）

**步骤 4：生成 `_mindmap.md`**（保持不变）

**步骤 5：为每个概念准备研究简报 (新增)**

在启动 Agent 生成文档之前，为每个文档页面准备一个"研究简报 (Research Briefing)"，包含：

- 该概念的定义和在项目中的作用
- 相关的 PR 和 Issue 列表（从步骤 1 的元数据中提取）
- 相关的 Git Commit 历史（哪些提交涉及到这个概念？）
- 相关的代码文件列表（从语义图谱中提取）
- 与其他概念的关联（例如："该概念依赖于概念 X，被概念 Y 使用"）

将研究简报保存到 `.atmos/wiki/_briefings/{concept_id}.md`。

**步骤 6：启动研究型 Agent 生成文章 (升级)**

将 Subagent 的 prompt 从"生成文档"升级为"深度研究"。新的 prompt 应包含：

- 研究简报（步骤 5 准备的内容）
- 明确的研究问题（例如："这个概念是如何演进的？"、"为什么选择这种设计？"、"它解决了什么问题？"）
- 引导性指令（例如："像一个技术研究员一样工作，不要只是总结代码，要挖掘背后的设计意图和技术权衡"）

**步骤 7：验证 Frontmatter**（保持不变）

**步骤 8：最终验证**（保持不变）

### 3.2 关键改进点的详细说明

#### 改进点 1：元数据分析脚本

在 `scripts/` 目录下新增 `collect_metadata.sh`，内容如下：

```bash
#!/bin/bash
# 收集项目的 Git 元数据

WIKI_DIR=".atmos/wiki"
METADATA_DIR="$WIKI_DIR/_metadata"

mkdir -p "$METADATA_DIR"

echo "收集 Git 提交历史..."
git log --all --oneline --graph > "$METADATA_DIR/commit_graph.txt"
git log --all --pretty=format:"%h|%an|%ar|%s" --numstat > "$METADATA_DIR/commit_details.txt"

echo "收集 PR 列表..."
gh pr list --state all --limit 100 --json number,title,author,createdAt,mergedAt,body > "$METADATA_DIR/prs.json"

echo "收集 Issue 列表..."
gh issue list --state all --limit 100 --json number,title,author,createdAt,closedAt,body > "$METADATA_DIR/issues.json"

echo "元数据收集完成！"
```

#### 改进点 2：概念提取 Prompt

在步骤 2 中，使用以下 prompt 来提取核心概念：

```
你是一位技术架构分析专家。请分析以下项目信息，提炼出该项目的 5-10 个核心概念。

**项目信息**：
- README 内容：[插入 README]
- 最近 50 次提交：[插入 commit_details.txt 的前 50 行]
- 最近 20 个 PR 标题：[插入 prs.json 的标题列表]
- 最近 20 个 Issue 标题：[插入 issues.json 的标题列表]

**核心概念定义**：
核心概念是指项目中反复出现的、对理解项目至关重要的技术思想、设计模式或业务逻辑。例如：
- "反应式状态管理"
- "插件化架构"
- "多租户隔离"
- "实时协作同步"

**输出格式**：
请以 JSON 格式输出，每个概念包含：
- `id`: 概念的唯一标识符（小写，用连字符分隔）
- `name`: 概念的名称
- `description`: 概念的简短描述（1-2 句话）
- `importance`: 重要性（high/medium/low）

示例输出：
```json
{
  "concepts": [
    {
      "id": "reactive-state-management",
      "name": "反应式状态管理",
      "description": "项目使用反应式编程模型来管理应用状态，确保 UI 与数据的自动同步。",
      "importance": "high"
    },
    ...
  ]
}
```
```

#### 改进点 3：研究简报生成

在步骤 5 中，为每个概念生成研究简报。以下是一个示例：

```markdown
# 研究简报：反应式状态管理

## 概念定义
反应式状态管理是指使用反应式编程模型来管理应用状态，确保 UI 与数据的自动同步。

## 在项目中的作用
该概念是项目前端架构的核心，所有的状态变更都会自动触发 UI 更新。

## 相关 PR
- #123: 引入 Zustand 作为状态管理库
- #145: 优化状态更新性能
- #178: 修复状态同步 bug

## 相关 Issue
- #56: 状态更新时 UI 不刷新
- #89: 如何在多个组件间共享状态？

## 相关 Git Commit
- abc1234: 初始化 Zustand store
- def5678: 添加状态持久化功能
- ghi9012: 重构状态管理逻辑

## 相关代码文件
- `src/store/index.ts`: 主 store 定义
- `src/hooks/useStore.ts`: 自定义 hook
- `src/components/StateProvider.tsx`: 状态提供者组件

## 与其他概念的关联
- 依赖于：组件化架构
- 被使用于：实时协作同步
```

#### 改进点 4：研究型 Agent Prompt

在步骤 6 中，使用以下 prompt 来引导 Agent：

```
你是一位技术研究员，正在撰写一篇关于"{概念名称}"的深度技术文章。

**你的任务不是"总结代码"，而是"研究概念"**。请像一个学术研究员一样工作：
1. 阅读所有相关的代码文件
2. 查看相关的 PR 和 Issue 讨论
3. 分析 Git 历史中的演进过程
4. 思考"为什么"和"如何演变至今"
5. 形成对该概念的深刻理解
6. 撰写一篇包含"是什么"、"为什么"和"如何演进"的深度文章

**研究简报**：
[插入步骤 5 生成的研究简报]

**研究问题**：
- 这个概念在项目中是如何实现的？
- 为什么选择这种实现方式？有哪些技术权衡？
- 这个概念是如何演进的？最初的设计是什么样的？后来做了哪些改进？
- 这个概念与其他概念是如何协作的？
- 有哪些常见的误解或陷阱？

**内容要求**：
- 最低字数：{Getting Started: 800+ / Deep Dive: 1500+}
- 必须包含至少 2-3 个 Mermaid 图表
- 必须引用至少 5 个源文件
- 必须解释"为什么"，而不仅仅是"是什么"
- 必须使用 YAML frontmatter 格式

**输出格式**：
请按照 `examples/sample_document.md` 的格式输出完整的 Markdown 文件。
```

### 3.3 实施路径

我建议您按照以下步骤实施改进：

**阶段 1：增量改进（立即可行）**

1. 在现有 skill 的步骤 1 中增加"收集 Git 元数据"的指令
2. 修改 Subagent 的 prompt，增加"研究问题"和"引导性指令"
3. 在 prompt 中明确要求 Agent 查看 Git 历史和 PR/Issue

**阶段 2：结构性升级（需要 1-2 周）**

1. 实现步骤 2 的"概念提取"功能
2. 实现步骤 5 的"研究简报生成"功能
3. 重构 `_catalog.json` 的生成逻辑，使其基于概念而非代码结构

**阶段 3：深度优化（需要 1 个月）**

1. 构建语义图谱（Symbol Graph、Call Graph）
2. 引入 RAG 机制，在生成时动态检索相关上下文
3. 实现多轮研究策略，允许 Agent 进行迭代式探索

---

## 四、预期效果与验证方法

实施以上改进后，您的 `project-wiki` skill 生成的文档应该具备以下特征：

**内容深度**：
- 不仅描述"是什么"，还解释"为什么"和"如何演变至今"
- 包含对设计决策和技术权衡的分析
- 引用具体的 PR、Issue 和 Commit 作为证据

**结构清晰**：
- 文档结构反映业务逻辑和核心概念，而非代码的物理结构
- 概念之间的关联清晰可见
- 读者可以从业务视角理解项目

**可验证性**：
- 每个观点都有源代码或元数据的支撑
- 可以追溯到具体的 PR、Issue 或 Commit
- 图表准确反映代码的实际结构

**验证方法**：

1. **对比测试**：使用相同的代码库，分别用旧 skill 和新 skill 生成文档，对比内容深度
2. **专家评审**：邀请熟悉该代码库的开发者阅读生成的文档，评价其准确性和洞察力
3. **新人测试**：让不熟悉该代码库的开发者阅读文档，测试其理解速度和深度

---

## 五、总结与建议

DeepWiki 的成功在于其采用了"概念研究"范式，而不是简单的"代码总结"。它通过充分利用元数据、构建语义图谱、使用研究型 Agent 等技术，能够生成具有深度洞察的项目文档。您的 `project-wiki` skill 虽然强调深度代码阅读，但缺少这些关键环节，导致生成的文档内容较为简单。

**核心建议**：

1. **立即行动**：在现有 skill 中增加"收集 Git 元数据"和"研究型 prompt"，这是成本最低、效果最明显的改进。

2. **逐步升级**：按照"增量改进 → 结构性升级 → 深度优化"的路径，逐步将 DeepWiki 的思想融入您的 skill。

3. **持续迭代**：文档生成是一个复杂的任务，需要不断调整 prompt、优化流程、积累经验。建议您在每次生成后进行评审，持续改进。

4. **借鉴开源**：可以参考 `deepwiki-open` 项目的实现，了解其具体的技术细节和 prompt 设计。

通过实施以上改进，您的 Code Agent 将能够从一个"代码总结员"转变为一个"技术研究员"，从而生成真正具有深度和洞察力的项目 Wiki。

---

## 参考资料

1. Cognition AI 官方博客 - DeepWiki: AI docs for any repo  
   https://cognition.ai/blog/deepwiki

2. Russell Kaplan (Cognition President) 演讲视频 - How DeepWiki Works  
   https://www.linkedin.com/posts/cognition-ai-labs_how-deepwiki-works-activity-7331755916897255424-Qknt

3. GitHub 深度分析文档 - DeepWiki 使用方法与技术原理深度分析  
   https://github.com/ForceInjection/AI-fundermentals/blob/main/06_llm_theory_and_fundamentals/deep_research/DeepWiki%20使用方法与技术原理深度分析.md

4. AsyncFuncAI/deepwiki-open - Open Source DeepWiki 项目  
   https://github.com/AsyncFuncAI/deepwiki-open

5. DeepWiki 官方文档  
   https://docs.devin.ai/work-with-devin/deepwiki
