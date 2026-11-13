// Local JPEG/PNG file -> FastAPI's multipart OCR endpoint. Candidates need user confirmation.
export type BrandCandidate = { brand: string; matched_text: string; ocr_confidence: number };
export type OCRStatus = 'ok' | 'no_text' | 'no_brand' | 'low_confidence' | 'ambiguous';
export type BrandOCRResult = {
  status: OCRStatus | 'unavailable' | 'invalid_image';
  candidates: BrandCandidate[];
  message: string;
};

const TIMEOUT_MS = 45_000; // Backend CPU OCR timeout is 30 seconds; allow transport overhead.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MESSAGES: Record<OCRStatus, string> = {
  ok: '찾은 상표가 맞는지 확인한 뒤 선택해 주세요. 글자 인식 신뢰도는 사이트의 안전도를 뜻하지 않아요.',
  no_text: '글자를 읽지 못했어요. 밝고 선명한 사진으로 다시 시도하거나 상표명을 직접 입력해 주세요.',
  no_brand: '등록된 상표를 찾지 못했어요. 상표명을 직접 입력할 수 있어요.',
  low_confidence: '글자 인식 신뢰도가 낮아요. 후보가 실제 상표와 맞는지 확인하거나 다시 촬영해 주세요.',
  ambiguous: '여러 상표가 보여요. QR에 해당하는 상표 하나를 선택해 주세요.',
};

export function parseBrandOCR(value: unknown): BrandOCRResult {
  const body = value as Record<string, unknown> | null;
  const status = body?.ocr_status;
  if (!body || typeof status !== 'string' || !Object.hasOwn(MESSAGES, status) ||
      body.requires_confirmation !== true || !Array.isArray(body.brand_candidates) ||
      body.brand_candidates.length > 10) throw new Error('OCR 응답 형식이 올바르지 않아요.');
  const candidates = body.brand_candidates.map((candidate: unknown): BrandCandidate => {
    const c = candidate as Partial<BrandCandidate> | null;
    if (!c || typeof c.brand !== 'string' || !c.brand.trim() || c.brand.length > 200 ||
        typeof c.matched_text !== 'string' || typeof c.ocr_confidence !== 'number' ||
        !Number.isFinite(c.ocr_confidence) || c.ocr_confidence < 0 || c.ocr_confidence > 1) {
      throw new Error('OCR 후보 형식이 올바르지 않아요.');
    }
    return { brand: c.brand, matched_text: c.matched_text, ocr_confidence: c.ocr_confidence };
  });
  // Never automatically forward the backend's suggested brand_texts to analysis.
  return { status: status as OCRStatus, candidates, message: MESSAGES[status as OCRStatus] };
}

export async function readBrandsFromPhoto(uri: string): Promise<BrandOCRResult> {
  const fail = (status: 'invalid_image' | 'unavailable', message: string): BrandOCRResult =>
    ({ status, candidates: [], message });
  // A QR target URL must never be fetched as an image by the phone.
  if (!/^(file|content|blob):/i.test(uri) && !/^data:image\/(jpeg|png);base64,/i.test(uri)) {
    return fail('invalid_image', '기기에 있는 JPEG/PNG 사진을 선택해 주세요.');
  }
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!apiUrl) return fail('unavailable', '검사 서버 주소가 설정되지 않았어요.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const form = new FormData();
    if (/^(file|content):/i.test(uri)) {
      // React Native FormData reads local files using uri/type/name.
      // RN supports local file descriptors, while the shared DOM type only exposes Blob.
      form.append('image', { uri, name: 'brand.jpg', type: 'image/jpeg' } as unknown as Blob);
    } else {
      // Browser-generated local blob/data URI; never an HTTP(S) image URL.
      const image = await fetch(uri, { signal: controller.signal });
      const blob = await image.blob();
      if (blob.size > MAX_IMAGE_BYTES) return fail('invalid_image', '사진은 5MiB 이하여야 해요.');
      form.append('image', blob, blob.type === 'image/png' ? 'brand.png' : 'brand.jpg');
    }
    const response = await fetch(`${apiUrl}/api/ocr/brands/local`, {
      method: 'POST', body: form, signal: controller.signal, redirect: 'error',
      // Fetch sets the multipart Content-Type including its boundary.
    });
    const body = await response.json().catch(() => null);
    if (response.ok) return parseBrandOCR(body);
    const message = typeof body?.detail === 'string' ? body.detail : '사진을 처리하지 못했어요. 다시 시도하거나 상표명을 직접 입력해 주세요.';
    return fail([400, 413, 415, 422].includes(response.status) ? 'invalid_image' : 'unavailable', message);
  } catch (error) {
    return fail('unavailable', error instanceof Error && error.name === 'AbortError'
      ? '문자인식 대기 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.'
      : '문자인식 응답을 받지 못했어요. 서버 연결을 확인하거나 상표명을 직접 입력해 주세요.');
  } finally {
    clearTimeout(timer);
  }
}
