import { imagePreview, tbImagePrefix } from '/@/api/tb/images';
import { imageToBase64 } from '/@/utils/file/base64Conver';

const TB_IMAGE_PATH = '/api/images/';

export async function resolveMapLogoImageSrc(source: string) {
  const normalized = String(source || '')
    .replace(tbImagePrefix, '')
    .trim();
  if (!normalized) return '';

  const directPath = normalized.startsWith('api/images/') ? `/${normalized}` : normalized;
  const resourcePathIndex = directPath.indexOf(TB_IMAGE_PATH);
  if (resourcePathIndex < 0) return directPath;

  const resourceLink = directPath.slice(resourcePathIndex);
  const blob = await imagePreview(resourceLink);
  return imageToBase64(blob);
}
