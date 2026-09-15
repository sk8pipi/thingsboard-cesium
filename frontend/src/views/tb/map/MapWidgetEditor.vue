<template>
  <div class="mw-editor" :style="templateAppearanceCssVars">
    <SelectDeviceDialog
      :visible="widgetDeviceDialogVisible"
      title="选择部件数据设备"
      ok-text="添加部件"
      @cancel="closeWidgetDeviceDialog"
      @ok="onWidgetDevicePicked"
    />

    <AreaKeyCompareConfigDialog
      :visible="areaKeyCompareConfigVisible"
      :default-title="pendingWidgetTitle || '资产 Key 趋势'"
      @cancel="cancelAreaKeyCompareConfig"
      @ok="confirmAreaKeyCompareConfig"
    />

    <SelectDeviceDialog
      :visible="sensorPointDialogVisible"
      :require-keys="false"
      :device-bindings="pointDeviceBindings"
      title="选择点位设备"
      ok-text="保存点位"
      detail-hint="根据设备配置自动选择图标与详情方式。确认后进入草稿，页面保存后才同步位置。"
      @cancel="cancelPointConfig"
      @ok="onSensorPointConfigured"
    />

    <SelectDeviceDialog
      :visible="cameraPointDialogVisible"
      :require-keys="false"
      :device-bindings="pointDeviceBindings"
      title="绑定监控点位 Device"
      ok-text="保存点位"
      detail-hint="监控点位绑定 ThingsBoard Device，视频通过 Video API 获取。页面保存后才同步所选位置。"
      @cancel="cancelPointConfig"
      @ok="onCameraPointConfigured"
    />

    <div class="mw-editbar">
      <div class="mw-editbar-left">
        <button class="mw-btn" type="button" @click="onExit">退出</button>
      </div>

      <div class="mw-editbar-center">
        <div class="mw-editbar-title">地图部件编辑</div>
        <div class="mw-editbar-mode">
          {{ editorMode === 'view' ? '查看模式' : editorMode === 'pickingPoint' ? '选点模式' : '编辑模式' }}
        </div>
      </div>

      <div class="mw-editbar-right">
        <button v-if="canEditTemplate && editorMode === 'view'" class="mw-btn primary" type="button" @click="enterEdit">
          编辑
        </button>

        <template v-else-if="canEditTemplate">
          <button
            class="mw-btn"
            :class="{ active: editorMode === 'pickingPoint' }"
            type="button"
            :disabled="editorMode !== 'editing' && editorMode !== 'pickingPoint'"
            @click="togglePickingPoint"
          >
            选点
          </button>
          <button class="mw-btn" type="button" :disabled="editorMode !== 'editing'" @click="openAddPanel">
            添加部件
          </button>
          <button class="mw-btn" type="button" :disabled="editorMode !== 'editing'" @click="openRemovedPoints">
            已移除点位（{{ draftExcludedDeviceIds.length }}）
          </button>
          <button
            class="mw-btn"
            :class="{ active: pageSettingsVisible }"
            type="button"
            :disabled="editorMode !== 'editing'"
            @click="togglePageSettingsPanel"
          >
            <Icon icon="ant-design:setting-outlined" :size="15" />
            页面设置
          </button>
          <button
            class="mw-btn"
            :class="{ active: appearancePanelVisible }"
            type="button"
            :disabled="editorMode !== 'editing'"
            @click="toggleAppearancePanel"
          >
            外观
          </button>
          <button
            class="mw-btn"
            :class="{ active: sensorStylePanelVisible }"
            type="button"
            :disabled="editorMode !== 'editing'"
            @click="toggleSensorStylePanel"
          >
            点位自定义
          </button>
          <button class="mw-btn" type="button" @click="cancelEdit">取消</button>
          <button class="mw-btn primary" type="button" :disabled="!canSaveEdit" @click="saveEdit">
            {{ saveFailures.length ? '保存 / 重试同步' : '保存' }}
          </button>
        </template>
      </div>
    </div>

    <div
      ref="stageEl"
      class="mw-stage"
      :class="{ 'mw-stage--compact': mapScreen.metrics.value.compact }"
      :style="mapScreen.cssVars.value"
    >
      <CesiumMap
        ref="cesiumMapRef"
        class="mw-cesium"
        :sensor-points="sensorPoints"
        :camera-points="cameraPoints"
        :mode="cesiumInteractionMode"
        :globe-only="templateGlobeOnly"
        :scene-models="templateScene.models"
        :enable-sensor-type-styles="true"
        :device-profile-styles="effectiveProfileRules"
        :sensor-type-styles-ignore-offline="true"
        :camera-styles-ignore-offline="true"
        :resolution-scale="mapScreen.metrics.value.cesiumResolutionScale"
        :screen-scale="mapScreen.metrics.value.uiScale"
        @sensor-click="onSensorClick"
        @camera-click="onCameraClick"
        @map-click="onMapPicked"
        @pick-error="onPickError"
        @pick-start="errorMsg = ''"
      />

      <div v-if="selectedEditPoint && editorMode === 'editing'" class="mw-point-panel">
        <strong>{{ selectedEditPoint.name }}</strong>
        <div>{{ profileLabel(templateRuntimeDevices[selectedEditPoint.entityId], selectedEditPoint) }}</div>
        <div>{{ locationDescription(selectedEditPoint) }}</div>
        <div
          >经度 {{ formatCoordinate(editPointLocation?.longitude) }}，纬度
          {{ formatCoordinate(editPointLocation?.latitude) }}</div
        >
        <div>椭球高度 {{ formatHeight(editPointLocation?.height) }} m</div>
        <div class="mw-dialog-actions">
          <button class="mw-btn primary" @click="startRelocatingPoint(selectedEditPoint)">重新选点</button>
          <button class="mw-btn" @click="removeDraftPoint(selectedEditPoint.id)">从当前大屏移除</button>
          <button v-if="selectedEditPoint.type === 'sensor'" class="mw-btn" @click="openSelectedSensorConfig"
            >配置数据弹窗</button
          >
          <button class="mw-btn" @click="editPointId = ''">关闭</button>
        </div>
        <label v-if="selectedEditPoint.modelAnchor">
          遮挡方式
          <select :value="selectedEditPoint.modelAnchor.occlusion" @change="changePointOcclusion">
            <option value="physical">正常遮挡</option
            ><option value="alwaysVisible">穿透显示</option>
          </select>
        </label>
      </div>

      <div v-if="removedPointsVisible" class="mw-dialog-mask" @click.self="closeRemovedPoints">
        <div class="mw-dialog-card mw-removed-card">
          <div class="mw-dialog-title">已从当前大屏移除的点位</div>
          <p>设备及业务数据仍然保留。恢复使用设备当前位置，不恢复旧模型绑定。</p>
          <p v-if="removedPointsLoading">正在核对设备权限……</p>
          <p v-else-if="!removedPointEntries.length">没有已移除点位</p>
          <div v-for="entry in removedPointEntries" :key="entry.deviceId" class="mw-removed-entry">
            <span>{{ entry.name }}</span>
            <small v-if="!entry.available">设备已删除、无权访问、读取失败或缺少点位类型</small>
            <div class="mw-dialog-actions">
              <button
                class="mw-btn"
                :disabled="!entry.available || removedPointsLoading"
                @click="restoreRemovedPoint(entry, false)"
                >恢复显示</button
              >
              <button
                class="mw-btn"
                :disabled="!entry.available || removedPointsLoading"
                @click="restoreRemovedPoint(entry, true)"
                >重新选点并恢复</button
              >
            </div>
          </div>
          <div class="mw-dialog-actions"
            ><button class="mw-btn" :disabled="removedPointsLoading" @click="openRemovedPoints">重新加载</button
            ><button class="mw-btn" @click="closeRemovedPoints">关闭</button></div
          >
        </div>
      </div>

      <MapScreenTopBar
        class="mw-top-bar"
        :config="templateTopBar"
        mode="editor"
        :dashboard-title="dashboardTemplate?.title || ''"
        :responsive-height="mapScreen.metrics.value.topBarHeight"
        :screen-scale="mapScreen.metrics.value.uiScale"
      />

      <MapTopBarSettingsPanel
        v-if="canEditTemplate && editorMode === 'editing' && pageSettingsVisible"
        v-model="templateTopBar"
        class="mw-page-settings-panel"
        @close="pageSettingsVisible = false"
      />

      <div v-if="editorMode === 'pickingPoint'" class="mw-mode-banner">
        <div class="mw-mode-banner__text"
          >{{
            relocatingPointId ? '请选择新的安装位置' : '请点击安装位置'
          }}：模型表面自动贴附并跟随，地形位置不绑定模型</div
        >
        <button class="mw-btn" type="button" @click="cancelPickingPoint">取消选点</button>
      </div>

      <div v-if="editorMode === 'editing' && appearancePanelVisible" class="mw-appearance-panel">
        <div class="mw-appearance-panel__header">
          <strong>部件玻璃外观</strong>
          <span>普通部件与点位详情同步</span>
        </div>

        <label class="mw-appearance-control">
          <span>透明度</span>
          <input v-model.number="templateBackgroundTransparency" type="range" min="0" max="100" step="1" />
          <output>{{ templateBackgroundTransparency }}%</output>
        </label>

        <label class="mw-appearance-control">
          <span>模糊度</span>
          <input v-model.number="templateAppearance.blurPx" type="range" min="0" max="40" step="1" />
          <output>{{ templateAppearance.blurPx || 0 }}px</output>
        </label>
      </div>

      <div v-if="sensorStylePanelVisible" class="mw-sensor-style-panel">
        <div class="mw-sensor-style-header">
          <div>
            <strong>点位样式</strong>
            <span>单点自定义优先于当前大屏的设备配置样式，未设置字段继续继承</span>
          </div>
          <button class="mw-panel-close" type="button" @click="sensorStylePanelVisible = false">关闭</button>
        </div>

        <div class="mw-style-tabs" role="tablist" aria-label="点位样式范围">
          <button
            class="mw-style-tab"
            :class="{ active: sensorStyleTab === 'point' }"
            type="button"
            role="tab"
            :aria-selected="sensorStyleTab === 'point'"
            @click="
              sensorStyleTab = 'point';
              ensureSelectedSensorPoint();
            "
          >
            按点位自定义
          </button>
          <button
            class="mw-style-tab"
            :class="{ active: sensorStyleTab === 'type' }"
            type="button"
            role="tab"
            :aria-selected="sensorStyleTab === 'type'"
            @click="
              sensorStyleTab = 'type';
              ensureSelectedSensorDeviceType();
            "
          >
            按设备配置
          </button>
        </div>

        <div v-for="conflict in profileMigration.conflicts" :key="conflict.profileId" class="mw-sensor-style-error">
          {{ conflict.profileName }} 对应多个旧样式，请选择要保留的样式：
          <button
            v-for="key in conflict.legacyKeys"
            :key="key"
            type="button"
            @click="resolveMigrationConflict(conflict.profileId, key)"
            >{{ key }}</button
          >
          <button type="button" @click="resolveMigrationConflict(conflict.profileId, '')">使用默认样式</button>
        </div>
        <div v-if="sensorStyleError" class="mw-sensor-style-error">{{ sensorStyleError }}</div>
        <div v-if="sensorStyleLoading" class="mw-sensor-style-state">正在读取设备配置...</div>

        <div v-else-if="sensorStyleTab === 'type' && !sensorDeviceTypeOptions.length" class="mw-sensor-style-state">
          当前模板还没有设备点位。
        </div>
        <div v-else-if="sensorStyleTab === 'point' && !sensorPointOptions.length" class="mw-sensor-style-state">
          当前模板还没有设备点位。
        </div>

        <div v-else class="mw-sensor-style-content" :class="{ 'is-point-tab': sensorStyleTab === 'point' }">
          <div v-if="sensorStyleTab === 'type'" class="mw-sensor-type-list">
            <button
              v-for="item in sensorDeviceTypeOptions"
              :key="item.key"
              class="mw-sensor-type-item"
              :class="{ active: item.key === selectedSensorDeviceTypeKey }"
              type="button"
              @click="selectedSensorDeviceTypeKey = item.key"
            >
              <span>{{ item.label }}</span>
              <em>{{ item.count }} 个</em>
            </button>
          </div>

          <div v-else class="mw-sensor-type-list">
            <label class="mw-sensor-point-search">
              <input v-model.trim="sensorPointSearch" type="search" placeholder="搜索设备名称或设备配置" />
            </label>
            <button
              v-for="point in filteredSensorPointOptions"
              :key="point.id"
              class="mw-sensor-type-item"
              :class="{ active: point.id === selectedSensorPointId }"
              type="button"
              @click="selectedSensorPointId = point.id"
            >
              <span>{{ point.name }}</span>
              <small>{{ point.deviceTypeLabel }}</small>
              <em v-if="point.customized">已自定义</em>
            </button>
          </div>

          <div class="mw-sensor-style-form">
            <div class="mw-sensor-style-selected">
              <span>{{ sensorStyleTab === 'point' ? '当前点位' : '当前设备配置' }}</span>
              <strong>{{ selectedSensorStyleTargetLabel || '未选择' }}</strong>
              <small>{{ selectedSensorStylePriority }}</small>
            </div>

            <label v-if="sensorStyleTab === 'type'" class="mw-sensor-style-field">
              <span>详情展示方式（每个配置设置一次）</span>
              <select v-model="selectedProfileKind" :disabled="!hasSelectedSensorStyleTarget"
                ><option value="sensor">设备数据详情</option
                ><option value="camera">监控视频详情</option></select
              >
              <small>视频播放仍需要有效的视频绑定与访问权限。</small>
            </label>
            <label v-if="sensorStyleTab === 'type'" class="mw-sensor-style-field">
              <span>内置备用图标</span>
              <select v-model="selectedProfilePreset" :disabled="!hasSelectedSensorStyleTarget"
                ><option
                  v-for="preset in [
                    'temperature',
                    'humidity',
                    'electricity_consumption',
                    'noise',
                    'illuminance',
                    'water_consumption',
                    'camera',
                    'default',
                  ]"
                  :key="preset"
                  :value="preset"
                  >{{ profilePresetLabels[preset] }}</option
                ></select
              >
            </label>
            <label class="mw-sensor-style-field">
              <span>在线颜色</span>
              <input v-model="selectedSensorStyleColor" type="color" :disabled="!hasSelectedSensorStyleTarget" />
            </label>

            <label class="mw-sensor-style-field">
              <span>上传 SVG 图标</span>
              <input
                ref="sensorStyleIconInputEl"
                type="file"
                accept="image/svg+xml,.svg"
                :disabled="!hasSelectedSensorStyleTarget"
                @change="onSensorStyleIconFileChange"
              />
            </label>

            <div class="mw-sensor-style-inline-preview">
              <span>最终效果</span>
              <div class="mw-sensor-style-preview-row">
                <div class="mw-sensor-style-preview-card">
                  <span>在线效果</span>
                  <img
                    v-if="selectedSensorStyleOnlinePreview"
                    :src="selectedSensorStyleOnlinePreview"
                    alt="在线效果预览"
                  />
                </div>
                <div class="mw-sensor-style-preview-card">
                  <span>离线效果</span>
                  <img
                    v-if="selectedSensorStyleOfflinePreview"
                    :src="selectedSensorStyleOfflinePreview"
                    alt="离线效果预览"
                  />
                </div>
              </div>
              <div class="mw-preview-scope">
                <span>影响点位（{{ selectedSensorStyleScopeNames.length }}）</span>
                <div>
                  <small v-for="(name, index) in selectedSensorStyleScopeNames" :key="`${name}-${index}`">{{
                    name
                  }}</small>
                </div>
              </div>
            </div>

            <div class="mw-sensor-style-actions">
              <button v-if="profileMigrationBackup" class="mw-btn" type="button" @click="downloadProfileMigrationBackup"
                >下载迁移前模板</button
              >
              <button
                class="mw-btn"
                type="button"
                :disabled="!hasSelectedSensorStyleTarget"
                @click="resetSelectedSensorStyle"
              >
                {{ sensorStyleTab === 'point' ? '恢复自动样式' : '重置该配置样式' }}
              </button>
              <button class="mw-btn primary" type="button" @click="confirmSensorStylePanel">确认</button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="aggregateConfigVisible" class="mw-dialog-mask" @click.self="cancelAggregateWidgetConfig">
        <div class="mw-dialog-card mw-aggregate-dialog">
          <div class="mw-dialog-title">配置{{ pendingWidgetTitle }}</div>
          <div class="mw-dialog-sub">该 Key 将在模板全部设备中进行聚合，未包含此 Key 的设备会自动忽略。</div>

          <label v-if="isResourceUsageWidget" class="mw-aggregate-field">
            <span>汇总资产</span>
            <select v-model="aggregateAssetId" :disabled="aggregateAssetsLoading" @change="onAggregateAssetChanged">
              <option value="">请选择资产</option>
              <option v-for="asset in aggregateAssetOptions" :key="asset.id" :value="asset.id">
                {{ asset.name }}
              </option>
            </select>
            <small v-if="aggregateAssetsLoading">正在读取资产...</small>
          </label>

          <label class="mw-aggregate-field">
            <span>搜索模板 Key</span>
            <input v-model.trim="aggregateKeySearch" type="search" placeholder="输入 Key 名称筛选" />
          </label>

          <div v-if="aggregateKeysLoading" class="mw-aggregate-key-state"
            >正在读取模板全部设备的 timeseries keys...</div
          >
          <div v-else-if="aggregateKeysError && !aggregateAvailableKeys.length" class="mw-aggregate-key-state is-error">
            {{ aggregateKeysError }}
          </div>
          <div v-else class="mw-aggregate-key-picker">
            <div class="mw-aggregate-key-picker__title">
              <span>模板已有 Keys（{{ aggregateAvailableKeys.length }}）</span>
              <span>已选：{{ aggregateKey || '未选择' }}</span>
            </div>
            <div v-if="filteredAggregateKeys.length" class="mw-aggregate-key-list">
              <button
                v-for="key in filteredAggregateKeys"
                :key="key"
                class="mw-aggregate-key-chip"
                :class="{ active: aggregateKey === key }"
                type="button"
                :aria-pressed="aggregateKey === key"
                @click="aggregateKey = key"
              >
                {{ key }}
              </button>
            </div>
            <div v-else class="mw-aggregate-key-state">没有匹配的 Key</div>
            <div v-if="aggregateKeysError" class="mw-aggregate-key-warning">{{ aggregateKeysError }}</div>
          </div>

          <label v-if="pendingWidgetKey === 'templateKeyTrend'" class="mw-aggregate-field">
            <span>趋势时间范围</span>
            <select v-model.number="aggregateTimeWindowMs">
              <option :value="900000">最近 15 分钟</option>
              <option :value="3600000">最近 1 小时</option>
              <option :value="21600000">最近 6 小时</option>
              <option :value="86400000">最近 24 小时</option>
            </select>
          </label>

          <div class="mw-dialog-actions">
            <button class="mw-btn" type="button" @click="cancelAggregateWidgetConfig">取消</button>
            <button
              class="mw-btn primary"
              type="button"
              :disabled="!aggregateKey || (isResourceUsageWidget && !aggregateAssetId)"
              @click="confirmAggregateWidgetConfig"
            >
              添加部件
            </button>
          </div>
        </div>
      </div>

      <div v-if="pointTypeDialogVisible" class="mw-dialog-mask" @click.self="cancelPointTypeSelection">
        <div class="mw-dialog-card">
          <div class="mw-dialog-title">确认新的点位位置</div>
          <div class="mw-dialog-sub">{{ pendingPointLocation ? locationDescription(pendingPointLocation) : '' }}</div>
          <div class="mw-dialog-sub">
            经度 {{ formatCoordinate(pendingPointLocation?.longitude) }}，纬度
            {{ formatCoordinate(pendingPointLocation?.latitude) }}，椭球高度
            {{ formatHeight(pendingPointLocation?.height) }} m
          </div>
          <div class="mw-dialog-actions">
            <button
              v-if="relocatingPointId || restoringPoint"
              class="mw-btn primary"
              type="button"
              @click="confirmPointLocation"
              >确认位置</button
            >
            <button class="mw-btn" type="button" @click="retryPickingPoint">重新选点</button>
            <button class="mw-btn" type="button" @click="cancelPointTypeSelection">取消</button>
          </div>
        </div>
      </div>

      <SensorPopupWidgetEditor
        :runtime="datasourceRuntime"
        :visible="sensorConfigVisible"
        :sensor="
          selectedSensor
            ? hydrateProfilePoint(
                selectedSensor,
                templateRuntimeDevices[selectedSensor.entityId],
                effectiveProfileRules,
              )
            : null
        "
        :widgets="selectedSensor ? getSensorPopupWidgetsForEditor(selectedSensor.id) : []"
        @changed="handleSensorPopupChanged"
        @close="sensorConfigVisible = false"
        @saved="handleSensorPopupSaved"
      />

      <SensorWidgetPopup
        :runtime="datasourceRuntime"
        :visible="sensorPreviewVisible"
        :sensor="
          selectedSensor
            ? hydrateProfilePoint(
                selectedSensor,
                templateRuntimeDevices[selectedSensor.entityId],
                effectiveProfileRules,
              )
            : null
        "
        :widgets="selectedSensor ? getSensorPopupWidgetsForView(selectedSensor.id) : []"
        :runtime-devices="templateRuntimeDevices"
        @close="sensorPreviewVisible = false"
      />

      <CameraMonitorPopup
        :visible="cameraPopupVisible"
        :runtime-info="selectedCameraRuntime"
        :profile-source="templateRuntimeDevices[selectedCameraRuntime?.entityId || ''] || selectedCameraPoint"
        :loading="cameraRuntimeLoading"
        :error="cameraRuntimeError"
        @close="closeCameraPopup"
      />

      <div
        v-if="editorMode === 'editing' && currentWidget && currentWidget.widgetKey === 'controlSwitch'"
        class="mw-control-editor"
      >
        <ControlSwitchEditor
          :model-value="controlSwitchSettingsModel"
          @update:model-value="updateControlSwitchSettings"
          @save="handleControlSwitchSettingsSave"
        />
      </div>

      <div v-if="canEditTemplate && editorMode === 'editing' && addPanelVisible" class="mw-add-panel">
        <div class="mw-add-title">选择要添加的部件</div>

        <div class="mw-add-list">
          <button class="mw-btn" type="button" @click="nativePickerVisible = true">原生部件库 · Vue 配置</button>
          <input
            ref="fileInputEl"
            type="file"
            accept="application/json"
            style="display: none"
            @change="onImportFileChange"
          />

          <button class="mw-widget-card mw-widget-card--import" type="button" @click="fileInputEl?.click()">
            <div class="mw-widget-preview mw-widget-preview--import">
              <span>JSON</span>
            </div>
            <div class="mw-widget-info">
              <div class="mw-widget-name">导入 ThingsBoard 部件 JSON</div>
              <div class="mw-widget-desc">从导出的 JSON 生成可复用部件</div>
            </div>
          </button>

          <div class="mw-lib-title">内置部件</div>

          <div class="mw-widget-grid">
            <button
              v-for="def in builtInWidgetDefs"
              :key="def.key"
              class="mw-widget-card"
              type="button"
              @click="addWidgetByKey(def.key)"
            >
              <div class="mw-widget-preview">
                <img class="mw-widget-preview-img" :src="getBuiltInPreview(def.key)" :alt="def.title" loading="lazy" />
              </div>
              <div class="mw-widget-info">
                <div class="mw-widget-name" :title="def.title">{{ def.title }}</div>
                <div class="mw-widget-meta">{{ getBuiltInKindLabel(def.key) }}</div>
              </div>
            </button>
          </div>

          <div v-if="libraryDefs.length" class="mw-lib-title">已导入部件</div>

          <div v-if="libraryDefs.length" class="mw-widget-grid">
            <div v-for="def in libraryDefs" :key="def.id" class="mw-widget-card-wrap">
              <button class="mw-widget-card" type="button" @click="addFromLibrary(def)">
                <div class="mw-widget-preview">
                  <img
                    v-if="getLibraryPreview(def)"
                    class="mw-widget-preview-img"
                    :src="getLibraryPreview(def)"
                    :alt="def.name"
                    loading="lazy"
                  />
                  <div v-else class="mw-widget-preview-placeholder">{{ getLibraryKindLabel(def.kind) }}</div>
                </div>
                <div class="mw-widget-info">
                  <div class="mw-widget-name" :title="def.name">{{ def.name }}</div>
                  <div class="mw-widget-meta">{{ getLibraryKindLabel(def.kind) }}</div>
                </div>
              </button>
              <button class="mw-lib-del" type="button" title="删除" @click="deleteFromLibrary(def.id)">删除</button>
            </div>
          </div>

          <div v-if="!libraryDefs.length" class="mw-empty-hint">暂无已导入部件</div>
        </div>

        <div class="mw-add-footer">
          <button class="mw-btn" type="button" @click="addPanelVisible = false">关闭</button>
        </div>
      </div>

      <div
        ref="gridEl"
        class="mw-grid grid-stack"
        :class="{
          'mw-grid--editing': editorMode !== 'view',
          'mw-grid--hidden': shouldHideWidgetLayer,
        }"
        :style="mapScreen.canvasStyle.value"
      ></div>

      <div v-if="dragHint" class="mw-toast">{{ dragHint }}</div>
      <div v-if="errorMsg" class="mw-error">{{ errorMsg }}</div>
      <div v-if="saveStatus" class="mw-save-status" role="status">
        <div>{{ saveStatus }}</div>
        <div v-for="failure in saveFailures" :key="failure.deviceId">{{ failure.name }}：{{ failure.message }}</div>
      </div>
    </div>
    <div v-if="isSavingEdit" class="mw-saving-mask" role="status">正在保存，请勿关闭页面……</div>
    <NativeWidgetPicker
      v-if="editorMode === 'editing' && !isSavingEdit"
      :visible="nativePickerVisible"
      @close="nativePickerVisible = false"
      @confirm="applyNativeWidget"
    />
    <NativeWidgetComposer
      v-if="nativeEditSource && editorMode === 'editing' && !isSavingEdit"
      :visible="true"
      :source="nativeEditSource"
      @close="nativeEditSource = null"
      @confirm="applyNativeWidget"
    />
  </div>
