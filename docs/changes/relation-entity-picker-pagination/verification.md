# 关联实体选择器验证记录

- 最后更新：2026-09-07
- 当前结果：实现相关定向检查通过；全量类型检查受仓库既有错误阻断。

## 已执行验证
- `pnpm exec esno tests/relationEntityOptions.test.ts`：通过。覆盖分页、按ID去重、搜索词重置、当前选中项保留、过期响应丢弃、滚动边界判断、From/To四种可见与隐藏字段必填组合、提交时固定端合并，以及切换实体类型时保留其他表单值。
- `pnpm exec eslint src/views/tb/relation/form.vue src/views/tb/relation/relationEntityOptions.ts tests/relationEntityOptions.test.ts`：通过。
- 使用`@vue/compiler-sfc`解析并编译`form.vue`的脚本与模板：通过。
- `git diff --check`：通过；只有Git关于现有LF/CRLF转换的提示。
- `scripts/validate-agent-governance.ps1`：通过。

## 实际页面验证
- 在资产“石油科技大楼”的向外关系列表新增`Contains`关系，目标设备为`sim-sensor-099`。
- 选择设备类型后，关系类型`Contains`仍保留，固定端资产没有从提交数据中丢失。
- 保存接口成功，弹窗关闭，页面提示“新增关联成功”，关系列表显示1条对应记录。

## 类型检查边界
执行`pnpm exec vue-tsc --noEmit -p tests/tsconfig.relation-entity-options.json`时，本次修改文件没有产生错误，但命令因导入链中的既有错误退出：
- `EditableCell.vue`存在`ComponentType`与`Upload`比较错误。
- `store/modules/lock.ts`、`multipleTab.ts`引用`UserInfo`中不存在的字段。
- `store/modules/permission.ts`存在`never.includes`错误。
- `store/modules/websocket.ts`的WebSocket状态类型不兼容。

这些错误不在当前任务文件范围内，本次未扩大修改范围处理。

## 页面验收步骤
1. 从资产或设备详情进入关联列表，新增一条关联。
2. 选择设备或资产类型，向下滚动超过50条，确认继续加载且不重复。
3. 输入未出现在首屏的实体名称，确认能通过服务端搜索找到并保存。
4. 快速改变搜索词或实体类型，确认旧结果不会覆盖新结果，旧实体ID不会残留。
5. 编辑已有关系，确认原实体名称仍能显示。
