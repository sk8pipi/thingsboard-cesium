# 项目架构文档索引

> 目的：让主 Agent 和子 Agent 只读取当前任务真正需要的领域文档，同时不遗漏权威约束。

## 所有任务必读

1. 根目录 AGENTS.md
2. docs/ai/architecture-index.md
3. docs/ai/project-architecture.md

中大型任务，或实际使用子 Agent、worktree、任务档案、交接和上下文切换时，
还必须完整读取 docs/ai/multi-agent-development.md。

如果当前需求已经建立 docs/changes/<任务编号>/，还必须读取其中的 delivery.md、
decisions.md 和 verification.md。实际使用子 Agent、独立 worktree 或上下文切换时，
还必须读取 docs/changes/active-tasks.json，确认任务登记、文件范围和共享资源没有冲突。

## 领域路由

| 任务范围 | 必读文档 | 说明 |
| --- | --- | --- |
| 视频、摄像头、WVP、ZLMediaKit、播放、截图、PTZ、录像、回放、流状态 | docs/ai/video-platform-architecture.md | 视频领域唯一权威架构与决策记录 |
| 新增多路摄像头、批量接入、视频点位复制、多宫格前置验收 | docs/ai/video-platform-architecture.md、docs/ai/multi-camera-video-onboarding.md、docs/api/video-api.md | 架构文档决定边界，接入指南提供逐路配置、诊断和容量清单 |
| Video API 请求、响应、权限、错误码、调用生命周期 | docs/ai/video-platform-architecture.md、docs/api/video-api.md | 架构文档决定边界，API 文档决定调用契约 |
| Cesium 摄像头点位和视频弹窗 | docs/ai/video-platform-architecture.md、docs/api/video-api.md | 必须保持 tbDeviceId 和 Video API 边界 |
| Vue 3 前端、普通 Cesium 地图、仪表盘运行时 | docs/ai/project-architecture.md | 若触及摄像头或播放，再追加视频文档 |
| ThingsBoard Java 后端、DAO、权限、数据库 | docs/ai/project-architecture.md | 若触及视频绑定或状态，再追加视频文档 |
| video-platform/、本地视频容器、相关启动脚本 | docs/ai/video-platform-architecture.md | 不得泄露本地密钥或并行争用共享端口 |
| 多 Agent、任务拆分、worktree、交接、上下文切换 | docs/ai/multi-agent-development.md、docs/changes/active-tasks.json、当前任务档案 | 协作文档是规范源，活动登记和任务档案记录运行状态 |
| Agent 角色权限、并发和运行配置 | docs/ai/multi-agent-development.md、.codex/config.toml、.codex/agents/*.toml | 协作文档定义规范，TOML 是执行投影，修改后运行治理校验 |

## 新领域文档

当某个领域出现三个以上稳定决策，或开始跨多个模块影响实现时，应建立独立架构文档，
并在本索引中增加路由。新增文档至少说明：

- 适用范围与非目标
- 模块边界和唯一数据源
- 核心契约与安全约束
- 迁移、兼容和回退策略
- 验收标准
- 决策记录

不得通过给基础 Agent 增加越来越多的硬编码领域知识代替领域文档。
