# 仓库 AI 协作规则

本文件适用于所有在本仓库工作的 AI Agent。开始分析、规划或修改前，必须先
检查当前工作树并保留用户已有修改。

## 必读文档与路由

所有任务必须完整读取：

1. AGENTS.md
2. docs/ai/architecture-index.md
3. docs/ai/project-architecture.md

中大型任务，或涉及子 Agent、任务拆分、交接、worktree、任务档案和上下文切换时，
还必须完整读取 docs/ai/multi-agent-development.md。

实际使用子 Agent、建立独立 Codex 任务或发生上下文切换前，必须先创建
docs/changes/<任务编号>/ 任务档案，并由当前主 Agent 在
docs/changes/active-tasks.json 中登记任务、工作树、文件范围和共享资源。

随后必须根据架构索引完整读取受影响领域的权威文档。涉及视频、摄像头、
ThingsBoard 摄像头身份、WVP、ZLMediaKit、Video API、Cesium 摄像头点位、
播放、截图、PTZ、录像、回放、流状态或本地视频验证环境的任务，必须完整读取：

- docs/ai/video-platform-architecture.md
- 涉及接口时同时读取 docs/api/video-api.md

不得只依赖历史聊天、Agent 摘要或记忆代替权威文档和当前代码。

## 架构与需求冲突

- 用户最新明确决定、当前任务已批准决策和权威架构文档发生冲突时，必须停止
  冲突部分的实现，向用户说明冲突、影响和可选方案。
- 不得静默引入冲突的身份模型、接口契约、数据源、URL 规则或网络拓扑。
- 如果用户明确批准改变既有架构决策，必须在同一变更中更新对应架构文档，
  记录迁移步骤、兼容影响、回退方案和验收方式。
- 子 Agent 无权自行扩大需求、改变已批准契约或覆盖其他 Agent/用户的修改。

## 多 Agent 工作方式

- 用户只需要与主 Agent 沟通。主 Agent 负责需求澄清、任务拆分、决策汇总、
  写入协调、集成验证和最终交付。
- 子 Agent 按任务临时创建，不作为长期常驻成员。小任务默认由主 Agent 直接完成。
- 中大型任务优先并行只读调查；写代码默认只安排一个 Agent。
- 只有在契约已冻结、文件完全不重叠、任务可独立验证且主 Agent 明确分配文件
  所有权时，才允许并行写入。大型独立写入应使用独立 Codex 任务和 Git worktree。
- 子 Agent 只返回精简、结构化的中文结论，不向主上下文倾倒完整日志。
- 角色、任务包、上下文交接和停止条件遵循 docs/ai/multi-agent-development.md。

## 事实来源与执行投影

- 不存在一个包办所有内容的“万能文件”；每类事实只能有一个明确的正式来源。
- docs/changes/active-tasks.json 是活动任务、工作树、文件范围和共享资源占用的中央登记。
- docs/changes/<任务编号>/ 是该任务目标、已批准决策、进度、交接和验证的长期档案。
- docs/ai/multi-agent-development.md 是 Agent 角色与协作流程的规范源；
  .codex/agents/*.toml 是 Codex 运行时执行投影，不得自行改变规范定义的权限和边界。
- 当前代码、数据库 schema 和 API 实现反映实现状态；Git 历史记录用户实际提交事实；
  测试和 CI 记录已执行的验证事实。
- 中央活动任务登记只由当前主 Agent 串行维护。实现 Agent 不得自行登记、修改其他任务
  或抢占已登记的文件范围和共享资源。
- 修改本节涉及的治理文档、任务模板或 .codex/agents/*.toml 后，必须运行
  scripts/validate-agent-governance.ps1。

## 调研、设计与实现

- 小型、低风险且方案明确的修改可走快速流程：检查相关代码与测试、实现、验证。
- 中大型或跨模块修改必须先检查仓库内已有实现和复用点；存在知识缺口时，再查询
  官方文档和可信公开库。
- 引入新的生产依赖、改变公共接口、数据库结构、权限模型、部署拓扑或架构决策前，
  必须完成架构设计和 RIO 分析，并取得用户确认。
- 本项目中的 RIO 固定表示：Risks（风险）、Impact（影响）、Options（选项）。
- 调研应有明确问题和时间边界，不得为了“先调研”无目的扫描大量公开项目。

## 中文记录

- 项目新建的 AI 协作文档、任务记录、决策、验证结果和交接摘要默认使用中文。
- 文件名保持稳定的英文/ASCII 命名。
- 代码标识符、API 字段、环境变量、命令、日志和原始错误信息保留原文。
- Git 历史是代码变更事实来源，测试/CI 是验证事实来源；文档不复制完整 diff、
  完整日志或完整聊天。

## 人工 Git 门禁

所有 AI Agent 禁止执行或代替用户执行以下操作：

- git add
- git commit
- git push
- git merge
- git rebase
- git cherry-pick
- git tag
- 创建、更新或合并 Pull Request
- 发布 Release 或生产部署

允许只读使用 git status、git diff、git log 和分支信息。AI 可以修改工作区、
运行测试，并在交付时提供变更摘要、风险、建议提交拆分、建议 commit message 和
供用户审核的手动命令。所有暂存、提交、推送和 GitHub 操作必须由用户本人完成。

## 安全与环境

- 不得读取、输出、提交或传播 .env.video.local 及其他本地密钥文件中的秘密。
- 不得把 WVP、ZLMediaKit、RTSP、ThingsBoard Token 或其他凭证暴露给前端或普通日志。
- 本地 Docker、ThingsBoard、WVP、ZLMediaKit、PostgreSQL 和固定端口属于共享环境；
  并行 Agent 不得同时启动、停止或重建同一套共享服务。
- 生产部署、数据迁移、批量数据修改和不可逆操作需要用户单独明确批准。
