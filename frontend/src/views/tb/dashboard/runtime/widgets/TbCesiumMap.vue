<template>
  <div ref="el" class="tb-cesium"></div>
</template>

<script setup lang="ts">
  import { onMounted, onBeforeUnmount, ref } from 'vue';
  import * as Cesium from 'cesium';

  Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN || '';
  const el = ref<HTMLDivElement | null>(null);
  let viewer: Cesium.Viewer | null = null;

  // 选择你要的建筑模式：'osm'（OSM 建筑） or 'google'（写实 3D Tiles）
  const BUILDINGS_MODE: 'osm' | 'google' = 'osm';

  onMounted(async () => {
    if (!el.value) return;

    // 1) ✅ 设置 Cesium ion token（没有 token，World Terrain / 部分 tileset 可能不可用）
    // 建议放到 .env 或你的配置里，不要硬编码提交到 GitHub
    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN || '';

    // 2) ✅ 创建 Viewer（先用默认地表，后面再异步挂 terrain）
    viewer = new Cesium.Viewer(el.value, {
      animation: false,
      timeline: false,
      baseLayerPicker: true,
      geocoder: false,
      homeButton: true,
      sceneModePicker: true,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: true,
    });

    // 3) ✅ 开启地形（World Terrain）
    // 这是“能看到起伏地形”的关键
    try {
      viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
    } catch (e) {
      console.warn('WorldTerrain 加载失败：', e);
    }

    // 建议：贴地/地形遮挡更真实（比如贴地折线/贴地标注等）
    viewer.scene.globe.depthTestAgainstTerrain = true;

    // 4) ✅ 加建筑（两种选一个）
    try {
      if (BUILDINGS_MODE === 'osm') {
        // OSM Buildings：轻量、效果直观
        const buildings = await Cesium.createOsmBuildingsAsync();
        viewer.scene.primitives.add(buildings);
      } else {
        // Google Photorealistic 3D Tiles：更写实，但更重，且对 token/配额更敏感
        const tileset = await Cesium.createGooglePhotorealistic3DTileset();
        viewer.scene.primitives.add(tileset);
      }
    } catch (e) {
      console.warn('建筑 Tileset 加载失败：', e);
    }

    // 5) ✅ 飞到一个位置（北京示例）
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(116.3913, 39.9075, 20000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-35),
        roll: 0,
      },
    });
  });

  onBeforeUnmount(() => {
    try {
      viewer?.destroy();
    } finally {
      viewer = null;
    }
  });
</script>

<style scoped>
  .tb-cesium {
    width: 100%;
    height: 100%;
  }
</style>
