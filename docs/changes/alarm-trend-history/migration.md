# 迁移、补录与回退

## 授权状态
代码与迁移脚本已获批准。用户于2026-09-07明确批准本地业务数据库迁移；迁移已在
localhost:5432/thingsboard（public schema）完成。生产发布仍未批准。
隔离测试使用独立数据目录和端口55439。

实际迁移前完成PostgreSQL custom格式完整备份并通过pg_restore目录校验，备份位于忽略目录：
backend/dao/target/alarm-statistics-backups/20260907-172403/database-before-migration.dump。
迁移后capture_state_rows=1、occurrence_rows=11、missing_existing_alarms=0。

## 生成可审核SQL
在仓库根目录执行（仅生成文件，不连接数据库）：

~~~powershell
powershell -ExecutionPolicy Bypass -File scripts/alarm-trend/New-AlarmStatisticsMigration.ps1 -OutputPath backend/dao/target/alarm-statistics-migrate.sql
~~~

已有同名输出时脚本拒绝覆盖；需要重新生成时选择新文件名。输出来自当前 schema-entities.sql 和 schema-functions.sql 的指定片段。

## 执行前
1. 核对代码版本、目标主机/端口/数据库和备份恢复办法。
2. 备份数据库及现有 create_or_update_active_alarm、update_alarm 的函数定义。
3. 暂停所有报警创建、更新、删除及TTL清理来源，包括规则引擎、API写入及边缘同步，等在途写入结束。
4. 只读核对现存报警按租户的数量；无有效租户的孤立报警不进入新表，必须另行处理。
5. 审核SQL并取得本次实际迁移/补录批准后再执行。

## 手动执行
使用已有数据库客户端，密码通过交互提示或现有安全认证提供，不写入命令/日志：

~~~text
psql -X -v ON_ERROR_STOP=1 -h <已批准主机> -p <端口> -U <用户> -d <数据库> -f <已审核SQL绝对路径>
~~~

本地环境也可使用安全执行器。默认只做只读预检查，增加-Execute才会先完整备份再迁移：

~~~powershell
powershell -ExecutionPolicy Bypass -File scripts/alarm-trend/Invoke-AlarmStatisticsMigration.ps1
powershell -ExecutionPolicy Bypass -File scripts/alarm-trend/Invoke-AlarmStatisticsMigration.ps1 `
  -MigrationSql backend/dao/target/alarm-statistics-migrate.sql -Execute
~~~

执行器只读取环境文件中的数据库连接项，密码仅通过子进程环境传给PostgreSQL客户端，不输出到终端或文件。

脚本单事务执行：
- 对 alarm 获取 SHARE ROW EXCLUSIVE 锁（等待超过10秒中止）。
- 创建历史表/索引及覆盖元数据表。
- 使用CREATE OR REPLACE原地更新两条报警采集/更新函数，保留函数对象、权限及依赖关系。
- 仅首次写入完整采集起点。
- 从当前 alarm 去重补录，JOIN tenant 排除不存在的租户，保留创建时间。
- ON CONFLICT DO NOTHING，不覆盖已有实时记录。
- 成功提交，任一步失败全部回滚。psql 必须开启 ON_ERROR_STOP。

生成的迁移不会DELETE、TRUNCATE、DROP TABLE、ALTER TABLE，也不会UPDATE现有业务表数据。
它只读取alarm和tenant，把结果插入新建的alarm_occurrence表；现有alarm表只在维护窗口内被临时加锁。

建议先在备份恢复的非生产环境验证迁移耗时和锁等待。大库补录会占用写锁，未完成验证不能声称无停机迁移。

## 执行后核对
~~~sql
SELECT * FROM alarm_statistics_state;
SELECT tenant_id, record_source, count(*) FROM alarm_occurrence GROUP BY tenant_id, record_source;
SELECT count(*) AS missing_existing_alarms
FROM alarm a JOIN tenant t ON t.id = a.tenant_id
LEFT JOIN alarm_occurrence h ON h.tenant_id = a.tenant_id AND h.alarm_id = a.id
WHERE h.alarm_id IS NULL;
~~~

missing_existing_alarms 应为0。只读核对后恢复报警服务，验证一个获准的测试设备创建和删除报警：
报警列表按原逻辑减少，趋势历史总数保持。查询API确认租户/客户范围以及完整采集提示。
不得未经批准在用户真实设备上制造或删除报警。

## 历史限制
- 迁移前已删除报警不能从当前数据库报警表恢复。
- 补录仅反映当前仍存报警及其最新严重度。
- 查询区间包含采集起点以前的时期时，部件明确提示历史可能不完整。
- 只有从可信备份恢复并逐ID核对后才可补更早历史；属于单独迁移工作。

## 回退
优先只回退前端，保留历史采集和表；旧趋势将恢复按现存报警计数。
若必须停采，先暂停写入并记录停采时刻，恢复备份的两个旧函数，保留历史表。
再次启用采集后，停采期间的历史不能宣称完整；需要明确记录缺口并重新确定完整起点。
在再次启用采集的维护事务内，安装函数并完成补录之后、释放alarm写锁之前，单独批准执行以下语句，将完整起点保守重设为恢复时刻：

~~~sql
UPDATE alarm_statistics_state
SET capture_started_time = floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
WHERE id = true;
~~~

此语句只适用于确实发生停采缺口的恢复，不用于普通重启或幂等重跑。普通迁移生成器不会主动修改已有起点。
不要直接DROP历史表，不要以重新执行安装脚本代替有记录的回退。

## 隔离测试复现
测试类 AlarmStatisticsPostgresTest 仅接受形如 jdbc:postgresql://127.0.0.1:<独立端口>/alarm_statistics_test 的显式测试URL。
测试用户为 alarm_test；每项测试创建随机schema并在结束删除，仅对上述可丢弃数据库执行。
设置 ALARM_STATISTICS_MIGRATION_SQL 为生成SQL的绝对路径。
其他业务数据库、共享本地数据库和密钥文件均不参与测试。
