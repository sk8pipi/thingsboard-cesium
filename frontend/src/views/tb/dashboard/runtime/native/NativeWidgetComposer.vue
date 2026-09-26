<template>
  <Teleport :to="overlayTarget">
    <div v-if="visible" class="nw-mask" @keydown.esc.stop="previewVisible ? (previewVisible = false) : emit('close')">
      <section class="nw-dialog" role="dialog" aria-modal="true" aria-label="部件配置" tabindex="-1">
        <header>
          <strong>{{ source?.config?.native ? '编辑' : '添加' }}：{{ source?.name || draft?.title }}</strong>
          <div class="nw-header-actions"
            ><div class="nw-segment"
              ><button :class="{ active: mode === 'basic' }" @click="mode = 'basic'">基础</button
              ><button :class="{ active: mode === 'advanced' }" @click="mode = 'advanced'">高级</button></div
            ><button aria-label="关闭配置" @click="emit('close')">×</button></div
          >
        </header>
        <div v-if="draft" class="nw-content">
          <template v-if="mode === 'basic'">
            <section
              v-if="
                historical ||
                (draft.config.native.family === 'alarmTable' && draft.config.native.alarmTable.useTimeWindow)
              "
              class="nw-panel"
            >
              <h3>时间窗口 <span class="nw-tag">使用部件时间窗口</span></h3>
              <details class="nw-time">
                <summary>{{
                  draft.config.native.window.realtime
                    ? '◷ 实时 · 最后 ' + durationLabel()
                    : draft.config.native.window.calendar
                      ? '◷ 日历窗口 · UTC'
                      : '◷ 固定历史范围'
                }}</summary>
                <div class="nw-fields">
                  <label
                    >时间模式<select v-model="timeMode"
                      ><option value="realtime">实时滚动</option
                      ><option value="fixed">固定历史范围</option
                      ><option value="day">今天至今（UTC）</option
                      ><option value="week">本周至今（UTC，周一开始）</option
                      ><option value="month">本月至今（UTC）</option></select
                    ></label
                  >
                  <template v-if="draft.config.native.window.realtime">
                    <label
                      >快捷窗口<select v-model="draft.config.native.window.durationMs"
                        ><option :value="60000">1 分钟</option
                        ><option :value="300000">5 分钟</option
                        ><option :value="600000">10 分钟</option
                        ><option :value="3600000">1 小时</option
                        ><option :value="86400000">24 小时</option
                        ><option :value="604800000">7 天</option></select
                      ></label
                    >
                    <label
                      >窗口时长（毫秒）<input
                        v-model.number="draft.config.native.window.durationMs"
                        type="number"
                        min="60000"
                        :max="31 * 86400000"
                    /></label>
                  </template>
                  <template v-else-if="!draft.config.native.window.calendar">
                    <label
                      >开始<input
                        type="datetime-local"
                        :value="localDate(draft.config.native.window.startTs)"
                        @input="setDate('startTs', $event)"
                    /></label>
                    <label
                      >结束<input
                        type="datetime-local"
                        :value="localDate(draft.config.native.window.endTs)"
                        @input="setDate('endTs', $event)"
                    /></label>
                  </template>
                  <label v-if="!['state', 'alarmTable'].includes(draft.config.native.family)"
                    >聚合<select v-model="draft.config.native.window.aggregation"
                      ><option v-for="agg in ['NONE', 'AVG', 'MIN', 'MAX', 'SUM', 'COUNT']" :key="agg" :value="agg">{{
                        agg === 'NONE' ? '无聚合' : agg
                      }}</option></select
                    ></label
                  >
                  <label v-if="!['state', 'alarmTable'].includes(draft.config.native.family)"
                    >聚合间隔（毫秒）<input
                      v-model.number="draft.config.native.window.intervalMs"
                      type="number"
                      min="1000"
                  /></label>
                </div>
              </details>
            </section>
            <section v-if="usesDataSource" class="nw-panel">
              <h3
                >数据源 <span class="nw-tag">{{ entityType === 'DEVICE' ? '设备' : '资产' }}</span></h3
              >
              <p v-if="lockedEntity" class="nw-note">当前点位：{{ lockedEntity.name || lockedEntity.entityId }}</p>
              <template v-else>
                <div class="nw-fields">
                  <label
                    >实体类型<select v-model="entityType" @change="searchEntities(0)"
                      ><option value="DEVICE">设备</option
                      ><option
                        v-if="
                          inputSpec?.scope !== 'SHARED_SCOPE' &&
                          locationSpec?.scope !== 'SHARED_SCOPE' &&
                          !['rpcButton', 'control', 'advancedControl', 'ledIndicator'].includes(
                            draft.config.native.family,
                          )
                        "
                        value="ASSET"
                        >资产自身数据</option
                      ></select
                    ></label
                  >
                  <label v-if="entityType === 'DEVICE'"
                    >设备配置<select v-model="profileId" @change="searchEntities(0)"
                      ><option value="">所有配置</option
                      ><option v-for="profile in profiles" :key="profile.id.id" :value="profile.id.id">{{
                        profile.name
                      }}</option></select
                    ></label
                  >
                </div>
                <label>选择{{ entityType === 'DEVICE' ? '设备' : '资产' }} *</label>
                <ASelect
                  show-search
                  :filter-option="false"
                  :value="[]"
                  aria-label="选择设备或资产"
                  :dropdown-style="{ zIndex: 12100 }"
                  :loading="loading"
                  :disabled="sources.length >= (singleSource ? 1 : 8)"
                  :get-popup-container="selectPopupTarget"
                  placeholder="输入名称搜索并选择，可添加多个实体"
                  class="nw-entity-select"
                  :options="
                    entities.map((entity) => ({
                      value: entity.id.id,
                      label: entity.name,
                      disabled: sources.some((s) => s.entityId === entity.id.id && s.entityType === entityType),
                    }))
                  "
                  @search="searchOptions"
                  @change="(value) => selectEntity(String(value))"
                />
                <div class="nw-pages"
                  ><button :disabled="page === 0 || loading" @click="searchEntities(page - 1)">上一页</button
                  ><span>{{ page + 1 }}</span
                  ><button :disabled="!hasNext || loading" @click="searchEntities(page + 1)">下一页</button></div
                >
              </template>
              <div v-for="(ds, index) in sources" :key="ds.entityType + ds.entityId" class="nw-source-chip"
                ><span>{{ ds.name || ds.entityId }}</span
                ><button v-if="!lockedEntity" aria-label="移除数据源" @click="sources.splice(index, 1)">×</button></div
              >
              <p v-if="entityType === 'ASSET'" class="nw-note">读取资产自身字段；下属设备汇总使用内置资产聚合部件。</p>
            </section>
            <section
              v-if="
                ![
                  'rpcButton',
                  'control',
                  'advancedControl',
                  'count',
                  'alarmTable',
                  'deviceClaim',
                  'entityHierarchy',
                  'entityTable',
                  'locationInput',
                  'ledIndicator',
                ].includes(draft.config.native.family)
              "
              class="nw-panel"
            >
              <h3>{{ historical ? '时间序列' : '数据字段' }}</h3>
              <p v-if="!sources.length" class="nw-note">先选择设备或资产，再选择数据字段。</p>
              <article v-for="ds in sources" :key="ds.entityType + ds.entityId" class="nw-source">
                <div class="nw-source-header"
                  ><strong>{{ ds.name || ds.entityId }}</strong
                  ><div class="nw-inline"
                    ><select v-model="keyTypes[ds.entityId]" :disabled="!!inputSpec" @change="loadKeys(ds)"
                      ><option v-if="!inputSpec || inputSpec.mode === 'timeseries'" value="timeseries">遥测</option
                      ><option v-if="!historical && !inputSpec && !multiInput && !photoInput" value="CLIENT_SCOPE"
                        >客户端属性</option
                      ><option
                        v-if="!historical && (!inputSpec || inputSpec.scope === 'SERVER_SCOPE')"
                        value="SERVER_SCOPE"
                        >服务端属性</option
                      ><option
                        v-if="
                          !historical &&
                          (!inputSpec || inputSpec.scope === 'SHARED_SCOPE') &&
                          !photoInput &&
                          (!multiInput || ds.entityType === 'DEVICE')
                        "
                        value="SHARED_SCOPE"
                        >共享属性</option
                      ></select
                    ><button :disabled="keyLoading[ds.entityId]" @click="loadKeys(ds)">刷新字段</button></div
                  ></div
                >
                <div class="nw-table-scroll"
                  ><table class="nw-key-table"
                    ><thead
                      ><tr
                        ><th>键</th
                        ><th v-if="!['liquid', 'battery', 'signal'].includes(draft.config.native.family)">标签</th
                        ><th v-if="historical && draft.config.native.family !== 'table'">类型</th
                        ><th v-if="historical && draft.config.native.family !== 'table'">Y 轴</th
                        ><th v-if="!['liquid', 'battery', 'signal', 'input'].includes(draft.config.native.family)"
                          >颜色</th
                        ><th v-if="!['liquid', 'input'].includes(draft.config.native.family)">单位</th
                        ><th v-if="!inputSpec">小数</th><th></th></tr
                    ></thead>
                    <tbody
                      ><tr v-for="(key, ki) in ds.dataKeys" :key="ki"
                        ><td
                          ><span class="nw-key-name">{{ key.name }}</span></td
                        ><td v-if="!['liquid', 'battery', 'signal'].includes(draft.config.native.family)"
                          ><input v-model="key.label" aria-label="字段显示名称"
                        /></td>
                        <td v-if="historical && draft.config.native.family !== 'table'"
                          ><select :value="seriesOptions(key).type" @change="setSeries(key, 'type', $event)"
                            ><option value="line">折线</option
                            ><option v-if="!['range', 'state'].includes(draft.config.native.family)" value="bar"
                              >柱形</option
                            ><option v-if="!['range', 'state'].includes(draft.config.native.family)" value="scatter"
                              >散点</option
                            ></select
                          ></td
                        >
                        <td v-if="historical && draft.config.native.family !== 'table'"
                          ><select :value="seriesOptions(key).axisId" @change="setSeries(key, 'axisId', $event)"
                            ><option v-for="axis in draft.config.native.chart.axes" :key="axis.id" :value="axis.id">{{
                              axis.label || axis.id
                            }}</option></select
                          ></td
                        >
                        <td v-if="!['liquid', 'battery', 'signal', 'input'].includes(draft.config.native.family)"
                          ><input v-model="key.color" type="color" aria-label="字段颜色" /></td
                        ><td v-if="!['liquid', 'input'].includes(draft.config.native.family)"
                          ><input v-model="key.units" aria-label="单位" /></td
                        ><td v-if="!inputSpec"
                          ><input v-model.number="key.decimals" type="number" min="0" max="8" aria-label="小数位" /></td
                        ><td><button aria-label="删除字段" @click="ds.dataKeys.splice(ki, 1)">×</button></td></tr
                      ></tbody
                    ></table
                  ></div
                >
                <ASelect
                  show-search
                  :value="[]"
                  aria-label="添加数据字段"
                  :dropdown-style="{ zIndex: 12100 }"
                  :loading="keyLoading[ds.entityId]"
                  :disabled="singleSource && ds.dataKeys.length >= (draft.config.native.family === 'wind' ? 2 : 1)"
                  :get-popup-container="selectPopupTarget"
                  placeholder="＋ 添加字段"
                  class="nw-key-select"
                  :options="(availableKeys[ds.entityId] || []).map((name) => ({ value: name, label: name }))"
                  @change="(name) => addKey(ds, String(name))"
                />
                <p v-if="keyMessages[ds.entityId]" class="nw-note">{{ keyMessages[ds.entityId] }}</p>
                <div v-if="multiInput" class="nw-multi-keys">
                  <details v-for="key in ds.dataKeys" :key="`${key.type}:${key.scope}:${key.name}`" class="nw-panel">
                    <summary
                      >{{ key.label || key.name }} ·
                      {{
                        key.type === 'timeseries' ? '遥测' : key.scope === 'SHARED_SCOPE' ? '共享属性' : '服务端属性'
                      }}</summary
                    >
                    <div class="nw-fields">
                      <label
                        >输入类型<select v-model="multiSettings(key).dataKeyValueType">
                          <option value="string">文本</option
                          ><option value="double">浮点数</option
                          ><option value="integer">整数</option>
                          <option value="booleanCheckbox">复选框</option
                          ><option value="booleanSwitch">开关</option>
                          <option value="date">日期</option
                          ><option value="dateTime">日期时间</option
                          ><option value="time">时间</option>
                          <option value="JSON">JSON</option
                          ><option value="select">下拉选择</option
                          ><option value="radio">单选</option
                          ><option value="color">颜色</option>
                        </select></label
                      >
                      <label class="nw-check"
                        ><input v-model="multiSettings(key).required" type="checkbox" />必填</label
                      >
                      <label
                        >编辑方式<select v-model="multiSettings(key).isEditable"
                          ><option value="editable">可编辑</option
                          ><option value="readonly">只读</option
                          ><option value="disabled">禁用</option></select
                        ></label
                      >
                      <label class="nw-check"
                        ><input v-model="multiSettings(key).dataKeyHidden" type="checkbox" />隐藏字段</label
                      >
                      <label
                        >被哪个字段禁用<input
                          v-model="multiSettings(key).disabledOnDataKey"
                          placeholder="留空表示始终可编辑"
                      /></label>
                      <template v-if="['integer', 'double'].includes(multiSettings(key).dataKeyValueType)">
                        <label
                          >最小值<input
                            :value="multiSettings(key).minValue ?? ''"
                            type="number"
                            @input="multiSettings(key).minValue = optionalNumber($event)"
                        /></label>
                        <label
                          >最大值<input
                            :value="multiSettings(key).maxValue ?? ''"
                            type="number"
                            @input="multiSettings(key).maxValue = optionalNumber($event)"
                        /></label>
                        <label>步长<input v-model.number="multiSettings(key).step" type="number" min="0.001" /></label>
                      </template>
                      <label v-if="['select', 'radio'].includes(multiSettings(key).dataKeyValueType)"
                        >选项（每行 标签=值）
                        <textarea
                          :value="multiOptionsText(key)"
                          rows="4"
                          @input="setMultiOptions(key, $event)"
                        ></textarea>
                      </label>
                    </div>
                  </details>
                </div>
              </article>
            </section>
            <section class="nw-panel"
              ><h3>标题</h3
              ><div class="nw-fields"
                ><label class="nw-check"><input v-model="draft.config.showTitle" type="checkbox" />显示标题</label
                ><label>标题文本<input v-model="draft.title" /></label></div
            ></section>
          </template>
          <NativeWidgetSettingsEditor
            v-if="
              !['count', 'alarmTable', 'deviceClaim', 'entityHierarchy', 'entityTable'].includes(
                draft.config.native.family,
              )
            "
            v-model="draft.config.native"
            :mode="mode"
            @remove-axis="rebindAxis"
          />
          <section v-if="draft.config.native.family === 'attributeCard' && mode === 'basic'" class="nw-panel">
            <h3>属性卡片</h3>
            <div class="nw-fields">
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.attributeCard.showSourceTitle"
                  type="checkbox"
                />显示实体标题</label
              >
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.attributeCard.showMissing"
                  type="checkbox"
                />显示暂无值的字段</label
              >
              <label
                >标签列宽度（%）<input
                  v-model.number="draft.config.native.attributeCard.labelWidth"
                  type="number"
                  min="10"
                  max="90"
              /></label>
            </div>
          </section>
          <section v-if="draft.config.native.family === 'count' && mode === 'basic'" class="nw-panel">
            <h3>{{ draft.config.native.count.kind === 'alarm' ? '告警计数' : '实体计数' }}</h3>
            <div class="nw-fields">
              <p v-if="draft.config.native.count.singleEntityId" class="nw-note"
                >当前点位设备：{{ lockedEntity?.name || draft.config.native.count.singleEntityId }}</p
              >
              <label v-if="!draft.config.native.count.singleEntityId"
                >统计范围<select v-model="draft.config.native.count.entityType">
                  <option v-if="draft.config.native.count.kind === 'alarm'" value="ALL">全部实体</option>
                  <option value="DEVICE">设备</option
                  ><option value="ASSET">资产</option>
                </select></label
              >
              <label v-if="!draft.config.native.count.singleEntityId && draft.config.native.count.entityType !== 'ALL'"
                >名称前缀<input v-model="draft.config.native.count.nameFilter" placeholder="留空表示全部"
              /></label>
              <template v-if="draft.config.native.count.kind === 'alarm'">
                <label
                  >告警状态<select v-model="draft.config.native.count.statusList" multiple>
                    <option value="ACTIVE">活跃</option
                    ><option value="CLEARED">已清除</option>
                    <option value="ACK">已确认</option
                    ><option value="UNACK">未确认</option>
                  </select></label
                >
                <label
                  >告警等级<select v-model="draft.config.native.count.severityList" multiple>
                    <option value="CRITICAL">严重</option
                    ><option value="MAJOR">重要</option>
                    <option value="MINOR">次要</option
                    ><option value="WARNING">警告</option>
                    <option value="INDETERMINATE">未确定</option>
                  </select></label
                >
                <label>告警类型（逗号分隔）<input v-model="draft.config.native.count.typeList" /></label>
                <label
                  >最近时长（毫秒；0 为不限）<input
                    v-model.number="draft.config.native.count.timeWindowMs"
                    type="number"
                    min="0"
                    :max="31 * 86400000"
                /></label>
              </template>
              <label>计数标签<input v-model="draft.config.native.count.label" /></label>
              <label class="nw-check"
                ><input v-model="draft.config.native.count.showLabel" type="checkbox" />显示标签</label
              >
              <label
                >布局<select v-model="draft.config.native.count.layout"
                  ><option value="column">纵向</option
                  ><option value="row">横向</option></select
                ></label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.count.showIcon" type="checkbox" />显示图标</label
              >
              <label v-if="draft.config.native.count.showIcon"
                >图标名（如 ant-design:warning-filled）<input v-model="draft.config.native.count.icon"
              /></label>
              <label v-if="draft.config.native.count.showIcon"
                >图标字号<input v-model.number="draft.config.native.count.iconSize" type="number" min="8" max="96"
              /></label>
              <label class="nw-check"
                ><input v-model="draft.config.native.count.showIconBackground" type="checkbox" />显示图标底色</label
              >
              <label>图标颜色<input v-model="draft.config.native.count.iconColor" /></label>
              <label>图标底色<input v-model="draft.config.native.count.iconBackgroundColor" /></label>
              <label>数值颜色<input v-model="draft.config.native.count.valueColor" /></label>
              <label
                >数值字号<input v-model.number="draft.config.native.count.valueFontSize" type="number" min="8" max="96"
              /></label>
            </div>
            <p class="nw-note">使用当前账户权限查询真实计数；预览也会读取。原始函数数据源不会执行。</p>
          </section>
          <section v-if="draft.config.native.family === 'alarmTable' && mode === 'basic'" class="nw-panel">
            <h3>告警表格</h3>
            <div class="nw-fields">
              <p v-if="draft.config.native.alarmTable.singleEntityId" class="nw-note"
                >当前点位设备：{{ lockedEntity?.name || draft.config.native.alarmTable.singleEntityId }}</p
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.alarmTable.enableSearch" type="checkbox" />启用搜索</label
              >
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.alarmTable.enableFilter"
                  type="checkbox"
                />启用状态和等级筛选</label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.alarmTable.enableSelection" type="checkbox" />启用行选择</label
              >
              <label
                >默认状态<select v-model="draft.config.native.alarmTable.statusList" multiple>
                  <option value="ACTIVE">活跃</option
                  ><option value="CLEARED">已清除</option>
                  <option value="ACK">已确认</option
                  ><option value="UNACK">未确认</option>
                </select></label
              >
              <label
                >默认等级<select v-model="draft.config.native.alarmTable.severityList" multiple>
                  <option value="CRITICAL">严重</option
                  ><option value="MAJOR">重要</option>
                  <option value="MINOR">次要</option
                  ><option value="WARNING">警告</option>
                  <option value="INDETERMINATE">未确定</option>
                </select></label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.alarmTable.displayDetails" type="checkbox" />显示告警详情</label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.alarmTable.displayPagination" type="checkbox" />显示分页</label
              >
              <label
                >每页条数<input
                  v-model.number="draft.config.native.alarmTable.defaultPageSize"
                  type="number"
                  min="1"
                  max="100"
              /></label>
              <label
                >时间排序<select v-model="draft.config.native.alarmTable.defaultSortOrder"
                  ><option value="DESC">最新优先</option
                  ><option value="ASC">最早优先</option></select
                ></label
              >
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.alarmTable.useTimeWindow"
                  type="checkbox"
                />按部件时间窗口筛选</label
              >
              <label
                >刷新间隔（毫秒）<input
                  v-model.number="draft.config.native.pollMs"
                  type="number"
                  min="5000"
                  max="300000"
              /></label>
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.alarmTable.allowAcknowledgment"
                  type="checkbox"
                />允许确认告警</label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.alarmTable.allowClear" type="checkbox" />允许清除告警</label
              >
            </div>
            <p class="nw-note">预览只读；确认和清除仅在正式部件中由用户点击触发。</p>
          </section>
          <section v-if="draft.config.native.family === 'deviceClaim' && mode === 'basic'" class="nw-panel">
            <h3>设备认领</h3>
            <div class="nw-fields">
              <label class="nw-check"
                ><input v-model="draft.config.native.deviceClaim.deviceSecret" type="checkbox" />要求填写密钥</label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.deviceClaim.showLabel" type="checkbox" />显示字段标签</label
              >
              <label>设备名称标签<input v-model="draft.config.native.deviceClaim.deviceLabel" /></label>
              <label>密钥标签<input v-model="draft.config.native.deviceClaim.secretKeyLabel" /></label>
              <label>按钮文字<input v-model="draft.config.native.deviceClaim.claimButtonLabel" /></label>
              <label>成功提示<input v-model="draft.config.native.deviceClaim.successfulClaimDevice" /></label>
              <label>失败提示<input v-model="draft.config.native.deviceClaim.failedClaimDevice" /></label>
            </div>
            <p class="nw-note">设备名和密钥在正式部件中由用户填写；密钥不会保存到模板。预览不会提交。</p>
          </section>
          <section v-if="draft.config.native.family === 'entityHierarchy' && mode === 'basic'" class="nw-panel">
            <h3>实体层级</h3>
            <div class="nw-fields">
              <label
                >关系类型<input v-model="draft.config.native.entityHierarchy.relationType" placeholder="Contains"
              /></label>
              <label
                >关系方向<select v-model="draft.config.native.entityHierarchy.direction"
                  ><option value="FROM">从根节点向外</option
                  ><option value="TO">从根节点向内</option></select
                ></label
              >
              <label
                >最大展开深度<input
                  v-model.number="draft.config.native.entityHierarchy.maxDepth"
                  type="number"
                  min="1"
                  max="5"
              /></label>
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.entityHierarchy.showEntityType"
                  type="checkbox"
                />显示实体类型</label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.entityHierarchy.sortByName" type="checkbox" />按名称排序</label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.entityHierarchy.expandRoot" type="checkbox" />默认展开根节点</label
              >
            </div>
            <p class="nw-note">通过当前账户可见的关系读取子节点；原始自定义函数不会执行。</p>
          </section>
          <section v-if="draft.config.native.family === 'entityTable' && mode === 'basic'" class="nw-panel">
            <h3>实体表格</h3>
            <div class="nw-fields">
              <p v-if="draft.config.native.entityTable.singleEntityId" class="nw-note"
                >当前点位设备：{{ lockedEntity?.name || draft.config.native.entityTable.singleEntityId }}</p
              >
              <label v-else-if="!draft.config.native.entityTable.adminMode"
                >实体类型<select v-model="draft.config.native.entityTable.entityType"
                  ><option value="DEVICE">设备</option
                  ><option value="ASSET">资产</option></select
                ></label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.entityTable.enableSearch" type="checkbox" />启用搜索</label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.entityTable.displayPagination" type="checkbox" />显示分页</label
              >
              <label
                >每页条数<input
                  v-model.number="draft.config.native.entityTable.pageSize"
                  type="number"
                  min="1"
                  max="100"
              /></label>
              <label
                >名称排序<select v-model="draft.config.native.entityTable.sortOrder"
                  ><option value="ASC">升序</option
                  ><option value="DESC">降序</option></select
                ></label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.entityTable.showLabel" type="checkbox" />显示实体标签</label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.entityTable.showType" type="checkbox" />显示实体类型</label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.entityTable.stickyHeader" type="checkbox" />固定表头</label
              >
              <template v-if="draft.config.native.entityTable.adminMode">
                <label class="nw-check"
                  ><input v-model="draft.config.native.entityTable.allowCreate" type="checkbox" />允许新增</label
                >
                <label class="nw-check"
                  ><input v-model="draft.config.native.entityTable.allowEdit" type="checkbox" />允许编辑</label
                >
                <label class="nw-check"
                  ><input v-model="draft.config.native.entityTable.allowDelete" type="checkbox" />允许删除</label
                >
                <label class="nw-check"
                  ><input v-model="draft.config.native.entityTable.editLocation" type="checkbox" />编辑经纬度</label
                >
              </template>
              <label
                >刷新间隔（毫秒）<input
                  v-model.number="draft.config.native.pollMs"
                  type="number"
                  min="5000"
                  max="300000"
              /></label>
            </div>
            <h4
              >附加字段
              <button
                type="button"
                :disabled="draft.config.native.entityTable.columns.length >= 16"
                @click="draft.config.native.entityTable.columns.push({ type: 'TIME_SERIES', key: '', label: '' })"
                >添加列</button
              ></h4
            >
            <div v-for="(column, index) in draft.config.native.entityTable.columns" :key="index" class="nw-fields">
              <label
                >来源<select v-model="column.type"
                  ><option value="TIME_SERIES">最新遥测</option
                  ><option value="SERVER_ATTRIBUTE">服务端属性</option
                  ><option value="CLIENT_ATTRIBUTE">客户端属性</option
                  ><option value="SHARED_ATTRIBUTE">共享属性</option></select
                ></label
              >
              <label>字段键<input v-model="column.key" /></label><label>列标题<input v-model="column.label" /></label>
              <button type="button" @click="draft.config.native.entityTable.columns.splice(index, 1)">删除列</button>
            </div>
            <p class="nw-note">
              {{
                draft.config.native.entityTable.adminMode
                  ? '使用当前账户权限新增、编辑和删除实体；配置预览不会提交任何变更。'
                  : '查询当前账户可见的实体与最新字段；原始函数数据源不会执行。'
              }}
            </p>
          </section>
          <NativeStateSettingsEditor
            v-if="draft.config.native.family === 'state' && mode === 'basic'"
            v-model="draft.config.native"
          />
          <NativeLiquidSettingsEditor
            v-if="draft.config.native.family === 'liquid' && mode === 'basic'"
            v-model="draft.config.native"
          />
          <NativeIndicatorSettingsEditor v-if="indicator" v-model="draft.config.native" :mode="mode" />
          <section v-if="multiInput" class="nw-panel">
            <h3>多属性更新</h3>
            <div class="nw-fields">
              <label class="nw-check"
                ><input v-model="draft.config.native.multiInput.showResultMessage" type="checkbox" />显示保存结果</label
              >
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.multiInput.showActionButtons"
                  type="checkbox"
                />显示整表操作按钮</label
              >
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.multiInput.updateAllValues"
                  type="checkbox"
                />每次更新全部可编辑值</label
              >
              <label
                >保存按钮文字<input v-model="draft.config.native.multiInput.saveButtonLabel" placeholder="保存"
              /></label>
              <label
                >重置按钮文字<input v-model="draft.config.native.multiInput.resetButtonLabel" placeholder="重置"
              /></label>
              <label class="nw-check"
                ><input v-model="draft.config.native.multiInput.showGroupTitle" type="checkbox" />显示分组标题</label
              >
              <label v-if="draft.config.native.multiInput.showGroupTitle"
                >分组标题<input v-model="draft.config.native.multiInput.groupTitle"
              /></label>
              <label
                >排列<select v-model="draft.config.native.multiInput.fieldsAlignment"
                  ><option value="row">多列</option
                  ><option value="column">单列</option></select
                ></label
              >
              <label v-if="draft.config.native.multiInput.fieldsAlignment === 'row'"
                >每行字段<input
                  v-model.number="draft.config.native.multiInput.fieldsInRow"
                  type="number"
                  min="1"
                  max="8"
              /></label>
              <label
                >行距<input v-model.number="draft.config.native.multiInput.rowGap" type="number" min="0" max="80"
              /></label>
              <label
                >列距<input v-model.number="draft.config.native.multiInput.columnGap" type="number" min="0" max="80"
              /></label>
            </div>
            <p class="nw-note">选择字段时可切换遥测/服务端/共享属性。预览不写入；自定义脚本不执行。</p>
          </section>
          <section v-if="draft.config.native.family === 'rpcButton'" class="nw-panel">
            <h3>RPC 按钮</h3>
            <div class="nw-fields">
              <label>按钮文字<input v-model="draft.config.native.rpcButton.buttonText" /></label>
              <label>方法名<input v-model="draft.config.native.rpcButton.methodName" /></label>
              <label
                >参数（JSON 或文本）<textarea v-model="draft.config.native.rpcButton.methodParams" rows="4"></textarea>
              </label>
              <label
                >超时（毫秒）<input
                  v-model.number="draft.config.native.rpcButton.requestTimeout"
                  type="number"
                  min="0"
                  max="60000"
              /></label>
              <label
                >调用方式<select v-model="draft.config.native.rpcButton.oneWayElseTwoWay"
                  ><option :value="true">单向请求</option
                  ><option :value="false">双向请求</option></select
                ></label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.rpcButton.styleButton.isRaised" type="checkbox" />按钮阴影</label
              >
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.rpcButton.styleButton.isPrimary"
                  type="checkbox"
                />主按钮配色</label
              >
              <template v-if="!draft.config.native.rpcButton.styleButton.isPrimary">
                <label
                  >按钮背景色<input v-model="draft.config.native.rpcButton.styleButton.bgColor" placeholder="沿用主题"
                /></label>
                <label
                  >按钮文字色<input
                    v-model="draft.config.native.rpcButton.styleButton.textColor"
                    placeholder="沿用主题"
                /></label>
              </template>
            </div>
            <p class="nw-note">预览不会发出 RPC；正式点击才向所选设备发送。单向请求不代表设备执行成功。</p>
          </section>
          <section v-if="draft.config.native.family === 'control'" class="nw-panel">
            <h3>设备控制</h3>
            <div class="nw-fields">
              <label>标题<input v-model="draft.config.native.control.title" /></label>
              <label
                >状态读取<select v-model="draft.config.native.control.retrieveValueMethod"
                  ><option value="rpc">双向 RPC</option
                  ><option value="attribute">属性</option
                  ><option value="timeseries">遥测</option
                  ><option value="none">使用初始值</option></select
                ></label
              >
              <label v-if="draft.config.native.control.retrieveValueMethod === 'rpc'"
                >读取方法<input v-model.trim="draft.config.native.control.getValueMethod"
              /></label>
              <label v-if="['attribute', 'timeseries'].includes(draft.config.native.control.retrieveValueMethod)"
                >状态字段<input v-model.trim="draft.config.native.control.valueKey"
              /></label>
              <label v-if="draft.config.native.control.retrieveValueMethod === 'attribute'"
                >属性范围<select v-model="draft.config.native.control.attributeScope"
                  ><option value="SERVER_SCOPE">服务端</option
                  ><option value="SHARED_SCOPE">共享</option
                  ><option value="CLIENT_SCOPE">客户端</option></select
                ></label
              >
              <label>写入方法<input v-model.trim="draft.config.native.control.setValueMethod" /></label>
              <label
                >超时（毫秒）<input
                  v-model.number="draft.config.native.control.requestTimeout"
                  type="number"
                  min="0"
                  max="60000"
              /></label>
              <label class="nw-check"
                ><input v-model="draft.config.native.control.requestPersistent" type="checkbox" />持久 RPC</label
              >
              <label v-if="draft.config.native.control.requestPersistent"
                >持久轮询（毫秒）<input
                  v-model.number="draft.config.native.control.persistentPollingInterval"
                  type="number"
                  min="1000"
                  max="60000"
              /></label>
              <template v-if="['knob', 'slider', 'stepper'].includes(draft.config.native.control.kind)">
                <label>最小值<input v-model.number="draft.config.native.control.min" type="number" /></label>
                <label>最大值<input v-model.number="draft.config.native.control.max" type="number" /></label>
                <label
                  >步长<input v-model.number="draft.config.native.control.step" type="number" min="0.000001"
                /></label>
                <label
                  >小数位<input v-model.number="draft.config.native.control.decimals" type="number" min="0" max="8"
                /></label>
                <label>单位<input v-model="draft.config.native.control.units" /></label>
                <label class="nw-check"
                  ><input v-model="draft.config.native.control.showValue" type="checkbox" />显示数值</label
                >
              </template>
              <template v-else>
                <label class="nw-check"
                  ><input v-model="draft.config.native.control.showOnOffLabels" type="checkbox" />显示开关文字</label
                >
                <label>开启文字<input v-model="draft.config.native.control.onLabel" /></label>
                <label>关闭文字<input v-model="draft.config.native.control.offLabel" /></label>
              </template>
              <label>开启/主颜色<input v-model="draft.config.native.control.activeColor" type="color" /></label>
              <label>关闭/轨道颜色<input v-model="draft.config.native.control.inactiveColor" type="color" /></label>
            </div>
            <p class="nw-note">预览不会发送 RPC。原生自定义 JavaScript 转换函数不会执行。</p>
          </section>
          <section v-if="draft.config.native.family === 'advancedControl'" class="nw-panel">
            <h3>控制、RPC 与 GPIO</h3>
            <div class="nw-fields">
              <label>标题<input v-model="draft.config.native.advancedControl.title" /></label>
              <label
                v-if="
                  ['actionButton', 'serviceRpc', 'attributeUpdate'].includes(draft.config.native.advancedControl.mode)
                "
                >按钮文字<input v-model="draft.config.native.advancedControl.buttonText"
              /></label>
              <template v-if="['actionButton', 'segment'].includes(draft.config.native.advancedControl.mode)">
                <label
                  >点击动作<select v-model="draft.config.native.advancedControl.actionMode"
                    ><option value="none">不执行</option
                    ><option value="url">打开链接</option></select
                  ></label
                >
                <label v-if="draft.config.native.advancedControl.actionMode === 'url'"
                  >链接<input
                    v-model.trim="draft.config.native.advancedControl.actionTarget"
                    placeholder="/dashboard 或 https://..."
                /></label>
              </template>
              <template v-if="draft.config.native.advancedControl.mode === 'segment'">
                <label>左侧文字<input v-model="draft.config.native.advancedControl.leftLabel" /></label>
                <label>右侧文字<input v-model="draft.config.native.advancedControl.rightLabel" /></label>
                <label class="nw-check"
                  ><input
                    v-model="draft.config.native.advancedControl.initialValue"
                    type="checkbox"
                  />默认选择右侧</label
                >
              </template>
              <template v-if="['gpioControl', 'gpioPanel'].includes(draft.config.native.advancedControl.mode)">
                <label v-if="draft.config.native.advancedControl.mode === 'gpioControl'"
                  >读取方法<input v-model.trim="draft.config.native.advancedControl.readMethod"
                /></label>
                <label v-if="draft.config.native.advancedControl.mode === 'gpioControl'"
                  >写入方法<input v-model.trim="draft.config.native.advancedControl.writeMethod"
                /></label>
                <label v-else
                  >面板背景<input v-model="draft.config.native.advancedControl.panelColor" type="color"
                /></label>
                <div class="nw-span-all">
                  <label>引脚</label>
                  <div v-for="(pin, index) in draft.config.native.advancedControl.pins" :key="index" class="nw-inline">
                    <input v-model.trim="pin.pin" aria-label="引脚编号" placeholder="编号" />
                    <input v-model="pin.label" aria-label="引脚名称" placeholder="名称" />
                    <input v-model="pin.color" aria-label="引脚颜色" type="color" />
                    <button type="button" @click="draft.config.native.advancedControl.pins.splice(index, 1)"
                      >删除</button
                    >
                  </div>
                  <button
                    type="button"
                    @click="
                      draft.config.native.advancedControl.pins.push({
                        pin: '',
                        label: 'GPIO',
                        row: 0,
                        col: 0,
                        color: '#5469ff',
                      })
                    "
                    >添加引脚</button
                  >
                </div>
              </template>
              <template v-if="draft.config.native.advancedControl.mode === 'persistentTable'">
                <label
                  >每页条数<input
                    v-model.number="draft.config.native.advancedControl.pageSize"
                    type="number"
                    min="1"
                    max="100"
                /></label>
                <label class="nw-check"
                  ><input
                    v-model="draft.config.native.advancedControl.allowDelete"
                    type="checkbox"
                  />允许删除请求</label
                >
              </template>
              <template v-if="draft.config.native.advancedControl.mode === 'serviceRpc'">
                <label>RPC 方法<input v-model.trim="draft.config.native.advancedControl.method" /></label>
                <label
                  >参数（JSON 或文本）<textarea
                    v-model="draft.config.native.advancedControl.params"
                    rows="4"
                  ></textarea>
                </label>
                <label class="nw-check"
                  ><input v-model="draft.config.native.advancedControl.isConnector" type="checkbox" />连接器 RPC</label
                >
                <p class="nw-note nw-span-all"
                  >网关命令可填 Ping、Stats 等，运行时加 gateway_ 前缀；连接器模式填写完整方法（如 mqtt_get），连接器 ID
                  放入参数。</p
                >
              </template>
              <template v-if="['rpcTerminal', 'rpcShell'].includes(draft.config.native.advancedControl.mode)">
                <label
                  >最大输出行数<input
                    v-model.number="draft.config.native.advancedControl.maxLines"
                    type="number"
                    min="10"
                    max="1000"
                /></label>
              </template>
              <template v-if="draft.config.native.advancedControl.mode === 'status'">
                <label>读取方法<input v-model.trim="draft.config.native.advancedControl.readMethod" /></label>
                <label>在线文字<input v-model="draft.config.native.advancedControl.onLabel" /></label>
                <label>离线文字<input v-model="draft.config.native.advancedControl.offLabel" /></label>
                <label>在线颜色<input v-model="draft.config.native.advancedControl.onColor" type="color" /></label>
                <label>离线颜色<input v-model="draft.config.native.advancedControl.offColor" type="color" /></label>
              </template>
              <template v-if="draft.config.native.advancedControl.mode === 'attributeUpdate'">
                <label
                  >属性范围<select v-model="draft.config.native.advancedControl.attributeScope"
                    ><option value="SERVER_SCOPE">服务端</option
                    ><option value="SHARED_SCOPE">共享</option
                    ><option value="CLIENT_SCOPE">客户端</option></select
                  ></label
                >
                <label
                  >属性 JSON<textarea v-model="draft.config.native.advancedControl.attributesJson" rows="5"></textarea>
                </label>
              </template>
              <template
                v-if="
                  ['gpioControl', 'rpcTerminal', 'rpcShell', 'serviceRpc', 'status'].includes(
                    draft.config.native.advancedControl.mode,
                  )
                "
              >
                <label
                  >RPC 超时（毫秒）<input
                    v-model.number="draft.config.native.advancedControl.requestTimeout"
                    type="number"
                    min="0"
                    max="60000"
                /></label>
                <label class="nw-check"
                  ><input v-model="draft.config.native.advancedControl.requestPersistent" type="checkbox" />持久
                  RPC</label
                >
              </template>
              <label v-if="['gpioControl', 'rpcShell', 'status'].includes(draft.config.native.advancedControl.mode)"
                >轮询间隔（毫秒）<input
                  v-model.number="draft.config.native.advancedControl.pollingInterval"
                  type="number"
                  min="200"
                  max="60000"
              /></label>
            </div>
            <p class="nw-note">预览不发送 RPC、不写属性、不打开链接；正式运行只执行这里明确配置的声明式动作。</p>
          </section>
          <section v-if="draft.config.native.family === 'wind'" class="nw-panel">
            <h3>风速风向</h3>
            <p class="nw-note">第一个字段是风向角度（°）；第二个字段可选，作为风速。缺少第二个字段时中心显示角度。</p>
            <div class="nw-fields">
              <label
                >布局<select v-model="draft.config.native.wind.layout"
                  ><option value="default">标准</option
                  ><option value="advanced">八方位</option
                  ><option value="simplified">简洁</option></select
                ></label
              >
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.wind.directionalNamesElseDegrees"
                  type="checkbox"
                />刻度显示方位名</label
              >
              <label
                >中心字号<input
                  v-model.number="draft.config.native.wind.centerValueFontSize"
                  type="number"
                  min="8"
                  max="96"
              /></label>
              <label>中心默认颜色<input v-model="draft.config.native.wind.centerValueColor.color" /></label>
              <label>箭头颜色<input v-model="draft.config.native.wind.arrowColor" /></label>
              <label>主刻度颜色<input v-model="draft.config.native.wind.majorTicksColor" /></label>
              <label>副刻度颜色<input v-model="draft.config.native.wind.minorTicksColor" /></label>
              <label>细刻度颜色<input v-model="draft.config.native.wind.ticksColor" /></label>
              <label
                >主刻度字号<input
                  v-model.number="draft.config.native.wind.majorTicksFontSize"
                  type="number"
                  min="8"
                  max="96"
              /></label>
              <label v-if="draft.config.native.wind.layout === 'advanced'"
                >副刻度字号<input
                  v-model.number="draft.config.native.wind.minorTicksFontSize"
                  type="number"
                  min="8"
                  max="96"
              /></label>
              <label
                >背景类型<select v-model="draft.config.native.wind.backgroundType"
                  ><option value="color">颜色</option
                  ><option value="image">原生图片</option></select
                ></label
              >
              <label>背景颜色<input v-model="draft.config.native.wind.backgroundColor" /></label>
              <label v-if="draft.config.native.wind.backgroundType === 'image'"
                >图片引用<input v-model="draft.config.native.wind.backgroundImage"
              /></label>
              <label class="nw-check"
                ><input v-model="draft.config.native.wind.overlayEnabled" type="checkbox" />背景遮罩</label
              >
              <label v-if="draft.config.native.wind.overlayEnabled"
                >遮罩颜色<input v-model="draft.config.native.wind.overlayColor"
              /></label>
              <label v-if="draft.config.native.wind.overlayEnabled"
                >遮罩模糊<input v-model.number="draft.config.native.wind.overlayBlur" type="number" min="0" max="24"
              /></label>
              <label
                >留白<input v-model.number="draft.config.native.wind.padding" type="number" min="0" max="48"
              /></label>
            </div>
            <div v-if="mode === 'advanced'" class="nw-fields">
              <label v-for="(range, index) in draft.config.native.wind.centerValueColor.ranges" :key="index">
                中心颜色区间 {{ index + 1 }}
                <input
                  :value="range.from ?? ''"
                  type="number"
                  placeholder="起点"
                  @input="range.from = optionalNumber($event)"
                />
                <input
                  :value="range.to ?? ''"
                  type="number"
                  placeholder="终点；留空表示无上限"
                  @input="range.to = optionalNumber($event)"
                />
                <input v-model="range.color" placeholder="颜色" />
                <button type="button" @click="draft.config.native.wind.centerValueColor.ranges.splice(index, 1)"
                  >删除</button
                >
              </label>
              <button
                type="button"
                @click="
                  draft.config.native.wind.centerValueColor.ranges.push({ from: null, to: null, color: '#6ce9ff' })
                "
                >添加颜色区间</button
              >
            </div>
          </section>
          <section v-if="draft.config.native.family === 'ledIndicator' && mode === 'basic'" class="nw-panel">
            <h3>LED 指示灯配置</h3>
            <div class="nw-fields">
              <label>标题<input v-model="draft.config.native.ledIndicator.title" /></label>
              <label>亮灯颜色<input v-model="draft.config.native.ledIndicator.ledColor" type="color" /></label>
              <label class="nw-check"
                ><input v-model="draft.config.native.ledIndicator.initialValue" type="checkbox" />初始亮灯</label
              >
              <label
                >读取类型<select v-model="draft.config.native.ledIndicator.retrieveValueMethod"
                  ><option value="attribute">属性</option
                  ><option value="timeseries">遥测</option></select
                ></label
              >
              <label v-if="draft.config.native.ledIndicator.retrieveValueMethod === 'attribute'"
                >属性范围<select v-model="draft.config.native.ledIndicator.attributeScope"
                  ><option value="SERVER_SCOPE">服务端</option
                  ><option value="SHARED_SCOPE">共享</option
                  ><option value="CLIENT_SCOPE">客户端</option></select
                ></label
              >
              <label>值字段键<input v-model.trim="draft.config.native.ledIndicator.valueAttribute" /></label>
              <label class="nw-check"
                ><input v-model="draft.config.native.ledIndicator.performCheckStatus" type="checkbox" />先用 RPC
                检查设备状态</label
              >
              <label v-if="draft.config.native.ledIndicator.performCheckStatus"
                >状态检查方法<input v-model.trim="draft.config.native.ledIndicator.checkStatusMethod"
              /></label>
              <label v-if="draft.config.native.ledIndicator.performCheckStatus"
                >RPC 超时（毫秒）<input
                  v-model.number="draft.config.native.ledIndicator.requestTimeout"
                  type="number"
                  min="0"
                  max="60000"
              /></label>
              <label v-if="draft.config.native.ledIndicator.performCheckStatus" class="nw-check"
                ><input v-model="draft.config.native.ledIndicator.requestPersistent" type="checkbox" />持久 RPC</label
              >
              <label
                v-if="
                  draft.config.native.ledIndicator.performCheckStatus &&
                  draft.config.native.ledIndicator.requestPersistent
                "
                >持久 RPC 轮询间隔（毫秒）<input
                  v-model.number="draft.config.native.ledIndicator.persistentPollingInterval"
                  type="number"
                  min="1000"
                  max="60000"
              /></label>
            </div>
            <p class="nw-note"
              >仅支持原生默认真值解析函数；自定义 JavaScript 解析函数不会执行。预览不会发送状态检查 RPC。</p
            >
          </section>
          <section v-if="photoInput && mode === 'basic'" class="nw-panel">
            <h3>拍照输入配置</h3>
            <div class="nw-fields">
              <label class="nw-check"
                ><input v-model="draft.config.native.photoInput.saveToGallery" type="checkbox" />保存到图片库</label
              >
              <label v-if="draft.config.native.photoInput.saveToGallery" class="nw-check"
                ><input
                  v-model="draft.config.native.photoInput.usePublicGalleryLink"
                  type="checkbox"
                />保存公开图片链接</label
              >
              <label
                >图片格式<select v-model="draft.config.native.photoInput.imageFormat"
                  ><option value="image/png">PNG</option
                  ><option value="image/jpeg">JPEG</option
                  ><option value="image/webp">WebP</option></select
                ></label
              >
              <label
                >图片质量（0–1）<input
                  v-model.number="draft.config.native.photoInput.imageQuality"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
              /></label>
              <label
                >最大宽度（像素）<input
                  v-model.number="draft.config.native.photoInput.maxWidth"
                  type="number"
                  min="1"
                  max="4096"
              /></label>
              <label
                >最大高度（像素）<input
                  v-model.number="draft.config.native.photoInput.maxHeight"
                  type="number"
                  min="1"
                  max="4096"
              /></label>
            </div>
            <p class="nw-note"
              >相机仅在正式部件中由用户主动打开，拍照后须再次点击保存。保存到图片库会创建图片资源，然后把链接写入所选字段。</p
            >
          </section>
          <section v-if="locationSpec && mode === 'basic'" class="nw-panel">
            <h3>位置输入配置</h3>
            <div class="nw-fields">
              <label
                >纬度字段键<input
                  v-model.trim="draft.config.native.locationInput.latKeyName"
                  @change="syncLocationKeys()"
              /></label>
              <label
                >经度字段键<input
                  v-model.trim="draft.config.native.locationInput.lngKeyName"
                  @change="syncLocationKeys()"
              /></label>
              <label>纬度标签<input v-model="draft.config.native.locationInput.latLabel" placeholder="纬度" /></label>
              <label>经度标签<input v-model="draft.config.native.locationInput.lngLabel" placeholder="经度" /></label>
              <label
                >排列<select v-model="draft.config.native.locationInput.inputFieldsAlignment"
                  ><option value="column">纵向</option
                  ><option value="row">横向</option></select
                ></label
              >
              <label
                >必填提示<input
                  v-model="draft.config.native.locationInput.requiredErrorMessage"
                  placeholder="使用默认提示"
              /></label>
              <label class="nw-check"
                ><input v-model="draft.config.native.locationInput.showLabel" type="checkbox" />显示标签</label
              >
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.locationInput.showResultMessage"
                  type="checkbox"
                />显示保存结果</label
              >
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.locationInput.isLatRequired"
                  type="checkbox"
                  :disabled="locationSpec.mode === 'timeseries'"
                />纬度必填</label
              >
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.locationInput.isLngRequired"
                  type="checkbox"
                  :disabled="locationSpec.mode === 'timeseries'"
                />经度必填</label
              >
              <label class="nw-check"
                ><input
                  v-model="draft.config.native.locationInput.showGetLocation"
                  type="checkbox"
                />显示获取当前位置</label
              >
              <label v-if="draft.config.native.locationInput.showGetLocation" class="nw-check"
                ><input
                  v-model="draft.config.native.locationInput.enableHighAccuracy"
                  type="checkbox"
                />高精度定位</label
              >
            </div>
            <p class="nw-note"
              >{{
                locationSpec.mode === 'timeseries'
                  ? '写入经纬度遥测'
                  : '写入' + (locationSpec.scope === 'SERVER_SCOPE' ? '服务端' : '共享') + '经纬度属性'
              }}；浏览器定位仅在正式部件中由用户主动触发，保存前可检查数值。</p
            >
          </section>
          <section v-if="inputSpec && mode === 'basic'" class="nw-panel">
            <h3>输入配置</h3>
            <div class="nw-fields">
              <template v-if="draft.config.native.fqn === 'input_widgets.update_json_attribute'">
                <label
                  >写入目标<select v-model="draft.config.native.input.widgetMode" @change="changeInputTarget"
                    ><option value="ATTRIBUTE">属性</option
                    ><option value="TIME_SERIES">遥测</option></select
                  ></label
                >
                <label v-if="draft.config.native.input.widgetMode === 'ATTRIBUTE'"
                  >属性范围<select v-model="draft.config.native.input.attributeScope" @change="changeInputTarget"
                    ><option value="SERVER_SCOPE">服务端属性</option
                    ><option value="SHARED_SCOPE">共享属性</option></select
                  ></label
                >
              </template>
              <label class="nw-check"
                ><input v-model="draft.config.native.input.showLabel" type="checkbox" />显示字段标签</label
              >
              <label class="nw-check"
                ><input v-model="draft.config.native.input.showResultMessage" type="checkbox" />显示保存结果</label
              >
              <label>标签文本<input v-model="draft.config.native.input.label" placeholder="默认使用字段名称" /></label>
              <template v-if="inputSpec.valueType === 'image'">
                <label class="nw-check"
                  ><input v-model="draft.config.native.input.displayPreview" type="checkbox" />显示图片预览</label
                >
                <label class="nw-check"
                  ><input v-model="draft.config.native.input.displayClearButton" type="checkbox" />允许清除图片</label
                >
                <label class="nw-check"
                  ><input v-model="draft.config.native.input.displayApplyButton" type="checkbox" />显示保存按钮</label
                >
                <label class="nw-check"
                  ><input
                    v-model="draft.config.native.input.displayDiscardButton"
                    type="checkbox"
                  />显示放弃修改按钮</label
                >
              </template>
              <label v-if="['string', 'json'].includes(inputSpec.valueType)" class="nw-check"
                ><input v-model="draft.config.native.input.required" type="checkbox" />必填</label
              >
              <label v-if="inputSpec.valueType === 'date'" class="nw-check"
                ><input v-model="draft.config.native.input.showTimeInput" type="checkbox" />包含时间</label
              >
              <template v-if="['double', 'integer'].includes(inputSpec.valueType)">
                <label
                  >最小值<input
                    :value="draft.config.native.input.min ?? ''"
                    type="number"
                    @input="draft.config.native.input.min = optionalNumber($event)"
                /></label>
                <label
                  >最大值<input
                    :value="draft.config.native.input.max ?? ''"
                    type="number"
                    @input="draft.config.native.input.max = optionalNumber($event)"
                /></label>
              </template>
            </div>
            <p class="nw-note"
              >{{
                inputSpec.mode === 'timeseries'
                  ? '写入遥测'
                  : '写入' + (inputSpec.scope === 'SERVER_SCOPE' ? '服务端' : '共享') + '属性'
              }}；预览不会发送写入请求。</p
            >
          </section>
          <NativeAggregateSettingsEditor
            v-if="draft.config.native.family === 'aggregate' && mode === 'basic'"
            v-model="draft.config.native"
          />
          <template v-if="mode === 'advanced'">
            <section v-if="historical && draft.config.native.family !== 'table'" class="nw-panel"
              ><h3>序列样式</h3>
              <template v-for="ds in sources" :key="ds.entityType + ds.entityId"
                ><details v-for="(key, index) in ds.dataKeys" :key="index" class="nw-series-detail"
                  ><summary>{{ ds.name }} · {{ key.label || key.name }}</summary
                  ><div class="nw-fields">
                    <label v-if="seriesOptions(key).type === 'line'"
                      >线宽<input
                        type="number"
                        min="0"
                        max="20"
                        :value="seriesOptions(key).lineWidth"
                        @input="setSeries(key, 'lineWidth', $event)"
                    /></label>
                    <label
                      v-if="
                        seriesOptions(key).type === 'scatter' ||
                        (seriesOptions(key).type === 'line' && seriesOptions(key).showPoints)
                      "
                      >数据点大小<input
                        type="number"
                        min="1"
                        max="40"
                        :value="seriesOptions(key).pointSize"
                        @input="setSeries(key, 'pointSize', $event)"
                    /></label>
                    <label v-if="seriesOptions(key).type === 'line' && draft.config.native.family !== 'state'"
                      >阶梯线<select :value="String(seriesOptions(key).step)" @change="setSeries(key, 'step', $event)"
                        ><option value="false">关闭</option
                        ><option value="start">起点</option
                        ><option value="middle">中点</option
                        ><option value="end">终点</option></select
                      ></label
                    >
                    <label v-for="field in seriesToggles(key)" :key="field[0]" class="nw-check"
                      ><input
                        type="checkbox"
                        :checked="seriesOptions(key)[field[0]]"
                        @change="setSeries(key, field[0], $event)"
                      />{{ field[1] }}</label
                    >
                  </div></details
                ></template
              >
            </section>
            <section
              v-if="
                [
                  'value',
                  'valueChart',
                  'progress',
                  'gauge',
                  'pie',
                  'bar',
                  'latestBar',
                  'timeseries',
                  'range',
                  'polar',
                ].includes(draft.config.native.family)
              "
              class="nw-panel"
              ><h3
                >数值颜色区间
                <button @click="draft.config.native.thresholds.push({ from: null, to: null, color: '#6ce9ff' })"
                  >添加区间</button
                ></h3
              ><div v-for="(threshold, ti) in draft.config.native.thresholds" :key="ti" class="nw-threshold"
                ><input
                  :value="threshold.from"
                  placeholder="下限（空为无限）"
                  type="number"
                  @input="threshold.from = optionalNumber($event)"
                /><input
                  :value="threshold.to"
                  placeholder="上限（空为无限）"
                  type="number"
                  @input="threshold.to = optionalNumber($event)"
                /><input v-model="threshold.color" type="color" /><button
                  @click="draft.config.native.thresholds.splice(ti, 1)"
                  >删除</button
                ></div
              ></section
            >
            <section class="nw-panel"
              ><h3>刷新</h3
              ><label
                >刷新间隔（毫秒）<input
                  v-model.number="draft.config.native.pollMs"
                  type="number"
                  min="5000"
                  max="300000" /></label
              ><p class="nw-note">实时窗口随当前时间推进，数据按此间隔读取。固定历史只加载一次。</p></section
            >
            <section class="nw-panel"
              ><h3>大屏外观</h3><p class="nw-note">大屏全局玻璃设置优先于单个部件。</p
              ><div class="nw-fields"
                ><label
                  >玻璃底色浓度<input
                    v-model.number="draft.appearance!.backgroundOpacity"
                    type="range"
                    min="0"
                    max="0.7"
                    step="0.01" /></label
                ><label
                  >边框亮度<input
                    v-model.number="draft.appearance!.borderOpacity"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01" /></label
                ><label>圆角<input v-model.number="draft.appearance!.radiusPx" type="range" min="0" max="40" /></label
                ><label>强调色<input v-model="draft.appearance!.accentColor" type="color" /></label></div
            ></section>
          </template>
        </div>
        <p v-else class="nw-error">{{ message || support.reason }}</p>
        <footer
          ><button @click="emit('close')">取消</button
          ><p v-if="draft && message" role="alert" class="nw-error nw-submit-error">{{ message }}</p
          ><div class="nw-footer-actions"
            ><button :disabled="!draft" @click="updatePreview">预览</button
            ><button v-if="!previewOnly && draft" class="nw-primary" @click="confirm">{{
              source?.config?.native ? '应用配置' : '添加'
            }}</button></div
          ></footer
        >
        <div v-if="previewVisible && preview" class="nw-preview-overlay" role="dialog" aria-label="部件预览"
          ><header
            ><strong>预览：{{ preview.title }}</strong
            ><button aria-label="关闭预览" @click="previewVisible = false">×</button></header
          ><div class="nw-preview"
            ><section class="tb-widget-surface" :style="widgetAppearanceStyle(preview.widgetKey, preview.appearance)"
              ><NativeWidgetRenderer :key="preview.id" :config="preview.config" preview-only /></section></div
          ><div class="nw-preview-footer"
            ><button @click="previewVisible = false">返回配置</button
            ><button v-if="!previewOnly" class="nw-primary" @click="confirm">{{
              source?.config?.native ? '应用配置' : '添加'
            }}</button></div
          ></div
        >
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onBeforeUnmount } from 'vue';
  import { useNativeOverlayTarget } from './useNativeOverlayTarget';
  const overlayTarget = useNativeOverlayTarget();
  function selectPopupTarget(): HTMLElement {
    return overlayTarget.value instanceof HTMLElement ? overlayTarget.value : document.body;
  }
  import { createNativeWidget, getNativeWidgetSupport, validateNativeWidget } from './nativeWidgetCatalog';
  import type { NativeSource } from './nativeWidgetTypes';
  import type { DashboardWidget } from '../types';
  import NativeWidgetRenderer from './NativeWidgetRenderer.vue';
  import NativeWidgetSettingsEditor from './NativeWidgetSettingsEditor.vue';
  import NativeStateSettingsEditor from './NativeStateSettingsEditor.vue';
  import NativeLiquidSettingsEditor from './NativeLiquidSettingsEditor.vue';
  import NativeIndicatorSettingsEditor from './NativeIndicatorSettingsEditor.vue';
  import NativeAggregateSettingsEditor from './NativeAggregateSettingsEditor.vue';
  import { Select as ASelect } from 'ant-design-vue';
  import { withNativeSettings, nativeSeriesSettings } from './nativeWidgetSettings';
  import { nativeInputSpec } from './nativeInputCore';
  import { nativeLocationSpec } from './nativeLocationInputCore';
  import { multiKeySettings } from './nativeMultiInputCore';
  import { advancedControlNeedsDevice } from './nativeAdvancedControlCore';
  import { widgetAppearanceStyle } from '../widgets/core/widgetInstance';
  import '../widgets/core/widgetSurface.css';
  import { getTenantDeviceInfoList, getCustomerDeviceInfoList } from '/@/api/tb/device';
  import { getTenantAssetInfoList, getCustomerAssetInfoList } from '/@/api/tb/asset';
  import { getDeviceProfileInfoList } from '/@/api/tb/deviceProfile';
  import { getTimeseriesKeys, getAttributeKeysByScope } from '/@/api/tb/telemetry';
  import { useUserStoreWithOut } from '/@/store/modules/user';

  const props = defineProps<{
    visible: boolean;
    source: Record<string, any>;
    previewOnly?: boolean;
    lockedEntity?: { entityId: string; name?: string };
  }>();
  const emit = defineEmits<{ (e: 'close'): void; (e: 'confirm', widget: DashboardWidget): void }>();
  const draft = ref<DashboardWidget | null>(null),
    preview = ref<DashboardWidget | null>(null),
    mode = ref<'basic' | 'advanced'>('basic'),
    previewVisible = ref(false),
    message = ref('');
  const entityType = ref<'DEVICE' | 'ASSET'>('DEVICE'),
    query = ref(''),
    profileQuery = ref(''),
    profileId = ref(''),
    profiles = ref<any[]>([]),
    entities = ref<any[]>([]),
    page = ref(0),
    hasNext = ref(false),
    loading = ref(false);
  const keyTypes = ref<Record<string, string>>({}),
    availableKeys = ref<Record<string, string[]>>({}),
    keyMessages = ref<Record<string, string>>({}),
    keyLoading = ref<Record<string, boolean>>({});
  const keyRequests: Record<string, number> = {};
  const loadedKeyTypes: Record<string, string> = {};
  let generation = 0,
    searchGeneration = 0,
    profileGeneration = 0;
  const user = useUserStoreWithOut();
  const support = computed(() => getNativeWidgetSupport(props.source));
  const sources = computed(() => (draft.value?.config.datasources || []) as NativeSource[]);
  const indicator = computed(() => ['battery', 'signal'].includes(draft.value?.config.native.family));
  const multiInput = computed(() => draft.value?.config.native.family === 'multiInput');
  const inputSpec = computed(() =>
    nativeInputSpec(draft.value?.config.native.fqn || '', draft.value?.config.native.input),
  );
  const locationSpec = computed(() => nativeLocationSpec(draft.value?.config.native.fqn || ''));
  const photoInput = computed(() => draft.value?.config.native.family === 'photoInput');
  const usesDataSource = computed(() => {
    const family = draft.value?.config.native.family;
    if (!family || ['count', 'alarmTable', 'deviceClaim', 'entityTable'].includes(family)) return false;
    if (family === 'advancedControl')
      return advancedControlNeedsDevice(draft.value!.config.native.advancedControl.mode);
    return true;
  });
  const singleSource = computed(
    () =>
      indicator.value ||
      !!inputSpec.value ||
      !!locationSpec.value ||
      photoInput.value ||
      ['wind', 'rpcButton', 'control', 'advancedControl', 'entityHierarchy', 'ledIndicator'].includes(
        draft.value?.config.native.family,
      ),
  );
  const timeMode = computed({
    get: () =>
      draft.value?.config.native.window.realtime ? 'realtime' : draft.value?.config.native.window.calendar || 'fixed',
    set: (mode: string) => {
      const window = draft.value?.config.native.window;
      if (!window) return;
      window.realtime = mode === 'realtime';
      if (['day', 'week', 'month'].includes(mode)) window.calendar = mode as 'day' | 'week' | 'month';
      else delete window.calendar;
      if (mode === 'fixed' && (!Number.isFinite(window.startTs) || !Number.isFinite(window.endTs))) {
        window.endTs = Date.now();
        window.startTs = window.endTs - window.durationMs;
      }
    },
  });
  const historical = computed(() =>
    ['valueChart', 'timeseries', 'table', 'bar', 'range', 'aggregate', 'state'].includes(
      draft.value?.config.native.family,
    ),
  );
  watch(
    () => [props.visible, props.source],
    () => {
      generation++;
      preview.value = null;
      message.value = '';
      mode.value = 'basic';
      previewVisible.value = false;
      availableKeys.value = {};
      keyMessages.value = {};
      keyLoading.value = {};
      if (!props.visible) return;
      try {
        draft.value = createNativeWidget(props.source);
        draft.value.config.native = withNativeSettings(draft.value.config.native);
      } catch (e: any) {
        draft.value = null;
        message.value = e.message;
        return;
      }
      draft.value.config.showTitle ??= true;
      draft.value.config.native.window.startTs ??= Date.now() - 3600000;
      draft.value.config.native.window.endTs ??= Date.now();
      if (draft.value.config.native.family === 'count' && props.lockedEntity) {
        draft.value.config.native.count.singleEntityId = props.lockedEntity.entityId;
        draft.value.config.native.count.entityType = 'DEVICE';
        draft.value.config.native.count.nameFilter = '';
      }
      if (draft.value.config.native.family === 'alarmTable' && props.lockedEntity)
        draft.value.config.native.alarmTable.singleEntityId = props.lockedEntity.entityId;
      if (
        draft.value.config.native.family === 'entityTable' &&
        draft.value.config.native.fqn === 'cards.entities_table' &&
        props.lockedEntity
      ) {
        draft.value.config.native.entityTable.singleEntityId = props.lockedEntity.entityId;
        draft.value.config.native.entityTable.entityType = 'DEVICE';
      }
      if (
        inputSpec.value?.scope === 'SHARED_SCOPE' ||
        locationSpec.value?.scope === 'SHARED_SCOPE' ||
        ['rpcButton', 'control', 'advancedControl', 'ledIndicator'].includes(draft.value.config.native.family)
      )
        entityType.value = 'DEVICE';
      if (props.lockedEntity && usesDataSource.value) {
        const previous = sources.value.find((s) => s.entityId === props.lockedEntity!.entityId);
        draft.value.config.datasources = [
          previous || {
            type: 'entity',
            entityType: 'DEVICE',
            entityId: props.lockedEntity.entityId,
            name: props.lockedEntity.name,
            dataKeys: [],
          },
        ];
      }
      if (multiInput.value)
        for (const source of sources.value)
          for (const key of source.dataKeys) {
            key.settings ??= {};
            key.settings.nativeMulti = multiKeySettings(key);
          }
      sources.value.forEach((s) => {
        if (locationSpec.value) syncLocationKeys(s);
        keyTypes.value[s.entityId] =
          inputSpec.value?.scope ||
          (s.dataKeys[0]?.type === 'attribute' ? s.dataKeys[0].scope || 'SERVER_SCOPE' : 'timeseries');
        if (
          !['rpcButton', 'control', 'advancedControl', 'entityHierarchy', 'locationInput', 'ledIndicator'].includes(
            draft.value?.config.native.family || '',
          )
        )
          void loadKeys(s);
      });
      if (!props.lockedEntity && usesDataSource.value) {
        void searchEntities(0);
        void loadProfiles();
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
    searchGeneration++;
    profileGeneration++;
  });
  async function searchEntities(nextPage: number) {
    const run = ++searchGeneration,
      session = generation;
    loading.value = true;
    entities.value = [];
    message.value = '';
    try {
      const params: any = {
        page: nextPage,
        pageSize: 20,
        textSearch: query.value,
        sortProperty: 'name',
        sortOrder: 'ASC',
        ...(entityType.value === 'DEVICE' && profileId.value ? { deviceProfileId: profileId.value } : {}),
      };
      const customer = String(user.getPageCacheByKey('customerId', ''));
      const isCustomer = user.getAuthority === 'CUSTOMER_USER';
      if (isCustomer && !customer) throw new Error('当前客户身份不可用，请重新登录');
      const result =
        entityType.value === 'DEVICE'
          ? await (isCustomer ? getCustomerDeviceInfoList(params, customer) : getTenantDeviceInfoList(params))
          : await (isCustomer ? getCustomerAssetInfoList(params, customer) : getTenantAssetInfoList(params));
      if (run !== searchGeneration || session !== generation) return;
      entities.value = result.data || [];
      page.value = nextPage;
      hasNext.value = !!result.hasNext;
    } catch {
      if (run === searchGeneration && session === generation) {
        entities.value = [];
        message.value = '实体列表读取失败，请检查登录和权限后重试';
      }
    } finally {
      if (run === searchGeneration && session === generation) loading.value = false;
    }
  }
  async function loadProfiles() {
    const run = ++profileGeneration,
      session = generation;
    try {
      const result = await getDeviceProfileInfoList({
        page: 0,
        pageSize: 100,
        textSearch: profileQuery.value,
        sortProperty: 'name',
        sortOrder: 'ASC',
      });
      if (run === profileGeneration && session === generation) profiles.value = result.data || [];
    } catch {
      if (session === generation) message.value = '设备配置列表读取失败，仍可按实体名称搜索';
    }
  }
  function addSource(entity: any) {
    if (
      !draft.value ||
      sources.value.length >= (singleSource.value ? 1 : 8) ||
      sources.value.some((source) => source.entityId === entity.id.id && source.entityType === entityType.value)
    )
      return;
    const ds: NativeSource = {
      type: 'entity',
      entityType: entityType.value,
      entityId: entity.id.id,
      name: entity.name,
      dataKeys: [],
    };
    sources.value.push(ds);
    keyTypes.value[ds.entityId] = inputSpec.value?.scope || 'timeseries';
    if (locationSpec.value) syncLocationKeys(ds);
    else if (
      !['rpcButton', 'control', 'advancedControl', 'entityHierarchy', 'ledIndicator'].includes(
        draft.value.config.native.family,
      )
    )
      void loadKeys(ds);
  }
  function syncLocationKeys(source?: NativeSource) {
    if (!locationSpec.value || !draft.value) return;
    const settings = draft.value.config.native.locationInput;
    const spec = locationSpec.value;
    for (const ds of source ? [source] : sources.value) {
      ds.dataKeys = [
        { name: settings.latKeyName.trim(), label: settings.latLabel || '纬度', type: spec.mode, scope: spec.scope },
        { name: settings.lngKeyName.trim(), label: settings.lngLabel || '经度', type: spec.mode, scope: spec.scope },
      ];
    }
  }
  function changeInputTarget() {
    const spec = inputSpec.value;
    if (!spec) return;
    if (spec.scope === 'SHARED_SCOPE') {
      entityType.value = 'DEVICE';
      draft.value!.config.datasources = sources.value.filter((source) => source.entityType === 'DEVICE');
    }
    for (const source of sources.value) {
      source.dataKeys = [];
      keyTypes.value[source.entityId] = spec.scope || 'timeseries';
      void loadKeys(source);
    }
  }
  async function loadKeys(ds: NativeSource) {
    const request = (keyRequests[ds.entityId] || 0) + 1;
    keyRequests[ds.entityId] = request;
    const session = generation,
      kind = keyTypes.value[ds.entityId] || 'timeseries';
    keyLoading.value[ds.entityId] = true;
    availableKeys.value[ds.entityId] = [];
    keyMessages.value[ds.entityId] = '';
    try {
      const entity: any = { id: ds.entityId, entityType: ds.entityType };
      const keys =
        kind === 'timeseries' ? await getTimeseriesKeys(entity) : await getAttributeKeysByScope(entity, kind as any);
      if (session === generation && request === keyRequests[ds.entityId] && kind === keyTypes.value[ds.entityId]) {
        availableKeys.value[ds.entityId] = keys;
        loadedKeyTypes[ds.entityId] = kind;
        keyMessages.value[ds.entityId] = keys.length ? '' : '此范围暂无字段';
      }
    } catch {
      if (session === generation && request === keyRequests[ds.entityId])
        keyMessages.value[ds.entityId] = '字段读取失败，请重试';
    } finally {
      if (session === generation && request === keyRequests[ds.entityId]) keyLoading.value[ds.entityId] = false;
    }
  }
  function addKey(ds: NativeSource, name: string) {
    const kind = keyTypes.value[ds.entityId] || 'timeseries';
    if (
      keyLoading.value[ds.entityId] ||
      loadedKeyTypes[ds.entityId] !== kind ||
      !availableKeys.value[ds.entityId]?.includes(name)
    )
      return;
    const type = kind === 'timeseries' ? 'timeseries' : 'attribute';
    if (ds.dataKeys.some((k) => k.name === name && k.type === type && (k.scope || 'timeseries') === kind)) return;
    const maxKeys = draft.value?.config.native.family === 'wind' ? 2 : singleSource.value ? 1 : 16;
    if (ds.dataKeys.length >= maxKeys) {
      message.value = singleSource.value ? `此部件最多需要 ${maxKeys} 个字段` : '每个数据源最多 16 个字段';
      return;
    }
    ds.dataKeys.push({
      name,
      type,
      scope: type === 'attribute' ? (kind as any) : undefined,
      label: name,
      color: '#6ce9ff',
      units: draft.value?.config.units || '',
      decimals: draft.value?.config.decimals ?? 2,
      ...(multiInput.value
        ? { settings: { nativeMulti: multiKeySettings({ name, type } as NativeSource['dataKeys'][number]) } }
        : {}),
    });
  }
  function multiOptionsText(key: NativeSource['dataKeys'][number]) {
    return (key.settings?.nativeMulti?.selectOptions || [])
      .map((option: { label: string; value: string | null }) => `${option.label}=${option.value ?? ''}`)
      .join('\n');
  }
  function multiSettings(key: NativeSource['dataKeys'][number]) {
    key.settings ??= {};
    return (key.settings.nativeMulti ??= multiKeySettings(key));
  }
  function setMultiOptions(key: NativeSource['dataKeys'][number], event: Event) {
    const text = (event.target as HTMLTextAreaElement).value;
    multiSettings(key).selectOptions = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => {
        const separator = line.indexOf('=');
        return separator < 0
          ? { label: line.trim(), value: line.trim() }
          : {
              label: line.slice(0, separator).trim(),
              value: line.slice(separator + 1).trim() || null,
            };
      });
  }
  function valid() {
    if (!draft.value) return false;
    message.value = validateNativeWidget(draft.value).join('；');
    return !message.value;
  }
  function updatePreview() {
    if (!valid()) return;
    draft.value!.config.title = draft.value!.title;
    preview.value = JSON.parse(JSON.stringify(draft.value));
    preview.value!.id = `preview-${Date.now()}`;
    previewVisible.value = true;
  }
  function confirm() {
    if (!valid()) return;
    draft.value!.config.title = draft.value!.title;
    emit('confirm', JSON.parse(JSON.stringify(draft.value)));
  }
  function selectEntity(id: string) {
    const entity = entities.value.find((entry) => entry.id.id === id);
    if (entity) addSource(entity);
  }
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  function searchOptions(value: string) {
    query.value = value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void searchEntities(0), 250);
  }
  onBeforeUnmount(() => clearTimeout(searchTimer));
  function seriesOptions(key: any) {
    return nativeSeriesSettings(key, draft.value!.config.native);
  }
  function rebindAxis(id: string, replacement: string) {
    for (const source of sources.value)
      for (const key of source.dataKeys) {
        if (seriesOptions(key).axisId === id)
          key.settings = { ...key.settings, native: { ...seriesOptions(key), axisId: replacement } };
      }
  }
  function seriesToggles(key: any) {
    const common = [
      ['hidden', '默认隐藏'],
      ['showLabel', '显示数值标签'],
    ];
    return seriesOptions(key).type === 'line'
      ? [
          ...(draft.value!.config.native.family === 'state' ? [] : [['smooth', '平滑曲线']]),
          ['showPoints', '显示数据点'],
          ['area', '填充面积'],
          ...common,
        ]
      : common;
  }
  function setSeries(key: any, field: string, event: Event) {
    const target = event.target as HTMLInputElement;
    let value: any =
      target.type === 'checkbox' ? target.checked : target.type === 'number' ? Number(target.value) : target.value;
    if (field === 'step' && value === 'false') value = false;
    key.settings = { ...key.settings, native: { ...seriesOptions(key), [field]: value } };
  }
  function durationLabel() {
    const minutes = Number(draft.value?.config.native.window.durationMs) / 60000;
    return minutes >= 1440 ? minutes / 1440 + ' 天' : minutes >= 60 ? minutes / 60 + ' 小时' : minutes + ' 分钟';
  }
  function localDate(ts: number) {
    if (ts == null || !Number.isFinite(ts)) return '';
    const date = new Date(ts);
    return new Date(ts - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function setDate(key: string, event: Event) {
    draft.value!.config.native.window[key] = new Date((event.target as HTMLInputElement).value).getTime();
  }
  function optionalNumber(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    return value === '' ? null : Number(value);
  }
</script>
<style scoped>
  .nw-mask {
    position: fixed;
    inset: 0;
    z-index: 12000;
    background: #13263699;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: #263742;
  }
  .nw-dialog {
    position: relative;
    width: min(1060px, 100%);
    height: min(920px, 94vh);
    display: flex;
    flex-direction: column;
    background: #f3f6f8;
    border-radius: 5px;
    box-shadow: 0 20px 70px #0005;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
    background: #30577f;
    color: white;
    flex-shrink: 0;
    min-height: 64px;
  }
  header strong {
    font-size: 20px;
  }
  .nw-header-actions,
  .nw-footer-actions,
  .nw-inline {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .nw-header-actions > button {
    background: transparent;
    color: white;
    border: 0;
    font-size: 24px;
  }
  .nw-segment {
    display: flex;
    border-radius: 20px;
    background: #26486b;
    padding: 3px;
  }
  .nw-segment button {
    border: 0;
    background: transparent;
    color: #d0dfed;
    border-radius: 20px;
    padding: 5px 14px;
  }
  .nw-segment button.active {
    background: white;
    color: #30577f;
  }
  .nw-content {
    overflow: auto;
    flex: 1;
    min-height: 0;
    padding: 18px;
  }
  .nw-panel {
    background: white;
    padding: 18px;
    border-radius: 5px;
    margin-bottom: 16px;
  }
  h3 {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .nw-tag {
    font-size: 13px;
    font-weight: 400;
    border: 1px solid #d1dae0;
    color: #30577f;
    border-radius: 18px;
    padding: 4px 12px;
  }
  .nw-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 13px;
    color: #566670;
    margin-bottom: 10px;
  }
  input,
  select,
  button {
    font: inherit;
    color: #344857;
    border: 1px solid #d5dce0;
    border-radius: 4px;
    background: white;
    padding: 8px;
    min-width: 0;
    max-width: 100%;
  }
  button {
    cursor: pointer;
    color: #30577f;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  input[type='checkbox'] {
    accent-color: #30577f;
    width: 18px;
    height: 18px;
  }
  input[type='color'] {
    width: 42px;
    min-width: 42px;
    height: 36px;
    padding: 3px;
  }
  .nw-check {
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }
  .nw-primary {
    background: #30577f;
    color: #fff;
    border-color: #30577f;
  }
  .nw-entity-select {
    width: 100%;
  }
  .nw-key-select {
    width: 260px;
    max-width: 100%;
    margin-top: 12px;
  }
  .nw-pages {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    align-items: center;
    margin-top: 8px;
    font-size: 12px;
  }
  .nw-pages button {
    padding: 4px 8px;
  }
  .nw-source-chip {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    background: #eaf0f4;
    border-radius: 18px;
    padding: 4px 10px;
    margin: 8px 8px 0 0;
  }
  .nw-source-chip button {
    border: 0;
    background: transparent;
    padding: 0;
  }
  .nw-source {
    padding: 12px 0;
    border-top: 1px solid #e4e8eb;
  }
  .nw-source-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .nw-note {
    color: #74838e;
    font-size: 12px;
    margin: 10px 0 0;
  }
  .nw-table-scroll {
    overflow: auto;
  }
  .nw-key-table {
    border-collapse: collapse;
    min-width: 680px;
    width: 100%;
    font-size: 13px;
  }
  .nw-key-table th {
    font-weight: 400;
    color: #7a848c;
    text-align: left;
    border-bottom: 1px solid #dde3e7;
    padding: 10px 6px;
  }
  .nw-key-table td {
    padding: 10px 6px;
    border-bottom: 1px solid #edf0f2;
  }
  .nw-key-table input:not([type='color']) {
    width: 100%;
    min-width: 50px;
  }
  .nw-key-table input[type='number'] {
    width: 66px;
  }
  .nw-key-table select {
    max-width: 130px;
  }
  .nw-key-name {
    display: block;
    padding: 6px 10px;
    border-radius: 16px;
    background: #edf0f2;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nw-threshold {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  .nw-threshold input[type='number'] {
    flex: 1;
    width: 100%;
  }
  .nw-time,
  .nw-series-detail {
    border: 1px solid #dfe5e9;
    border-radius: 5px;
    padding: 12px;
  }
  .nw-series-detail {
    margin: 10px 0;
  }
  summary {
    cursor: pointer;
    color: #30577f;
    font-size: 14px;
  }
  details[open] > summary {
    margin-bottom: 18px;
  }
  footer {
    display: flex;
    gap: 16px;
    align-items: center;
    padding: 14px 18px;
    background: white;
    flex-shrink: 0;
    border-top: 1px solid #e2e7ea;
  }
  .nw-footer-actions {
    margin-left: auto;
  }
  .nw-submit-error {
    flex: 1;
    max-height: 70px;
    overflow: auto;
    margin: 0;
  }
  .nw-error {
    color: #b72923;
    font-size: 13px;
    padding: 8px;
  }
  .nw-preview-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: #f3f6f8;
    display: flex;
    flex-direction: column;
  }
  .nw-preview {
    flex: 1;
    min-height: 0;
    padding: 24px;
    background:
      radial-gradient(ellipse at 10% 20%, #236b79, transparent 55%), linear-gradient(125deg, #0b1828, #244533);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nw-preview > section {
    height: 100%;
    max-height: 540px;
    width: 100%;
    padding: 16px;
    overflow: hidden;
  }
  .nw-preview-footer {
    display: flex;
    justify-content: space-between;
    padding: 16px;
  }
  @media (max-width: 650px) {
    .nw-mask {
      padding: 6px;
    }
    .nw-dialog {
      height: 96vh;
    }
    .nw-content {
      padding: 10px;
    }
    .nw-panel {
      padding: 12px;
    }
    .nw-fields {
      grid-template-columns: 1fr;
    }
    header {
      padding: 12px;
    }
    header strong {
      font-size: 16px;
    }
    .nw-source-header {
      flex-direction: column;
      align-items: stretch;
    }
    .nw-preview {
      padding: 12px;
    }
  }
</style>
