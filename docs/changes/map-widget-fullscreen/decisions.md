# 地图大屏部件全屏决策记录

## DEC-001：采用独立宿主移动原 DOM，避免重挂载部件

- 状态：已批准
- 日期：2026-09-04
- 决策人：用户
- 背景：地图部件由 GridStack 创建容器并由独立 Vue 应用挂载；重新创建全屏副本会导致状态和数据订阅变化。
- 最终决定：进入全屏时将原 `.grid-stack-item-content` 移入 `MapHome` 的全屏宿主，退出时恢复到原父节点和原顺序；不调用 GridStack 布局更新和模板保存。
- 选择理由：保留 Vue、ECharts、表格和数据运行时实例，同时绕开 GridStack 父级定位、裁剪和层级限制。
- 备选方案：直接对 GridStack 节点使用 `requestFullscreen()`；使用 `position: fixed`；重新挂载全屏副本。
- Risks：DOM 移动后的祖先选择器样式、异常清理和焦点恢复需要专门覆盖。
- Impact：只影响 Vue 运行时 DOM 和样式，不影响接口、数据库、权限和模板配置。
- Options：若浏览器限制 DOM 移动，可回退为只在 `MapHome` 内使用固定定位覆盖，但仍保持布局只读。
- 兼容与迁移影响：已有 Dashboard 无需迁移。
- 回退方案：移除统一部件操作层、全屏宿主与控制器即可恢复现状。
- 事实源影响：不新增业务数据事实源。
- 关联文件或接口：`MapHome.vue`、`MapWidgetLayer.vue`、`mapTopBarActions.ts`

## DEC-002：浏览器全屏目标统一为 MapHome

- 状态：已批准
- 日期：2026-09-04
- 决策人：用户
- 最终决定：单部件模式与整张大屏共用 `MapHome` 浏览器全屏目标；部件通过高层宿主覆盖其他内容，不创建嵌套 Fullscreen API 目标。
- 选择理由：避免 `document.fullscreenElement`、Esc 和顶部栏按钮在多个全屏元素之间产生歧义。
- Risks：浏览器拒绝全屏时只能提供页面内覆盖。
- Impact：需要把现有全屏判断从“存在任意全屏元素”收紧为“当前 MapHome 是全屏元素”。
- Options：浏览器拒绝时保留页面内全屏作为降级路径。
- 兼容与迁移影响：现代 Chrome/Edge 使用原生 Fullscreen API；不支持时功能降级而非中断。
- 回退方案：部件只使用页面内覆盖，不请求浏览器全屏。
