import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type { CameraPoint } from './cameraTypes';

export function useCameraOverlay(cameraSource: MaybeRefOrGetter<CameraPoint[]>) {
  const selectedCameraId = ref('');
  const panelVisible = ref(false);

  const selectedCamera = computed(() => {
    const cameras = toValue(cameraSource);
    return cameras.find((camera) => camera.id === selectedCameraId.value) ?? null;
  });

  function openCamera(camera: CameraPoint) {
    selectedCameraId.value = camera.id;
    panelVisible.value = true;
  }

  function switchCamera(cameraId: string) {
    const cameras = toValue(cameraSource);
    const target = cameras.find((camera) => camera.id === cameraId);
    if (!target) return;

    selectedCameraId.value = target.id;
    panelVisible.value = true;
  }

  function closeCamera() {
    panelVisible.value = false;
  }

  function clearCamera() {
    selectedCameraId.value = '';
    panelVisible.value = false;
  }

  watch(
    () => toValue(cameraSource),
    (cameras) => {
      if (!selectedCameraId.value) return;

      const exists = cameras.some((camera) => camera.id === selectedCameraId.value);
      if (!exists) {
        clearCamera();
      }
    },
    { deep: true },
  );

  return {
    panelVisible,
    selectedCameraId,
    selectedCamera,
    openCamera,
    switchCamera,
    closeCamera,
    clearCamera,
  };
}
