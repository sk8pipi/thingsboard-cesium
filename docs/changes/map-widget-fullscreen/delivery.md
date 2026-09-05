# 地图大屏部件全屏交付记录

## 基本信息

- 任务编号：map-widget-fullscreen
- 任务名称：地图大屏部件全屏与原位恢复
- 当前状态：待人工提交
- 当前主 Agent：主 Agent
- 最后更新：2026-09-04

## 协作登记

- 活动任务登记：`docs/changes/active-tasks.json`
- 任务目录：`docs/changes/map-widget-fullscreen`
- 工作树：`.`
- 文件范围：地图大屏运行时、部件表面样式、Cesium 部件尺寸适配、针对性测试和本任务档案
- 共享资源：无独占共享运行时资源

## 目标

- 用户大屏中的每个 GridStack 部件均提供全屏入口。
- 部件进入全屏后填满大屏可视区域，并可通过按钮或 Esc 恢复原位。
- 全屏切换不修改、不保存部件 `x/y/w/h`，不重挂载部件和不重复建立数据订阅。
- 与现有整张大屏全屏能力协调工作，图表和 Cesium 部件在尺寸改变后正确重绘。

## 非目标

- 不修改后端接口、数据库、权限模型或 Dashboard 配置格式。
- 不为传感器弹窗、摄像头弹窗增加独立全屏能力。
- 不在租户管理员编辑模式和选点模式启用部件全屏。
- 不执行 Git 暂存、提交、推送或 GitHub 操作。

## 验收标准

- [x] 用户大屏所有部件具有统一全屏/恢复按钮，且同一时间只允许一个部件全屏。
- [x] 全屏时保留原 Vue/数据运行时实例，退出后布局、状态和焦点恢复。
- [x] Esc、浏览器退出全屏、路由卸载和模板重载均能安全清理。
- [x] ECharts、表格和 Cesium 部件响应容器尺寸变化；真实双屏裁剪效果保留为人工验收项。
- [x] 新增单元测试、原有响应式测试、定向 lint、SFC 编译解析和治理检查通过；全仓类型检查与构建的既有阻塞已记录。

## 必读文档

- `AGENTS.md`
- `docs/ai/architecture-index.md`
- `docs/ai/project-architecture.md`
- `docs/ai/multi-agent-development.md`
- 领域文档：普通 Vue 3、Cesium 地图和仪表盘运行时由项目总体架构覆盖

## 已批准方案摘要

- 采用统一部件操作层与独立全屏宿主，不在各部件中重复实现按钮。
- 全屏时移动原部件内容 DOM，不重新创建 Vue 应用；退出时插回原父节点和原顺序。
- 浏览器全屏始终以 `MapHome` 为目标，部件只负责焦点覆盖，避免嵌套全屏元素。
- 当前大屏已处于浏览器全屏时，退出部件焦点后继续保持整张大屏全屏。
- 浏览器拒绝 Fullscreen API 时退化为页面内覆盖模式。

## 工作包与文件所有权

| 工作包 | Agent | 文件范围 | 状态 | 停止条件 |
| --- | --- | --- | --- | --- |
| 全屏控制器与运行时接入 | 主 Agent | `frontend/src/views/tb/map/` | 已完成 | 需要改变模板契约或 GridStack 持久布局 |
| 部件尺寸适配 | 主 Agent | `frontend/src/views/tb/dashboard/runtime/widgets/` | 已完成 | 需要新增依赖或修改公共数据契约 |
| 测试和任务记录 | 主 Agent | `frontend/tests/`、`docs/changes/map-widget-fullscreen/`、`docs/changes/active-tasks.json` | 已完成 | 发现与其他活动任务文件冲突 |

## 当前进度

### 已完成

- 已核对工作树、必读架构文档、现有 GridStack 挂载流程和整张大屏 Fullscreen API。
- 已获得用户对详细方案的实现授权。
- 已实现统一部件全屏/恢复入口、焦点陷阱、Esc 清理和浏览器全屏降级。
- 已实现原 DOM 搬移与原位恢复，未调用 GridStack 布局更新或模板保存。
- 已将整张大屏全屏状态收紧为精确目标判断，并处理单部件与整张大屏的返回关系。
- 已为 Cesium 部件增加容器尺寸观察和重绘。
- 已完成针对性测试、定向静态检查和治理校验。

### 未完成

- 用户在真实双 1920×1080、125% 缩放环境中完成最终视觉验收。
- 仓库既有空 SFC 和全仓类型错误修复后，再补跑完整生产构建和全仓类型检查。

### 当前风险

- 浏览器自动验证会话中断，未在已登录真实大屏上完成鼠标交互验证。
- 自定义部件若依赖 `.grid-stack-item` 祖先选择器，进入独立宿主后仍可能需要个别兼容样式。

### 下一步

- 用户审核差异并在双屏环境测试全屏、恢复、Esc 和整张大屏全屏组合。
- 人工确认后由用户执行 Git 暂存、提交和推送。

## 修改范围

- 已修改文件：`MapHome.vue`、`MapWidgetLayer.vue`、`MapTopBarPreview.vue`、`mapTopBarActions.ts`、`TbCesiumMap.vue`、`mapWidgetFullscreen.ts`、`mapWidgetFullscreen.test.ts` 和任务档案。
- 明确未修改：后端、数据库、API、权限、视频平台和部署配置。

## 事实源影响

- 新增或改变的正式来源：本任务档案记录已批准交互决策和真实验证结果。
- 被替代或降级的旧来源：无。
- 需要同步的规范、执行投影、API、schema 或测试：仅新增前端测试，不改变公共契约。

## 人工 Git 交付

- 建议提交分组：功能代码、测试与任务档案作为一个原子提交。
- 建议 commit message：`feat(map): add fullscreen mode for dashboard widgets`
- 重要提交引用（由用户提交后填写）：
- AI Git 写操作：未执行
