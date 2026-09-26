<template>
  <div class="native-entity-table">
    <div class="toolbar">
      <form v-if="settings.enableSearch" @submit.prevent="applySearch">
        <input v-model="searchDraft" aria-label="搜索实体" placeholder="搜索实体" /><button type="submit">搜索</button>
      </form>
      <button v-if="settings.adminMode && settings.allowCreate" type="button" :disabled="busy" @click="openCreate">
        新增{{ entityLabel }}
      </button>
      <button type="button" :disabled="busy" @click="refresh">刷新</button>
    </div>
    <p v-if="settings.adminMode && previewOnly" class="notice">当前为配置预览，新增、编辑和删除不会提交。</p>
    <p v-if="mutationError" class="error" role="alert">{{ mutationError }}</p>
    <form v-if="formVisible" class="entity-form" @submit.prevent="saveEntityForm">
      <h4>{{ formMode === 'create' ? `新增${entityLabel}` : `编辑${entityLabel}` }}</h4>
      <div class="fields">
        <label>名称<input v-model.trim="form.name" required /></label>
        <label>类型<input v-model.trim="form.type" required /></label>
        <label>标签<input v-model.trim="form.label" /></label>
        <template v-if="settings.editLocation">
          <label>纬度<input v-model="form.latitude" type="number" step="any" /></label>
          <label>经度<input v-model="form.longitude" type="number" step="any" /></label>
        </template>
      </div>
      <div class="form-actions">
        <button type="button" :disabled="busy" @click="closeForm">取消</button>
        <button type="submit" :disabled="busy || !form.name.trim() || !form.type.trim()">
          {{ busy ? '保存中…' : previewOnly ? '预览保存' : '保存' }}
        </button>
      </div>
    </form>
    <div v-if="loading && !rows.length" class="message" role="status">正在读取实体…</div>
    <div v-else-if="error && !rows.length" class="message" role="status">{{ error }}</div>
    <div v-else class="scroll">
      <table :class="{ sticky: settings.stickyHeader }">
        <thead>
          <tr>
            <th>名称</th><th v-if="settings.showLabel">标签</th><th v-if="settings.showType">类型</th>
            <th v-for="column in settings.columns" :key="`${column.type}:${column.key}`">{{
              column.label || column.key
            }}</th>
            <th v-if="showActions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>{{ row.name }}</td
            ><td v-if="settings.showLabel">{{ row.label }}</td
            ><td v-if="settings.showType">{{ row.type }}</td>
            <td v-for="column in settings.columns" :key="`${column.type}:${column.key}`">{{
              row.values[`${column.type}:${column.key}`]
            }}</td>
            <td v-if="showActions" class="actions">
              <button v-if="settings.allowEdit" type="button" :disabled="busy" @click="openEdit(row)">编辑</button>
              <template v-if="settings.allowDelete">
                <button
                  v-if="confirmDeleteId !== row.id"
                  type="button"
                  :disabled="busy"
                  @click="confirmDeleteId = row.id"
                  >删除</button
                >
                <template v-else>
                  <button type="button" :disabled="busy" class="danger" @click="deleteRow(row)">确认删除</button>
                  <button type="button" :disabled="busy" @click="confirmDeleteId = ''">取消</button>
                </template>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="message">暂无实体</div>
    </div>
    <div v-if="error && rows.length" class="message" role="status">{{ error }}</div>
    <footer v-if="settings.displayPagination" class="footer">
      <span>共 {{ total }} 条</span><button type="button" :disabled="page === 0" @click="page--">上一页</button>
      <span>{{ page + 1 }} / {{ Math.max(1, totalPages) }}</span>
      <button type="button" :disabled="page + 1 >= totalPages" @click="page++">下一页</button>
    </footer>
    <div v-else-if="total > rows.length" class="message"
      >共 {{ total }} 条，当前显示前 {{ rows.length }} 条；开启分页可浏览全部。</div
    >
  </div>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue';
  import { findEntityDataByQuery } from '/@/api/tb/entityQuery';
  import { deleteAsset, getAssetById, saveAsset } from '/@/api/tb/asset';
  import { deleteDevice, getDeviceById, saveDevice } from '/@/api/tb/device';
  import { getAttributesByScope, saveEntityAttributesV1 } from '/@/api/tb/telemetry';
  import { EntityType } from '/@/enums/entityTypeEnum';
  import { Scope } from '/@/enums/telemetryEnum';
  import { nativeEntityTableQuery, nativeEntityTableRows, type NativeEntityTableRow } from './nativeEntityTableCore';
  import type { NativeEntityTableSettings } from './nativeWidgetTypes';

  const props = defineProps<{ settings: NativeEntityTableSettings; pollMs: number; previewOnly?: boolean }>();
  const rows = ref<NativeEntityTableRow[]>([]);
  const total = ref(0);
  const totalPages = ref(1);
  const page = ref(0);
  const searchDraft = ref('');
  const search = ref('');
  const loading = ref(false);
  const error = ref('');
  const mutationError = ref('');
  const busy = ref(false);
  const refreshTick = ref(0);
  const formVisible = ref(false);
  const formMode = ref<'create' | 'edit'>('create');
  const originalEntity = ref<Record<string, any> | null>(null);
  const confirmDeleteId = ref('');
  const form = reactive({ id: '', name: '', type: '', label: '', latitude: '', longitude: '' });
  const entityLabel = computed(() => (props.settings.entityType === 'ASSET' ? '资产' : '设备'));
  const showActions = computed(
    () => props.settings.adminMode && (props.settings.allowEdit || props.settings.allowDelete),
  );

  function applySearch() {
    page.value = 0;
    search.value = searchDraft.value;
  }
  function refresh() {
    refreshTick.value++;
  }
  function resetForm() {
    Object.assign(form, { id: '', name: '', type: '', label: '', latitude: '', longitude: '' });
    originalEntity.value = null;
    mutationError.value = '';
  }
  function openCreate() {
    resetForm();
    formMode.value = 'create';
    formVisible.value = true;
  }
  function closeForm() {
    formVisible.value = false;
    resetForm();
  }
  function entityId(id: string) {
    return { entityType: props.settings.entityType as EntityType, id };
  }
  async function openEdit(row: NativeEntityTableRow) {
    resetForm();
    formMode.value = 'edit';
    formVisible.value = true;
    Object.assign(form, {
      id: row.id,
      name: row.name === '—' ? '' : row.name,
      type: row.type === '—' ? '' : row.type,
      label: row.label === '—' ? '' : row.label,
    });
    if (props.previewOnly) return;
    busy.value = true;
    try {
      const [entity, attributes] = await Promise.all([
        props.settings.entityType === 'ASSET' ? getAssetById(row.id) : getDeviceById(row.id),
        props.settings.editLocation
          ? getAttributesByScope(entityId(row.id), Scope.SERVER_SCOPE, { keys: 'latitude,longitude' })
          : Promise.resolve([]),
      ]);
      originalEntity.value = entity as Record<string, any>;
      Object.assign(form, { name: entity?.name || '', type: entity?.type || '', label: entity?.label || '' });
      for (const attribute of attributes || []) {
        if (attribute.key === 'latitude') form.latitude = attribute.value == null ? '' : String(attribute.value);
        if (attribute.key === 'longitude') form.longitude = attribute.value == null ? '' : String(attribute.value);
      }
    } catch (cause: any) {
      mutationError.value = cause?.message || `${entityLabel.value}读取失败`;
    } finally {
      busy.value = false;
    }
  }
  function locationPayload() {
    const numberOrNull = (value: string) => (value === '' ? null : Number(value));
    return { latitude: numberOrNull(form.latitude), longitude: numberOrNull(form.longitude) };
  }
  async function saveEntityForm() {
    mutationError.value = '';
    if (props.previewOnly) {
      mutationError.value = '配置预览不会提交实体变更。';
      return;
    }
    if (!form.name.trim() || !form.type.trim()) {
      mutationError.value = '名称和类型不能为空。';
      return;
    }
    busy.value = true;
    try {
      const payload: Record<string, any> = {
        ...(originalEntity.value || {}),
        name: form.name.trim(),
        type: form.type.trim(),
        label: form.label.trim(),
      };
      if (
        props.settings.entityType === 'DEVICE' &&
        originalEntity.value?.type &&
        originalEntity.value.type !== payload.type
      )
        delete payload.deviceProfileId;
      const saved = props.settings.entityType === 'ASSET' ? await saveAsset(payload) : await saveDevice(payload);
      const savedId = typeof saved?.id === 'string' ? saved.id : saved?.id?.id;
      if (!savedId) throw new Error(`${entityLabel.value}保存成功，但响应中缺少实体 ID`);
      if (props.settings.editLocation)
        await saveEntityAttributesV1(entityId(savedId), Scope.SERVER_SCOPE, locationPayload());
      formVisible.value = false;
      resetForm();
      refresh();
    } catch (cause: any) {
      mutationError.value = cause?.message || `${entityLabel.value}保存失败`;
    } finally {
      busy.value = false;
    }
  }
  async function deleteRow(row: NativeEntityTableRow) {
    mutationError.value = '';
    if (props.previewOnly) {
      mutationError.value = '配置预览不会删除实体。';
      confirmDeleteId.value = '';
      return;
    }
    busy.value = true;
    try {
      if (props.settings.entityType === 'ASSET') await deleteAsset(row.id);
      else await deleteDevice(row.id);
      confirmDeleteId.value = '';
      if (rows.value.length === 1 && page.value > 0) page.value--;
      else refresh();
    } catch (cause: any) {
      mutationError.value = cause?.message || `${entityLabel.value}删除失败`;
    } finally {
      busy.value = false;
    }
  }

  watch(
    () => JSON.stringify(props.settings),
    () => {
      page.value = 0;
      confirmDeleteId.value = '';
      closeForm();
    },
  );
  watch(
    () => JSON.stringify([props.settings, props.pollMs, page.value, search.value, refreshTick.value]),
    (_value, _previous, onCleanup) => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      loading.value = !rows.value.length;
      const run = async () => {
        try {
          const result = await findEntityDataByQuery(nativeEntityTableQuery(props.settings, page.value, search.value));
          if (!active) return;
          rows.value = nativeEntityTableRows(result.data || [], props.settings.columns);
          total.value = Number(result.totalElements ?? rows.value.length);
          totalPages.value = Number(result.totalPages ?? 1);
          error.value = '';
        } catch (cause: any) {
          if (active) {
            rows.value = [];
            error.value = cause?.message || '实体读取失败';
          }
        } finally {
          if (active) {
            loading.value = false;
            timer = setTimeout(run, Math.max(5000, props.pollMs));
          }
        }
      };
      void run();
      onCleanup(() => {
        active = false;
        if (timer) clearTimeout(timer);
      });
    },
    { immediate: true },
  );
</script>

<style scoped>
  .native-entity-table {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    width: 100%;
    padding: 8px;
  }
  .toolbar,
  .toolbar form,
  .footer,
  .actions,
  .form-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .toolbar,
  .form-actions {
    justify-content: flex-end;
  }
  .scroll {
    overflow: auto;
    flex: 1;
    min-height: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    white-space: nowrap;
  }
  th,
  td {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.24);
  }
  .sticky th {
    position: sticky;
    top: 0;
    background: #20384a;
    z-index: 1;
  }
  .footer {
    justify-content: flex-end;
  }
  .message,
  .notice,
  .error {
    padding: 8px;
    margin: 0;
  }
  .notice {
    color: #8dd4ff;
  }
  .error,
  .danger {
    color: #ff8f8f;
  }
  .entity-form {
    padding: 10px;
    border: 1px solid rgba(148, 163, 184, 0.32);
    border-radius: 6px;
    background: rgba(16, 37, 53, 0.88);
  }
  .entity-form h4 {
    margin: 0 0 8px;
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
  }
  .fields label {
    display: grid;
    gap: 4px;
  }
  .form-actions {
    margin-top: 10px;
  }
</style>
