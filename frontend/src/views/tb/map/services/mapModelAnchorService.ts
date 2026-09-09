import { Cartesian3, Cartographic, Math as CesiumMath, Matrix4, Transforms, HeadingPitchRoll } from 'cesium';
import type { MapSceneModel } from '../mapTemplateConfig';
import type { MapModelAnchor, MapPickedLocation, MapPoint, MapPointLocation } from '../types/mapPointTypes';
import { BASE_MODEL_ASSET_ID, BASE_MODEL_CENTER } from '../mapSceneConfig';

export const BASE_SCENE_MODEL_ID = '__base_scene_model__';
export type ModelAnchorStatus = 'attached' | 'hidden' | 'loading' | 'missing' | 'failed' | 'changed' | 'invalid';
export interface SceneModelRuntime {
  model: MapSceneModel;
  status: 'loading' | 'ready' | 'failed';
  matrix?: Matrix4;
}
export type AnchoredLocation = MapPointLocation & { modelAnchor?: MapModelAnchor; positionSource?: 'template' };

export function getEffectiveSceneModels(models: MapSceneModel[], globeOnly: boolean): MapSceneModel[] {
  if (globeOnly) return [];
  if (models.length) return models;
  return [
    {
      id: BASE_SCENE_MODEL_ID,
      name: '默认三维模型',
      type: '3d-tiles',
      source: 'ion',
      assetId: BASE_MODEL_ASSET_ID,
      ...BASE_MODEL_CENTER,
    },
  ];
}

export function getModelRevision(model: MapSceneModel): string {
  // 仅检测资源配置变化，不作为安全摘要；不将资源 URL 放入点位数据。
  const source = JSON.stringify([model.type, model.source, model.assetId || '', model.url || '', model.revision || '']);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `v1-${(hash >>> 0).toString(16)}`;
}

export function createModelPlacementMatrix(model: MapSceneModel, groundHeight: number): Matrix4 {
  const scale = model.scale ?? 1;
  const values = [
    model.longitude,
    model.latitude,
    groundHeight,
    model.heightOffset ?? model.height ?? 0,
    model.heading ?? 0,
    model.pitch ?? 0,
    model.roll ?? 0,
    scale,
  ];
  if (
    !values.every(Number.isFinite) ||
    scale <= 0 ||
    Math.abs(model.latitude) > 90 ||
    Math.abs(model.longitude) > 180
  ) {
    throw new Error('模型定位参数无效');
  }
  const matrix = Transforms.headingPitchRollToFixedFrame(
    Cartesian3.fromDegrees(model.longitude, model.latitude, groundHeight + (model.heightOffset ?? model.height ?? 0)),
    new HeadingPitchRoll(
      CesiumMath.toRadians(model.heading ?? 0),
      CesiumMath.toRadians(model.pitch ?? 0),
      CesiumMath.toRadians(model.roll ?? 0),
    ),
  );
  return Matrix4.multiplyByUniformScale(matrix, scale, matrix);
}

export function worldToLocation(world: Cartesian3): Required<MapPointLocation> {
  if (![world.x, world.y, world.z, Cartesian3.magnitude(world)].every(Number.isFinite)) {
    throw new Error('表面坐标无效');
  }
  const c = Cartographic.fromCartesian(world);
  if (!c) throw new Error('无法解析表面坐标');
  return {
    longitude: CesiumMath.toDegrees(c.longitude),
    latitude: CesiumMath.toDegrees(c.latitude),
    height: c.height,
    heightMode: 'absolute',
  };
}

export function createModelAnchor(model: MapSceneModel, matrix: Matrix4, world: Cartesian3): MapModelAnchor {
  const local = Matrix4.multiplyByPoint(Matrix4.inverse(matrix, new Matrix4()), world, new Cartesian3());
  return {
    frameVersion: 1,
    modelId: model.id,
    modelRevision: getModelRevision(model),
    localPosition: { x: local.x, y: local.y, z: local.z },
    fallbackWorldPosition: worldToLocation(world),
    occlusion: 'physical',
  };
}

