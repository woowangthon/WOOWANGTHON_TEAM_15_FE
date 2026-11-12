// Dev-only sample results for building the result screen without a phone/server.
// The JSON files are real responses captured from the local backend (AI key set, no GeoIP DB),
// except `aiPhishing`, which is derived from `normal` to show an AI-detected attack.
import type { AnalyzeOutcome } from '../api/analyze';
import type { AnalyzeResponse } from '../api/types';
import apkLink from './apk_link.json';
import blocked from './blocked.json';
import brandMismatch from './brand_mismatch.json';
import httpOnly from './http_only.json';
import impersonation from './impersonation.json';
import ipLiteral from './ip_literal.json';
import normal from './normal.json';
import shortUrl from './short_url.json';

const asResponse = (json: unknown) => json as AnalyzeResponse;

const normalData = asResponse(normal);
const aiPhishing: AnalyzeResponse = {
  ...normalData,
  url: 'https://secure-login-check.example',
  hostname: 'secure-login-check.example',
  score: 75,
  level: '위험',
  assessment_status: 'complete',
  analysis_complete: true,
  ai_status: 'generated',
  components: { ai_behavior: 60, tls: 0, domain_age: 15 },
  evidence: { ...normalData.evidence, rdap: { ...normalData.evidence.rdap, created_at: '2026-11-04T00:00:00+00:00', age_days: 9 } },
  attack_types: [
    { type: 'credential_theft', severity: 'strong', evidence_ids: ['page_text_1'] },
    { type: 'personal_data_theft', severity: 'none', evidence_ids: [] },
    { type: 'financial_fraud', severity: 'none', evidence_ids: [] },
    { type: 'unsafe_installation', severity: 'none', evidence_ids: [] },
  ],
  page: normalData.page && { ...normalData.page, final_url: 'https://secure-login-check.example/verify', ai_status: 'generated' },
  explanation_status: 'generated',
  explanation: '이 페이지는 계정이 곧 정지된다며 비밀번호와 인증번호를 바로 입력하라고 재촉하고 있어요. 사이트 주소도 만들어진 지 9일밖에 안 됐어요. 비밀번호나 인증번호를 입력하지 말고, 공식 앱으로 직접 들어가 확인하세요.',
};

export const MOCK_RESULTS: { label: string; outcome: AnalyzeOutcome }[] = [
  { label: '정상 사이트 (python.org)', outcome: { kind: 'analysis', data: normalData, brandTexts: [] } },
  { label: 'AI 피싱 탐지 (가상)', outcome: { kind: 'analysis', data: aiPhishing, brandTexts: [] } },
  { label: 'HTTP 주소', outcome: { kind: 'analysis', data: asResponse(httpOnly), brandTexts: [] } },
  { label: '단축 URL (HTTP로 이동 차단)', outcome: { kind: 'analysis', data: asResponse(shortUrl), brandTexts: [] } },
  { label: '상표 공식 도메인 불일치', outcome: { kind: 'analysis', data: asResponse(brandMismatch), brandTexts: ['스타벅스'] } },
  { label: '.apk 다운로드 링크', outcome: { kind: 'analysis', data: asResponse(apkLink), brandTexts: [] } },
  { label: 'IP 주소형 URL', outcome: { kind: 'analysis', data: asResponse(ipLiteral), brandTexts: [] } },
  { label: '매장 도메인 사칭', outcome: { kind: 'analysis', data: asResponse(impersonation), brandTexts: [] } },
  { label: '내부망 주소 차단', outcome: { kind: 'analysis', data: asResponse(blocked), brandTexts: [] } },
  { label: '웹 주소가 아닌 QR', outcome: { kind: 'not_url', raw: 'hello' } },
  { label: '서버 422 오류', outcome: { kind: 'error', raw: 'https://user@example.com', message: 'HTTP(S) URL만 지원합니다. 사용자 정보와 80/443 이외 포트는 허용하지 않습니다.' } },
  { label: '서버 연결 실패', outcome: { kind: 'error', raw: 'https://example.com', message: '검사 서버에 연결하지 못했어요. 휴대폰과 PC가 같은 Wi-Fi인지, 서버가 켜져 있는지 확인해 주세요.' } },
];
