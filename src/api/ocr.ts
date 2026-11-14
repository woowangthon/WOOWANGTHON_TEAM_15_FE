// BAZE vision OCR: prepared image base64 -> backend JSON API. Candidates need user confirmation.
export type BrandCandidate = { brand: string; registered: boolean };
export type BrandOCRResult = {
  status: 'ok' | 'unavailable' | 'invalid_image';
  candidates: BrandCandidate[];
  message: string;
};

const TIMEOUT_MS = 25_000; // Backend AI OCR timeout is 18 seconds.
const MAX_BASE64_CHARS = 4 * 1024 * 1024; // 3MiB of decoded image data.
const CONFIRM_MESSAGE = 'AI가 읽은 상표 후보예요. 실제 상표와 맞는지 확인한 뒤 선택해 주세요.';

export function parseBrandOCR(value: unknown): BrandOCRResult {
  const body = value as Record<string, unknown> | null;
  if (!body || !['ok', 'unavailable', 'invalid_image'].includes(String(body.status)) ||
      !Array.isArray(body.brands) || body.brands.length > 5 ||
      (body.message !== null && body.message !== undefined && typeof body.message !== 'string')) {
    throw new Error('AI OCR 응답 형식이 올바르지 않아요.');
  }
  const candidates = body.brands.map((value: unknown): BrandCandidate => {
    const item = value as { name?: unknown; registered?: unknown } | null;
    if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 30 ||
        typeof item.registered !== 'boolean') throw new Error('AI OCR 후보 형식이 올바르지 않아요.');
    return { brand: item.name, registered: item.registered };
  });
  const status = body.status as BrandOCRResult['status'];
  return {
    status, candidates: status === 'ok' ? candidates : [],
    message: typeof body.message === 'string' && body.message.trim() ? body.message
      : status !== 'ok' ? 'AI가 사진을 처리하지 못했어요. 다시 시도하거나 상표명을 직접 입력해 주세요.'
      : candidates.length ? CONFIRM_MESSAGE : '사진에서 상표를 찾지 못했어요. 다시 촬영하거나 상표명을 직접 입력해 주세요.',
  };
}

export async function readBrandsFromPhoto(imageBase64: string): Promise<BrandOCRResult> {
  const fail = (status: 'invalid_image' | 'unavailable', message: string): BrandOCRResult =>
    ({ status, candidates: [], message });
  const base64 = imageBase64.replace(/^data:image\/(jpeg|png|webp);base64,/i, '');
  // A phone file URI or a QR target URL cannot be used as an AI image URL.
  if (base64.length < 16 || base64.length > MAX_BASE64_CHARS || base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return fail('invalid_image', '3MiB 이하의 사진을 준비하지 못했어요. 상표 부분을 잘라 다시 선택해 주세요.');
  }
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!apiUrl) return fail('unavailable', '검사 서버 주소가 설정되지 않았어요.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${apiUrl}/api/ocr/brands`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64 }),
      signal: controller.signal, redirect: 'error',
    });
    const body = await response.json().catch(() => null);
    if (response.ok) return parseBrandOCR(body);
    const message = typeof body?.detail === 'string' ? body.detail : 'AI가 사진을 처리하지 못했어요. 다시 시도하거나 상표명을 직접 입력해 주세요.';
    return fail([400, 413, 415, 422].includes(response.status) ? 'invalid_image' : 'unavailable', message);
  } catch (error) {
    return fail('unavailable', error instanceof Error && error.name === 'AbortError'
      ? 'AI 문자인식 대기 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.'
      : 'AI 문자인식 응답을 받지 못했어요. 서버 연결을 확인하거나 상표명을 직접 입력해 주세요.');
  } finally {
    clearTimeout(timer);
  }
}
