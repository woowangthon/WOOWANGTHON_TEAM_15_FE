import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Longest side sent to the OCR server. Enough to read a brand name,
// and keeps even an uncropped phone photo far under the server's 5MiB limit.
const MAX_SIDE = 1600;

/** Downscale a local photo and return a local JPEG URI for /api/ocr/brands/local, or null if it cannot be read. */
export async function photoForOcr(uri: string): Promise<string | null> {
  const context = ImageManipulator.manipulate(uri);
  try {
    const original = await context.renderAsync();
    const { width, height } = original;
    original.release();
    if (Math.max(width, height) > MAX_SIDE) {
      context.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    image.release();
    return saved.uri;
  } catch {
    return null;
  } finally {
    context.release();
  }
}
