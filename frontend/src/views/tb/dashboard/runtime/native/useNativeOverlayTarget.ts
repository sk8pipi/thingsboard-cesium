import { shallowRef, onMounted, onBeforeUnmount } from 'vue';

export function resolveNativeOverlayTarget(documentLike: Pick<Document, 'fullscreenElement' | 'body'>) {
  return documentLike.fullscreenElement || documentLike.body;
}

// 浏览器全屏只绘制全屏元素的子树；模态框必须跟随这个宿主。
export function useNativeOverlayTarget() {
  const target = shallowRef<Element | string>(
    typeof document === 'undefined' ? 'body' : resolveNativeOverlayTarget(document),
  );
  const update = () => {
    target.value = resolveNativeOverlayTarget(document);
  };
  onMounted(() => {
    update();
    document.addEventListener('fullscreenchange', update);
  });
  onBeforeUnmount(() => document.removeEventListener('fullscreenchange', update));
  return target;
}
