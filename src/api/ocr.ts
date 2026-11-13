// POST /api/ocr/brands: brand-name candidates read from a photo by the server's vision AI.
// The photo is sent only when the person taps the button, and the server does not store it.

export type BrandCandidate = { name: string; registered: boolean };
// Web addresses printed in the photo (not inside the QR), reduced to registered domains.
export type PrintedDomain = { text: string; domain: string };
export type BrandOCRResult = {
  status: 'ok' | 'unavailable' | 'invalid_image';
  brands: BrandCandidate[];
  domains: PrintedDomain[];
  message: string | null;
};

// Server limit is 3MB of image data; base64 is ~4/3 of that.
const MAX_BASE64_CHARS = 4_000_000;
const TIMEOUT_MS = 25_000;

export async function readBrandsFromPhoto(base64: string): Promise<BrandOCRResult> {
  if (base64.length > MAX_BASE64_CHARS) {
    return { status: 'invalid_image', brands: [], domains: [], message: '사진이 너무 커요.' };
  }
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!apiUrl) return { status: 'unavailable', brands: [], domains: [], message: '검사 서버 주소가 설정되지 않았어요.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${apiUrl}/api/ocr/brands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64 }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body && Array.isArray(body.brands)) return { ...body, domains: Array.isArray(body.domains) ? body.domains : [] } as BrandOCRResult;
    return { status: 'unavailable', brands: [], domains: [], message: '사진에서 상표명을 읽지 못했어요. 직접 입력해 주세요.' };
  } catch {
    return { status: 'unavailable', brands: [], domains: [], message: '검사 서버에 연결하지 못했어요. 상표명을 직접 입력해 주세요.' };
  } finally {
    clearTimeout(timer);
  }
}
