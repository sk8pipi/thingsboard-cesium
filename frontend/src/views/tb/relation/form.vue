<template>
  <BasicModal
    v-bind="$attrs"
    :showFooter="true"
    @register="registerModal"
    @ok="handleSubmit"
    width="40%"
    :show-ok-btn="hasPermission(Authority.TENANT_ADMIN)"
  >
    <template #title>
      <Icon :icon="getTitle.icon" class="pr-1 m-1" />
      <span> {{ getTitle.value }} </span>
    </template>
    <BasicForm @register="registerForm">
      <template #additionalInfo="{ model, field }">
        <div class="border border-solid border-neutral-300 h-30">
          <CodeEditor :bordered="true" :mode="MODE.JSON" v-model:value="model[field]" />
        </div>
      </template>
    </BasicForm>
  </BasicModal>
</template>
<script lang="ts" setup name="ViewsTbRelationForm">
  import { ref, unref, computed, onBeforeUnmount } from 'vue';
  import { useI18n } from '/@/hooks/web/useI18n';
  import { useMessage } from '/@/hooks/web/useMessage';
  import { router } from '/@/router';
  import { Icon } from '/@/components/Icon';
  import { CodeEditor, MODE } from '/@/components/CodeEditor';

  import { BasicForm, FormSchema, useForm } from '/@/components/Form';
  import { BasicModal, useModalInner } from '/@/components/Modal';
  import { useUserStore } from '/@/store/modules/user';
  import { EntityRelation, saveRelation } from '/@/api/tb/relation';
  import { Authority } from '/@/enums/authorityEnum';
  import { RelationTypeGroup } from '/@/enums/relationEnum';
  import { debounce, isEmpty } from 'lodash-es';
  import { usePermission } from '/@/hooks/web/usePermission';
  import { ENTITY_TYPE_OPTIONS, EntityType } from '/@/enums/entityTypeEnum';
  import { getTenantDeviceInfoList } from '/@/api/tb/device';
  import { getTenantAssetInfoList } from '/@/api/tb/asset';
  import { getTenantEntityViewInfos } from '/@/api/tb/entityView';
  import { tenantById } from '/@/api/tb/tenant';
  import { customerList } from '/@/api/tb/customer';
  import { userList } from '/@/api/tb/user';
  import { ruleChainList } from '/@/api/tb/ruleChain';
  import { currentTenantDashboardList } from '/@/api/tb/dashboard';
  import {
    buildRelationSaveData,
    changeRelationEntityType,
    createRelationEntityOptionSource,
    isRelationEntitySelectionRequired,
    isRelationEntityDropdownNearBottom,
    type RelationDirection,
    type RelationEntityOption,
    type RelationEntityOptionPage,
    type RelationEntityOptionQuery,
  } from './relationEntityOptions';

  const emit = defineEmits(['success', 'register']);

  const { t } = useI18n('tb');
  const { hasPermission } = usePermission();
  const userStore = useUserStore();
  const { showMessage } = useMessage();
  const { meta } = unref(router.currentRoute);
  const record = ref<EntityRelation>({} as EntityRelation);
  const direction = ref<RelationDirection>('From');

  const isNewRecord = ref(true);

  const getTitle = computed(() => ({
    icon: meta.icon || 'ant-design:book-outlined',
    value: isNewRecord.value ? t('tb.relation.action.add') : t('tb.relation.action.edit'),
  }));

  const entityTypeOptions = computed(() => {
    return ENTITY_TYPE_OPTIONS.filter((item) => {
      return (
        item.value == EntityType.DEVICE ||
        item.value == EntityType.ASSET ||
        item.value == EntityType.ENTITY_VIEW ||
        item.value == EntityType.TENANT ||
        item.value == EntityType.CUSTOMER ||
        item.value == EntityType.USER ||
        item.value == EntityType.DASHBOARD ||
        item.value == EntityType.RULE_CHAIN
      );
    });
  });
  const fromOptionSource = createRelationEntityOptionSource(fetchRelationEntityPage);
  const toOptionSource = createRelationEntityOptionSource(fetchRelationEntityPage);
  const entitySearchHandlers = {
    From: debounce((text: string) => void resetEntitySearch('From', text), 300),
    To: debounce((text: string) => void resetEntitySearch('To', text), 300),
  };

  const inputFormSchemas: FormSchema[] = [
    { field: 'typeGroup', component: 'Input', defaultValue: RelationTypeGroup.COMMON, show: false },
    {
      label: t('tb.relation.form.relationType'),
      field: 'type',
      component: 'Input',
      componentProps: {
        maxlength: 100,
        placeholder: t('tb.relation.form.relationTypePlaceholder'),
      },
      required: true,
    },
    {
      label: t('tb.relation.form.fromEntity'),
      field: 'from.entityType',
      component: 'Select',
      componentProps: {
        options: entityTypeOptions,
        onChange: (text) => onEntityTypeChange(text, 'From'),
      },
      required: () => isRelationEntitySelectionRequired(direction.value, 'From'),
      show: direction.value == 'To',
      colProps: { lg: 10, md: 10 },
    },
    {
      field: 'from.id',
      component: 'Select',
      componentProps: () => getEntityIdComponentProps('From'),
      required: () => isRelationEntitySelectionRequired(direction.value, 'From'),
      show: direction.value == 'To',
      colProps: { lg: 14, md: 14 },
    },
    {
      label: t('tb.relation.form.toEntity'),
      field: 'to.entityType',
      component: 'Select',
      componentProps: {
        options: entityTypeOptions,
        onChange: (text) => onEntityTypeChange(text, 'To'),
      },
      required: () => isRelationEntitySelectionRequired(direction.value, 'To'),
      show: direction.value == 'From',
      colProps: { lg: 10, md: 10 },
    },
    {
      field: 'to.id',
      component: 'Select',
      componentProps: () => getEntityIdComponentProps('To'),
      required: () => isRelationEntitySelectionRequired(direction.value, 'To'),
      show: direction.value == 'From',
      colProps: { lg: 14, md: 14 },
    },

    {
      label: t('tb.relation.form.additionalInfo'),
      subLabel: '(JSON)',
      field: 'additionalInfo',
      component: 'InputTextArea',
      componentProps: {
        maxlength: 500,
      },
      slot: 'additionalInfo',
    },
  ];

  const [registerForm, { resetFields, setFieldsValue, getFieldsValue, updateSchema, validate }] = useForm({
    labelWidth: 120,
    schemas: inputFormSchemas,
    baseColProps: { lg: 24, md: 24 },
  });

  const [registerModal, { setModalProps, closeModal }] = useModalInner(async (data) => {
    setModalProps({ loading: true });
    await resetFields();
    direction.value = data.direction;
    record.value = { ...data } as EntityRelation;
    isNewRecord.value = direction.value == 'From' ? isEmpty(record.value.to?.id) : isEmpty(record.value.from?.id);

    const relatedEntity = direction.value == 'From' ? record.value.to : record.value.from;
    const relatedName = direction.value == 'From' ? (data as any).toName : (data as any).fromName;
    const selectedOption = relatedEntity?.id
      ? { label: relatedName || relatedEntity.id, value: relatedEntity.id }
      : null;
    await resetEntityOptions(relatedEntity?.entityType, direction.value == 'From' ? 'To' : 'From', '', selectedOption);
    await setFieldsValue(record.value);
    updateSchema([
      {
        label: t('tb.relation.form.relationType'),
        field: 'type',
        component: 'Input',
        componentProps: {
          maxlength: 100,
          placeholder: t('tb.relation.form.relationTypePlaceholder'),
          disabled: !isNewRecord.value,
        },
        required: true,
      },
      {
        label: t('tb.relation.form.fromEntity'),
        field: 'from.entityType',
        component: 'Select',
        componentProps: {
          options: entityTypeOptions,
          onChange: (text) => onEntityTypeChange(text, 'From'),
          disabled: !isNewRecord.value,
        },
        required: () => isRelationEntitySelectionRequired(direction.value, 'From'),
        show: direction.value == 'To',
        colProps: { lg: 8, md: 8 },
      },
      {
        field: 'from.id',
        component: 'Select',
        componentProps: () => getEntityIdComponentProps('From', !isNewRecord.value),
        required: () => isRelationEntitySelectionRequired(direction.value, 'From'),
        show: direction.value == 'To',
        colProps: { lg: 16, md: 16 },
      },
      {
        label: t('tb.relation.form.toEntity'),
        field: 'to.entityType',
        component: 'Select',
        componentProps: {
          options: entityTypeOptions,
          onChange: (text) => onEntityTypeChange(text, 'To'),
          disabled: !isNewRecord.value,
        },
        required: () => isRelationEntitySelectionRequired(direction.value, 'To'),
        show: direction.value == 'From',
        colProps: { lg: 8, md: 8 },
      },
      {
        field: 'to.id',
        component: 'Select',
        componentProps: () => getEntityIdComponentProps('To', !isNewRecord.value),
        required: () => isRelationEntitySelectionRequired(direction.value, 'To'),
        show: direction.value == 'From',
        colProps: { lg: 16, md: 16 },
      },
    ]);
    setModalProps({ loading: false });
  });

  async function handleSubmit() {
    try {
      const formValues = await validate();
      const data = buildRelationSaveData(formValues, record.value, direction.value) as EntityRelation & Recordable;
      data.typeGroup ||= RelationTypeGroup.COMMON;
      setModalProps({ confirmLoading: true });
      if (isEmpty(data.additionalInfo)) {
        delete data.additionalInfo;
      } else if (typeof data.additionalInfo === 'string') {
        try {
          data.additionalInfo = JSON.parse(data.additionalInfo);
        } catch (e) {
          showMessage(t('tb.relation.form.additionalInfoJsonError'), 'error');
          return;
        }
      }
      if (!data.from?.id || !data.from.entityType || !data.to?.id || !data.to.entityType) {
        showMessage(t('common.validateError'), 'error');
        return;
      }
      await saveRelation({ ...data });
      showMessage(isNewRecord.value ? t('tb.relation.action.addSuccess') : t('tb.relation.action.editSuccess'));
      setTimeout(closeModal);
      emit('success', data);
    } catch (error: any) {
      if (error && error.errorFields) {
        showMessage(t('common.validateError'));
      }
      console.log('error', error);
    } finally {
      setModalProps({ confirmLoading: false });
    }
  }

  function getOptionSource(direction: 'From' | 'To') {
    return direction == 'From' ? fromOptionSource : toOptionSource;
  }

  function getEntityIdComponentProps(direction: 'From' | 'To', disabled = false) {
    const source = getOptionSource(direction);
    return {
      options: source.state.options,
      disabled,
      allowClear: true,
      showSearch: true,
      filterOption: false,
      loading: source.state.loading,
      notFoundContent: source.state.loading ? '加载中…' : undefined,
      onSearch: entitySearchHandlers[direction],
      onPopupScroll: (event: Event) => onEntityOptionsScroll(event, direction),
      onDropdownVisibleChange: (open: boolean) => {
        if (
          open &&
          source.state.entityType &&
          source.state.hasNext &&
          source.state.nextPage === 0 &&
          !source.state.loading
        ) {
          void loadNextEntityOptions(direction);
        }
      },
      onSelect: (value: string, option: RelationEntityOption) => {
        source.state.selectedOption = { label: String(option.label || value), value: String(value) };
      },
      onClear: () => {
        source.state.selectedOption = null;
      },
    };
  }

  function mapEntityPage(result: any, label: (item: any) => string): RelationEntityOptionPage {
    return {
      data: (result?.data || [])
        .map((item: any) => ({ label: label(item) || item?.id?.id, value: item?.id?.id }))
        .filter((option: RelationEntityOption) => Boolean(option.value)),
      hasNext: Boolean(result?.hasNext),
      totalElements: Number(result?.totalElements ?? 0),
    };
  }

  async function fetchRelationEntityPage(query: RelationEntityOptionQuery): Promise<RelationEntityOptionPage> {
    const params = {
      pageSize: query.pageSize,
      page: query.page,
      textSearch: query.textSearch || undefined,
      sortProperty: 'name',
      sortOrder: 'ASC' as const,
    };
    switch (query.entityType as EntityType) {
      case EntityType.DEVICE:
        return mapEntityPage(await getTenantDeviceInfoList(params), (item) => item.name);
      case EntityType.ASSET:
        return mapEntityPage(await getTenantAssetInfoList(params), (item) => item.name);
      case EntityType.ENTITY_VIEW:
        return mapEntityPage(await getTenantEntityViewInfos(params), (item) => item.name);
      case EntityType.TENANT: {
        const tenant = await tenantById(userStore.getUserInfo.tenantId.id);
        return {
          data: [{ label: tenant.title || tenant.id.id, value: tenant.id.id }],
          hasNext: false,
          totalElements: 1,
        };
      }
      case EntityType.CUSTOMER:
        return mapEntityPage(
          await customerList({ ...params, sortProperty: 'title' }),
          (item) => item.title || item.name,
        );
      case EntityType.USER:
        return mapEntityPage(
          await userList({ ...params, sortProperty: 'email' }),
          (item) => [item.firstName, item.lastName].filter(Boolean).join(' ') || item.email || item.name,
        );
      case EntityType.DASHBOARD:
        return mapEntityPage(
          await currentTenantDashboardList({ ...params, sortProperty: 'title' }),
          (item) => item.title,
        );
      case EntityType.RULE_CHAIN:
        return mapEntityPage(await ruleChainList(params, 'CORE'), (item) => item.name);
      default:
        return { data: [], hasNext: false, totalElements: 0 };
    }
  }

  async function resetEntityOptions(
    entityType: EntityType | undefined,
    direction: 'From' | 'To',
    textSearch = '',
    selectedOption?: RelationEntityOption | null,
  ) {
    try {
      await getOptionSource(direction).reset(entityType, textSearch, selectedOption);
    } catch (error) {
      console.warn('Failed to load relation entity options', error);
      showMessage('关联实体加载失败，请重试', 'error');
    }
  }

  async function onEntityTypeChange(entityType: EntityType, direction: 'From' | 'To') {
    entitySearchHandlers[direction].cancel();
    const values = getFieldsValue();
    await setFieldsValue(changeRelationEntityType(values, direction, entityType));
    await resetEntityOptions(entityType, direction, '', null);
  }

  async function resetEntitySearch(direction: 'From' | 'To', textSearch: string) {
    const source = getOptionSource(direction);
    await resetEntityOptions(source.state.entityType as EntityType | undefined, direction, textSearch);
  }

  async function loadNextEntityOptions(direction: 'From' | 'To') {
    try {
      await getOptionSource(direction).loadNext();
    } catch (error) {
      console.warn('Failed to load the next relation entity page', error);
      showMessage('关联实体加载失败，请重试', 'error');
    }
  }

  function onEntityOptionsScroll(event: Event, direction: 'From' | 'To') {
    const target = event.target as HTMLElement;
    if (target && isRelationEntityDropdownNearBottom(target)) void loadNextEntityOptions(direction);
  }

  onBeforeUnmount(() => {
    entitySearchHandlers.From.cancel();
    entitySearchHandlers.To.cancel();
    fromOptionSource.cancel();
    toOptionSource.cancel();
  });
</script>