</template>

<script setup lang="ts">
  import NativeWidgetPicker from '../dashboard/runtime/native/NativeWidgetPicker.vue';
  import NativeWidgetComposer from '../dashboard/runtime/native/NativeWidgetComposer.vue';
  import { getNativeWidgetSupport } from '../dashboard/runtime/native/nativeWidgetCatalog';
  import { createProfileBillboardCache } from './services/profileBillboardCache';
  import { subscribeAssignedMapTemplateRuntimeEvents } from './services/mapTemplateRuntimeService';
  import {
    readDeviceProfile,
    profileKey,
    profileLabel,
    hydrateProfilePoint,
    resolveProfilePointStyle,
    defaultProfileRule,
    migrateProfileRules,
    UNKNOWN_PROFILE,
    type DeviceProfileRules,
    type DeviceProfileRule,
  } from './services/deviceProfilePresentation';
  import { computed, createApp, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { getAttributesByScope, getTimeseriesKeys } from '/@/api/tb/telemetry';
  import { getTenantAssetInfoList } from '/@/api/tb/asset';
  import type * as Cesium from 'cesium';
  import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
  import { GridStack } from 'gridstack';
  import 'gridstack/dist/gridstack.min.css';
  import { Icon } from '/@/components/Icon';
  import CesiumMap from './CesiumMap.vue';
  import {
    attachPoint,
    getEffectiveSceneModels,
    assertNoRemovedModelBindings,
    isValidModelAnchor,
  } from './services/mapModelAnchorService';
  import { filterExcludedMapPoints, unifiedDeviceLocationWriteCandidates } from './services/mapPointPositionService';
  import { getDeviceInfoById } from '/@/api/tb/device';
  import SelectDeviceDialog from './SelectDeviceDialog.vue';
  import SensorWidgetPopup from './SensorWidgetPopup.vue';
  import SensorPopupWidgetEditor from './SensorPopupWidgetEditor.vue';
  import CameraMonitorPopup from './components/CameraMonitorPopup.vue';
  import AreaKeyCompareConfigDialog from './AreaKeyCompareConfigDialog.vue';
  import MapScreenTopBar from './components/MapScreenTopBar.vue';
  import MapTopBarSettingsPanel from './components/MapTopBarSettingsPanel.vue';
  import { getMapWidgetStorageKey } from './mapWidgetStorage';
  import { loadMapPoints, saveMapPoints } from './mapPointStorage';
  import {
    getSensorPopupWidgets,
    loadSensorPopupBindings,
    saveSensorPopupBindings,
    type PopupWidgetConfig,
    type SensorPopupBinding,
  } from './sensorPopupWidgetStorage';
  import { loadCameraRuntimeInfo } from './services/cameraDeviceRuntimeService';
  import { releaseCameraVideoSession } from './services/cameraVideoSessionService';
  import {
    applyDeviceInfoMapPointLocations,
    loadDeviceMapPointLocation,
    syncDeviceMapPointLocations,
    type DeviceLocationSyncResult,
  } from './services/deviceMapPointService';
  import { getAssignedMapTemplateRuntime, type MapTemplateRuntimeDevices } from './services/mapTemplateRuntimeService';
  import {
    buildSensorPointBillboard,
    normalizeDeviceTypeStyleKey,
    resolveSensorDeviceType,
    resolveSensorPointStyle,
    UNSET_SENSOR_DEVICE_TYPE_STYLE_KEY,
    type SensorPointIconShape,
    type SensorPointStyleOverride,
  } from './services/sensorPointStyleService';
  import type {
    CameraMapPoint,
    CameraRuntimeInfo,
    DevicePointBindingInfo,
    MapEditorMode,
    MapPoint,
    MapPointLocation,
    MapPickedLocation,
    MapPointType,
    SensorMapPoint,
  } from './types/mapPointTypes';
  import { widgetRegistry } from '../dashboard/runtime/widgets/registry/widgetRegistry';
  import {
    buildWidgetConfig,
    createWidgetInstance,
    listWidgetDefinitions,
    normalizeWidgetRecord,
    resolveWidgetDefinitionKey,
    widgetAppearanceStyleText,
  } from '../dashboard/runtime/widgets/core/widgetInstance';
  import '../dashboard/runtime/widgets/core/widgetSurface.css';
  import type {
    DashboardWidget,
    GridItem,
    LocalWidgetKey,
    TbWidgetConfig,
    WidgetAppearance,
  } from '../dashboard/runtime/types';
  import type { AlarmFocusPayload } from '../dashboard/runtime/widgets/alarm/focus';
  import { importThingsboardJson } from './widgetLibrary/importThingsboardWidget';
  import { loadWidgetLibrary, removeWidget, upsertWidget } from './widgetLibrary/libraryStorage';
  import type { CustomWidgetDefinition } from './widgetLibrary/types';
  import WidgetHost from '../dashboard/runtime/widgets/WidgetHost.vue';
  import { createDatasourceRuntime } from '../dashboard/runtime/datasourceRuntime';
  import ControlSwitchEditor from '../dashboard/runtime/widgets/control/ControlSwitchEditor.vue';
  import { getDashboardById, saveDashboard, type Dashboard } from '/@/api/tb/dashboard';
  import { Authority } from '/@/enums/authorityEnum';
  import { Scope } from '/@/enums/telemetryEnum';
  import { usePermission } from '/@/hooks/web/usePermission';
  import { useUserStore } from '/@/store/modules/user';
  import {
    DASHBOARD_MAP_WIDGET_CONFIG_KEY,
    createDefaultMapTemplateState,
    getMapBusinessPoints,
    toMapBusinessBinding,
    createDefaultMapTopBarConfig,
    DEFAULT_MAP_TEMPLATE_VIEWPORT,
    mapTemplateAppearanceStyle,
    normalizeMapTemplateState,
    resolveMapTemplateViewportForLayout,
    type MapTemplateAppearance,
    type MapTemplateScene,
    type MapTemplateState,
    type MapTemplateViewport,
    type MapTopBarConfig,
    type SensorDeviceTypeStyles,
  } from './mapTemplateConfig';
  import { calculateGridStackCellHeight, useMapScreenResponsive } from './mapScreenResponsive';
  import {
    collectMapTemplateDeviceRefs,
    formatTemplateDeviceNames,
    inspectMapTemplateDeviceAccess,
  } from './mapTemplateDeviceAccess';

  type WidgetData = DashboardWidget & {
    type: LocalWidgetKey;
    config: TbWidgetConfig;
  };

  type WidgetSnapshot = {
    scene: MapTemplateScene;
    layout: GridItem[];
    widgets: Record<string, WidgetData>;
    appearance: WidgetAppearance;
    deviceProfileStyles: DeviceProfileRules;
    topBar: MapTopBarConfig;
    viewport: MapTemplateViewport;
  };

  type MapWidgetEditorState = MapTemplateState;

  type SensorDeviceTypeOption = {
    key: string;
    label: string;
    count: number;
  };

  type SensorPointStyleOption = {
    id: string;
    name: string;
    deviceTypeLabel: string;
    customized: boolean;
  };
  type CesiumMapExpose = {
    getViewer: () => Cesium.Viewer | undefined;
    getPointEntity: (pointId: string) => Cesium.Entity | null;
    flyToPoint: (point: MapPointLocation) => void;
    getResolvedPointLocation: (point: MapPoint) => MapPointLocation;
    clearPickPreview: () => void;
    isCurrentModelPick: (location: MapPickedLocation) => boolean;
    getPointAnchorStatus: (point: MapPoint) => string;
  };
  type RemovedPointEntry = { deviceId: string; name: string; type?: MapPointType; available: boolean };

  function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  function upsertDraftPoint(points: MapPoint[], point: MapPoint) {
    const index = points.findIndex((item) => item.id === point.id);
    if (index >= 0) {
      points[index] = point;
      return;
    }
    points.push(point);
  }

  const router = useRouter();
  const route = useRoute();
  const { hasPermission } = usePermission();
  const userStore = useUserStore();

  const pendingImportedConfig = ref<Record<string, any> | null>(null);
  const pendingWidgetKey = ref<LocalWidgetKey | ''>('');
  const pendingWidgetTitle = ref('');

  const widgetDeviceDialogVisible = ref(false);
  const sensorPointDialogVisible = ref(false);
  const cameraPointDialogVisible = ref(false);
  const aggregateConfigVisible = ref(false);
  const areaKeyCompareConfigVisible = ref(false);
  const aggregateKey = ref('');
  const aggregateKeySearch = ref('');
  const aggregateAvailableKeys = ref<string[]>([]);
  const aggregateKeysLoading = ref(false);
  const aggregateKeysError = ref('');
  const aggregateTimeWindowMs = ref(3600000);
  const aggregateAssetId = ref('');
  const aggregateAssetOptions = ref<Array<{ id: string; name: string }>>([]);
  const aggregateAssetsLoading = ref(false);
  let aggregateKeysRequestId = 0;
  const isResourceUsageWidget = computed(() =>
    ['iotElectricityUsage', 'iotWaterUsage'].includes(pendingWidgetKey.value),
  );
  const filteredAggregateKeys = computed(() => {
    const search = aggregateKeySearch.value.trim().toLowerCase();
    if (!search) return aggregateAvailableKeys.value;
    return aggregateAvailableKeys.value.filter((key) => key.toLowerCase().includes(search));
  });
  const cesiumMapRef = ref<CesiumMapExpose | null>(null);

  const gridEl = ref<HTMLDivElement | null>(null);
  const stageEl = ref<HTMLDivElement | null>(null);
  const fileInputEl = ref<HTMLInputElement | null>(null);
  const sensorStyleIconInputEl = ref<HTMLInputElement | null>(null);
  let grid: any = null;
  let applyingScreenMetrics = false;

  const editorMode = ref<MapEditorMode>('view');
  const addPanelVisible = ref(false);
  const errorMsg = ref('');
  const isSavingEdit = ref(false);
  const dragHint = ref('');
  let dragHintTimer: ReturnType<typeof setTimeout> | null = null;

  const pendingPointLocation = ref<MapPickedLocation | null>(null);
  const editPointId = ref('');
  const relocatingPointId = ref('');
  const restoringPoint = ref<MapPoint | null>(null);
  const removedPointsVisible = ref(false);
  const removedPointsLoading = ref(false);
  const removedPointEntries = ref<RemovedPointEntry[]>([]);
  let pointActionRequest = 0;
  const originalExcludedDeviceIds = ref<string[]>([]);
  const draftExcludedDeviceIds = ref<string[]>([]);
  const originalExcludedPointTypes = ref<Record<string, MapPointType>>({});
  const draftExcludedPointTypes = ref<Record<string, MapPointType>>({});
  const originalExcludedDeviceBindings = ref<MapTemplateState['excludedDeviceBindings']>({});
  const draftExcludedDeviceBindings = ref<MapTemplateState['excludedDeviceBindings']>({});
  // 本次从设备读回的当前位置，仅避免恢复操作重写坐标；不是历史备份。
  const restoredPositionReads = new Map<string, MapPointLocation>();
  let editorDisposed = false;
  const saveStatus = ref('');
  const saveFailures = ref<DeviceLocationSyncResult['failed']>([]);

  const selectedSensor = ref<SensorMapPoint | null>(null);
  const sensorConfigVisible = ref(false);
  const sensorPreviewVisible = ref(false);

  const cameraPopupVisible = ref(false);
  const selectedCameraPoint = ref<CameraMapPoint | null>(null);
  const selectedCameraRuntime = ref<CameraRuntimeInfo | null>(null);
  const cameraRuntimeLoading = ref(false);
  const cameraRuntimeError = ref('');
  let cameraRuntimeRequestId = 0;

  const libraryDefs = ref<CustomWidgetDefinition[]>([]);
  const selectedWidgetId = ref('');

  const layout = ref<GridItem[]>([]);
  const widgets = ref<Record<string, WidgetData>>({});
  let widgetSnapshot: WidgetSnapshot | null = null;
  const dashboardTemplate = ref<Dashboard | null>(null);
  const templateScene = ref<MapTemplateScene>(createDefaultMapTemplateState().scene);
  const templateAppearance = ref<MapTemplateAppearance>({ ...createDefaultMapTemplateState().appearance });
  const templateDeviceProfileStyles = ref<DeviceProfileRules>({});
  const legacyTypeStyles = ref<SensorDeviceTypeStyles>({});
  const profileMigrationBackup = ref<Record<string, any>>();
  const profileMigration = computed(() =>
    migrateProfileRules(
      draftMapPoints.value,
      templateRuntimeDevices.value,
      templateDeviceProfileStyles.value,
      legacyTypeStyles.value,
    ),
  );
  const effectiveProfileRules = computed(() => profileMigration.value.rules);
  const templateTopBar = ref<MapTopBarConfig>(createDefaultMapTopBarConfig());
  const templateViewport = ref<MapTemplateViewport>({ ...DEFAULT_MAP_TEMPLATE_VIEWPORT });
  const appearancePanelVisible = ref(false);
  const sensorStylePanelVisible = ref(false);
  const pageSettingsVisible = ref(false);
  const sensorStyleLoading = ref(false);
  const sensorStyleError = ref('');
  const sensorStyleTab = ref<'point' | 'type'>('point');
  const selectedSensorDeviceTypeKey = ref('');
  const selectedSensorPointId = ref('');
  const sensorPointSearch = ref('');
  const templateAppearanceCssVars = computed(() => mapTemplateAppearanceStyle(templateAppearance.value));
  const responsiveTemplateViewport = computed(() =>
    resolveMapTemplateViewportForLayout(templateViewport.value, layout.value, widgets.value),
  );
  const mapScreen = useMapScreenResponsive(
    stageEl,
    () => responsiveTemplateViewport.value,
    () => templateTopBar.value,
  );
  function applyScreenMetrics() {
    if (!grid) return;
    const metrics = mapScreen.metrics.value;
    applyingScreenMetrics = true;
    if (grid.getColumn() !== metrics.columns) {
      grid.column(metrics.columns, 'move');
    }
    const renderedRows =
      templateViewport.value.mode === 'fixed'
        ? Math.max(metrics.rows, Number(grid.getRow?.()) || 0)
        : Math.max(1, Number(grid.getRow?.()) || metrics.rows);
    const cellHeight = calculateGridStackCellHeight(metrics.canvasHeight, renderedRows);
    grid.cellHeight(Math.round(cellHeight * 100) / 100);
    grid.margin(Math.round(metrics.margin * 100) / 100);
    queueMicrotask(() => {
      applyingScreenMetrics = false;
    });
  }

  watch(
    () => [
      mapScreen.metrics.value.columns,
      mapScreen.metrics.value.cellHeight,
      mapScreen.metrics.value.margin,
      mapScreen.metrics.value.canvasWidth,
      mapScreen.metrics.value.canvasHeight,
    ],
    async () => {
      await nextTick();
      applyScreenMetrics();
    },
  );
  const templateBackgroundTransparency = computed({
    get: () => Math.round((1 - Number(templateAppearance.value.backgroundOpacity ?? 0.04)) * 100),
    set: (value: number) => {
      const transparency = Math.min(100, Math.max(0, Number(value) || 0));
      templateAppearance.value.backgroundOpacity = 1 - transparency / 100;
    },
  });

  const originalMapPoints = ref<MapPoint[]>(loadMapPoints());
  const draftMapPoints = ref<MapPoint[]>(cloneJson(originalMapPoints.value));
  const originalSensorPopupBindings = ref<SensorPopupBinding>(loadSensorPopupBindings());
  const draftSensorPopupBindings = ref<SensorPopupBinding>(cloneJson(originalSensorPopupBindings.value));

  const mountedApps = new Map<string, ReturnType<typeof createApp>>();
  const templateRuntimeDevices = ref<MapTemplateRuntimeDevices>({});
  const datasourceRuntime = createDatasourceRuntime({
    getExternalValues: (_entityType, entityId) => templateRuntimeDevices.value[entityId],
    getEntityName: (_entityType, entityId) =>
      String(
        templateRuntimeDevices.value[entityId]?.entityName ||
          draftMapPoints.value.find((point) => point.entityId === entityId)?.entityName ||
          '',
      ) || undefined,
  });

  let renderPatched = false;

  const builtInWidgetDefs = computed(() =>
    listWidgetDefinitions('dashboard').filter((item) => item.key !== 'cesium3d' && !item.key.startsWith('native_')),
  );
  const nativePickerVisible = ref(false);
  const nativeEditSource = ref<Record<string, any> | null>(null);
  watch(
    () => editorMode.value,
    (mode) => {
      if (mode !== 'editing') {
        nativePickerVisible.value = false;
        nativeEditSource.value = null;
      }
    },
  );
  function applyNativeWidget(widget: DashboardWidget) {
    if (!grid || editorMode.value !== 'editing' || isSavingEdit.value) return;
    const existing = widgets.value[widget.id];
    widgets.value[widget.id] = { ...widget, type: widget.widgetKey } as WidgetData;
    if (existing) renderGrid();
    else {
      const def = widgetRegistry[widget.widgetKey];
      grid.addWidget({
        id: widget.id,
        w: def.dashboardPlacement.width,
        h: def.dashboardPlacement.height,
        content: widgetHtml(widget.id),
      } as any);
      void mountWidget(widget.id, widget.widgetKey);
      syncLayoutFromGrid();
    }
    nativePickerVisible.value = false;
    nativeEditSource.value = null;
    addPanelVisible.value = false;
  }
  const currentWidget = computed(() => {
    if (!selectedWidgetId.value) return null;
    return widgets.value[selectedWidgetId.value] || null;
  });
  const controlSwitchSettingsModel = computed(() => currentWidget.value?.config?.settings as any);
  const activeMapPoints = computed(() =>
    filterExcludedMapPoints(
      editorMode.value === 'view' ? originalMapPoints.value : draftMapPoints.value,
      editorMode.value === 'view' ? originalExcludedDeviceIds.value : draftExcludedDeviceIds.value,
    ),
  );
  const selectedEditPoint = computed(() => {
    const point = draftMapPoints.value.find((item) => item.id === editPointId.value);
    return point
      ? hydrateProfilePoint(point, templateRuntimeDevices.value[point.entityId], effectiveProfileRules.value)
      : undefined;
  });
  const editPointLocation = computed(() =>
    selectedEditPoint.value
      ? cesiumMapRef.value?.getResolvedPointLocation(selectedEditPoint.value) || selectedEditPoint.value
      : null,
  );
  const pointDeviceBindings = computed<DevicePointBindingInfo[]>(() =>
    draftMapPoints.value
      .map(toDevicePointBinding)
      .filter((binding): binding is DevicePointBindingInfo => Boolean(binding)),
  );
  const presentationPoints = computed(() =>
    activeMapPoints.value.map((point) =>
      hydrateProfilePoint(point, templateRuntimeDevices.value[point.entityId], effectiveProfileRules.value),
    ),
  );
  const sensorPoints = computed(() =>
    presentationPoints.value.filter((point): point is SensorMapPoint => point.type === 'sensor'),
  );
  const cameraPoints = computed(() =>
    presentationPoints.value.filter((point): point is CameraMapPoint => point.type === 'camera'),
  );
  function getSensorPointDeviceType(point: MapPoint) {
    return profileKey(readDeviceProfile(templateRuntimeDevices.value[point.entityId], point));
  }
  const sensorDeviceTypeOptions = computed<SensorDeviceTypeOption[]>(() => {
    const options = new Map<string, SensorDeviceTypeOption>();
    for (const point of draftMapPoints.value) {
      const profile = readDeviceProfile(templateRuntimeDevices.value[point.entityId], point);
      const key = profileKey(profile);
      const current = options.get(key);
      if (current) current.count++;
      else options.set(key, { key, label: profileLabel(profile), count: 1 });
    }
    for (const [key, rule] of Object.entries(templateDeviceProfileStyles.value))
      if (!options.has(key)) options.set(key, { key, label: rule.profileName || '暂未使用的设备配置', count: 0 });
    return [...options.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  });
  const sensorPointOptions = computed<SensorPointStyleOption[]>(() =>
    draftMapPoints.value.map((point) => ({
      id: point.id,
      name: point.name || point.entityName,
      deviceTypeLabel: profileLabel(templateRuntimeDevices.value[point.entityId], point),
      customized: Boolean(Object.keys(point.pointStyleOverride || point.sensorStyleOverride || {}).length),
    })),
  );
  const filteredSensorPointOptions = computed(() =>
    sensorPointOptions.value.filter((point) =>
      `${point.name} ${point.deviceTypeLabel}`.toLowerCase().includes(sensorPointSearch.value.trim().toLowerCase()),
    ),
  );
  const selectedSensorDeviceTypeOption = computed(() =>
    sensorDeviceTypeOptions.value.find((item) => item.key === selectedSensorDeviceTypeKey.value),
  );
  const selectedSensorPoint = computed(() =>
    draftMapPoints.value.find((point) => point.id === selectedSensorPointId.value),
  );
  const selectedSensorDeviceTypeStyle = computed<DeviceProfileRule>(
    () => effectiveProfileRules.value[selectedSensorDeviceTypeKey.value] || {},
  );
  const selectedSensorPointStyle = computed<SensorPointStyleOverride>(
    () => selectedSensorPoint.value?.pointStyleOverride || selectedSensorPoint.value?.sensorStyleOverride || {},
  );
  const selectedSensorStyle = computed(() =>
    sensorStyleTab.value === 'point' ? selectedSensorPointStyle.value : selectedSensorDeviceTypeStyle.value,
  );
  const hasSelectedSensorStyleTarget = computed(() =>
    sensorStyleTab.value === 'point'
      ? Boolean(selectedSensorPoint.value)
      : Boolean(selectedSensorDeviceTypeKey.value && selectedSensorDeviceTypeKey.value !== UNKNOWN_PROFILE),
  );
  const selectedSensorStyleTargetLabel = computed(() =>
    sensorStyleTab.value === 'point'
      ? selectedSensorPoint.value?.name || ''
      : selectedSensorDeviceTypeOption.value?.label || '',
  );
  const selectedSensorStylePriority = computed(() =>
    sensorStyleTab.value === 'point' && Object.keys(selectedSensorPointStyle.value).length
      ? '单点自定义（其余字段继承设备配置）'
      : '按设备配置继承样式',
  );
  const selectedSensorStyleScopeNames = computed(() =>
    sensorStyleTab.value === 'point'
      ? [selectedSensorStyleTargetLabel.value]
      : draftMapPoints.value
          .filter((point) => getSensorPointDeviceType(point) === selectedSensorDeviceTypeKey.value)
          .map((point) => point.name + (point.pointStyleOverride || point.sensorStyleOverride ? '（有单点覆盖）' : '')),
  );
  const selectedSensorStyleColor = computed({
    get: () =>
      selectedSensorStyle.value.color ||
      resolveProfilePointStyle(selectedStylePoint(), effectiveProfileRules.value).color,
    set: (color: string) => updateSelectedSensorStyle({ color }),
  });
  const selectedProfileKind = computed({
    get: () => selectedSensorDeviceTypeStyle.value.pointKind || 'sensor',
    set: (pointKind: 'sensor' | 'camera') => updateSelectedSensorStyle({ pointKind }),
  });
  const profilePresetLabels: Record<string, string> = {
    temperature: '温度传感器',
    humidity: '湿度传感器',
    electricity_consumption: '电表',
    noise: '噪声传感器',
    illuminance: '光照传感器',
    water_consumption: '水表',
    camera: '监控设备',
    default: '通用设备',
  };
  const selectedProfilePreset = computed({
    get: () => selectedSensorDeviceTypeStyle.value.preset || 'default',
    set: (preset: DeviceProfileRule['preset']) => updateSelectedSensorStyle({ preset }),
  });
  function selectedStylePoint(): any {
    const point =
      sensorStyleTab.value === 'point'
        ? selectedSensorPoint.value
        : draftMapPoints.value.find((point) => getSensorPointDeviceType(point) === selectedSensorDeviceTypeKey.value);
    return point
      ? hydrateProfilePoint(
          sensorStyleTab.value === 'type'
            ? { ...point, pointStyleOverride: undefined, sensorStyleOverride: undefined }
            : point,
          templateRuntimeDevices.value[point.entityId],
          effectiveProfileRules.value,
        )
      : {
          deviceProfileId: selectedSensorDeviceTypeKey.value,
          deviceProfileName: selectedSensorDeviceTypeOption.value?.label,
        };
  }
  const selectedSensorStyleOnlinePreview = computed(() => buildSensorStylePreview(true));
  const selectedSensorStyleOfflinePreview = computed(() => buildSensorStylePreview(false));
  const profileImageVersion = ref(0);
  const previewBillboards = createProfileBillboardCache(() => profileImageVersion.value++);
  function buildSensorStylePreview(online: boolean) {
    void profileImageVersion.value;
    return previewBillboards.get(resolveProfilePointStyle(selectedStylePoint(), effectiveProfileRules.value), online);
  }
  function ensureSelectedSensorDeviceType() {
    if (!sensorDeviceTypeOptions.value.some((item) => item.key === selectedSensorDeviceTypeKey.value))
      selectedSensorDeviceTypeKey.value = sensorDeviceTypeOptions.value[0]?.key || '';
  }
  function ensureSelectedSensorPoint() {
    if (!sensorPointOptions.value.some((item) => item.id === selectedSensorPointId.value))
      selectedSensorPointId.value = sensorPointOptions.value[0]?.id || '';
  }
  function updateSelectedSensorStyle(patch: DeviceProfileRule) {
    if (sensorStyleTab.value === 'point') {
      draftMapPoints.value = draftMapPoints.value.map((point) =>
        point.id !== selectedSensorPointId.value
          ? point
          : {
              ...point,
              pointStyleOverride: {
                ...(point.sensorStyleOverride || {}),
                ...(point.pointStyleOverride || {}),
                ...patch,
              },
            },
      );
    } else {
      const key = selectedSensorDeviceTypeKey.value;
      if (!key || key === UNKNOWN_PROFILE) return;
      templateDeviceProfileStyles.value = {
        ...effectiveProfileRules.value,
        [key]: { ...selectedSensorDeviceTypeStyle.value, ...patch },
      };
    }
  }
  function resolveMigrationConflict(profileId: string, legacyKey: string) {
    const point = draftMapPoints.value.find((point) => getSensorPointDeviceType(point) === profileId);
    if (!point) return;
    const profile = readDeviceProfile(templateRuntimeDevices.value[point.entityId], point);
    templateDeviceProfileStyles.value = {
      ...templateDeviceProfileStyles.value,
      [profileId]: { ...defaultProfileRule(profile), ...(legacyTypeStyles.value[legacyKey] || {}) },
    };
  }
  async function syncSensorDeviceTypesFromClientAttributes() {
    sensorStyleLoading.value = true;
    try {
      await refreshTemplateRuntime();
      const missing = draftMapPoints.value.filter(
        (point) => !readDeviceProfile(templateRuntimeDevices.value[point.entityId], point).deviceProfileId,
      );
      // New, unsaved points are not in the server template yet. Reuse device-info requests only for those points.
      for (const point of missing) {
        try {
          const info = await getDeviceInfoById(point.entityId);
          templateRuntimeDevices.value = {
            ...templateRuntimeDevices.value,
            [point.entityId]: {
              ...(templateRuntimeDevices.value[point.entityId] || {}),
              entityMetadata: readDeviceProfile(info),
            },
          };
        } catch {
          /* Keep explicit unavailable state. */
        }
      }
      sensorStyleError.value = profileMigration.value.missing.length
        ? `${profileMigration.value.missing.length} 个点位的设备配置暂不可用，可重试刷新。`
        : '';
    } finally {
      sensorStyleLoading.value = false;
      ensureSelectedSensorDeviceType();
      ensureSelectedSensorPoint();
    }
  }
  function openSensorStylePanel() {
    if (editorMode.value === 'view') return;
    if (editorMode.value !== 'editing') editorMode.value = 'editing';
    addPanelVisible.value = false;
    appearancePanelVisible.value = false;
    pageSettingsVisible.value = false;
    sensorStylePanelVisible.value = true;
    ensureSelectedSensorDeviceType();
    ensureSelectedSensorPoint();
    void syncSensorDeviceTypesFromClientAttributes();
  }
  function toggleSensorStylePanel() {
    if (sensorStylePanelVisible.value) sensorStylePanelVisible.value = false;
    else openSensorStylePanel();
  }

  function parseSvgIcon(text: string): SensorPointIconShape {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const parseError = doc.querySelector('parsererror');
    const svg = doc.querySelector('svg');
    if (parseError || !svg) throw new Error('请上传有效的 SVG 图标。');
    const viewBox = svg.getAttribute('viewBox') || '0 0 1024 1024';
    const paths = Array.from(svg.querySelectorAll('path'))
      .map((path) => String(path.getAttribute('d') || '').trim())
      .filter(Boolean)
      .slice(0, 80);
    if (!paths.length) throw new Error('SVG 中没有可用的 path，当前仅支持 path 图标。');
    return { viewBox, paths };
  }

  async function onSensorStyleIconFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      updateSelectedSensorStyle({ icon: parseSvgIcon(await file.text()) });
      sensorStyleError.value = '';
    } catch (error: any) {
      sensorStyleError.value = error?.message || 'SVG 图标解析失败。';
    } finally {
      input.value = '';
    }
  }

  function resetSelectedSensorStyle() {
    if (sensorStyleTab.value === 'point') {
      const pointId = selectedSensorPointId.value;
      if (!pointId) return;
      draftMapPoints.value = draftMapPoints.value.map((point) => {
        if (point.id !== pointId) return point;
        const { sensorStyleOverride: _sensorStyleOverride, pointStyleOverride: _pointStyleOverride, ...rest } = point;
        return rest as SensorMapPoint;
      });
      return;
    }

    const key = selectedSensorDeviceTypeKey.value;
    if (!key) return;
    const next = { ...templateDeviceProfileStyles.value };
    const current = effectiveProfileRules.value[key];
    next[key] = { profileName: current?.profileName, preset: current?.preset, pointKind: current?.pointKind };
    templateDeviceProfileStyles.value = next;
  }

  function downloadProfileMigrationBackup() {
    if (!profileMigrationBackup.value) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(profileMigrationBackup.value, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'map-template-before-profile-migration.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function confirmSensorStylePanel() {
    sensorStylePanelVisible.value = false;
  }
  const canSaveEdit = computed(
    () => !isSavingEdit.value && !removedPointsLoading.value && canEditTemplate.value && editorMode.value === 'editing',
  );
  const dashboardId = computed(() => String(route.query.dashboardId || ''));
  const isDashboardTemplateMode = computed(() => Boolean(dashboardId.value));
  const canEditTemplate = computed(() => isDashboardTemplateMode.value && hasPermission(Authority.TENANT_ADMIN));
  const templateGlobeOnly = computed(() =>
    isDashboardTemplateMode.value ? templateScene.value.globeOnly !== false : false,
  );
  const effectiveAnchorModels = computed(() =>
    getEffectiveSceneModels(templateScene.value.models, templateGlobeOnly.value),
  );
  const cesiumInteractionMode = computed(() => (editorMode.value === 'pickingPoint' ? 'pickPoint' : 'default'));
  const pointTypeDialogVisible = computed(() => editorMode.value === 'selectingPointType');
  const shouldHideWidgetLayer = computed(() =>
    ['pickingPoint', 'selectingPointType', 'configuringSensorPoint', 'configuringCameraPoint'].includes(
      editorMode.value,
    ),
  );

  const widgetPreviewByKey: Partial<Record<LocalWidgetKey, string>> = {
    timeseriesLine: createWidgetPreviewSvg('Line', 'line', '#2563eb', '#22c55e'),
    timeseriesScatter: createWidgetPreviewSvg('Scatter', 'scatter', '#2563eb', '#f59e0b'),
    timeseriesBarWithLabels: createWidgetPreviewSvg('Bar', 'bar', '#0f766e', '#38bdf8'),
    rangeChart: createWidgetPreviewSvg('Range', 'area', '#7c3aed', '#f59e0b'),
    stateChart: createWidgetPreviewSvg('State', 'step', '#0891b2', '#84cc16'),
    latestPie: createWidgetPreviewSvg('Pie', 'pie', '#7c3aed', '#f97316'),
    latestBar: createWidgetPreviewSvg('Bar', 'bar', '#2563eb', '#f59e0b'),
    latestRadar: createWidgetPreviewSvg('Radar', 'radar', '#0f766e', '#22c55e'),
    latestPolarArea: createWidgetPreviewSvg('Polar', 'pie', '#be185d', '#38bdf8'),
    ledIndicator: createWidgetPreviewSvg('LED', 'led', '#16a34a', '#facc15'),
    staticHtml: createWidgetPreviewSvg('HTML', 'static', '#475569', '#38bdf8'),
    alarmTable: createWidgetPreviewSvg('Alarm Table', 'table', '#dc2626', '#f97316'),
    alarmCard: createWidgetPreviewSvg('Alarm Card', 'card', '#dc2626', '#f59e0b'),
    alarmTrend: createWidgetPreviewSvg('报警趋势', 'bar', '#38bdf8', '#7dd3fc'),
    controlSwitch: createWidgetPreviewSvg('Switch', 'switch', '#0284c7', '#22c55e'),
    templateDeviceOverview: createWidgetPreviewSvg('Device Overview', 'card', '#0284c7', '#22c55e'),
    templateAlarmOverview: createWidgetPreviewSvg('Alarm Overview', 'card', '#dc2626', '#f59e0b'),
    templateKeyAggregate: createWidgetPreviewSvg('Key Aggregate', 'card', '#0e7490', '#38bdf8'),
    templateKeyTrend: createWidgetPreviewSvg('Key Trend', 'line', '#2563eb', '#22c55e'),
    templateStatusDistribution: createWidgetPreviewSvg('Status Distribution', 'pie', '#16a34a', '#ef4444'),
  };

  function getBuiltInPreview(key: LocalWidgetKey) {
    return widgetPreviewByKey[key] || createWidgetPreviewSvg('閮ㄤ欢', 'card', '#2563eb', '#22c55e');
  }

  function getBuiltInKindLabel(key: LocalWidgetKey) {
    const def = widgetRegistry[key];
    if (!def) return 'Widget';

    const map: Record<string, string> = {
      timeseries: 'Timeseries',
      latest: 'Latest',
      alarm: '报警部件',
      aggregate: 'Aggregate',
      control: 'Control',
      static: 'Static',
    };
    return map[def.category] || 'Widget';
  }

  function getLibraryKindLabel(kind?: string) {
    const map: Record<string, string> = {
      chart: 'Chart',
      pie: 'Pie',
      bar: 'Bar',
      static: 'Static',
      cesium3d: '3D Map',
      native: 'Vue 基础适配',
      unknown: '待适配（保留原始定义）',
    };
    return map[String(kind || 'unknown')] || String(kind || 'Imported Widget');
  }

  function getLibraryPreview(def: CustomWidgetDefinition) {
    const rawImage =
      def.raw?.image ||
      def.raw?.previewImage ||
      def.raw?.widget?.image ||
      def.raw?.widgetType?.image ||
      def.raw?.descriptor?.image ||
      def.tb?.raw?.image;

    return resolveWidgetPreviewImage(rawImage) || createWidgetPreviewSvg(def.name, def.kind, '#2563eb', '#22c55e');
  }

  function resolveWidgetPreviewImage(image?: string) {
    if (!image || typeof image !== 'string') return '';
    const value = image.trim();
    if (!value || value.startsWith('tb-image;')) return '';
    if (value.startsWith('data:')) return value;
    if (/^(https?:|blob:|\/)/.test(value)) return value;
    if (value.startsWith('<svg')) {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
    }
    return `data:image/png;base64,${value}`;
  }

  function createWidgetPreviewSvg(label: string, kind: string, primary: string, accent: string) {
    const safeLabel = escapeSvgText(label || 'Widget');
    const normalizedKind = String(kind || '').toLowerCase();
    const chartShape = getPreviewShape(normalizedKind, primary, accent);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
        <rect width="320" height="180" rx="16" fill="#f8fafc"/>
        <rect x="18" y="18" width="284" height="144" rx="14" fill="#ffffff" stroke="#dbe3ef"/>
        <text x="160" y="45" fill="#172033" font-family="Arial, sans-serif" font-size="18" font-weight="700" text-anchor="middle">${safeLabel}</text>
        ${chartShape}
      </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function getPreviewShape(kind: string, primary: string, accent: string) {
    if (kind.includes('pie')) {
      return `
        <circle cx="160" cy="104" r="42" fill="${primary}" opacity=".9"/>
        <path d="M160 104 L160 62 A42 42 0 0 1 199 120 Z" fill="${accent}"/>
        <circle cx="160" cy="104" r="18" fill="#fff" opacity=".95"/>
      `;
    }

    if (kind.includes('bar')) {
      return `
        <rect x="92" y="106" width="24" height="34" rx="5" fill="${accent}"/>
        <rect x="128" y="82" width="24" height="58" rx="5" fill="${primary}"/>
        <rect x="164" y="96" width="24" height="44" rx="5" fill="${accent}" opacity=".78"/>
        <rect x="200" y="70" width="24" height="70" rx="5" fill="${primary}" opacity=".78"/>
      `;
    }

    if (kind.includes('scatter')) {
      return `
        <circle cx="96" cy="124" r="8" fill="${accent}"/>
        <circle cx="126" cy="96" r="7" fill="${primary}"/>
        <circle cx="164" cy="116" r="9" fill="${accent}" opacity=".8"/>
        <circle cx="204" cy="78" r="8" fill="${primary}" opacity=".85"/>
        <circle cx="232" cy="108" r="7" fill="${accent}"/>
      `;
    }

    if (kind.includes('switch')) {
      return `
        <rect x="94" y="82" width="132" height="54" rx="27" fill="${primary}" opacity=".9"/>
        <circle cx="198" cy="109" r="22" fill="#fff"/>
        <path d="M117 109 h48" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>
      `;
    }

    if (kind.includes('led')) {
      return `
        <circle cx="160" cy="104" r="38" fill="${accent}" opacity=".95"/>
        <circle cx="148" cy="90" r="11" fill="#fff" opacity=".75"/>
        <path d="M118 146 h84" stroke="${primary}" stroke-width="8" stroke-linecap="round"/>
      `;
    }

    if (kind.includes('table')) {
      return `
        <rect x="78" y="70" width="164" height="74" rx="8" fill="#f8fafc" stroke="${primary}" stroke-width="3"/>
        <path d="M78 94 H242 M78 118 H242 M120 70 V144 M184 70 V144" stroke="${accent}" stroke-width="3" opacity=".85"/>
      `;
    }

    if (kind.includes('static') || kind.includes('card')) {
      return `
        <rect x="86" y="70" width="148" height="74" rx="10" fill="#f8fafc" stroke="${primary}" stroke-width="3"/>
        <path d="M108 94 H212 M108 116 H184" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>
      `;
    }

    return `
      <path d="M70 128 C106 86 132 122 160 92 S218 68 250 108" fill="none" stroke="${primary}" stroke-width="10" stroke-linecap="round"/>
      <path d="M70 140 H250" stroke="#dbe3ef" stroke-width="4" stroke-linecap="round"/>
      <circle cx="160" cy="92" r="8" fill="${accent}"/>
    `;
  }

  function escapeSvgText(text: string) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function patchGridstackRenderOnce() {
    if (renderPatched) return;
    renderPatched = true;
    GridStack.renderCB = (el, widget) => {
      const html = (widget as any)?.content ?? '';
      el.innerHTML = String(html);
    };
  }

  function reloadLibrary() {
    libraryDefs.value = loadWidgetLibrary();
  }

  function widgetStorageKey() {
    return getMapWidgetStorageKey();
  }

  function normalizeWidgetState(rawWidgets: unknown): Record<string, WidgetData> {
    return normalizeWidgetRecord(rawWidgets) as Record<string, WidgetData>;
  }

  function applyEditorState(state?: Partial<MapWidgetEditorState> | null) {
    const normalized = normalizeMapTemplateState(state);
    templateScene.value = cloneJson(normalized.scene);
    templateAppearance.value = cloneJson(normalized.appearance);
    templateDeviceProfileStyles.value = cloneJson(normalized.deviceProfileStyles);
    legacyTypeStyles.value = cloneJson(normalized.sensorDeviceTypeStyles);
    profileMigrationBackup.value = normalized.profileMigrationBackup;
    templateTopBar.value = cloneJson(normalized.topBar);
    templateViewport.value = cloneJson(normalized.viewport);
    layout.value = normalized.layout;
    widgets.value = normalizeWidgetState(normalized.widgets);
    originalMapPoints.value = cloneJson(normalized.mapPoints);
    originalExcludedDeviceIds.value = [...normalized.excludedDeviceIds];
    draftExcludedDeviceIds.value = [...normalized.excludedDeviceIds];
    originalExcludedPointTypes.value = { ...normalized.excludedPointTypes };
    draftExcludedPointTypes.value = { ...normalized.excludedPointTypes };
    originalExcludedDeviceBindings.value = cloneJson(normalized.excludedDeviceBindings);
    draftExcludedDeviceBindings.value = cloneJson(normalized.excludedDeviceBindings);
    originalMapPoints.value = filterExcludedMapPoints(originalMapPoints.value, normalized.excludedDeviceIds);
    draftMapPoints.value = cloneJson(originalMapPoints.value);
    originalSensorPopupBindings.value = cloneJson(normalized.sensorPopupBindings);
    draftSensorPopupBindings.value = cloneJson(originalSensorPopupBindings.value);
  }

  function getEditorState(): MapWidgetEditorState {
    return {
      ...createDefaultMapTemplateState(),
      version: 8,
      sensorDeviceTypeStyles: cloneJson(legacyTypeStyles.value),
      profileMigrationBackup: profileMigrationBackup.value,
      scene: cloneJson(templateScene.value),
      appearance: cloneJson(templateAppearance.value),
      deviceProfileStyles: cloneJson(effectiveProfileRules.value),
      topBar: cloneJson(templateTopBar.value),
      viewport: cloneJson(templateViewport.value),
      layout: cloneJson(layout.value),
      widgets: cloneJson(widgets.value),
      excludedDeviceIds: [...draftExcludedDeviceIds.value],
      excludedPointTypes: { ...draftExcludedPointTypes.value },
      excludedDeviceBindings: cloneJson(draftExcludedDeviceBindings.value),
      mapPoints: cloneJson(
        filterExcludedMapPoints(draftMapPoints.value, draftExcludedDeviceIds.value)
          .map((rawPoint) =>
            hydrateProfilePoint(rawPoint, templateRuntimeDevices.value[rawPoint.entityId], effectiveProfileRules.value),
          )
          .map((point) => {
            if (!isValidModelAnchor(point.modelAnchor)) return point;
            if (cesiumMapRef.value?.getPointAnchorStatus(point) !== 'attached') return point;
            const location = cesiumMapRef.value?.getResolvedPointLocation(point) || point;
            const fallback = {
              longitude: location.longitude,
              latitude: location.latitude,
              height: location.height ?? 0,
            };
            return {
              ...point,
              ...fallback,
              heightMode: 'absolute',
              modelAnchor: { ...point.modelAnchor, fallbackWorldPosition: fallback },
            };
          }),
      ),
      sensorPopupBindings: cloneJson(draftSensorPopupBindings.value),
    };
  }

  function loadWidgetsFromLocal() {
    try {
      const raw = localStorage.getItem(widgetStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);

      layout.value = Array.isArray(parsed?.layout) ? parsed.layout : [];
      widgets.value = normalizeWidgetState(parsed?.widgets);
    } catch (error) {
      console.warn('load map widgets failed', error);
    }
  }

  function saveWidgetsToLocal(state = getEditorState()) {
    localStorage.setItem(
      widgetStorageKey(),
      JSON.stringify({
        layout: state.layout,
        widgets: state.widgets,
      }),
    );
  }

  async function loadEditorState() {
    if (isDashboardTemplateMode.value) {
      assertTenantAdminAccess();
      const dashboard = await getDashboardById(dashboardId.value);
      assertDashboardTenantOwnership(dashboard);
      dashboardTemplate.value = dashboard;
      applyEditorState(dashboard.configuration?.[DASHBOARD_MAP_WIDGET_CONFIG_KEY]);
      return;
    }

    loadWidgetsFromLocal();
    applyEditorState({
      layout: layout.value,
      widgets: widgets.value,
      mapPoints: loadMapPoints(),
      sensorPopupBindings: loadSensorPopupBindings(),
    });
    originalMapPoints.value = await applyDeviceInfoMapPointLocations(originalMapPoints.value);
    draftMapPoints.value = cloneJson(originalMapPoints.value);
  }

  function applyTemplateRuntimeDevices(devices?: MapTemplateRuntimeDevices | null) {
    templateRuntimeDevices.value = devices || {};
    datasourceRuntime.refreshExternalValues();
    if (isDashboardTemplateMode.value && editorMode.value === 'view') {
      draftMapPoints.value = cloneJson(originalMapPoints.value);
    }
  }

  let stopProfileRuntime: (() => void) | undefined;
  let profileRuntimeDashboard = '';
  async function refreshTemplateRuntime() {
    if (!isDashboardTemplateMode.value || !dashboardId.value) {
      applyTemplateRuntimeDevices({});
      return;
    }

    try {
      const target = dashboardId.value;
      const runtime = await getAssignedMapTemplateRuntime(target);
      if (editorDisposed || target !== dashboardId.value) return;
      applyTemplateRuntimeDevices(runtime.devices);
      if (profileRuntimeDashboard !== target) {
        stopProfileRuntime?.();
        profileRuntimeDashboard = target;
        stopProfileRuntime = subscribeAssignedMapTemplateRuntimeEvents(target, (event) => {
          if (!editorDisposed && dashboardId.value === target) applyTemplateRuntimeDevices(event.devices);
        });
      }
    } catch (error) {
      applyTemplateRuntimeDevices({});
      console.warn('[MapWidgetEditor] Failed to load template runtime data:', error);
    }
  }

  function assertTenantAdminAccess(targetDashboardId = dashboardId.value) {
    if (!hasPermission(Authority.TENANT_ADMIN)) {
      throw new Error('\u53ea\u6709\u79df\u6237\u7ba1\u7406\u5458\u53ef\u4ee5\u7f16\u8f91\u7528\u6237\u5927\u5c4f');
    }
    if (!targetDashboardId) {
      throw new Error('\u7f3a\u5c11\u5927\u5c4f\u6a21\u677f dashboardId');
    }
  }

  function assertDashboardTenantOwnership(dashboard: Dashboard) {
    const currentTenantId = String(userStore.getUserInfo?.tenantId?.id || '');
    const dashboardTenantId = String(dashboard?.tenantId?.id || '');
    if (!currentTenantId || !dashboardTenantId || currentTenantId !== dashboardTenantId) {
      throw new Error('\u5f53\u524d\u5927\u5c4f\u4e0d\u5c5e\u4e8e\u6b64\u79df\u6237\uff0c\u65e0\u6cd5\u7f16\u8f91');
    }
  }

  async function getWritableDashboard() {
    assertTenantAdminAccess();
    const dashboard = await getDashboardById(dashboardId.value);
    assertDashboardTenantOwnership(dashboard);
    return dashboard;
  }

  async function persistEditorState(
    state = getEditorState(),
    writableDashboard?: Dashboard,
    refreshRuntimeAfterSave = true,
  ) {
    if (writableDashboard || isDashboardTemplateMode.value) {
      assertTenantAdminAccess(writableDashboard?.id?.id || dashboardId.value);
      const latest = writableDashboard || (await getWritableDashboard());
      assertDashboardTenantOwnership(latest);

      const deviceAccess = await inspectMapTemplateDeviceAccess(state);
      const activeDeviceIds = new Set(
        collectMapTemplateDeviceRefs({ ...state, excludedDeviceIds: [] }).map((item) => item.deviceId),
      );
      const inaccessibleDevices = deviceAccess.filter((item) => !item.device && activeDeviceIds.has(item.ref.deviceId));
      if (inaccessibleDevices.length) {
        throw new Error('Template contains inaccessible devices: ' + formatTemplateDeviceNames(inaccessibleDevices));
      }

      latest.configuration = latest.configuration || {};
      latest.configuration[DASHBOARD_MAP_WIDGET_CONFIG_KEY] = state;
      await saveDashboard(latest);
      dashboardTemplate.value = latest;
      if (refreshRuntimeAfterSave) {
        await refreshTemplateRuntime();
      }
      return;
    }

    saveWidgetsToLocal(state);
    saveMapPoints(state.mapPoints);
    saveSensorPopupBindings(state.sensorPopupBindings);
  }

  function unmountWidget(id: string) {
    datasourceRuntime.unmountWidgetRuntime(id);

    const app = mountedApps.get(id);
    if (app) {
      try {
        app.unmount();
      } catch {}
      mountedApps.delete(id);
    }
  }

  function unmountAllWidgets() {
    Array.from(mountedApps.keys()).forEach(unmountWidget);
  }

  async function mountWidget(id: string, key: LocalWidgetKey) {
    await nextTick();
    const mountEl = document.getElementById(`mw-mount-${id}`);
    if (!mountEl) return;

    unmountWidget(id);

    const widget = widgets.value[id];
    if (!widget) return;

    const app = createApp({
      render: () =>
        h(WidgetHost, {
          widget,
          runtime: datasourceRuntime,
          context: {
            host: 'editor',
            readonly: editorMode.value === 'view',
            runtimeDevices: templateRuntimeDevices.value,
            templatePoints: getMapBusinessPoints({
              mapPoints: draftMapPoints.value,
              excludedDeviceIds: draftExcludedDeviceIds.value,
              excludedPointTypes: draftExcludedPointTypes.value,
              excludedDeviceBindings: draftExcludedDeviceBindings.value,
            }),
            emit: (event: string, payload?: unknown) => {
              if (event === 'alarm-focus') onAlarmFocus(payload as AlarmFocusPayload);
            },
          },
        }),
    });

    app.mount(mountEl);
    mountedApps.set(id, app);
  }

  function widgetHtml(id: string) {
    const safeId = escapeSvgText(id);
    const widget = widgets.value[id];
    const surfaceStyle = widgetAppearanceStyleText(widget?.widgetKey || widget?.type || '', widget?.appearance);
    return `
      <div class="mw-widget tb-widget-surface" data-widget-id="${safeId}" style="${surfaceStyle}">
        ${widget?.config?.native ? `<button class="mw-native-edit" data-id="${safeId}" title="配置部件" style="position:absolute;right:42px;top:8px;z-index:5;color:#dff8ff;background:#14313ddd;border:1px solid #ffffff40;border-radius:5px;cursor:pointer">配置</button>` : ''}
        <button class="mw-del" data-id="${safeId}" title="删除">脳</button>
        <div class="mw-body">
          <div id="mw-mount-${safeId}" class="mw-mount"></div>
        </div>
      </div>
    `;
  }

  function renderGrid() {
    if (!grid) return;

    unmountAllWidgets();
    grid.removeAll(true);

    layout.value.forEach((item) => {
      const widget = widgets.value[item.i];
      if (!widget) return;

      const widgetKey = (widget?.widgetKey || widget?.type) as LocalWidgetKey | undefined;

      grid?.addWidget({
        id: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        content: widgetHtml(item.i),
      } as any);

      if (widgetKey) {
        void mountWidget(item.i, widgetKey);
      }
    });
    applyScreenMetrics();
  }

  function syncLayoutFromGrid() {
    if (!grid) return;
    layout.value = grid.engine.nodes.map((node) => ({
      i: String(node.id),
      x: node.x ?? 0,
      y: node.y ?? 0,
      w: node.w ?? 1,
      h: node.h ?? 1,
    }));
  }

  function beginWidgetResize() {
    if (!grid || editorMode.value !== 'editing' || isSavingEdit.value) return;
    // 保留当前画布尺度，避免缩小末行部件时自动铺满抵消高度变化。
    templateViewport.value = {
      ...templateViewport.value,
      mode: 'fixed',
      rows: Math.max(mapScreen.metrics.value.rows, Number(grid.getRow()) || 1),
    };
  }

  function deleteWidgetById(id: string, buttonEl?: HTMLElement) {
    if (!grid) return;

    unmountWidget(id);

    const itemEl =
      (buttonEl?.closest('.grid-stack-item') as HTMLElement | null) ||
      (gridEl.value?.querySelector(`.grid-stack-item[gs-id="${id}"]`) as HTMLElement | null) ||
      (gridEl.value?.querySelector(`.grid-stack-item[data-gs-id="${id}"]`) as HTMLElement | null) ||
      null;

    if (itemEl) {
      grid.removeWidget(itemEl, true);
    }

    delete widgets.value[id];
    layout.value = layout.value.filter((item) => item.i !== id);
    selectedWidgetId.value = selectedWidgetId.value === id ? '' : selectedWidgetId.value;
    syncLayoutFromGrid();
  }

  function onGridClick(event: Event) {
    if (editorMode.value === 'view' || editorMode.value === 'pickingPoint') return;

    const target = event.target as HTMLElement | null;
    if (!target) return;

    const editButton = target.closest?.('.mw-native-edit') as HTMLElement | null;
    if (editButton) {
      event.preventDefault();
      event.stopPropagation();
      const id = editButton.getAttribute('data-id') || '';
      nativeEditSource.value = widgets.value[id] || null;
      return;
    }

    const deleteButton = target.closest?.('.mw-del') as HTMLElement | null;
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();

      const id = deleteButton.getAttribute('data-id') || '';
      if (id) {
        deleteWidgetById(id, deleteButton);
      }
      return;
    }

    const widgetEl = target.closest?.('.mw-widget') as HTMLElement | null;
    const widgetId = widgetEl?.getAttribute('data-widget-id') || '';
    if (widgetId) {
      selectedWidgetId.value = widgetId;
      addPanelVisible.value = false;
    }
  }

  function createWidgetAndAddToGrid(key: LocalWidgetKey, title: string, config: Record<string, any>) {
    if (!grid) return;

    const def = widgetRegistry[key];
    if (!def) return;

    const id = `mw_${Date.now()}`;
    const instance = createWidgetInstance(key, { id, title, config });
    if (!instance) return;

    widgets.value[id] = { ...instance, type: key } as WidgetData;

    grid.addWidget({
      id,
      w: def.dashboardPlacement.width,
      h: def.dashboardPlacement.height,
      content: widgetHtml(id),
    } as any);

    void mountWidget(id, key);
    syncLayoutFromGrid();
    addPanelVisible.value = false;
  }

  async function loadAggregateAvailableKeys() {
    const requestId = ++aggregateKeysRequestId;
    if (isResourceUsageWidget.value) {
      aggregateAssetsLoading.value = true;
      try {
        const page = await getTenantAssetInfoList({ page: 0, pageSize: 500, sortProperty: 'name', sortOrder: 'ASC' });
        if (requestId !== aggregateKeysRequestId) return;
        aggregateAssetOptions.value = (page.data || []).map((asset: any) => ({ id: asset.id.id, name: asset.name }));
        aggregateKey.value =
          pendingWidgetKey.value === 'iotWaterUsage' ? 'totalWaterConsumption' : 'totalElectricityConsumption';
      } catch {
        aggregateKeysError.value = '读取资产列表失败，请稍后重试。';
      } finally {
        aggregateAssetsLoading.value = false;
      }
      return;
    }
    const deviceRefs = collectMapTemplateDeviceRefs(getEditorState());
    aggregateAvailableKeys.value = [];
    aggregateKeysError.value = '';
    aggregateKeysLoading.value = false;

    if (!deviceRefs.length) {
      aggregateKeysError.value = 'Failed to read keys from template devices. Please check permissions or retry later.';
      return;
    }

    aggregateKeysLoading.value = true;
    const results = await Promise.allSettled(
      deviceRefs.map((device) => getTimeseriesKeys({ entityType: 'DEVICE', id: device.deviceId } as any)),
    );
    if (requestId !== aggregateKeysRequestId) return;

    const keySet = new Set<string>();
    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      (Array.isArray(result.value) ? result.value : []).forEach((key) => {
        const normalized = String(key || '').trim();
        if (normalized) keySet.add(normalized);
      });
    });

    aggregateAvailableKeys.value = Array.from(keySet).sort((left, right) => left.localeCompare(right));
    const failedCount = results.filter((result) => result.status === 'rejected').length;
    if (failedCount === results.length) {
      aggregateKeysError.value = 'Failed to read keys from template devices. Please check permissions or retry later.';
    } else if (failedCount) {
      aggregateKeysError.value =
        failedCount + ' device key reads failed; the current list comes from the remaining devices.';
    } else if (!aggregateAvailableKeys.value.length) {
      aggregateKeysError.value = 'Failed to read keys from template devices. Please check permissions or retry later.';
    }

    if (!aggregateAvailableKeys.value.includes(aggregateKey.value)) {
      aggregateKey.value = aggregateAvailableKeys.value[0] || '';
    }
    aggregateKeysLoading.value = false;
  }

  async function onAggregateAssetChanged() {
    aggregateAvailableKeys.value = [];
    const assetId = aggregateAssetId.value;
    if (!assetId) return;
    aggregateKeysLoading.value = true;
    try {
      aggregateAvailableKeys.value = await getTimeseriesKeys({ entityType: 'ASSET', id: assetId } as any);
      if (aggregateAvailableKeys.value.length && !aggregateAvailableKeys.value.includes(aggregateKey.value)) {
        aggregateKey.value = aggregateAvailableKeys.value[0];
      }
    } catch {
      aggregateKeysError.value = '读取资产时序 Key 失败，请稍后重试。';
    } finally {
      aggregateKeysLoading.value = false;
    }
  }
  function cancelAggregateWidgetConfig() {
    aggregateKeysRequestId += 1;
    aggregateKeysLoading.value = false;
    aggregateAssetsLoading.value = false;
    aggregateAssetId.value = '';
    aggregateConfigVisible.value = false;
    pendingWidgetKey.value = '';
    pendingWidgetTitle.value = '';
  }

  function confirmAggregateWidgetConfig() {
    const key = pendingWidgetKey.value;
    const definition = key ? widgetRegistry[key] : null;
    if (isResourceUsageWidget.value) {
      const asset = aggregateAssetOptions.value.find((item) => item.id === aggregateAssetId.value);
      const telemetryKey = aggregateKey.value.trim();
      if (!key || !definition || !asset || !telemetryKey) return;
      const config = cloneJson(definition.defaultConfig || {});
      config.settings = {
        ...(config.settings || {}),
        sourceAssetId: asset.id,
        sourceAssetName: asset.name,
        sourceTelemetryKey: telemetryKey,
      };
      createWidgetAndAddToGrid(key, pendingWidgetTitle.value || definition.title, config);
      cancelAggregateWidgetConfig();
      return;
    }
    const telemetryKey = aggregateKey.value.trim();
    if (!key || !definition || !telemetryKey) return;

    const config = cloneJson(definition.defaultConfig || {});
    config.settings = { ...(config.settings || {}), key: telemetryKey };
    if (key === 'templateKeyTrend') {
      config.timewindow = { ...(config.timewindow || {}), intervalMs: aggregateTimeWindowMs.value, realtime: true };
    }

    createWidgetAndAddToGrid(key, pendingWidgetTitle.value || definition.title, config);
    aggregateConfigVisible.value = false;
    pendingWidgetKey.value = '';
    pendingWidgetTitle.value = '';
  }

  function cancelAreaKeyCompareConfig() {
    areaKeyCompareConfigVisible.value = false;
    pendingWidgetKey.value = '';
    pendingWidgetTitle.value = '';
  }

  function confirmAreaKeyCompareConfig(payload: {
    title: string;
    asset: { id: string; name: string };
    key: string;
    unit: string;
    statisticMode: 'latest' | 'todayUsage';
    timeRange: 'last24h' | 'last7d';
  }) {
    const key = pendingWidgetKey.value;
    const definition = key ? widgetRegistry[key] : null;
    if (!key || !definition || !payload.asset.id || !payload.key) return;

    const config = cloneJson(definition.defaultConfig || {});
    const datasource = {
      type: 'entity',
      entityType: 'ASSET',
      entityId: payload.asset.id,
      entityName: payload.asset.name,
      keys: [payload.key],
      dataKeys: [{ name: payload.key, type: 'timeseries', units: payload.unit }],
      pollMs: 60000,
    };

    config.title = payload.title;
    config.settings = {
      ...(config.settings || {}),
      title: payload.title,
      sourceAssetId: payload.asset.id,
      sourceAssetName: payload.asset.name,
      sourceTelemetryKey: payload.key,
      unit: payload.unit,
      statisticMode: payload.statisticMode,
      timeRange: payload.timeRange,
    };
    config.datasource = datasource;
    config.datasources = [datasource];

    createWidgetAndAddToGrid(key, payload.title || definition.title, config);
    cancelAreaKeyCompareConfig();
  }
  function addWidgetByKey(key: LocalWidgetKey) {
    if (!grid || editorMode.value !== 'editing') return;

    const def = widgetRegistry[key];
    if (!def) {
      errorMsg.value = 'Widget definition not found: ' + key;
      return;
    }

    const title = def.title;

    if (key === 'iotAreaKeyCompareBar') {
      pendingWidgetKey.value = key;
      pendingWidgetTitle.value = title;
      addPanelVisible.value = false;
      areaKeyCompareConfigVisible.value = true;
      return;
    }

    if (def.editor === 'aggregate') {
      pendingWidgetKey.value = key;
      pendingWidgetTitle.value = title;
      aggregateKey.value = '';
      aggregateKeySearch.value = '';
      aggregateTimeWindowMs.value = Number(def.defaultConfig?.timewindow?.intervalMs || 3600000);
      addPanelVisible.value = false;
      aggregateConfigVisible.value = true;
      void loadAggregateAvailableKeys();
      return;
    }

    if (def.editor === 'timeseries' || def.editor === 'latest' || def.editor === 'control') {
      pendingWidgetKey.value = key;
      pendingWidgetTitle.value = title;
      pendingImportedConfig.value = null;
      widgetDeviceDialogVisible.value = true;
      return;
    }

    createWidgetAndAddToGrid(key, title, {
      ...def.defaultConfig,
    });
  }

  async function onImportFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请拆分后导入');
      const text = await file.text();
      const json = JSON.parse(text);
      const defs = importThingsboardJson(json);

      if (!defs.length) {
        errorMsg.value = 'Import failed: unrecognized ThingsBoard widget or bundle format';
        return;
      }

      for (const def of defs) {
        upsertWidget(def);
      }

      reloadLibrary();
      const unavailable = defs.filter((def) => def.kind === 'unknown').length;
      errorMsg.value = unavailable
        ? `已保留 ${defs.length} 个原始定义，其中 ${unavailable} 个尚未适配；点击条目可查看原因。`
        : '';
    } catch (error: any) {
      errorMsg.value = error?.message || String(error);
    } finally {
      input.value = '';
    }
  }

  function deleteFromLibrary(id: string) {
    removeWidget(id);
    reloadLibrary();
  }

  function mapImportedKindToLocalKey(def: CustomWidgetDefinition): LocalWidgetKey | '' {
    return resolveWidgetDefinitionKey({
      localWidgetKey: def.localWidgetKey,
      typeFullFqn: def.typeFullFqn,
      kind: def.kind,
    });
  }

  function addFromLibrary(def: CustomWidgetDefinition) {
    if (!grid || editorMode.value !== 'editing') return;

    if (def.raw && (def.raw.descriptor || def.defaultConfig?.native || def.kind === 'unknown')) {
      const source = def.raw;
      const support = getNativeWidgetSupport(source);
      if (!support.supported) {
        errorMsg.value = support.reason;
        return;
      }
      nativeEditSource.value = source.config?.native ? { ...source, id: `native-${Date.now()}` } : source;
      return;
    }

    const localKey = mapImportedKindToLocalKey(def);
    if (!localKey) {
      errorMsg.value = 'Unsupported widget type: ' + def.kind;
      return;
    }

    pendingWidgetKey.value = localKey;
    pendingWidgetTitle.value = def.name;
    pendingImportedConfig.value = def.defaultConfig || {};
    widgetDeviceDialogVisible.value = true;
  }

  function closeWidgetDeviceDialog() {
    widgetDeviceDialogVisible.value = false;
    pendingWidgetKey.value = '';
    pendingWidgetTitle.value = '';
    pendingImportedConfig.value = null;
  }

  function onWidgetDevicePicked(payload: { deviceId: string; deviceName: string; keys: string[]; pollMs: number }) {
    errorMsg.value = '';
    if (!grid) return;

    const key = pendingWidgetKey.value;
    if (!key) return;

    const def = widgetRegistry[key];
    if (!def) {
      errorMsg.value = 'Widget definition not found: ' + key;
      return;
    }

    const title = pendingWidgetTitle.value || def.title;
    const imported = pendingImportedConfig.value || {};
    widgetDeviceDialogVisible.value = false;

    const config = buildWidgetConfig(def, title, imported, {
      deviceId: payload.deviceId,
      deviceName: payload.deviceName,
      keys: payload.keys,
      pollMs: payload.pollMs,
    });

    createWidgetAndAddToGrid(key, title, config);
    closeWidgetDeviceDialog();
  }

  function closeAllOverlays() {
    editPointId.value = '';
    addPanelVisible.value = false;
    aggregateConfigVisible.value = false;
    areaKeyCompareConfigVisible.value = false;
    sensorPreviewVisible.value = false;
    sensorConfigVisible.value = false;
    sensorStylePanelVisible.value = false;
    pageSettingsVisible.value = false;
    selectedSensor.value = null;
    closeCameraPopup();
  }

  function clearDragHint() {
    dragHint.value = '';
    if (dragHintTimer) {
      clearTimeout(dragHintTimer);
      dragHintTimer = null;
    }
  }

  function getChangedDeviceLocationPoints(points: MapPoint[]) {
    const baseline = originalMapPoints.value.map((point) => {
      const currentRead = restoredPositionReads.get(point.entityId);
      return currentRead ? ({ ...point, ...currentRead, deviceLocationSynced: true } as MapPoint) : point;
    });
    return unifiedDeviceLocationWriteCandidates(points, baseline);
  }

  function removeDraftPoint(pointId: string) {
    if (editorMode.value !== 'editing' || isSavingEdit.value) return;
    const target = draftMapPoints.value.find((point) => point.id === pointId);
    if (!target) return;
    if (
      !window.confirm(
        '仅从当前大屏移除“' + target.name + '”？不会删除 ThingsBoard 设备或修改设备坐标。顶部保存后生效。',
      )
    )
      return;
    const removed = draftMapPoints.value.filter((point) => point.entityId === target.entityId);
    draftMapPoints.value = draftMapPoints.value.filter((point) => point.entityId !== target.entityId);
    draftExcludedDeviceIds.value = [...new Set([...draftExcludedDeviceIds.value, target.entityId])];
    draftExcludedPointTypes.value = { ...draftExcludedPointTypes.value, [target.entityId]: target.type };
    draftExcludedDeviceBindings.value = {
      ...draftExcludedDeviceBindings.value,
      [target.entityId]: toMapBusinessBinding(target),
    };
    restoredPositionReads.delete(target.entityId);
    const bindings = cloneJson(draftSensorPopupBindings.value);
    removed.forEach((point) => delete bindings[point.id]);
    draftSensorPopupBindings.value = bindings;
    closeAllOverlays();
  }

  function enterEdit() {
    if (!grid) return;
    if (!canEditTemplate.value) return;

    widgetSnapshot = {
      layout: cloneJson(layout.value),
      widgets: cloneJson(widgets.value),
      appearance: cloneJson(templateAppearance.value),
      deviceProfileStyles: cloneJson(effectiveProfileRules.value),
      topBar: cloneJson(templateTopBar.value),
      viewport: cloneJson(templateViewport.value),
      scene: cloneJson(templateScene.value),
    };
    draftMapPoints.value = cloneJson(originalMapPoints.value);
    draftSensorPopupBindings.value = cloneJson(originalSensorPopupBindings.value);
    draftExcludedDeviceIds.value = [...originalExcludedDeviceIds.value];
    draftExcludedPointTypes.value = { ...originalExcludedPointTypes.value };
    draftExcludedDeviceBindings.value = cloneJson(originalExcludedDeviceBindings.value);

    editorMode.value = 'editing';
    selectedWidgetId.value = '';
    clearDragHint();
    closeAllOverlays();

    grid.setStatic(false);
    grid.enableMove(true);
    grid.enableResize(true);
  }

  function toDevicePointBinding(point: MapPoint): DevicePointBindingInfo | null {
    const deviceId = String(point.entityId || '').trim();
    if (!deviceId) return null;

    return {
      deviceId,
      deviceName: point.entityName || point.name,
      pointId: point.id,
      pointName: point.name,
      pointType: point.type,
    };
  }

  function pointTypeLabel(pointType: MapPointType) {
    return pointType === 'camera' ? 'Camera point' : 'Sensor point';
  }

  function findDraftDeviceBinding(deviceId: string) {
    const normalizedId = String(deviceId || '').trim();
    return pointDeviceBindings.value.find((binding) => binding.deviceId === normalizedId);
  }

  function ensureDeviceAvailableForNewPoint(deviceId: string) {
    const binding = findDraftDeviceBinding(deviceId);
    if (!binding) return true;

    errorMsg.value =
      'Device is already bound to ' +
      pointTypeLabel(binding.pointType) +
      ' ' +
      binding.pointName +
      ' (' +
      binding.pointId +
      ').';
    return false;
  }

  function findDuplicateDeviceBindings(points: MapPoint[]) {
    const bindingsByDevice = new Map<string, DevicePointBindingInfo[]>();

    points.forEach((point) => {
      const binding = toDevicePointBinding(point);
      if (!binding) return;
      bindingsByDevice.set(binding.deviceId, [...(bindingsByDevice.get(binding.deviceId) || []), binding]);
    });

    return Array.from(bindingsByDevice.values()).filter((bindings) => bindings.length > 1);
  }

  function clearPointPicking() {
    pointActionRequest += 1;
    pendingPointLocation.value = null;
    relocatingPointId.value = '';
    restoringPoint.value = null;
    sensorPointDialogVisible.value = false;
    cameraPointDialogVisible.value = false;
    cesiumMapRef.value?.clearPickPreview();
  }

  function locationDescription(location: MapPointLocation & { modelAnchor?: MapPickedLocation['modelAnchor'] }) {
    if (!location.modelAnchor) return '地面位置（不跟随模型）';
    const model = effectiveAnchorModels.value.find((item) => item.id === location.modelAnchor?.modelId);
    return '模型表面：' + (model?.name || location.modelAnchor.modelId) + '（跟随模型变化）';
  }

  function validatePickedLocation(location: MapPickedLocation) {
    if (
      !Number.isFinite(location.longitude) ||
      Math.abs(location.longitude) > 180 ||
      !Number.isFinite(location.latitude) ||
      Math.abs(location.latitude) > 90 ||
      !Number.isFinite(location.height ?? 0)
    ) {
      errorMsg.value = '位置无效，请重新选点';
      return false;
    }
    if (
      location.modelAnchor &&
      (!isValidModelAnchor(location.modelAnchor) || !cesiumMapRef.value?.isCurrentModelPick(location))
    ) {
      errorMsg.value = '模型已变化或位置不可用，请重新选点';
      return false;
    }
    return true;
  }

  function startPickingPoint() {
    if (editorMode.value !== 'editing' || isSavingEdit.value || removedPointsLoading.value) return false;
    closeRemovedPoints();
    clearPointPicking();
    closeAllOverlays();
    selectedWidgetId.value = '';
    errorMsg.value = '';
    editorMode.value = 'pickingPoint';
    return true;
  }

  function togglePickingPoint() {
    if (editorMode.value === 'pickingPoint') cancelPickingPoint();
    else startPickingPoint();
  }

  function cancelPickingPoint() {
    if (isSavingEdit.value) return;
    clearPointPicking();
    if (editorMode.value !== 'view') editorMode.value = 'editing';
  }

  function onPickError(message: string) {
    errorMsg.value = message;
  }

  function onMapPicked(location: MapPickedLocation) {
    if (editorMode.value !== 'pickingPoint' || isSavingEdit.value) return;
    pendingPointLocation.value = location;
    if (relocatingPointId.value || restoringPoint.value) editorMode.value = 'selectingPointType';
    else {
      editorMode.value = 'configuringSensorPoint';
      sensorPointDialogVisible.value = true;
    }
  }

  function retryPickingPoint() {
    if (isSavingEdit.value) return;
    pendingPointLocation.value = null;
    cesiumMapRef.value?.clearPickPreview();
    editorMode.value = 'pickingPoint';
  }

  function cancelPointTypeSelection() {
    cancelPickingPoint();
  }

  function openPointActions(point: MapPoint) {
    if (editorMode.value !== 'editing' || isSavingEdit.value) return;
    closeAllOverlays();
    editPointId.value = point.id;
  }

  function startRelocatingPoint(point: MapPoint) {
    if (editorMode.value !== 'editing' || isSavingEdit.value) return;
    if (startPickingPoint()) relocatingPointId.value = point.id;
  }

  function pointWithPickedLocation(point: MapPoint, location: MapPickedLocation): MapPoint {
    const { modelAnchor: _oldAnchor, ...ground } = point;
    const positioned = location.modelAnchor
      ? attachPoint(point, location)
      : {
          ...ground,
          longitude: location.longitude,
          latitude: location.latitude,
          height: location.height ?? 0,
          heightMode: 'absolute' as const,
          positionSource: 'template' as const,
          locationSource: 'manual' as const,
        };
    return { ...positioned, deviceLocationSynced: false, updatedAt: Date.now() } as MapPoint;
  }

  function unexcludeDevice(deviceId: string) {
    draftExcludedDeviceIds.value = draftExcludedDeviceIds.value.filter((id) => id !== deviceId);
    const types = { ...draftExcludedPointTypes.value };
    delete types[deviceId];
    draftExcludedPointTypes.value = types;
    const bindings = { ...draftExcludedDeviceBindings.value };
    delete bindings[deviceId];
    draftExcludedDeviceBindings.value = bindings;
  }

  function confirmPointLocation() {
    if (isSavingEdit.value || editorMode.value !== 'selectingPointType') return;
    const location = pendingPointLocation.value;
    if (!location || !validatePickedLocation(location)) return;
    const target = restoringPoint.value || draftMapPoints.value.find((point) => point.id === relocatingPointId.value);
    if (!target) return;
    const point = pointWithPickedLocation(target, location);
    const next = cloneJson(draftMapPoints.value);
    upsertDraftPoint(next, point);
    draftMapPoints.value = next;
    unexcludeDevice(point.entityId);
    clearPointPicking();
    editorMode.value = 'editing';
    editPointId.value = point.id;
  }

  function changePointOcclusion(event: Event) {
    if (editorMode.value !== 'editing' || isSavingEdit.value) return;
    const occlusion = (event.target as HTMLSelectElement).value;
    if (occlusion !== 'physical' && occlusion !== 'alwaysVisible') return;
    draftMapPoints.value = draftMapPoints.value.map((point) =>
      point.id === editPointId.value && point.modelAnchor
        ? { ...point, modelAnchor: { ...point.modelAnchor, occlusion }, updatedAt: Date.now() }
        : point,
    );
  }

  function openSelectedSensorConfig() {
    const point = selectedEditPoint.value;
    if (point?.type !== 'sensor' || isSavingEdit.value) return;
    selectedSensor.value = point;
    editPointId.value = '';
    sensorConfigVisible.value = true;
  }

  function closeRemovedPoints() {
    pointActionRequest += 1;
    removedPointsVisible.value = false;
    removedPointsLoading.value = false;
  }

  async function openRemovedPoints() {
    if (editorMode.value !== 'editing' || isSavingEdit.value || removedPointsLoading.value) return;
    closeAllOverlays();
    removedPointsVisible.value = true;
    removedPointsLoading.value = true;
    removedPointEntries.value = [];
    const request = ++pointActionRequest;
    const ids = [...draftExcludedDeviceIds.value];
    try {
      for (let index = 0; index < ids.length; index += 8) {
        const entries = await Promise.all(
          ids.slice(index, index + 8).map(async (deviceId) => {
            const type = draftExcludedPointTypes.value[deviceId];
            try {
              const device = await getDeviceInfoById(deviceId);
              const profile = readDeviceProfile(device);
              const kind = profile.deviceProfileId
                ? (effectiveProfileRules.value[profile.deviceProfileId] || defaultProfileRule(profile)).pointKind
                : type;
              return { deviceId, name: device.label || device.name || deviceId, type: kind, available: !!kind };
            } catch {
              return { deviceId, name: deviceId, type, available: false };
            }
          }),
        );
        if (request !== pointActionRequest || !removedPointsVisible.value) return;
        removedPointEntries.value.push(...entries);
      }
    } finally {
      if (request === pointActionRequest) removedPointsLoading.value = false;
    }
  }

  async function restoreRemovedPoint(entry: RemovedPointEntry, repick: boolean) {
    if (
      !entry.available ||
      !entry.type ||
      isSavingEdit.value ||
      removedPointsLoading.value ||
      editorMode.value !== 'editing' ||
      !removedPointsVisible.value
    )
      return;
    const request = ++pointActionRequest;
    removedPointsLoading.value = true;
    try {
      const device = await getDeviceInfoById(entry.deviceId);
      const location = repick ? null : await loadDeviceMapPointLocation(entry.deviceId);
      if (request !== pointActionRequest || !removedPointsVisible.value) return;
      if (!repick && !location) throw new Error('设备没有可用坐标，请使用“重新选点恢复”');
      const point = {
        ...toMapBusinessBinding(draftExcludedDeviceBindings.value[entry.deviceId] || {}),
        ...readDeviceProfile(device),
        id: entry.type + '_' + entry.deviceId,
        type: readDeviceProfile(device).deviceProfileId
          ? (
              effectiveProfileRules.value[readDeviceProfile(device).deviceProfileId] ||
              defaultProfileRule(readDeviceProfile(device))
            ).pointKind
          : entry.type,
        name: device.label || device.name || entry.deviceId,
        entityType: 'DEVICE',
        entityId: entry.deviceId,
        entityName: device.name,
        longitude: location?.longitude ?? 0,
        latitude: location?.latitude ?? 0,
        height: location?.height ?? 0,
        heightMode: 'absolute',
        locationSource: location?.source || 'manual',
        positionSource: 'template',
        deviceLocationSynced: !repick,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as MapPoint;
      closeRemovedPoints();
      clearPointPicking();
      if (repick) {
        restoringPoint.value = point;
        editorMode.value = 'pickingPoint';
      } else {
        if (location) restoredPositionReads.set(entry.deviceId, { ...location, heightMode: 'absolute' });
        const next = cloneJson(draftMapPoints.value);
        upsertDraftPoint(next, point);
        draftMapPoints.value = next;
        unexcludeDevice(entry.deviceId);
        editPointId.value = point.id;
      }
    } catch (error) {
      if (request === pointActionRequest)
        errorMsg.value =
          error instanceof Error && error.message === '设备没有可用坐标，请使用“重新选点恢复”'
            ? error.message
            : '设备信息读取失败或已无访问权限，请重试';
    } finally {
      if (request === pointActionRequest) removedPointsLoading.value = false;
    }
  }

  function cancelPointConfig() {
    cancelPickingPoint();
  }

  function createPointBase(type: MapPointType, deviceId: string, deviceName: string) {
    const location = pendingPointLocation.value;
    if (!location || !validatePickedLocation(location)) throw new Error('请重新选择有效位置');
    const now = Date.now();
    return {
      id: type + '_' + deviceId,
      type,
      name: deviceName,
      longitude: location.longitude,
      latitude: location.latitude,
      height: location.height ?? 0,
      heightMode: 'absolute' as const,
      modelAnchor: location.modelAnchor,
      positionSource: 'template' as const,
      deviceLocationSynced: false,
      locationSource: 'manual' as const,
      entityType: 'DEVICE' as const,
      entityId: deviceId,
      entityName: deviceName,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function verifyNewPointDevice(deviceId: string, mode: string) {
    if (isSavingEdit.value || editorMode.value !== mode || !ensureDeviceAvailableForNewPoint(deviceId)) return false;
    const pending = pendingPointLocation.value;
    const request = ++pointActionRequest;
    let device;
    try {
      device = await getDeviceInfoById(deviceId);
    } catch {
      if (request === pointActionRequest) errorMsg.value = '无法读取设备或已无访问权限，请重试';
      return false;
    }
    return (
      request === pointActionRequest &&
      !!pending &&
      pending === pendingPointLocation.value &&
      editorMode.value === mode &&
      validatePickedLocation(pending) &&
      ensureDeviceAvailableForNewPoint(deviceId) &&
      device
    );
  }

  function finishNewPoint(point: MapPoint) {
    const next = cloneJson(draftMapPoints.value);
    upsertDraftPoint(next, point);
    draftMapPoints.value = next;
    unexcludeDevice(point.entityId);
    clearPointPicking();
    editorMode.value = 'editing';
    editPointId.value = point.id;
  }

  async function onSensorPointConfigured(payload: {
    deviceId: string;
    deviceName: string;
    keys: string[];
    pollMs: number;
  }) {
    const device = await verifyNewPointDevice(payload.deviceId, 'configuringSensorPoint');
    if (!device) return;
    const metadata = readDeviceProfile(device);
    templateRuntimeDevices.value[payload.deviceId] = {
      ...(templateRuntimeDevices.value[payload.deviceId] || {}),
      entityMetadata: metadata,
    };
    const rule = effectiveProfileRules.value[metadata.deviceProfileId] || defaultProfileRule(metadata);
    if (metadata.deviceProfileId) templateDeviceProfileStyles.value[metadata.deviceProfileId] = rule;
    if (rule.pointKind === 'camera') {
      finishNewPoint({
        ...createPointBase('camera', payload.deviceId, device.name || payload.deviceName),
        ...metadata,
        type: 'camera',
      });
      return;
    }
    const point: SensorMapPoint = {
      ...createPointBase('sensor', payload.deviceId, payload.deviceName),
      ...metadata,
      type: 'sensor',
      online: false,
      statusText: '离线',
      color: 'gray',
      datasource: {
        entityType: 'DEVICE',
        entityId: payload.deviceId,
        entityName: payload.deviceName,
        keys: (payload.keys || []).map((name) => ({ name, type: 'timeseries' })),
        pollMs: payload.pollMs,
      },
    };
    draftSensorPopupBindings.value = { ...draftSensorPopupBindings.value, [point.id]: [] };
    finishNewPoint(point);
  }

  async function onCameraPointConfigured(payload: { deviceId: string; deviceName: string }) {
    if (!(await verifyNewPointDevice(payload.deviceId, 'configuringCameraPoint'))) return;
    finishNewPoint({
      ...createPointBase('camera', payload.deviceId, payload.deviceName),
      type: 'camera',
      online: false,
      statusText: '离线',
      color: 'gray',
    });
  }

  function openAddPanel() {
    if (editorMode.value !== 'editing') return;
    appearancePanelVisible.value = false;
    sensorStylePanelVisible.value = false;
    pageSettingsVisible.value = false;
    addPanelVisible.value = !addPanelVisible.value;
  }

  function togglePageSettingsPanel() {
    if (editorMode.value !== 'editing') return;
    addPanelVisible.value = false;
    appearancePanelVisible.value = false;
    sensorStylePanelVisible.value = false;
    pageSettingsVisible.value = !pageSettingsVisible.value;
  }

  function toggleAppearancePanel() {
    if (editorMode.value !== 'editing') return;
    addPanelVisible.value = false;
    sensorStylePanelVisible.value = false;
    pageSettingsVisible.value = false;
    appearancePanelVisible.value = !appearancePanelVisible.value;
  }

  function restoreWidgetSnapshot() {
    if (!widgetSnapshot) return;
    layout.value = cloneJson(widgetSnapshot.layout);
    widgets.value = cloneJson(widgetSnapshot.widgets);
    templateAppearance.value = cloneJson(widgetSnapshot.appearance);
    templateDeviceProfileStyles.value = cloneJson(widgetSnapshot.deviceProfileStyles);
    templateTopBar.value = cloneJson(widgetSnapshot.topBar);
    templateViewport.value = cloneJson(widgetSnapshot.viewport);
    templateScene.value = cloneJson(widgetSnapshot.scene);
    renderGrid();
  }

  function leaveEditMode() {
    restoredPositionReads.clear();
    clearDragHint();
    clearPointPicking();
    closeRemovedPoints();
    editorMode.value = 'view';
    appearancePanelVisible.value = false;
    selectedWidgetId.value = '';
    closeAllOverlays();
    grid?.setStatic(true);
    grid?.enableMove(false);
    grid?.enableResize(false);
  }

  function cancelEdit() {
    if (isSavingEdit.value) return;
    restoreWidgetSnapshot();
    draftMapPoints.value = cloneJson(originalMapPoints.value);
    draftSensorPopupBindings.value = cloneJson(originalSensorPopupBindings.value);
    draftExcludedDeviceIds.value = [...originalExcludedDeviceIds.value];
    draftExcludedPointTypes.value = { ...originalExcludedPointTypes.value };
    draftExcludedDeviceBindings.value = cloneJson(originalExcludedDeviceBindings.value);
    leaveEditMode();
  }

  function adoptSavedState(state: MapTemplateState) {
    templateDeviceProfileStyles.value = cloneJson(state.deviceProfileStyles);
    profileMigrationBackup.value = state.profileMigrationBackup;
    originalMapPoints.value = cloneJson(state.mapPoints);
    draftMapPoints.value = cloneJson(state.mapPoints);
    originalSensorPopupBindings.value = cloneJson(state.sensorPopupBindings);
    draftSensorPopupBindings.value = cloneJson(state.sensorPopupBindings);
    originalExcludedDeviceIds.value = [...state.excludedDeviceIds];
    draftExcludedDeviceIds.value = [...state.excludedDeviceIds];
    originalExcludedPointTypes.value = { ...state.excludedPointTypes };
    draftExcludedPointTypes.value = { ...state.excludedPointTypes };
    originalExcludedDeviceBindings.value = cloneJson(state.excludedDeviceBindings);
    draftExcludedDeviceBindings.value = cloneJson(state.excludedDeviceBindings);
    restoredPositionReads.clear();
    widgetSnapshot = {
      layout: cloneJson(state.layout),
      widgets: cloneJson(state.widgets),
      appearance: cloneJson(state.appearance),
      deviceProfileStyles: cloneJson(state.deviceProfileStyles),
      topBar: cloneJson(state.topBar),
      viewport: cloneJson(state.viewport),
      scene: cloneJson(state.scene),
    };
  }

  async function saveEdit() {
    if (!grid || !canSaveEdit.value || isSavingEdit.value || !canEditTemplate.value) return;
    if (pendingPointLocation.value || relocatingPointId.value || restoringPoint.value) {
      errorMsg.value = '请先确认或取消当前选点';
      return;
    }
    if (findDuplicateDeviceBindings(draftMapPoints.value).length) {
      errorMsg.value = '同一设备在当前模板中存在重复点位，请先移除重复点位';
      return;
    }
    if (profileMigration.value.conflicts.length) {
      errorMsg.value = '请在点位样式面板解决旧分类样式冲突后保存';
      sensorStylePanelVisible.value = true;
      return;
    }
    errorMsg.value = '';
    syncLayoutFromGrid();
    const state = getEditorState();
    const candidates = getChangedDeviceLocationPoints(state.mapPoints);
    for (const point of candidates) {
      if (
        !Number.isFinite(point.longitude) ||
        Math.abs(point.longitude) > 180 ||
        !Number.isFinite(point.latitude) ||
        Math.abs(point.latitude) > 90 ||
        !Number.isFinite(point.height ?? 0) ||
        point.heightMode === 'relativeToGround'
      ) {
        errorMsg.value = '“' + point.name + '”坐标无效或不是绝对高度，请重新选点';
        return;
      }
      if (point.modelAnchor && cesiumMapRef.value?.getPointAnchorStatus(point) !== 'attached') {
        errorMsg.value = '“' + point.name + '”关联模型尚不可用或已隐藏，请加载/显示模型或重新选点后保存';
        return;
      }
    }
    if (
      !window.confirm(
        '保存当前大屏布局与点位？将直接同步 ' +
          candidates.length +
          ' 个设备的经纬度和高度；当前排除 ' +
          state.excludedDeviceIds.length +
          ' 个设备（不删除设备、不修改被移除设备的坐标）。不备份旧坐标。',
      )
    )
      return;

    isSavingEdit.value = true;
    grid.setStatic(true);
    closeAllOverlays();
    closeRemovedPoints();
    saveFailures.value = [];
    saveStatus.value = '正在保存模板目标位置……';
    let templateSaved = false;
    let result: DeviceLocationSyncResult | null = null;
    try {
      const dashboard = await getWritableDashboard();
      const targetDashboardId = dashboard.id.id;
      if (editorDisposed) throw new Error('编辑页已关闭');
      const previous = normalizeMapTemplateState(dashboard.configuration?.[DASHBOARD_MAP_WIDGET_CONFIG_KEY]);
      assertNoRemovedModelBindings(
        getEffectiveSceneModels(previous.scene.models, previous.scene.globeOnly),
        getEffectiveSceneModels(state.scene.models, state.scene.globeOnly),
        state.mapPoints,
      );
      if (
        !state.profileMigrationBackup &&
        (Object.keys(previous.sensorDeviceTypeStyles).length || previous.version < 8)
      ) {
        const { profileMigrationBackup: _backup, ...snapshot } = previous;
        state.profileMigrationBackup = cloneJson(snapshot);
      }
      const pendingIds = new Set(candidates.map((point) => point.entityId));
      state.mapPoints = state.mapPoints.map((point) =>
        pendingIds.has(point.entityId) ? { ...point, deviceLocationSynced: false } : point,
      );
      // 先持久化目标与待同步标志；模板权限/写入失败时绝不写设备。
      await persistEditorState(state, dashboard, false);
      templateSaved = true;
      adoptSavedState(state);
      if (candidates.length) {
        saveStatus.value = '模板已保存，正在同步设备坐标……';
        result = await syncDeviceMapPointLocations(candidates);
        saveFailures.value = result.failed;
        const succeeded = new Set(result.succeeded);
        const finalState = cloneJson(state);
        finalState.mapPoints = finalState.mapPoints.map((point) =>
          succeeded.has(point.entityId) ? { ...point, deviceLocationSynced: true } : point,
        );
        const latest = await getDashboardById(targetDashboardId);
        await persistEditorState(finalState, latest, false);
        adoptSavedState(finalState);
      }
      if (result?.failed.length) {
        saveStatus.value =
          '模板已保存；坐标同步成功 ' +
          result.succeeded.length +
          ' 个，失败 ' +
          result.failed.length +
          ' 个。可再次保存重试；刷新后待同步标志仍保留。取消编辑不会撤销已保存结果。';
      } else {
        saveStatus.value = '模板已保存，设备坐标同步完成（' + candidates.length + ' 个）。';
        leaveEditMode();
        void refreshTemplateRuntime();
      }
    } catch {
      if (!templateSaved) {
        errorMsg.value = '模板保存未确认成功，未执行设备坐标同步。草稿已保留，请检查权限/网络后重试。';
        saveStatus.value = '';
      } else {
        saveStatus.value =
          '模板目标已保存；' +
          (result
            ? '设备坐标成功 ' +
              result.succeeded.length +
              ' 个、失败 ' +
              result.failed.length +
              ' 个，但同步状态保存未确认成功。'
            : '设备同步未完成。') +
          '请再次保存重试，已保存的数据不会自动撤销。';
        errorMsg.value = '保存未全部完成，待同步状态已保留。';
      }
    } finally {
      isSavingEdit.value = false;
      const editing = editorMode.value !== 'view';
      grid?.setStatic(!editing);
      grid?.enableMove(editing);
      grid?.enableResize(editing);
    }
  }

  async function handleControlSwitchSettingsSave() {
    if (!currentWidget.value || isSavingEdit.value || editorMode.value !== 'editing') return;
    void mountWidget(currentWidget.value.id, currentWidget.value.widgetKey as LocalWidgetKey);
    selectedWidgetId.value = '';
    addPanelVisible.value = false;
  }

  function updateControlSwitchSettings(value: any) {
    if (!currentWidget.value) return;
    currentWidget.value.config.settings = value;
  }

  function getSensorPopupWidgetsForView(sensorId: string): PopupWidgetConfig[] {
    if (isDashboardTemplateMode.value) {
      return draftSensorPopupBindings.value[sensorId] || [];
    }

    if (editorMode.value === 'view') {
      return getSensorPopupWidgets(sensorId);
    }
    return draftSensorPopupBindings.value[sensorId] || [];
  }

  function getSensorPopupWidgetsForEditor(sensorId: string): PopupWidgetConfig[] {
    return draftSensorPopupBindings.value[sensorId] || [];
  }

  async function persistSensorPopupWidgets(widgetsForSensor: PopupWidgetConfig[]) {
    if (!selectedSensor.value || isSavingEdit.value || editorMode.value !== 'editing') return;
    draftSensorPopupBindings.value = {
      ...draftSensorPopupBindings.value,
      [selectedSensor.value.id]: cloneJson(widgetsForSensor),
    };
  }

  async function handleSensorPopupChanged(widgetsForSensor: PopupWidgetConfig[]) {
    await persistSensorPopupWidgets(widgetsForSensor);
  }

  async function handleSensorPopupSaved(widgetsForSensor: PopupWidgetConfig[]) {
    await persistSensorPopupWidgets(widgetsForSensor);
    sensorConfigVisible.value = false;
  }

  function onSensorClick(sensor: SensorMapPoint) {
    if (editorMode.value !== 'view') {
      openPointActions(sensor);
      return;
    }
    selectedSensor.value = sensor;
    closeCameraPopup();

    if (editorMode.value !== 'view') {
      sensorPreviewVisible.value = false;
      sensorConfigVisible.value = true;
      return;
    }

    sensorConfigVisible.value = false;
    sensorPreviewVisible.value = true;
  }

  function findAlarmPoint(payload: AlarmFocusPayload) {
    const pointId = payload.pointId || '';
    const originatorId = payload.originatorId || '';
    return activeMapPoints.value.find((point) => {
      if (pointId && point.id === pointId) return true;
      if (originatorId && point.entityId === originatorId) return true;
      return false;
    });
  }

  function onAlarmFocus(payload: AlarmFocusPayload) {
    const point = findAlarmPoint(payload);
    if (point) {
      cesiumMapRef.value?.flyToPoint(point);
      return;
    }

    if (Number.isFinite(payload.longitude) && Number.isFinite(payload.latitude)) {
      cesiumMapRef.value?.flyToPoint({
        longitude: payload.longitude as number,
        latitude: payload.latitude as number,
        height: payload.height,
      });
    } else {
      errorMsg.value = '未找到该报警对应的地图点位';
    }
  }

  async function onCameraClick(camera: CameraMapPoint) {
    if (editorMode.value !== 'view') {
      openPointActions(camera);
      return;
    }
    selectedSensor.value = null;
    sensorPreviewVisible.value = false;
    sensorConfigVisible.value = false;

    selectedCameraPoint.value = camera;
    selectedCameraRuntime.value = {
      entityId: camera.entityId,
      entityName: camera.entityName || camera.name,
      cameraName: camera.name,
    };
    cameraRuntimeLoading.value = true;
    cameraRuntimeError.value = 'Failed to read camera device information';
    cameraPopupVisible.value = true;

    const requestId = ++cameraRuntimeRequestId;

    try {
      const runtime = await loadCameraRuntimeInfo(camera.entityId, camera.entityName || camera.name, [
        camera.id,
        camera.name,
      ]);
      if (requestId !== cameraRuntimeRequestId) {
        void releaseCameraVideoSession(runtime);
        return;
      }

      selectedCameraRuntime.value = {
        ...runtime,
        entityId: runtime.entityId,
        entityName: runtime.entityName || camera.entityName || camera.name,
        cameraName: camera.name || runtime.cameraName,
      };
    } catch (error: any) {
      if (requestId !== cameraRuntimeRequestId) return;
      console.error('[MapWidgetEditor] Failed to load camera runtime info:', {
        pointId: camera.id,
        entityId: camera.entityId,
        entityName: camera.entityName,
        error,
      });
      cameraRuntimeError.value = 'Failed to read camera device information';
      selectedCameraRuntime.value = {
        entityId: camera.entityId,
        entityName: camera.entityName || camera.name,
        cameraName: camera.name,
      };
    } finally {
      if (requestId === cameraRuntimeRequestId) {
        cameraRuntimeLoading.value = false;
      }
    }
  }

  function closeCameraPopup() {
    cameraPopupVisible.value = false;
    cameraRuntimeLoading.value = false;
    cameraRuntimeError.value = 'Failed to read camera device information';
    selectedCameraPoint.value = null;
    selectedCameraRuntime.value = null;
    cameraRuntimeRequestId += 1;
  }

  function formatCoordinate(value?: number) {
    if (value === undefined || value === null || Number.isNaN(value)) return '-';
    return value.toFixed(6);
  }

  function formatHeight(value?: number) {
    if (value === undefined || value === null || Number.isNaN(value)) return '-';
    return Number(value).toFixed(2);
  }

  function onExit() {
    if (isSavingEdit.value) return;
    if (editorMode.value !== 'view') {
      if (!window.confirm('放弃尚未保存的草稿并退出？已完成的保存和同步不会撤销。')) return;
      cancelEdit();
    }
    router.push(isDashboardTemplateMode.value ? '/dashboard/list' : '/desktop/dashboard');
  }

  function onPointEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || isSavingEdit.value) return;
    if (editorMode.value !== 'view' && editorMode.value !== 'editing') cancelPickingPoint();
    else {
      editPointId.value = '';
      closeRemovedPoints();
    }
  }

  function canLeaveEditor() {
    if (isSavingEdit.value) return false;
    if (editorMode.value === 'view') return true;
    if (!window.confirm('放弃尚未保存的草稿并离开？已完成的保存和同步不会撤销。')) return false;
    cancelEdit();
    return true;
  }

  onBeforeRouteLeave(() => canLeaveEditor());
  onBeforeRouteUpdate((to, from) => {
    if (isSavingEdit.value) return false;
    if (to.query.dashboardId !== from.query.dashboardId) {
      if (!canLeaveEditor()) return false;
      // 同组件更换模板使用完整重载，避免旧草稿与新的路由 ID 混用。
      window.location.assign(router.resolve(to).href);
      return false;
    }
    return true;
  });

  function onEditorBeforeUnload(event: BeforeUnloadEvent) {
    if (editorMode.value === 'view' && !isSavingEdit.value) return;
    event.preventDefault();
    event.returnValue = '';
  }

  onMounted(async () => {
    window.addEventListener('keydown', onPointEscape);
    window.addEventListener('beforeunload', onEditorBeforeUnload);
    if (!hasPermission(Authority.TENANT_ADMIN)) {
      await router.replace('/map-home');
      return;
    }
    if (!dashboardId.value) {
      await router.replace('/dashboard/list');
      return;
    }

    await nextTick();
    if (!gridEl.value) return;

    patchGridstackRenderOnce();
    try {
      await loadEditorState();
      void refreshTemplateRuntime();
    } catch (error: any) {
      errorMsg.value = error?.message || '鍔犺浇澶у睆妯℃澘澶辫触';
    }
    reloadLibrary();

    grid = GridStack.init(
      {
        column: mapScreen.metrics.value.columns,
        cellHeight: mapScreen.metrics.value.cellHeight || 30,
        margin: mapScreen.metrics.value.margin || 10,
        float: true,
        draggable: {
          handle: '.mw-widget',
          cancel: 'button, input, textarea, select, option, canvas, video, iframe',
        },
        disableResize: false,
        alwaysShowResizeHandle: true,
        resizable: { handles: 'all' },
        disableDrag: false,
      },
      gridEl.value,
    );

    gridEl.value.addEventListener('click', onGridClick, true);
    grid.on('resizestart', beginWidgetResize);
    grid.on('change', () => {
      if (!grid || editorMode.value === 'view' || applyingScreenMetrics) return;
      syncLayoutFromGrid();
    });

    datasourceRuntime.connect();
    applyScreenMetrics();
    renderGrid();
    grid.setStatic(true);
    grid.enableMove(false);
    grid.enableResize(false);
  });

  onBeforeUnmount(() => {
    editorDisposed = true;
    stopProfileRuntime?.();
    previewBillboards.dispose();
    cameraRuntimeRequestId += 1;
    clearDragHint();
    clearPointPicking();
    closeRemovedPoints();
    window.removeEventListener('keydown', onPointEscape);
    window.removeEventListener('beforeunload', onEditorBeforeUnload);
    gridEl.value?.removeEventListener('click', onGridClick, true);
    grid?.destroy(false);
    grid = null;
    unmountAllWidgets();
    datasourceRuntime.close();
  });
</script>

<style scoped>
  .mw-point-panel,
  .mw-save-status {
    z-index: 25;
    position: absolute;
    z-index: 35;
    max-width: min(560px, calc(100% - 32px));
    padding: 16px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 12px;
    background: rgba(8, 20, 34, 0.96);
    color: #e2e8f0;
    line-height: 1.8;
    box-shadow: 0 8px 32px #0006;
  }

  .mw-point-panel {
    top: 76px;
    left: 16px;
  }
  .mw-point-panel select {
    color: #fff;
    background: #13263b;
    padding: 4px;
  }
  .mw-save-status {
    bottom: 16px;
    left: 16px;
    max-height: 35%;
    overflow: auto;
  }
  .mw-dialog-card.mw-removed-card {
    width: min(640px, calc(100% - 32px));
    max-height: 80%;
    overflow: auto;
  }
  .mw-removed-entry {
    padding: 12px 0;
    border-bottom: 1px solid #64748b66;
  }
  .mw-removed-entry small {
    display: block;
    color: #fbbf24;
  }
  .mw-point-panel .mw-dialog-actions {
    flex-wrap: wrap;
  }
  .mw-saving-mask {
    position: absolute;
    inset: 0;
    z-index: 9999;
    display: grid;
    place-items: center;
    background: rgba(3, 10, 20, 0.72);
    color: white;
    cursor: wait;
    font-size: 18px;
  }

  .mw-editor {
    position: relative;
    container: map-editor / size;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #050b14;
  }

  .mw-editbar {
    position: relative;
    z-index: 40;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    flex: 0 0 auto;
    min-height: 56px;
    padding: 10px 14px;
    box-sizing: border-box;
    color: #fff;
    background: linear-gradient(180deg, rgba(8, 20, 34, 0.98), rgba(8, 20, 34, 0.92));
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
    box-shadow: 0 10px 24px rgba(0, 7, 18, 0.18);
  }

  .mw-editbar-left,
  .mw-editbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .mw-editbar-right {
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .mw-editbar-center {
    display: grid;
    gap: 2px;
    min-width: 0;
    text-align: center;
    pointer-events: none;
  }

  .mw-editbar-title {
    overflow: hidden;
    color: rgba(255, 255, 255, 0.94);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mw-editbar-mode {
    color: rgba(203, 213, 225, 0.8);
    font-size: 12px;
    line-height: 1.2;
  }

  .mw-stage {
    position: relative;
    container: map-screen / size;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .mw-cesium {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .mw-top-bar {
    position: absolute;
    inset: 0 0 auto;
    z-index: 20;
  }

  .mw-page-settings-panel {
    position: absolute;
    top: calc(var(--map-top-bar-offset, 0px) + 12px);
    right: 12px;
    bottom: 12px;
    z-index: 33;
    max-height: calc(100% - var(--map-top-bar-offset, 0px) - 24px);
  }

  .mw-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid rgba(255, 255, 255, 0.55);
    background: rgba(25, 30, 40, 0.72);
    color: #fff;
    padding: 8px 12px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    backdrop-filter: blur(6px);
  }

  .mw-btn.primary {
    background: rgba(22, 100, 145, 0.88);
  }

  .mw-btn.active {
    border-color: rgba(125, 211, 252, 0.9);
    background: rgba(14, 165, 233, 0.92);
    box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.22);
  }

  .mw-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .mw-appearance-panel {
    position: absolute;
    top: calc(var(--map-top-bar-offset, 0px) + 12px);
    left: 12px;
    z-index: 28;
    width: min(380px, calc(100% - 24px));
    box-sizing: border-box;
    display: grid;
    gap: 14px;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    background: rgba(8, 20, 34, 0.78);
    box-shadow: 0 16px 42px rgba(0, 7, 18, 0.28);
    color: #fff;
    backdrop-filter: blur(8px);
  }

  .mw-appearance-panel__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .mw-appearance-panel__header strong {
    font-size: 14px;
  }

  .mw-appearance-panel__header span {
    color: rgba(255, 255, 255, 0.66);
    font-size: 11px;
  }

  .mw-appearance-control {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr) 48px;
    align-items: center;
    gap: 10px;
    font-size: 12px;
  }

  .mw-appearance-control input {
    width: 100%;
    accent-color: #38bdf8;
    cursor: pointer;
  }

  .mw-appearance-control output {
    color: #bae6fd;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .mw-mode-banner {
    position: absolute;
    top: calc(var(--map-top-bar-offset, 0px) + 12px);
    left: 12px;
    z-index: 25;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.88);
    border: 1px solid rgba(148, 163, 184, 0.18);
    color: #fff;
  }

  .mw-mode-banner__text {
    font-size: 13px;
    font-weight: 600;
  }

  .mw-dialog-mask {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
  }

  .mw-dialog-card {
    width: min(420px, calc(100% - 32px));
    padding: 18px;
    border-radius: 16px;
    background: rgba(18, 22, 30, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #fff;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.35);
  }

  .mw-dialog-title {
    font-size: 16px;
    font-weight: 700;
  }

  .mw-dialog-sub {
    margin-top: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.72);
  }

  .mw-aggregate-dialog {
    display: grid;
    gap: 14px;
  }

  .mw-aggregate-key-picker {
    display: grid;
    gap: 9px;
  }

  .mw-aggregate-key-picker__title {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: rgba(255, 255, 255, 0.68);
    font-size: 12px;
  }

  .mw-aggregate-key-list {
    display: flex;
    max-height: 190px;
    flex-wrap: wrap;
    gap: 8px;
    overflow-y: auto;
    padding: 2px;
  }

  .mw-aggregate-key-chip {
    border: 1px solid rgba(125, 211, 252, 0.26);
    border-radius: 999px;
    background: rgba(8, 47, 73, 0.42);
    color: rgba(224, 242, 254, 0.82);
    padding: 6px 10px;
    cursor: pointer;
    font-size: 12px;
  }

  .mw-aggregate-key-chip:hover,
  .mw-aggregate-key-chip.active {
    border-color: rgba(56, 189, 248, 0.9);
    background: rgba(14, 116, 144, 0.72);
    color: #fff;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.12);
  }

  .mw-aggregate-key-state,
  .mw-aggregate-key-warning {
    padding: 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(224, 242, 254, 0.68);
    font-size: 12px;
  }

  .mw-aggregate-key-state.is-error,
  .mw-aggregate-key-warning {
    border: 1px solid rgba(251, 146, 60, 0.24);
    color: #fdba74;
  }

  .mw-aggregate-field {
    display: grid;
    gap: 6px;
    color: rgba(255, 255, 255, 0.74);
    font-size: 12px;
  }

  .mw-aggregate-field input,
  .mw-aggregate-field select {
    width: 100%;
    height: 38px;
    box-sizing: border-box;
    border: 1px solid rgba(125, 211, 252, 0.28);
    border-radius: 8px;
    outline: none;
    background: rgba(8, 20, 34, 0.72);
    color: #e0f2fe;
    padding: 0 10px;
  }

  .mw-aggregate-field input:focus,
  .mw-aggregate-field select:focus {
    border-color: rgba(56, 189, 248, 0.8);
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.12);
  }

  .mw-dialog-actions {
    display: flex;
    gap: 10px;
    margin-top: 16px;
  }

  .mw-sensor-style-panel {
    position: absolute;
    top: calc(var(--map-top-bar-offset, 0px) + 12px);
    right: 12px;
    z-index: 31;
    width: min(860px, calc(100% - 24px));
    max-height: calc(100% - var(--map-top-bar-offset, 0px) - 24px);
    overflow: hidden;
    box-sizing: border-box;
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 12px;
    background: rgba(8, 20, 34, 0.94);
    color: #fff;
    box-shadow: 0 18px 48px rgba(0, 7, 18, 0.34);
    backdrop-filter: blur(10px);
  }

  .mw-sensor-style-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .mw-sensor-style-header div {
    display: grid;
    gap: 4px;
  }

  .mw-sensor-style-header strong {
    font-size: 15px;
  }

  .mw-sensor-style-header span {
    color: rgba(226, 232, 240, 0.68);
    font-size: 12px;
  }

  .mw-panel-close {
    border: 1px solid rgba(148, 163, 184, 0.34);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.72);
    color: #e2e8f0;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 12px;
  }

  .mw-style-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: 14px;
  }

  .mw-style-tab {
    min-height: 34px;
    border: 1px solid rgba(125, 211, 252, 0.22);
    background: rgba(15, 23, 42, 0.48);
    color: rgba(226, 232, 240, 0.76);
    cursor: pointer;
  }

  .mw-style-tab.active {
    border-color: rgba(56, 189, 248, 0.76);
    background: rgba(14, 116, 144, 0.36);
    color: #fff;
  }

  .mw-sensor-point-search input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(125, 211, 252, 0.24);
    background: rgba(15, 23, 42, 0.48);
    color: #fff;
    padding: 8px;
  }

  .mw-sensor-type-item small {
    color: rgba(226, 232, 240, 0.58);
    font-size: 11px;
  }
  .mw-sensor-style-content {
    display: grid;
    grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
  }

  .mw-sensor-style-content.is-point-tab {
    grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  }
  .mw-sensor-type-list {
    display: grid;
    align-content: start;
    gap: 8px;
    max-height: 420px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .mw-sensor-type-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    border: 1px solid rgba(125, 211, 252, 0.22);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.64);
    color: rgba(226, 232, 240, 0.88);
    padding: 9px 10px;
    cursor: pointer;
    text-align: left;
  }

  .mw-sensor-type-item span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mw-sensor-type-item em {
    flex: 0 0 auto;
    color: rgba(186, 230, 253, 0.72);
    font-size: 11px;
    font-style: normal;
  }

  .mw-sensor-type-item:hover,
  .mw-sensor-type-item.active {
    border-color: rgba(56, 189, 248, 0.78);
    background: rgba(14, 116, 144, 0.58);
    color: #fff;
  }

  .mw-sensor-style-form {
    display: grid;
    align-content: start;
    gap: 12px;
    min-width: 0;
  }

  .mw-sensor-style-selected,
  .mw-sensor-style-field {
    display: grid;
    gap: 6px;
    color: rgba(226, 232, 240, 0.74);
    font-size: 12px;
  }

  .mw-sensor-style-selected strong {
    color: #fff;
    font-size: 14px;
  }

  .mw-sensor-style-field input[type='color'] {
    width: 72px;
    height: 36px;
    padding: 0;
    border: 1px solid rgba(125, 211, 252, 0.34);
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
  }

  .mw-sensor-style-field input[type='file'] {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(125, 211, 252, 0.24);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.64);
    color: rgba(226, 232, 240, 0.82);
    padding: 8px;
  }

  .mw-sensor-style-preview-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .mw-sensor-style-preview-card {
    display: grid;
    place-items: center;
    gap: 8px;
    min-height: 124px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.5);
    color: rgba(226, 232, 240, 0.72);
    font-size: 12px;
  }

  .mw-sensor-style-preview-card img {
    width: 64px;
    height: 64px;
  }

  .mw-dialog-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .mw-preview-scope {
    display: grid;
    gap: 8px;
    margin-top: 16px;
    color: rgba(226, 232, 240, 0.72);
    font-size: 12px;
  }

  .mw-preview-scope div {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .mw-preview-scope small {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 1px solid rgba(125, 211, 252, 0.22);
    padding: 4px 7px;
    color: #e0f2fe;
  }
  .mw-sensor-style-inline-preview {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(125, 211, 252, 0.2);
    background: rgba(15, 23, 42, 0.36);
    color: rgba(226, 232, 240, 0.78);
    font-size: 12px;
  }
  .mw-sensor-style-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .mw-sensor-style-state,
  .mw-sensor-style-error {
    padding: 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(224, 242, 254, 0.72);
    font-size: 12px;
  }

  .mw-sensor-style-error {
    border: 1px solid rgba(251, 146, 60, 0.24);
    color: #fdba74;
  }

  @container map-editor (max-width: 720px) {
    .mw-style-tabs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      margin-top: 14px;
    }

    .mw-style-tab {
      min-height: 34px;
      border: 1px solid rgba(125, 211, 252, 0.22);
      background: rgba(15, 23, 42, 0.48);
      color: rgba(226, 232, 240, 0.76);
      cursor: pointer;
    }

    .mw-style-tab.active {
      border-color: rgba(56, 189, 248, 0.76);
      background: rgba(14, 116, 144, 0.36);
      color: #fff;
    }

    .mw-sensor-point-search input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid rgba(125, 211, 252, 0.24);
      background: rgba(15, 23, 42, 0.48);
      color: #fff;
      padding: 8px;
    }

    .mw-sensor-type-item small {
      color: rgba(226, 232, 240, 0.58);
      font-size: 11px;
    }
    .mw-sensor-style-content {
      grid-template-columns: 1fr;
    }
  }
  .mw-add-panel {
    position: absolute;
    top: calc(var(--map-top-bar-offset, 0px) + 12px);
    left: 12px;
    z-index: 30;
    width: min(620px, calc(100% - 24px));
    max-height: calc(100% - var(--map-top-bar-offset, 0px) - 24px);
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(25, 30, 40, 0.94);
    color: #fff;
    padding: 12px;
    backdrop-filter: blur(10px);
  }

  .mw-add-title,
  .mw-lib-title {
    font-size: 13px;
    font-weight: 600;
    margin: 4px 0 8px;
  }

  .mw-add-list {
    display: grid;
    max-height: calc(100vh - 170px);
    gap: 10px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .mw-widget-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .mw-widget-card-wrap {
    position: relative;
    min-width: 0;
  }

  .mw-widget-card {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.09);
    color: #fff;
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    text-align: left;
    transition:
      border-color 0.16s ease,
      background 0.16s ease,
      transform 0.16s ease;
  }
  .mw-widget-card:hover {
    transform: translateY(-1px);
    border-color: rgba(125, 211, 252, 0.75);
    background: rgba(255, 255, 255, 0.14);
  }
  .mw-widget-card--import {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 10px;
    align-items: center;
  }

  .mw-widget-preview {
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 7px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(15, 23, 42, 0.56);
  }
  .mw-widget-preview--import {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #bae6fd;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0;
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.24), rgba(34, 197, 94, 0.2));
  }
  .mw-widget-preview-img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }
  .mw-widget-preview-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: rgba(255, 255, 255, 0.76);
    font-size: 13px;
    font-weight: 700;
    background: linear-gradient(135deg, rgba(37, 99, 235, 0.28), rgba(20, 184, 166, 0.22));
  }

  .mw-widget-info {
    min-width: 0;
    padding-top: 8px;
  }
  .mw-widget-card--import .mw-widget-info {
    padding-top: 0;
  }
  .mw-widget-name {
    overflow: hidden;
    font-size: 13px;
    font-weight: 700;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mw-widget-meta,
  .mw-widget-desc {
    margin-top: 3px;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.68);
    font-size: 12px;
    line-height: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mw-lib-del {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 2;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(127, 29, 29, 0.86);
    color: #fff;
    border-radius: 999px;
    padding: 3px 7px;
    cursor: pointer;
    font-size: 12px;
    line-height: 16px;
  }

  .mw-empty-hint {
    opacity: 0.72;
    font-size: 12px;
  }

  .mw-add-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }

  .mw-grid {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 10;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }

  .mw-grid--hidden {
    opacity: 0;
    pointer-events: none;
  }

  .mw-control-editor {
    position: absolute;
    top: calc(var(--map-top-bar-offset, 0px) + 12px);
    right: 12px;
    z-index: 30;
    width: min(420px, calc(100% - 24px));
  }

  .mw-error {
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 35;
    max-width: min(480px, calc(100% - 24px));
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(127, 29, 29, 0.92);
    color: #fff;
    font-size: 12px;
  }

  .mw-toast {
    position: absolute;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    z-index: 34;
    max-width: min(620px, calc(100% - 32px));
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.88);
    border: 1px solid rgba(125, 211, 252, 0.28);
    color: #e0f2fe;
    font-size: 12px;
    line-height: 1.4;
    box-shadow: 0 10px 30px rgba(2, 6, 23, 0.28);
    pointer-events: none;
  }

  :deep(.grid-stack-item) {
    pointer-events: auto;
  }

  :deep(.grid-stack-item-content) {
    pointer-events: auto;
    overflow: hidden;
  }

  :deep(.ui-resizable-handle) {
    pointer-events: auto;
    /* 玻璃内容会建立层叠上下文，拖拽手柄须位于内容之上。 */
    z-index: 10;
  }

  :deep(.mw-native-edit) {
    display: none;
  }

  .mw-grid--editing :deep(.mw-native-edit) {
    display: inline-flex;
  }

  :deep(.mw-widget) {
    height: 100%;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  :deep(.mw-del) {
    position: absolute;
    right: 8px;
    top: 6px;
    z-index: 2;
    border: none;
    background: rgba(127, 29, 29, 0.88);
    color: #fff;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    cursor: pointer;
    display: none;
  }

  .mw-grid--editing :deep(.mw-del) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  :deep(.mw-body) {
    flex: 1;
    padding: 8px;
    min-height: 0;
  }

  :deep(.mw-mount) {
    width: 100%;
    height: 100%;
  }

  /* codex-delete-icon-fix */
  .mw-grid--editing :deep(.mw-del) {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 8;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    overflow: hidden;
    color: transparent;
    font-size: 0;
    line-height: 0;
    text-indent: -999px;
    background: rgba(220, 38, 38, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: 999px;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.24);
  }

  .mw-grid--editing :deep(.mw-del::before),
  .mw-grid--editing :deep(.mw-del::after) {
    position: absolute;
    width: 12px;
    height: 2px;
    content: '';
    background: #fff;
    border-radius: 999px;
  }

  .mw-grid--editing :deep(.mw-del::before) {
    transform: rotate(45deg);
  }

  .mw-grid--editing :deep(.mw-del::after) {
    transform: rotate(-45deg);
  }

  @container map-editor (max-width: 960px) {
    .mw-editbar {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px 12px;
      padding: 8px 10px;
    }

    .mw-editbar-center {
      text-align: left;
    }

    .mw-editbar-right {
      grid-column: 1 / -1;
      justify-content: flex-start;
      flex-wrap: nowrap;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: thin;
    }

    .mw-editbar-right .mw-btn {
      flex: 0 0 auto;
    }
  }

  @container map-editor (max-width: 560px) {
    .mw-editbar {
      gap: 6px 8px;
      padding: 7px 8px;
    }

    .mw-btn {
      padding: 7px 9px;
      border-radius: 6px;
      font-size: 12px;
    }

    .mw-page-settings-panel,
    .mw-appearance-panel,
    .mw-sensor-style-panel,
    .mw-add-panel,
    .mw-control-editor {
      right: 8px;
      left: 8px;
      width: auto;
    }

    .mw-mode-banner {
      right: 8px;
      left: 8px;
      flex-wrap: wrap;
    }

    .mw-widget-grid {
      grid-template-columns: 1fr;
    }

    .mw-widget-card--import {
      grid-template-columns: 72px minmax(0, 1fr);
    }
  }
</style>
