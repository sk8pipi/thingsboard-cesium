<template>
  <BasicModal
    v-bind="$attrs"
    :showFooter="true"
    :can-fullscreen="false"
    @register="registerModal"
    @ok="handleSubmit"
    width="50%"
  >
    <template #title>
      <Icon :icon="getTitle.icon" class="pr-1 m-1" />
      <span>{{ getTitle.value }}</span>
    </template>

    <BasicForm @register="registerForm">
      <template #upload="{ model, field }">
        <Upload.Dragger
          :max-count="1"
          :before-upload="
            async (file) => {
              const base64 = await fileToBase64(file);
              model[field] = base64;
              model['fileName'] = file.name;
              return false;
            }
          "
        >
          <p class="ant-upload-drag-icon">
            <Icon :icon="'ant-design:upload-outlined'" />
          </p>
          <p class="ant-upload-text">{{ t('tb.resource.form.uploadTip') }}</p>
        </Upload.Dragger>
      </template>
    </BasicForm>
  </BasicModal>
</template>
<script lang="ts">
  export default defineComponent({
    name: 'ViewsTbResourceLibraryForm',
  });
</script>
<script lang="ts" setup>
  import { Icon } from '/@/components/Icon';
  import { computed, defineComponent, ref, unref } from 'vue';
  import { BasicModal, useModalInner } from '/@/components/Modal';
  import { useMessage } from '/@/hooks/web/useMessage';
  import { router } from '/@/router';
  import { Upload } from 'ant-design-vue';
  import { useI18n } from '/@/hooks/web/useI18n';
  import { saveResource } from '/@/api/tb/resourceLibrary';
  import { fileToBase64 } from '/@/utils/file/base64Conver';
  import { FormSchema, BasicForm, useForm } from '/@/components/Form';
  import { RESOURCE_TYPE_OPTIONS, ResourceType } from '/@/enums/resourceTypeEnum';
  const { meta } = unref(router.currentRoute);

  const getTitle = computed(() => ({
    icon: meta.icon || 'ant-design:book-outlined',
    value: t('tb.resource.action.add'),
  }));

  const emit = defineEmits(['register', 'success']);

  const { t } = useI18n('tb');
  const { showMessage } = useMessage();

  const [registerModal, { setModalProps, closeModal }] = useModalInner(async (data) => {
    setModalProps({ loading: true });
    resetFields();
    setModalProps({ loading: false });
  });

  const inputFormSchemas: FormSchema[] = [
    {
      label: t('tb.resource.form.resourceType'),
      field: 'resourceType',
      component: 'Select',
      componentProps: {
        options: RESOURCE_TYPE_OPTIONS,
      },
      required: true,
    },
    {
      label: t('tb.resource.form.title'),
      field: 'title',
      component: 'Input',
      required: true,
      ifShow: ({ values }) => values.resourceType == ResourceType.PKCS_12 || values.resourceType == ResourceType.JKS,
    },
    {
      field: 'fileName',
      component: 'Input',
      show: false,
    },
    {
      label: t('tb.resource.form.upload'),
      field: 'data',
      component: 'Input',
      required: true,
      slot: 'upload',
    },
  ];

  const [registerForm, { resetFields, validate }] = useForm({
    labelWidth: 120,
    schemas: inputFormSchemas,
    baseColProps: { lg: 24, md: 24 },
  });

  async function handleSubmit() {
    try {
      const data = await validate();
      setModalProps({ confirmLoading: true });

      const result = await saveResource({
        ...data,
      });
      setTimeout(closeModal);
      emit('success', result);
    } catch (error: any) {
      if (error && error.errorFields) {
        showMessage(t('common.validateError'));
      }
      console.log('error', error);
    } finally {
      setModalProps({ confirmLoading: false });
    }
  }
</script>
