import type { NativePhotoSettings } from './nativeWidgetTypes';

export function nativePhotoSpec(fqn: string): boolean {
  return fqn === 'input_widgets.web_camera_input';
}

export function validateNativePhotoSettings(settings: NativePhotoSettings): string[] {
  const errors: string[] = [];
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(settings.imageFormat)) errors.push('图片格式无效');
  if (!Number.isFinite(settings.imageQuality) || settings.imageQuality < 0 || settings.imageQuality > 1)
    errors.push('图片质量须为 0–1');
  if (
    !Number.isInteger(settings.maxWidth) ||
    settings.maxWidth < 1 ||
    settings.maxWidth > 4096 ||
    !Number.isInteger(settings.maxHeight) ||
    settings.maxHeight < 1 ||
    settings.maxHeight > 4096
  )
    errors.push('图片宽高须为 1–4096 像素');
  return errors;
}

export function nativePhotoSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (![width, height, maxWidth, maxHeight].every((number) => Number.isFinite(number) && number > 0))
    throw new Error('相机画面尺寸无效');
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface NativePhotoTransport {
  writeAttribute(data: Record<string, unknown>): Promise<unknown>;
  writeTelemetry(data: Record<string, unknown>): Promise<unknown>;
  readAttribute(key: string): Promise<unknown>;
  readTelemetry(key: string): Promise<unknown>;
}

export async function writeAndReadNativePhoto(
  mode: 'attribute' | 'timeseries',
  key: string,
  image: string,
  transport: NativePhotoTransport,
): Promise<unknown> {
  if (!key.trim() || !image.trim()) throw new Error('图片字段或内容不能为空');
  if (mode === 'attribute') {
    await transport.writeAttribute({ [key]: image });
    return transport.readAttribute(key);
  }
  await transport.writeTelemetry({ [key]: image });
  return transport.readTelemetry(key);
}
