import type { AnalyzeResponse } from './types.ts';

// Page fetch (up to 18s) + AI call can take a while; give up after this.
const TIMEOUT_MS = 90_000;

// What the optional QR-photo lookup (brand candidates) found, so the result screen can say so,
// including when it found nothing or had to be skipped.
export type PhotoNote =
  | { kind: 'found'; brands: string[]; usedBrand: string | null }
  | { kind: 'none' }
  | { kind: 'skipped'; reason: string };

export type AnalyzeOutcome =
  // brandTexts: what the user (or OCR) sent, so the screen can tell "not entered" from "not registered".
  | { kind: 'analysis'; data: AnalyzeResponse; brandTexts: string[]; photo?: PhotoNote }
  | { kind: 'not_url'; raw: string }
  | { kind: 'error'; raw: string; message: string };

export type AnalyzeOptions = { brandTexts?: string[]; storeId?: string | null };

export async function analyzeQr(raw: string, url: string | null, options: AnalyzeOptions = {}): Promise<AnalyzeOutcome> {
  // Plain-text QR payloads never reach the server: the API only accepts HTTP(S) URLs.
  if (!url) return { kind: 'not_url', raw };

  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!apiUrl) {
    return { kind: 'error', raw, message: '검사 서버 주소가 설정되지 않았어요. FE .env의 EXPO_PUBLIC_API_URL을 확인해 주세요.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${apiUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // inspect_page: the server (not the phone) fetches the page so AI can check what it asks for.
      body: JSON.stringify({
        qr_text: url,
        brand_texts: options.brandTexts ?? [],
        store_id: options.storeId ?? null,
        include_ai: true,
        inspect_page: true,
        include_explanation: true,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body) return { kind: 'analysis', data: body as AnalyzeResponse, brandTexts: options.brandTexts ?? [] };
    if (response.status === 422) {
      const detail = typeof body?.detail === 'string' ? body.detail : null;
      return { kind: 'error', raw, message: detail ?? '검사할 수 없는 주소 형식이에요.' };
    }
    return { kind: 'error', raw, message: `검사 서버 오류가 발생했어요. (HTTP ${response.status})` };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      kind: 'error',
      raw,
      message: aborted
        ? '검사 시간이 너무 오래 걸려 중단했어요. 잠시 후 다시 시도해 주세요.'
        : '검사 서버에 연결하지 못했어요. 휴대폰과 PC가 같은 Wi-Fi인지, 서버가 켜져 있는지 확인해 주세요.',
    };
  } finally {
    clearTimeout(timer);
  }
}
