# ThingsBoard + Cesium 项目总体架构

> 状态：项目级通用架构入口  
> 适用范围：仓库模块、系统边界、数据归属、验证与变更原则  
> 领域细节：按 docs/ai/architecture-index.md 路由到对应权威文档

## 1. 仓库目标

本仓库集成 ThingsBoard 后端、Vue 3 + Cesium 前端和视频平台能力。总体目标是：

- ThingsBoard 负责设备、关系、属性、遥测、告警、权限和 RPC。
- Vue 3 前端负责业务页面、仪表盘运行时和 Cesium 可视化。
- 领域服务负责封装外部平台和厂商差异，前端不直接持有基础设施凭证。
- 架构文档记录稳定边界，Git 记录代码事实，测试与 CI 记录验证事实。

## 2. 仓库模块

| 路径 | 职责 | 主要技术 |
| --- | --- | --- |
| frontend/ | 当前项目的业务前端、Vue 页面、Cesium 地图和仪表盘运行时 | Vue 3、TypeScript、Vite、Cesium |
| backend/ | ThingsBoard 后端源码及其模块 | Java 17、Maven、Spring |
| backend/application/ | ThingsBoard 主应用、控制器和领域服务集成 | Spring、ThingsBoard 服务 |
| backend/dao/ | 数据访问、SQL schema 和持久化基础设施 | PostgreSQL/DAO |
| backend/ui-ngx/ | ThingsBoard 上游 Angular UI 模块 | Angular |
| video-platform/ | WVP、ZLMediaKit 和本地视频容器配置 | Docker Compose、WVP、ZLMediaKit |
| scripts/ | 本地启动、验证和辅助脚本 | PowerShell |
| docs/ | API、架构、决策和任务交付记录 | Markdown |

修改 UI 前必须先确认目标属于 frontend/ 的 Vue 业务前端，还是 backend/ui-ngx/ 的
ThingsBoard Angular UI，禁止在两个前端中重复实现同一职责。

## 3. 系统边界

~~~mermaid
flowchart LR
  UI["Vue 3 + Cesium"]
  TB["ThingsBoard 后端"]
  DB["PostgreSQL"]
  DOMAIN["领域服务边界"]
  EXT["外部平台与设备"]

  UI -->|"JWT + 业务 API"| TB
  TB --> DB
  TB --> DOMAIN
  DOMAIN --> EXT
  TB -->|"REST / WebSocket"| UI
~~~

通用原则：

- 浏览器只调用项目公开的业务 API，不直接访问带凭证的基础设施或厂商接口。
- 权限判断必须在后端完成；前端隐藏按钮不等于授权。
- 稳定业务身份、运行时状态和外部平台标识必须明确分层。
- 一个数据概念只能有一个正式数据源；缓存、迁移字段和显示模型必须标明性质。
- 外部系统差异应封装在 Provider、Adapter 或领域服务边界内。
- 跨模块失败应局部降级，不应删除或伪造仍然有效的设备和业务数据。

## 4. 变更边界

下列变更属于架构或高风险变更，实施前必须经过用户确认并记录 RIO：

- 新增生产依赖或外部服务。
- 修改公共 API、身份字段、权限模型或错误语义。
- 修改数据库 schema、数据迁移或唯一约束。
- 改变前后端职责、正式数据源或 Provider 边界。
- 改变 Docker/网络拓扑、生产配置或凭证流向。
- 删除兼容路径、执行不可逆数据操作或生产发布。

如果任务只是局部修复且不改变这些边界，可走快速实现和针对性验证流程。

## 5. 验证入口

验证应按改动范围选择，不要求每次运行全仓库测试。

### Vue 3 前端

在 frontend/ 中优先使用：

~~~powershell
pnpm run type:check
pnpm exec eslint <受影响文件>
~~~

涉及构建、路由、环境变量或 Vite 代理时，再运行：

~~~powershell
pnpm run build
~~~

### ThingsBoard 后端

在 backend/ 中使用 Maven 对受影响模块和测试进行定向验证。视频相关测试当前位于：

~~~text
backend/application/src/test/java/org/thingsboard/server/controller/
backend/application/src/test/java/org/thingsboard/server/service/video/
~~~

修改 DAO、公共模块或跨模块契约时，应根据依赖关系扩大到相关模块，不得用编译通过
代替行为测试。

### 视频环境

本地视频环境是共享集成环境。启动和验证必须遵循
 docs/ai/video-platform-architecture.md，不得由多个 Agent 并行重启同一服务。

## 6. 文档与事实来源

本项目采用“按事实类别确定唯一正式来源”，不使用一个文件覆盖所有生命周期。分类如下：

| 事实类别 | 正式来源 | 说明 |
| --- | --- | --- |
| 当前任务方向 | 用户当前明确决定 | 产生持久影响后必须写入任务决策或架构文档 |
| 活动任务与资源占用 | docs/changes/active-tasks.json | 只保留活动任务，由中央主 Agent 串行维护 |
| 任务目标、状态和下一步 | docs/changes/<任务编号>/delivery.md | 当前任务中央状态文件 |
| 已批准决策 | docs/changes/<任务编号>/decisions.md | 记录 RIO、兼容、迁移和回退，不复制完整讨论 |
| 长期架构边界 | 领域权威架构文档 | 稳定决策晋升后的长期约束 |
| Agent 协作规范 | docs/ai/multi-agent-development.md | `.codex/agents/*.toml` 是运行时执行投影 |
| API 调用契约 | docs/api/ 下对应 API 文档 | 必须与当前实现和契约测试一致 |
| 当前实现状态 | 当前代码、数据库 schema 和配置 | 文档不得覆盖与实现不一致的事实 |
| 已提交变更历史 | Git 历史 | 仅用户执行 Git 写操作 |
| 已执行验证 | 测试、CI 和 verification.md | 未实际运行的检查不得写为通过 |

同一类别内部发生冲突时，按以下优先级核实：

1. 用户当前明确决定：决定当前任务方向。
2. docs/changes/<任务编号>/decisions.md：当前需求已批准共识。
3. 领域权威架构文档：决定长期架构约束。
4. 本文档：决定仓库通用边界。
5. 当前代码、数据库 schema 和 API 实现：反映实际状态。
6. 测试和 CI：反映已经执行的验证事实。
7. Agent 摘要和历史聊天：仅作为线索，必须回到正式来源核实。

用户当前决定尚未落盘时只具有当前对话效力；主 Agent 必须在继续委派或切换上下文前
写入对应正式来源。发生冲突时不得静默选择其中一方，应向用户说明并更新正式文档。
