export type Attack = {
  type: 'credential_theft' | 'personal_data_theft' | 'financial_fraud' | 'unsafe_installation';
  severity: 'none' | 'weak' | 'moderate' | 'strong' | 'unknown';
  evidence_ids: string[];
};

export type Analysis = {
  url: string;
  score: number | null;
  score_version: 'behavior-v1' | 'metadata-v2';
  assessment_status: 'complete' | 'partial' | 'failed';
  level: '낮음' | '주의' | '위험' | '확인 불가';
  components: { ai_behavior: number | null; tls: number | null; domain_age: number | null };
  reasons: { code: string; points: number; message: string; evidence_ids: string[] }[];
  attack_types: Attack[];
  analysis_complete: boolean;
  navigation_allowed: boolean;
  auto_open: false;
  requires_confirmation: true;
  ai_status: string;
  warning: string;
};

export function apiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!raw) throw new Error('분석 서버 주소가 설정되지 않았어요. 프론트 .env의 EXPO_PUBLIC_API_URL을 확인해 주세요.');
  try {
    const value = new URL(raw);
    if (!['http:', 'https:'].includes(value.protocol) || value.username || value.password || value.search || value.hash ||
        !value.hostname || value.pathname !== '/') throw new Error('invalid');
    return value.origin;
  } catch {
    throw new Error('분석 서버 주소 형식이 올바르지 않아요. http://PC_IP:8000 형식으로 설정해 주세요.');
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function score(value: unknown, max: number): boolean {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max);
}

export function parseAnalysis(value: unknown): Analysis {
  if (!record(value) || !['behavior-v1', 'metadata-v2'].includes(String(value.score_version)) || typeof value.url !== 'string' ||
      !score(value.score, 100) || !['complete', 'partial', 'failed'].includes(String(value.assessment_status)) ||
      !['낮음', '주의', '위험', '확인 불가'].includes(String(value.level)) ||
      !record(value.components) || !score(value.components.ai_behavior, 60) ||
      !score(value.components.tls, 25) || !score(value.components.domain_age, 15) ||
      !Array.isArray(value.reasons) || !value.reasons.every(r => record(r) && typeof r.code === 'string' &&
        typeof r.message === 'string' && score(r.points, 100) && r.points !== null) ||
      !Array.isArray(value.attack_types) || !value.attack_types.every(a => record(a) &&
        ['credential_theft', 'personal_data_theft', 'financial_fraud', 'unsafe_installation'].includes(String(a.type)) &&
        ['none', 'weak', 'moderate', 'strong', 'unknown'].includes(String(a.severity))) ||
      value.auto_open !== false || value.requires_confirmation !== true || typeof value.navigation_allowed !== 'boolean' ||
      typeof value.analysis_complete !== 'boolean' || typeof value.warning !== 'string') {
    throw new Error('서버 응답 형식이 맞지 않아요. behavior-v1 백엔드가 실행 중인지 확인해 주세요.');
  }
  return value as Analysis;
}

async function request(path: string, init: RequestInit, signal?: AbortSignal, timeout = 90000): Promise<Response> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let timedOut = false;
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  try {
    return await fetch(apiBaseUrl() + path, { ...init, signal: controller.signal, redirect: 'error' });
  } catch (error) {
    if (signal?.aborted) throw new Error('분석을 취소했어요.');
    if (timedOut) throw new Error('분석 시간이 길어지고 있어요. 잠시 후 다시 시도해 주세요.');
    if (error instanceof Error && /서버 주소/.test(error.message)) throw error;
    throw new Error('분석 서버에 연결할 수 없어요. 서버 실행 상태와 같은 Wi-Fi 연결을 확인해 주세요.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function analyzeQR(qrText: string, inspectPage: boolean, signal?: AbortSignal): Promise<Analysis> {
  const response = await request('/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_text: qrText, brand_texts: [], include_ai: inspectPage, inspect_page: inspectPage }),
  }, signal);
  if (response.status === 422) throw new Error('분석할 수 없는 URL이에요. HTTP(S) 주소와 포트를 확인해 주세요.');
  if (!response.ok) throw new Error('분석 서버에서 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
  try { return parseAnalysis(await response.json()); }
  catch (error) {
    if (error instanceof Error && /응답 형식/.test(error.message)) throw error;
    throw new Error('서버 응답을 읽지 못했어요. 서버 상태를 확인해 주세요.');
  }
}

export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  const response = await request('/health', {}, signal, 5000);
  return response.ok && (await response.json()).status === 'ok';
}

export function readQR(raw: string): { raw: string; url: string | null } {
  const candidate = raw.trim();
  try {
    const value = new URL(candidate);
    if (/^https?:\/\//i.test(candidate) && !/[\s\\\u0000-\u001f]/.test(candidate) && candidate.length <= 4096 &&
      value.hostname && !value.username && !value.password && (!value.port || ['80', '443'].includes(value.port))) {
      return { raw, url: value.href };
    }
  } catch { /* Non-URL QR is displayed locally. */ }
  return { raw, url: null };
}
