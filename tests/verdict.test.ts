import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnalyzeResponse, RiskSignals, URLAnalysis } from '../src/api/types.ts';
import { buildVerdict } from '../src/result/verdict.ts';

function urlAnalysis(signals: Partial<RiskSignals> = {}): URLAnalysis {
  return {
    status: 'ok',
    suspicious_patterns: { valid: true, suspicious: false, codes: [], reasons: [] },
    brand_domain: { status: signals.brand_domain_status ?? 'unknown', brand: '네이버' },
    store_qr: null, domain_impersonation: null,
    redirect_patterns: { suspicious: false, reasons: [] }, errors: [],
    risk_signals: {
      url_valid: true, suspicious_url_pattern: false, pattern_codes: [], brand_domain_status: 'unknown',
      store_qr_status: 'not_checked', store_data_verified: null,
      domain_impersonation_status: 'not_checked', redirect_pattern_detected: false, ...signals,
    },
  };
}

function fixture(): AnalyzeResponse {
  return {
    url: 'https://naver.com/redirect', hostname: 'naver.com',
    evidence: {
      dns: { status: 'ok', reason: null, addresses: ['93.184.216.34'] },
      rdap: { status: 'ok', reason: null, domain: 'naver.com', created_at: '2000-01-01', age_days: 9000 },
      tls: { status: 'ok', reason: null, valid: true, issuer: 'Test CA', expires_at: null },
      geoip: { status: 'unknown', reason: null, countries: [], is_overseas: null },
    },
    score: 0, level: '낮음', assessment_status: 'complete', components: { ai_behavior: 0, tls: 0, domain_age: 0 },
    url_analysis: urlAnalysis({ brand_domain_status: 'matched' }), final_url_analysis: null,
    attack_types: [], reasons: [], analysis_complete: true, navigation_allowed: true,
    auto_open: false, requires_confirmation: true, warning: 'Test', ai_explanation: '', ai_status: 'generated',
    page: { status: 'ok', reason: null, final_url: 'https://example.com', download_response: false,
      password_fields: 0, meta_refresh: false, attack_types: [], ai_status: 'generated' },
    verdict: { version: 'combined-v1', score: 50, level: '위험', reasons: [] },
  };
}

function check(data: AnalyzeResponse, key: string) {
  const result = buildVerdict(data, ['네이버']).checks.find((item) => item.key === key);
  assert.ok(result, `Expected ${key} check`);
  return result;
}

test('final-only executable links explain the backend danger score without opening a site', () => {
  const data = fixture();
  data.final_url_analysis = urlAnalysis({ pattern_codes: ['EXECUTABLE_LINK'] });
  data.page!.status = 'not_applicable';
  data.page!.final_url = 'https://example.com/update.apk';
  const result = buildVerdict(data, ['네이버']);
  assert.equal(check(data, 'download').tone, 'danger');
  assert.match(check(data, 'download').detail, /최종 이동 주소.*실행 파일/);
  assert.equal(result.score, data.verdict!.score);
  assert.equal(result.tone, 'danger');
  assert.equal(result.finalUrl, data.page!.final_url);
  assert.equal(data.auto_open, false);
});

test('original executable links remain visible even when the final address has no executable pattern', () => {
  const data = fixture();
  data.url_analysis = urlAnalysis({ pattern_codes: ['EXECUTABLE_QUERY'] });
  data.final_url_analysis = urlAnalysis();
  assert.equal(check(data, 'download').tone, 'danger');
  assert.match(check(data, 'download').detail, /QR의 원래 주소/);
});

test('final-only brand mismatch is not hidden by the original official domain', () => {
  const data = fixture();
  data.final_url_analysis = urlAnalysis({ brand_domain_status: 'mismatched' });
  const result = check(data, 'brand');
  assert.equal(result.tone, 'danger');
  assert.match(result.detail, /최종 이동 주소: '네이버'의 공식 도메인과 달라요/);
  assert.match(result.detail, /QR의 원래 주소: '네이버'의 공식 도메인과 일치해요/);
});

test('a final official match is described while retaining an original mismatch counted by the backend', () => {
  const data = fixture();
  data.url_analysis = urlAnalysis({ brand_domain_status: 'mismatched' });
  data.final_url_analysis = urlAnalysis({ brand_domain_status: 'matched' });
  assert.equal(check(data, 'brand').tone, 'danger');
  assert.match(check(data, 'brand').detail, /최종 이동 주소: '네이버'의 공식 도메인과 일치해요/);
  assert.match(check(data, 'brand').detail, /QR의 원래 주소: '네이버'의 공식 도메인과 달라요/);
});

test('final-only store impersonation and IP addresses appear in the checklist', () => {
  const data = fixture();
  data.url_analysis = urlAnalysis({ store_qr_status: 'matched', store_data_verified: true });
  data.final_url_analysis = urlAnalysis({ store_qr_status: 'mismatched', domain_impersonation_status: 'impersonation_suspected', pattern_codes: ['IP_LITERAL'] });
  assert.equal(check(data, 'store').tone, 'danger');
  assert.match(check(data, 'store').detail, /최종 이동 주소.*흉내/);
  assert.equal(check(data, 'shape').tone, 'caution');
  assert.match(check(data, 'shape').detail, /최종 이동 주소.*IP 주소/);
});

test('uninspected pages do not claim download links are absent and blocked navigation remains disabled', () => {
  const data = fixture();
  data.navigation_allowed = false;
  data.page!.status = 'blocked';
  data.page!.reason = 'Blocked redirect';
  data.page!.final_url = null;
  const result = buildVerdict(data, ['네이버']);
  assert.equal(check(data, 'download').tone, 'unknown');
  assert.match(check(data, 'download').detail, /확인하지 못했어요/);
  assert.equal(result.canOpen, false);
  assert.equal(result.finalUrl, null);
  assert.equal(result.score, data.verdict!.score);
});
