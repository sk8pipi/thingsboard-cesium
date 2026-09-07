# 报警趋势验证记录

- 最后更新：2026-09-07
- 结果：代码、隔离功能验证及本地业务数据库迁移通过；真实页面交互待用户验收。
- 环境：Windows、Java17、Maven3.9.11、现有前端依赖、本机 PostgreSQL13.23。
- 数据库：仅使用工作区 target 下新建的独立PG数据目录，127.0.0.1:55439/alarm_statistics_test。
- 每个数据库测试使用随机schema并清理，未连接用户现有业务数据库、未读取密钥文件。
- 验证结束已正常停止该独立PG实例并释放端口登记，保留忽略目录中的测试日志。

## 已执行验证

| 检查 | 结果 | 覆盖 |
| --- | --- | --- |
| 后端 Maven application 及依赖36模块 test-compile | 通过 | 跳过不相关Angular前端构建；最终控制器修订另行定向 javac 通过 |
| AlarmStatisticsServiceTest | 4项通过 | 北京时间日/小时分桶、空桶、客户参数、覆盖边界、非法模式、数据库异常 |
| AlarmStatisticsPostgresTest | 7项通过 | 实际SQL安装/事务、创建去重、两条严重度更新路径、确认解除、删除保留、租户客户隔离、租户级联、失败回滚、并发、时间边界、迁移启用及重复补录 |
| AlarmStatisticsControllerTest | 7项通过 | 实际Spring方法权限代理、未登录/系统管理员拒绝、按authority选范围、缺失/空/占位客户ID拒绝、JSON响应、非法模式、数据库/事务失败安全503 |
| pnpm exec esno tests/alarmTrendHistory.test.ts | 通过 | 北京时间午夜、小时边界、标签、完整性字段、非法/缺失/不一致响应拒绝 |
| 定向 tsc --noEmit（alarmTrend.ts及测试） | 通过 | 新增纯前端类型与测试 |
| 定向 ESLint（3个趋势文件和测试） | 通过 | 无错误 |
| Vue SFC parse/compileScript/compileTemplate | 通过 | 趋势部件脚本/模板编译 |
| New-AlarmStatisticsMigration.ps1 | 通过 | 仅生成SQL；生成结果在隔离PG内成功执行、重跑并验证 |
| 独立只读审查 | 通过 | 两个P2已修复并复核；额外权限测试发现的角色推断边界也已修复并复核 |
| validate-agent-governance.ps1、git diff --check | 通过 | 活动任务状态/范围一致，无差异空白错误；Git仅提示换行格式 |
| 本地视频启动链路模块编译 | 通过 | `common/data,dao install`后`application compile`成功，原AlarmStatisticsService找不到符号错误消失 |
| 本地业务数据库迁移 | 通过 | 完整备份校验后单事务迁移；11条补录、状态1条、缺失0条 |

数据库与服务共11项、控制器7项，总计18项Java测试通过。
最终结果日志位于 backend/dao/target/alarm-history-tests/result.log、
backend/application/target/alarm-history-tests/result.log；日志未复制到正式文档。

## 构建限制
- 全仓前端 type:check 未通过：包含原有缺失模块和多处类型错误；本次三个趋势文件及新增测试未出现在错误列表。
- 首次完整Maven流程被原有Angular组件/NgModule构建错误阻塞；改用前端插件skip参数后，后端及测试编译成功。
- 本轮没有修改这些无关错误，没有以完整前端检查通过来描述交付。

后端通过的命令（在backend目录）：
~~~powershell
mvn -o -pl application -am test-compile '-DskipTests' '-Dlicense.skip=true' '-Dcheckstyle.skip=true' '-Dskip.yarn=true' '-Dskip.bower=true' '-Dskip.npm=true' '-Dskip.installnodenpm=true' '-Dskip.installyarn=true'
~~~

新增测试使用Maven生成的测试classpath、编译产物与实际源资源定向编译并由JUnitCore运行。
Postgres测试要求显式 ALARM_STATISTICS_TEST_URL 和 ALARM_STATISTICS_MIGRATION_SQL，不提供时跳过，避免误连共享数据库。

## 审查修复
- 本地启动脚本原先只构建application，会读取本机Maven仓库中的旧DAO包；现于启动前安装common/data与dao最新构件。
- 迁移生成器移除fresh-install脚本中的update_alarm先删后建操作，改为原地CREATE OR REPLACE，保留权限与依赖。
- 捕获TransactionException，避免事务连接失败绕过安全503。
- 回退文档增加恢复采集同事务内更新完整起点的实际SQL。
- 不使用User.isCustomerUser()推断范围：该方法按customerId推断角色，异常客户身份可能误变租户范围；改按Authority并验证客户ID。
- 严重度历史DML在GET DIAGNOSTICS之后，不改变原modified返回值。

## 未验证与残余风险
- 未对真实设备产生/删除报警。
- 尚未在用户已登录大屏完成最终交互验收；服务端逻辑通过真实PG、接口权限测试及本地业务库迁移验证。
- 未执行大规模生产容量/锁持有时长测试；上线前按实际数据规模在备份恢复环境评估维护窗口。
- 旧已删除报警无法无依据恢复；统计写入故障会回滚报警创建。
