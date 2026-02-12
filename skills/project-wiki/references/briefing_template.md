# 研究简报模板

在生成每篇 Deep Dive 文章之前，Agent 必须为每个 catalog 条目生成一份研究简报。简报保存在 `.atmos/wiki/_briefings/{path}.md`。

## 模板结构

```markdown
# 研究简报：{article_title}

## 涉及的核心概念

- **{concept_id}**: {1-2 sentence description of what this concept is and why it matters}
- **{concept_id_2}**: {description}
- (从 _concepts.json 中提取该文章涉及的概念)

## 在项目中的作用

{2-4 sentences: 这个模块/功能解决什么问题？为什么是架构中的关键一环？}

## 相关 Git 历史

- `{commit_hash}`: {commit_message} ({date})
- (从 _metadata/commit_details.txt 中提取与该模块文件相关的提交，至少 3-5 条)

## 相关 PR / Issue（如有）

- PR #{number}: {title}
- Issue #{number}: {title}
- (从 _metadata/prs.json 和 issues.json 中提取，若无可略过)

## 必须回答的研究问题

1. 这个模块/功能要解决什么问题？动机是什么？
2. 为什么选择当前的实现方式？考虑过哪些替代方案？有什么权衡？
3. 它如何与其他模块协作？数据怎么流动？
4. 它是如何演进至今的？最初设计和现在有什么不同？
5. 有哪些边界情况和已知限制？
6. 新贡献者最容易误解的地方是什么？

## 必读源文件

| 文件路径 | 阅读重点 |
|----------|----------|
| `{path/to/file}` | {why_read_this: 例如 "WsManager 连接注册与并发模型" } |
| `{path/to/file2}` | {why_read_this} |
| (至少 5 个源文件，需覆盖该模块的核心逻辑)

## 与其他概念的关联

- **依赖于**: {concept_id} — {brief explanation}
- **被使用于**: {concept_id} — {brief explanation}
- (从 _concepts.json 中提取依赖关系)
```

## 使用说明

- 研究简报在 Step 5（生成研究简报）中由主 Agent 基于元数据和概念提取结果产出
- 每篇 Deep Dive 文章必须有一份对应的研究简报
- Subagent 在撰写文章时，必须将研究简报作为首要上下文，并逐一回答简报中的研究问题
- 若项目无 PR/Issue 或 Git 历史较浅，对应小节可简写，但「必须回答的研究问题」和「必读源文件」不可省略
