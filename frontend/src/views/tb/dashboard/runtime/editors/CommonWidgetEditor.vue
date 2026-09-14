<script lang="ts">
  // 共用原生 Vue 配置器，避免空 SFC 被路由扫描器收集后阻断构建。
  export { default } from '../native/NativeWidgetComposer.vue';
</script>
