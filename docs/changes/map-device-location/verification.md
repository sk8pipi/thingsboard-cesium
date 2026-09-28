# 验证记录

2026-09-27 已执行：

- 后端 `mvn -o -pl application '-Dtest=MapDeviceLocationServiceTest,MapTemplateRuntimeServiceTest' '-DfailIfNoTests=false' '-Dcheckstyle.skip=true' '-Dlicense.skipAddThirdParty=true' test`：21 项通过，BUILD SUCCESS。
- 前端 `mapGlobalDeviceLocation`、`mapUnifiedPoint`、`mapModelAnchorEditor`、`mapModelAnchor`、`mapDeviceProfile`、`mapUnifiedPick` 六组 esno 测试分别通过，覆盖同设备跨模板、SSE 新旧版本、模板草稿隔离、冲突、模型与移除恢复。
- 本次改动的 Vue/TS/测试文件定向 ESLint 通过；`git diff --check` 通过；`scripts/validate-agent-governance.ps1` 通过（1 个活动任务）。
- `VITE_BUILD_COMPRESS=none pnpm exec vite build --mode production` 通过，7,357 个模块转换完成。仓库缺少 `.env.production`，构建时提示该文件缺失；构建另有现存 CSS 压缩警告。未读取或修改本地密钥文件。
- `pnpm exec vue-tsc --noEmit -p tests/tsconfig.map-model-anchor.json` 未通过：错误位于未修改的 Table、store、告警、图表和 `deviceProfilePresentation.ts:118`；本次改动文件没有新增报错。

未执行：真实 ThingsBoard/PostgreSQL API 集成测试、双浏览器 Cesium/SSE/权限联调、生产数据迁移或批量坐标修改。上述测试环境验证仍是交付前必要步骤，尤其是 SERVER_SCOPE 投影顺序与跨模板视觉同步。

2026-09-28 补充：只读检查 Edge 用户大屏，刷新后显示 103/103 个地图点位且无“位置暂不可用”提示；管理员编辑页显示“温度”和 `sim-sensor-100` 两个位置同步失败草稿，具体请求状态未取得。针对用户页加载误报，`MapHome.vue` 定向 ESLint、Vue SFC/模板编译与 `git diff --check` 通过。全量 Vite 构建因本机长时间高内存占用主动停止；修改后的浏览器再次联调因调试连接不可用未完成，因此尚未确认新加载文案在真实页面中的表现。未写入设备位置。

2026-09-28 位置 PUT 失败排查：用户提供“模型测试”失败响应，HTTP 500，`errorCode=2`，`message=Content-Type 'application/x-www-form-urlencoded;charset=UTF-8' is not supported`。前端 `defHttp` 默认表单请求头，设备位置 PUT 原先未覆盖；后端 `@RequestBody LocationRequest` 接收 JSON，因此请求未进入位置保存逻辑。已给该 PUT 显式指定 JSON 请求头。新增 `mapDeviceLocationService.test.ts`，模拟 HTTP 客户端验证 JSON 请求头、坐标版本参数及缺失版本时不发送请求；定向 esno、ESLint、Prettier、`git diff --check` 通过。尚未在真实服务中重试写入；“温度”和 `sim-sensor-100` 的既往失败是否同因，需分别核验。