export function isValidModelAnchor(value: unknown): value is MapModelAnchor {
  const a = value as MapModelAnchor | undefined;
  return Boolean(
    a &&
      a.frameVersion === 1 &&
      typeof a.modelId === 'string' &&
      a.modelId &&
      typeof a.modelRevision === 'string' &&
      a.modelRevision &&
      a.localPosition &&
      a.fallbackWorldPosition &&
      [
        a.localPosition.x,
        a.localPosition.y,
        a.localPosition.z,
        a.fallbackWorldPosition.longitude,
        a.fallbackWorldPosition.latitude,
        a.fallbackWorldPosition.height,
      ].every(Number.isFinite) &&
      Math.abs(a.fallbackWorldPosition.latitude) <= 90 &&
      Math.abs(a.fallbackWorldPosition.longitude) <= 180 &&
      ['physical', 'alwaysVisible'].includes(a.occlusion),
  );
}

export { usesTemplatePosition } from './mapPointPositionService';

export function resolveModelAnchor(point: AnchoredLocation, models: ReadonlyMap<string, SceneModelRuntime>) {
  const anchor = point.modelAnchor;
  const fallback = isValidModelAnchor(anchor) ? anchor.fallbackWorldPosition : point;
  const location: Required<MapPointLocation> = {
    longitude: fallback.longitude,
    latitude: fallback.latitude,
    height: fallback.height ?? 0,
    heightMode: 'absolute',
  };
  const result = (status: ModelAnchorStatus) => ({ status, location, visible: status !== 'hidden' });
  if (!isValidModelAnchor(anchor)) return result('invalid');
  const runtime = models.get(anchor.modelId);
  if (!runtime) return result('missing');
  if (runtime.model.visible === false) return result('hidden');
  if (getModelRevision(runtime.model) !== anchor.modelRevision) return result('changed');
  if (runtime.status === 'loading') return result('loading');
  if (runtime.status !== 'ready' || !runtime.matrix) return result('failed');
  const world = Matrix4.multiplyByPoint(
    runtime.matrix,
    Cartesian3.fromElements(anchor.localPosition.x, anchor.localPosition.y, anchor.localPosition.z),
    new Cartesian3(),
  );
  try {
    return { status: 'attached' as const, location: worldToLocation(world), visible: true };
  } catch {
    return result('invalid');
  }
}

export function attachPoint<T extends MapPoint>(point: T, picked: MapPickedLocation): T {
  if (!isValidModelAnchor(picked.modelAnchor)) throw new Error('请选择有效的模型表面位置');
  return {
    ...point,
    ...picked,
    // Vue ref/reactive 会将候选及其嵌套坐标包装成 Proxy，不能直接 structuredClone。
    // 锚点只有两层坐标记录，分别复制为普通对象，避免草稿与候选共享可变坐标。
    modelAnchor: {
      ...picked.modelAnchor,
      localPosition: { ...picked.modelAnchor.localPosition },
      fallbackWorldPosition: { ...picked.modelAnchor.fallbackWorldPosition },
    },
    positionSource: 'template',
    locationSource: 'manual',
    updatedAt: Date.now(),
  };
}

export function detachPoint<T extends MapPoint>(point: T, location: Required<MapPointLocation>): T {
  const { modelAnchor: _anchor, ...rest } = point;
  return {
    ...rest,
    longitude: location.longitude,
    latitude: location.latitude,
    height: location.height,
    heightMode: 'absolute',
    positionSource: 'template',
    locationSource: 'manual',
    updatedAt: Date.now(),
  } as T;
}

export function modelAnchorStatusText(status: ModelAnchorStatus): string {
  return {
    attached: '已贴附',
    hidden: '模型已隐藏',
    loading: '模型加载中，暂用保存位置',
    missing: '模型不存在，请重新绑定',
    failed: '模型加载失败，暂用保存位置',
    changed: '模型资源已变更，请重新校准',
    invalid: '模型绑定无效，请重新定位',
  }[status];
}

export function assertNoRemovedModelBindings(previous: MapSceneModel[], next: MapSceneModel[], points: MapPoint[]) {
  const nextIds = new Set(next.map((model) => model.id));
  const removedIds = new Set(previous.filter((model) => !nextIds.has(model.id)).map((model) => model.id));
  const affected = points.filter((point) => point.modelAnchor && removedIds.has(point.modelAnchor.modelId));
  if (affected.length) throw new Error(`移除模型会影响 ${affected.length} 个点位，请先重新绑定或解除绑定`);
}
