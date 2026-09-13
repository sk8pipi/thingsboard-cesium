import { downloadImage } from '/@/api/tb/images';
import { buildSensorPointBillboard } from './sensorPointStyleService';
import type { resolveProfilePointStyle } from './deviceProfilePresentation';

type Style = ReturnType<typeof resolveProfilePointStyle>;
/** Per-view cache: no cross-user private image reuse, and no retry storm on failed images. */
export function createProfileBillboardCache(onReady: () => void) {
  const images = new Map<string, Promise<HTMLImageElement>>();
  const billboards = new Map<string, string>();
  const pending = new Set<string>();
  const failed = new Set<string>();
  let disposed = false;
  function loadImage(url: string) {
    let promise = images.get(url);
    if (!promise) {
      promise = (async () => {
        let blobUrl: string | undefined;
        const src = url.startsWith('/api/images/') ? (blobUrl = URL.createObjectURL(await downloadImage(url))) : url;
        try {
          return await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('配置图片加载失败'));
            img.src = src;
          });
        } finally {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
        }
      })();
      images.set(url, promise);
    }
    return promise;
  }
  function get(style: Style, online: boolean) {
    const key = JSON.stringify([style, online]);
    if (billboards.has(key)) return billboards.get(key)!;
    const fallback = buildSensorPointBillboard(style, online);
    billboards.set(key, fallback);
    if (style.image && !pending.has(key) && !failed.has(style.image)) {
      pending.add(key);
      void loadImage(style.image)
        .then((img) => {
          if (disposed) return;
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 64;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.fillStyle = online ? style.color : style.override?.offlineColor || '#94A3B8';
          ctx.beginPath();
          ctx.arc(32, 32, 25, 0, Math.PI * 2);
          ctx.fill();
          if (!online) ctx.filter = 'grayscale(1)';
          const scale = Math.min(34 / img.width, 34 / img.height);
          ctx.drawImage(
            img,
            (64 - img.width * scale) / 2,
            (64 - img.height * scale) / 2,
            img.width * scale,
            img.height * scale,
          );
          billboards.set(key, canvas.toDataURL());
          onReady();
        })
        .catch(() => {
          if (style.image) failed.add(style.image);
        })
        .finally(() => pending.delete(key));
    }
    // Bound style variants without evicting in-flight entries.
    if (billboards.size > 512)
      for (const candidate of billboards.keys()) {
        if (!pending.has(candidate) && candidate !== key) {
          billboards.delete(candidate);
          break;
        }
      }
    return fallback;
  }
  return {
    get,
    dispose() {
      disposed = true;
      images.clear();
      billboards.clear();
      failed.clear();
    },
  };
}
