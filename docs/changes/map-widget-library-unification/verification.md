# 验证记录

2026-09-28 已执行：

- `nativeWidgetIntegration.test.ts` 通过：共享 SFC 编译、两个入口接线、点位/画布可用性、导入部件去除旧数据源、原生点位草稿行为。
- `nativeWidgetPersistence.test.ts` 通过：点位添加/取消/重开与模板部件配置往返。
- `nativeWidgetBrowse.test.ts` 与 `mapWidgetFullscreen.test.ts` 通过。
- 变更文件 ESLint、Prettier 通过；`scripts/validate-agent-governance.ps1` 通过；`git diff --check` 通过。
- 限定原生部件范围的 `vue-tsc` 未通过，报错均位于既有 Table、store、dashboard 图表/告警和 `deviceProfilePresentation.ts` 等未改文件；本次变更文件无新增诊断。
- `VITE_BUILD_COMPRESS=none` 下 `vite build --mode production` 通过，构建时提示本地缺少 `.env.production`，另有既有 CSS 压缩警告。

尚未使用真实账号执行浏览器端保存、全屏与窄屏验收。

2026-09-28 弹层瞬间消失修复：`nativeWidgetIntegration.test.ts` 增加 Vue 响应式监听回归，检查同点位对象和 `widgets` 更新不关闭部件库、不覆盖草稿；切换点位与关闭/重新打开仍正确重置。`nativeWidgetPersistence.test.ts` 和变更文件 ESLint 通过。
