import { scanFromURLAsync } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { photoForQR } from './photo';
import { decodeQRImage, QRPhotoError } from './qr-decode';
import { scanWithFallback } from '../qr/fallback.ts';
import { scanQRPhoto, type Crop } from '../qr/photo-scan.ts';

// PNG conversion avoids another lossy JPEG pass and materializes image orientation.
// Derivatives stay in Expo's local cache; the original poster URI is retained for OCR.
async function prepare(uri: string, crop?: Crop) {
  const context = ImageManipulator.manipulate(uri);
  try {
    if (crop) context.crop(crop);
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ format: SaveFormat.PNG });
      return { uri: saved.uri, width: image.width, height: image.height };
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

/** Photo opt-in: use independent server decoding FIRST, rather than gating OCR on native still-photo decoding. */
export function readQRFromPhoto(uri: string, allowServerFallback = false, onServerScan?: () => void) {
  const local = () => scanQRPhoto(uri, {
    scan: imageUri => scanFromURLAsync(imageUri, ['qr']),
    normalize: imageUri => prepare(imageUri),
    crop: async (image, rect) => (await prepare(image.uri, rect)).uri,
  });
  if (!allowServerFallback) return local();
  return scanWithFallback(async () => {
    onServerScan?.();
    const base64 = await photoForQR(uri);
    if (!base64) throw new QRPhotoError('서버에 보낼 사진을 준비하지 못했어요. JPG/PNG 사진을 다시 선택해 주세요.');
    return decodeQRImage(base64);
  }, local, true);
}
