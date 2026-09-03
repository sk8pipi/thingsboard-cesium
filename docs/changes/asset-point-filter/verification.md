# Cesium 大屏按资产显示点位验证记录

## 计划验证

- 资产后代与设备 UUID 解析的单元测试：直接关系、嵌套资产、重复关系、环、空资产。
- 点位过滤测试：全部资产、指定资产、未知设备、传感器与摄像头混合。
- 本地选择恢复测试：有效选择、无权限/已删除资产回退。
- 弹窗清理测试：筛选隐藏当前传感器或摄像头点位。
- 前端类型检查、相关 ESLint、专项测试与生产构建。
- 治理文档校验与最终工作树差异审查。

## 执行结果

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| `pnpm exec esno tests/mapAssetPointFilter.test.ts` | 通过 | 覆盖嵌套资产、重复、环、空结果、规模上限、请求失败、严格 `Contains + COMMON`、点位过滤与存储隔离。 |
| 其余 4 个前端专项测试 | 通过 | `cumulativeUsageAccumulator`、`mapScreenResponsive`、`templateAggregateCore`、`templateTelemetryHub` 全部通过。 |
| 针对性 ESLint | 通过 | 本次 6 个前端实现/测试文件无错误或警告。 |
| Vue SFC 编译检查 | 通过 | `MapHome.vue`、`MapScreenTopBar.vue`、`MapAssetSelector.vue` 均可编译。 |
| `git diff --check` | 通过 | 无空白错误；仅治理文档存在 Git 的 LF→CRLF 提示。 |
| `scripts/validate-agent-governance.ps1` | 通过 | 活动任务、档案和 Agent 配置符合仓库治理规则。 |
| 独立验证复核 | 通过 | 首轮发现的 requested/applied 显示不一致、403/404 回退和宽松关系匹配均已修复，二次复核无 P0/P1。 |
| `pnpm run type:check` | 仓库既有阻塞 | 退出码 2、共 239 行既有类型错误；本次实现/测试文件匹配为 0。 |
| `pnpm run build` | 仓库既有阻塞 | 现有生产环境配置缺少 `VITE_BUILD_COMPRESS`，在压缩配置读取 `undefined.split` 时失败。 |

## 浏览器联调

- 前端 Vite 服务可在 `https://localhost:5173/vue` 启动。
- 当前本机 ThingsBoard 后端未启动，Vite WebSocket/API 代理返回 `ECONNREFUSED`，应用根节点无法进入登录后大屏。
- 因此未在真实登录态验证资产目录、关系权限、刷新恢复和摄像头会话释放；这些项目保留为人工联调项。

## 人工联调清单

- `CUSTOMER_USER` 首次进入默认显示全部点位，资产列表仅包含该客户可读资产。
- 选择直接资产、嵌套资产和空资产，核对传感器/摄像头点位和空状态。
- 快速连续切换两个资产，确认晚到响应不会覆盖最后选择。
- F5 刷新后恢复上次有效资产；删除资产或撤销权限后回退全部。
- 打开传感器详情、摄像头直播和录像回放后切换资产，确认弹窗关闭且会话释放。
- 在 1920×1080、Windows 125% 缩放以及窄屏下检查顶部栏选择器、弹层和原有响应式布局。
