<template>
  <aside class="map-top-bar-settings" aria-label="大屏顶部栏设置">
    <header class="map-top-bar-settings__header">
      <div>
        <strong>页面设置</strong>
        <span>配置用户大屏顶部栏</span>
      </div>
      <button
        class="map-top-bar-settings__icon-button"
        type="button"
        title="关闭"
        aria-label="关闭"
        @click="emit('close')"
      >
        <Icon icon="ant-design:close-outlined" :size="18" />
      </button>
    </header>

    <section class="map-top-bar-settings__section">
      <label class="map-top-bar-settings__toggle">
        <span>
          <strong>显示顶部栏</strong>
          <small>关闭后用户大屏不显示顶部栏</small>
        </span>
        <input type="checkbox" :checked="modelValue.visible" @change="patchRoot({ visible: checkedValue($event) })" />
      </label>

      <label class="map-top-bar-settings__field">
        <span>顶部栏高度</span>
        <div class="map-top-bar-settings__range">
          <input
            type="range"
            min="48"
            max="96"
            step="1"
            :value="modelValue.height"
            @input="patchRoot({ height: numberValue($event) })"
          />
          <output>{{ modelValue.height }}px</output>
        </div>
      </label>
    </section>

    <section class="map-top-bar-settings__section">
      <div class="map-top-bar-settings__section-title">品牌区域</div>
      <label class="map-top-bar-settings__toggle">
        <span>
          <strong>显示品牌</strong>
          <small>在顶部栏左侧显示 Logo 和名称</small>
        </span>
        <input
          type="checkbox"
          :checked="modelValue.brand.visible"
          @change="patchBrand({ visible: checkedValue($event) })"
        />
      </label>
      <div class="map-top-bar-settings__logo-upload">
        <div class="map-top-bar-settings__logo-preview">
          <img
            v-if="logoPreviewUrl && !logoPreviewFailed"
            :src="logoPreviewUrl"
            alt="Logo 预览"
            @error="logoPreviewFailed = true"
          />
          <Icon v-else icon="ant-design:picture-outlined" :size="28" />
        </div>
        <div class="map-top-bar-settings__logo-controls">
          <input
            ref="logoFileInput"
            class="map-top-bar-settings__file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            @change="handleLogoFileChange"
          />
          <div class="map-top-bar-settings__logo-actions">
            <button type="button" :disabled="logoUploading" @click="logoFileInput?.click()">
              <Icon icon="ant-design:upload-outlined" :size="16" />
              {{ logoUploading ? '正在上传' : modelValue.brand.logoUrl ? '替换图片' : '上传图片' }}
            </button>
            <button
              v-if="modelValue.brand.logoUrl"
              class="is-danger"
              type="button"
              :disabled="logoUploading"
              @click="clearLogo"
            >
              <Icon icon="ant-design:delete-outlined" :size="16" />
              移除
            </button>
          </div>
          <small>支持 PNG、JPG、WebP，文件不超过 2MB</small>
          <div v-if="logoUploadError" class="map-top-bar-settings__upload-error">{{ logoUploadError }}</div>
        </div>
      </div>
      <label class="map-top-bar-settings__field">
        <span>Logo 高度</span>
        <div class="map-top-bar-settings__range">
          <input
            type="range"
            min="20"
            max="48"
            step="2"
            :value="modelValue.brand.logoHeight"
            @input="patchBrand({ logoHeight: numberValue($event) })"
          />
          <output>{{ modelValue.brand.logoHeight }}px</output>
        </div>
      </label>
      <label class="map-top-bar-settings__field">
        <span>Logo 最大宽度</span>
        <div class="map-top-bar-settings__range">
          <input
            type="range"
            min="40"
            max="160"
            step="4"
            :value="modelValue.brand.logoMaxWidth"
            @input="patchBrand({ logoMaxWidth: numberValue($event) })"
          />
          <output>{{ modelValue.brand.logoMaxWidth }}px</output>
        </div>
      </label>
      <label class="map-top-bar-settings__field">
        <span>Logo 地址</span>
        <input
          type="url"
          :value="modelValue.brand.logoUrl"
          placeholder="https://example.com/logo.png"
          @input="patchBrand({ logoUrl: textValue($event) })"
        />
      </label>
      <label class="map-top-bar-settings__field">
        <span>品牌名称</span>
        <input
          type="text"
          maxlength="40"
          :value="modelValue.brand.name"
          placeholder="例如：智慧物联平台"
          @input="patchBrand({ name: textValue($event) })"
        />
      </label>
    </section>

    <section class="map-top-bar-settings__section">
      <div class="map-top-bar-settings__section-title">大屏标题</div>
      <label class="map-top-bar-settings__toggle">
        <span>
          <strong>显示标题</strong>
          <small>标题始终在顶部栏中间居中</small>
        </span>
        <input
          type="checkbox"
          :checked="modelValue.title.visible"
          @change="patchTitle({ visible: checkedValue($event) })"
        />
      </label>
      <label class="map-top-bar-settings__toggle">
        <span>
          <strong>使用 Dashboard 名称</strong>
          <small>名称变化后顶部栏自动同步</small>
        </span>
        <input
          type="checkbox"
          :checked="modelValue.title.useDashboardTitle"
          @change="patchTitle({ useDashboardTitle: checkedValue($event) })"
        />
      </label>
      <label v-if="!modelValue.title.useDashboardTitle" class="map-top-bar-settings__field">
        <span>自定义标题</span>
        <input
          type="text"
          maxlength="60"
          :value="modelValue.title.text"
          placeholder="请输入用户大屏标题"
          @input="patchTitle({ text: textValue($event) })"
        />
      </label>
    </section>

    <section class="map-top-bar-settings__section">
      <div class="map-top-bar-settings__section-title">功能按钮</div>
      <div class="map-top-bar-settings__hint">管理员在此配置；画布预览按钮不会执行操作。</div>
      <div class="map-top-bar-settings__actions">
        <div v-for="(action, index) in orderedActions" :key="action.id" class="map-top-bar-settings__action">
          <label class="map-top-bar-settings__action-visible" :title="`显示${actionName(action.type)}按钮`">
            <input
              type="checkbox"
              :checked="action.visible"
              @change="patchAction(action.id, { visible: checkedValue($event) })"
            />
          </label>
          <Icon :icon="actionIcon(action.type)" :size="18" />
          <input
            class="map-top-bar-settings__action-label"
            type="text"
            maxlength="12"
            :value="action.label"
            :aria-label="`${actionName(action.type)}按钮名称`"
            @input="patchAction(action.id, { label: textValue($event) })"
          />
          <div class="map-top-bar-settings__action-order">
            <button
              type="button"
              title="上移"
              aria-label="上移"
              :disabled="index === 0"
              @click="moveAction(action.id, -1)"
            >
              <Icon icon="ant-design:arrow-up-outlined" :size="15" />
            </button>
            <button
              type="button"
              title="下移"
              aria-label="下移"
              :disabled="index === orderedActions.length - 1"
              @click="moveAction(action.id, 1)"
            >
              <Icon icon="ant-design:arrow-down-outlined" :size="15" />
            </button>
          </div>
        </div>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { uploadImage } from '/@/api/tb/images';
  import { Icon } from '/@/components/Icon';
  import { useMessage } from '/@/hooks/web/useMessage';
  import type { MapTopBarActionConfig, MapTopBarActionType, MapTopBarConfig } from '../mapTemplateConfig';
  import { resolveMapLogoImageSrc } from '../services/mapLogoImageService';

  const props = defineProps<{
    modelValue: MapTopBarConfig;
  }>();

  const emit = defineEmits<{
    'update:modelValue': [value: MapTopBarConfig];
    close: [];
  }>();

  const LOGO_MAX_FILE_SIZE = 2 * 1024 * 1024;
  const LOGO_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const LOGO_FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);
  const logoFileInput = ref<HTMLInputElement | null>(null);
  const logoUploading = ref(false);
  const logoUploadError = ref('');
  const logoPreviewFailed = ref(false);
  const logoPreviewUrl = ref('');
  let logoPreviewRequestId = 0;
  const { showMessage } = useMessage();

  const orderedActions = computed(() =>
    props.modelValue.actions.slice().sort((left, right) => left.order - right.order),
  );

  watch(
    () => props.modelValue.brand.logoUrl,
    async (source) => {
      const requestId = ++logoPreviewRequestId;
      logoPreviewFailed.value = false;
      logoPreviewUrl.value = '';
      try {
        const resolved = await resolveMapLogoImageSrc(source);
        if (requestId === logoPreviewRequestId) {
          logoPreviewUrl.value = resolved;
        }
      } catch {
        if (requestId === logoPreviewRequestId) {
          logoPreviewFailed.value = true;
        }
      }
    },
    { immediate: true },
  );

  function checkedValue(event: Event) {
    return (event.target as HTMLInputElement).checked;
  }

  function numberValue(event: Event) {
    return Number((event.target as HTMLInputElement).value);
  }

  function textValue(event: Event) {
    return (event.target as HTMLInputElement).value;
  }

  function patchRoot(patch: Partial<MapTopBarConfig>) {
    emit('update:modelValue', { ...props.modelValue, ...patch });
  }

  function patchBrand(patch: Partial<MapTopBarConfig['brand']>) {
    patchRoot({ brand: { ...props.modelValue.brand, ...patch } });
  }

  function validateLogoFile(file: File) {
    const extension = String(file.name.split('.').pop() || '').toLowerCase();
    if (!LOGO_MIME_TYPES.has(file.type) && !LOGO_FILE_EXTENSIONS.has(extension)) {
      throw new Error('请选择 PNG、JPG 或 WebP 图片。');
    }
    if (file.size > LOGO_MAX_FILE_SIZE) {
      throw new Error('Logo 图片不能超过 2MB。');
    }
  }

  async function handleLogoFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    logoUploading.value = true;
    logoUploadError.value = '';
    try {
      validateLogoFile(file);
      const resource = await uploadImage(file, `大屏 Logo - ${file.name}`);
      const logoUrl = String((resource as any)?.link || '').trim();
      if (!logoUrl) throw new Error('图片上传成功，但没有返回可用的资源地址。');
      patchBrand({ logoUrl });
      showMessage('Logo 上传成功', 'success');
    } catch (error: any) {
      logoUploadError.value = error?.message || 'Logo 上传失败，请稍后重试。';
    } finally {
      logoUploading.value = false;
      input.value = '';
    }
  }

  function clearLogo() {
    logoUploadError.value = '';
    patchBrand({ logoUrl: '' });
  }

  function patchTitle(patch: Partial<MapTopBarConfig['title']>) {
    patchRoot({ title: { ...props.modelValue.title, ...patch } });
  }

  function patchAction(id: MapTopBarActionType, patch: Partial<MapTopBarActionConfig>) {
    patchRoot({
      actions: props.modelValue.actions.map((action) => (action.id === id ? { ...action, ...patch } : action)),
    });
  }

  function moveAction(id: MapTopBarActionType, offset: -1 | 1) {
    const actions = orderedActions.value;
    const sourceIndex = actions.findIndex((action) => action.id === id);
    const targetIndex = sourceIndex + offset;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= actions.length) return;

    const reordered = actions.slice();
    const [action] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, action);
    patchRoot({ actions: reordered.map((item, index) => ({ ...item, order: index + 1 })) });
  }

  function actionName(type: MapTopBarActionType) {
    if (type === 'overview') return '总览';
    if (type === 'settings') return '设置';
    return '全屏';
  }

  function actionIcon(type: MapTopBarActionType) {
    if (type === 'overview') return 'ant-design:appstore-outlined';
    if (type === 'settings') return 'ant-design:setting-outlined';
    return 'ant-design:fullscreen-outlined';
  }
