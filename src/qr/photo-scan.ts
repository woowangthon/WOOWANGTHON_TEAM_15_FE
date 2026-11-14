/** Bounded on-device retries. QR payloads are returned as text, never opened/fetched. */
export type Crop = { originX: number; originY: number; width: number; height: number };
export type ScanImage = { uri: string; width: number; height: number };
export type QRCode = { data: string };
export type PhotoScanner = {
  scan: (uri: string) => Promise<QRCode[]>;
  normalize: (uri: string) => Promise<ScanImage>;
  crop: (image: ScanImage, rect: Crop) => Promise<string>;
};

export function qrCropRegions(width: number, height: number): Crop[] {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0)) return [];
  const regions: Crop[] = [];
  const add = (fraction: number, x: number, y: number) => {
    const side = Math.max(1, Math.floor(Math.min(width, height) * fraction));
    const rect = { originX: Math.round((width - side) * x), originY: Math.round((height - side) * y), width: side, height: side };
    if (!regions.some(r => r.originX === rect.originX && r.originY === rect.originY && r.width === side)) regions.push(rect);
  };
  // Posters tend to place the QR centrally; overlapping tiles also cover off-centre stickers.
  add(0.55, 0.5, 0.5);
  add(0.35, 0.5, 0.5);
  add(1, 0.5, 0.5);
  for (const y of [0, 0.5, 1]) for (const x of [0, 0.5, 1]) add(0.55, x, y);
  return regions;
}

export async function scanQRPhoto(uri: string, scanner: PhotoScanner): Promise<QRCode | null> {
  // Never allow a QR target or remote image into the native image reader.
  if (!/^(file|content):\/\//i.test(uri)) return null;
  let scanSucceeded = false;
  const tryScan = async (imageUri: string) => {
    try {
      const codes = await scanner.scan(imageUri);
      scanSucceeded = true;
      return codes.find(c => typeof c.data === 'string' && c.data.trim()) ?? null;
    } catch {
      return null; // A format/URI failure can still recover after local conversion.
    }
  };
  const original = await tryScan(uri);
  if (original) return original;
  try {
    const image = await scanner.normalize(uri);
    const normalized = await tryScan(image.uri);
    if (normalized) return normalized;
    for (const rect of qrCropRegions(image.width, image.height)) {
      try {
        const code = await tryScan(await scanner.crop(image, rect));
        if (code) return code;
      } catch {
        // Continue through other bounded regions when one native crop fails.
      }
    }
  } catch {
    if (!scanSucceeded) throw new Error('PHOTO_QR_UNREADABLE');
  }
  if (!scanSucceeded) throw new Error('PHOTO_QR_UNREADABLE');
  return null;
}