</script>

<style scoped>
  .map-top-bar-settings {
    display: grid;
    align-content: start;
    gap: 0;
    width: min(380px, calc(100vw - 24px));
    max-height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    color: #e8eef5;
    background: rgba(8, 20, 34, 0.97);
    border: 1px solid rgba(125, 211, 252, 0.24);
    border-radius: 6px;
    box-shadow: 0 18px 48px rgba(0, 7, 18, 0.38);
    backdrop-filter: blur(12px);
  }

  .map-top-bar-settings__header {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 58px;
    padding: 10px 14px;
    box-sizing: border-box;
    background: #0b1a2a;
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  }

  .map-top-bar-settings__header > div {
    display: grid;
    gap: 2px;
  }

  .map-top-bar-settings__header strong {
    font-size: 15px;
  }

  .map-top-bar-settings__header span,
  .map-top-bar-settings__hint,
  .map-top-bar-settings small {
    color: rgba(203, 213, 225, 0.7);
    font-size: 11px;
    line-height: 1.45;
  }

  .map-top-bar-settings__icon-button,
  .map-top-bar-settings__action-order button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    color: #dce7f2;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 4px;
    cursor: pointer;
  }

  .map-top-bar-settings__section {
    display: grid;
    gap: 12px;
    padding: 14px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  }

  .map-top-bar-settings__section:last-child {
    border-bottom: 0;
  }

  .map-top-bar-settings__section-title {
    color: #7dd3fc;
    font-size: 12px;
    font-weight: 700;
  }

  .map-top-bar-settings__toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .map-top-bar-settings__toggle > span {
    display: grid;
    gap: 2px;
  }

  .map-top-bar-settings__toggle strong,
  .map-top-bar-settings__field > span {
    font-size: 12px;
    font-weight: 600;
  }

  .map-top-bar-settings input[type='checkbox'] {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
    accent-color: #0ea5e9;
    cursor: pointer;
  }

  .map-top-bar-settings__field {
    display: grid;
    gap: 7px;
  }

  .map-top-bar-settings__logo-upload {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
  }

  .map-top-bar-settings__logo-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    overflow: hidden;
    box-sizing: border-box;
    color: rgba(186, 230, 253, 0.72);
    background: rgba(15, 34, 51, 0.78);
    border: 1px solid rgba(125, 211, 252, 0.22);
    border-radius: 4px;
  }

  .map-top-bar-settings__logo-preview img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .map-top-bar-settings__logo-controls {
    display: grid;
    gap: 7px;
    min-width: 0;
  }

  .map-top-bar-settings__file-input {
    display: none;
  }

  .map-top-bar-settings__logo-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .map-top-bar-settings__logo-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 10px;
    color: #e0f2fe;
    background: rgba(14, 116, 144, 0.4);
    border: 1px solid rgba(56, 189, 248, 0.48);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .map-top-bar-settings__logo-actions button.is-danger {
    color: #fecaca;
    background: rgba(127, 29, 29, 0.3);
    border-color: rgba(248, 113, 113, 0.42);
  }

  .map-top-bar-settings__logo-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .map-top-bar-settings__upload-error {
    color: #fca5a5;
    font-size: 11px;
    line-height: 1.4;
  }

  .map-top-bar-settings__field > input,
  .map-top-bar-settings__action-label {
    width: 100%;
    height: 36px;
    padding: 0 10px;
    box-sizing: border-box;
    color: #e8eef5;
    background: rgba(15, 34, 51, 0.78);
    border: 1px solid rgba(125, 211, 252, 0.22);
    border-radius: 4px;
    outline: none;
    font-size: 12px;
  }

  .map-top-bar-settings__field > input:focus,
  .map-top-bar-settings__action-label:focus {
    border-color: #38bdf8;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.12);
  }

  .map-top-bar-settings__range {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 48px;
    align-items: center;
    gap: 10px;
  }

  .map-top-bar-settings__range input {
    width: 100%;
    accent-color: #0ea5e9;
  }

  .map-top-bar-settings__range output {
    color: #bae6fd;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .map-top-bar-settings__actions {
    display: grid;
    gap: 8px;
  }

  .map-top-bar-settings__action {
    display: grid;
    grid-template-columns: 18px 20px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    min-height: 44px;
  }

  .map-top-bar-settings__action-visible {
    display: inline-flex;
  }

  .map-top-bar-settings__action-order {
    display: flex;
    gap: 4px;
  }

  .map-top-bar-settings__action-order button {
    width: 28px;
    height: 28px;
  }

  .map-top-bar-settings__action-order button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  @media (max-width: 420px) {
    .map-top-bar-settings__header {
      gap: 10px;
      padding: 9px 12px;
    }

    .map-top-bar-settings__section {
      gap: 10px;
      padding: 12px;
    }

    .map-top-bar-settings__logo-upload {
      grid-template-columns: 56px minmax(0, 1fr);
      gap: 10px;
    }

    .map-top-bar-settings__logo-preview {
      width: 56px;
      height: 56px;
    }

    .map-top-bar-settings__action {
      grid-template-columns: 18px 18px minmax(0, 1fr) auto;
      gap: 6px;
    }
  }
</style>
