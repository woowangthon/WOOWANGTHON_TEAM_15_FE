import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnalyzeResponse, RiskSignals, URLAnalysis } from '../src/api/types.ts';
import { buildVerdict, checkStatusLabel } from '../src/result/verdict.ts';

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

const ALL_NONE: AnalyzeResponse['attack_types'] = [
  'credential_theft', 'personal_data_theft', 'financial_fraud', 'unsafe_installation',
].map((type) => ({ type: type as AnalyzeResponse['attack_types'][number]['type'], severity: 'none', evidence_ids: [] }));

function fixture(): AnalyzeResponse {
  return {
    url: 'https://naver.com/redirect', hostname: 'naver.com',
    evidence: {
      dns: { status: 'ok', reason: null, addresses: ['93.184.216.34'] },
      rdap: { status: 'ok', reason: null, domain: 'naver.com', created_at: '2000-01-01', age_days: 9000 },
      tls: { status: 'ok', reason: null, valid: true, issuer: 'Test CA', expires_at: null },
      geoip: { status: 'ok', reason: null, countries: [], is_overseas: false },
    },
    score: 0, level: '낮음', assessment_status: 'complete', components: { ai_behavior: 0, tls: 0, domain_age: 0 },
    url_analysis: urlAnalysis({ brand_domain_status: 'matched' }), final_url_analysis: null,
    attack_types: structuredClone(ALL_NONE), reasons: [], analysis_complete: true, navigation_allowed: true,
    auto_open: false, requires_confirmation: true, warning: 'Test', ai_explanation: '', ai_status: 'generated',
    page: { status: 'ok', reason: null, final_url: 'https://naver.com/redirect', download_response: false,
      password_fields: 0, meta_refresh: false, attack_types: structuredClone(ALL_NONE), ai_status: 'generated', readable: true },
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


function lowFixture(): AnalyzeResponse {
  const data = fixture();
  data.verdict = { version: 'combined-v1', score: 0, level: '낮음', reasons: [], assessment_status: 'complete' };
  return data;
}

test('empty, missing, duplicate, unknown or partly unknown AI categories never display a clean page', () => {
  for (const attacks of [
    [],
    ALL_NONE.slice(0, 3),
    [ALL_NONE[0], ALL_NONE[0], ALL_NONE[2], ALL_NONE[3]],
    ALL_NONE.map((a) => ({ ...a, severity: 'unknown' as const })),
    ALL_NONE.map((a, i) => i ? a : { ...a, severity: 'unknown' as const }),
  ]) {
    const data = lowFixture();
    data.attack_types = attacks;
    const result = buildVerdict(data, ['네이버']);
    const page = result.checks.find((c) => c.key === 'page')!;
    assert.equal(page.tone, 'unknown');
    assert.equal(checkStatusLabel(page), '확인 불가');
    assert.equal(result.tone, 'unknown');
    assert.equal(result.score, 0);
    assert.equal(result.scoreLabel, '확인된 위험 점수 0점');
    assert.match(result.assessmentNote!, /검사 미완료.*페이지 내용/);
  }
});

test('all four assessed none means no observed signal within the static scope, not absence of requests', () => {
  const data = lowFixture();
  const result = buildVerdict(data, ['네이버']);
  const page = check(data, 'page');
  assert.equal(page.tone, 'ok');
  assert.equal(checkStatusLabel(page), '신호 미발견');
  assert.match(page.detail, /정적 페이지 범위/);
  assert.doesNotMatch(page.detail, /요구하는 내용을 찾지 못/);
  assert.equal(result.tone, 'low');
  assert.equal(result.scoreLabel, '위험 점수 0점');
  assert.equal(result.assessmentNote, null);
});

test('unreadable pages, failed AI and unresolved meta refreshes remain unknown even with none categories', () => {
  for (const mode of ['unreadable', 'ai-failed', 'meta-refresh', 'fetch-failed']) {
    const data = lowFixture();
    if (mode === 'unreadable') data.page!.readable = false;
    if (mode === 'ai-failed') data.page!.ai_status = 'unavailable';
    if (mode === 'meta-refresh') data.page!.meta_refresh = true;
    if (mode === 'fetch-failed') data.page!.status = 'unknown';
    const page = check(data, 'page');
    assert.equal(page.tone, 'unknown', mode);
    assert.equal(buildVerdict(data).tone, 'unknown', mode);
  }
});

test('known attack signals still appear when other categories are unknown', () => {
  const data = fixture();
  data.attack_types[0].severity = 'strong';
  data.attack_types[1].severity = 'unknown';
  data.verdict!.assessment_status = 'partial';
  const result = buildVerdict(data, ['네이버']);
  assert.equal(check(data, 'page').tone, 'danger');
  assert.equal(result.tone, 'danger');
  assert.equal(result.score, 50);
  assert.match(result.assessmentNote!, /검사 미완료/);
});

test('unrequested brand comparison is marked skipped once instead of a safe or unknown match', () => {
  const data = lowFixture();
  data.url_analysis = urlAnalysis();
  data.final_url_analysis = urlAnalysis();
  const brand = buildVerdict(data).checks.find((c) => c.key === 'brand')!;
  assert.equal(brand.tone, 'not_checked');
  assert.equal(checkStatusLabel(brand), '미검사');
  assert.equal((brand.detail.match(/상표명을 입력하지 않아/g) ?? []).length, 1);
  assert.equal(buildVerdict(data).tone, 'low');
});

test('metadata success badges say confirmed without claiming the site has no problems', () => {
  const data = lowFixture();
  for (const key of ['age', 'tls', 'geo']) assert.equal(checkStatusLabel(check(data, key)), '확인됨');
  for (const key of ['shape', 'download']) assert.equal(checkStatusLabel(check(data, key)), '신호 미발견');
});

test('unknown metadata never makes a zero score look complete, including older backend verdicts', () => {
  const data = lowFixture();
  delete data.verdict!.assessment_status;
  data.evidence.rdap = { ...data.evidence.rdap, status: 'unknown', age_days: null };
  data.evidence.geoip = { ...data.evidence.geoip, status: 'unknown', is_overseas: null };
  const result = buildVerdict(data, ['네이버']);
  assert.equal(result.tone, 'unknown');
  assert.equal(result.score, 0);
  assert.match(result.assessmentNote!, /도메인 생성일.*서버 위치/);
});

test('unknown final metadata is not hidden behind the original valid certificate and old domain', () => {
  const data = lowFixture();
  data.page!.final_url = 'https://ece.cbnu.ac.kr/ECE';
  data.final_url_analysis = urlAnalysis({ brand_domain_status: 'matched' });
  const result = buildVerdict(data, ['네이버']);
  assert.equal(check(data, 'tls').tone, 'unknown');
  assert.match(check(data, 'tls').detail, /최종 이동 주소.*확인하지 못/);
  assert.equal(result.tone, 'unknown');
});

test('an invalid final certificate remains visible despite a valid source certificate', () => {
  const data = fixture();
  data.page!.final_url = 'https://target.example/';
  data.page!.final_evidence = structuredClone(data.evidence);
  data.page!.final_evidence.tls.status = 'invalid';
  data.final_url_analysis = urlAnalysis({ brand_domain_status: 'matched' });
  const tls = check(data, 'tls');
  assert.equal(tls.tone, 'caution');
  assert.match(tls.detail, /최종 이동 주소.*검증에 실패/);
  assert.match(tls.detail, /QR의 원래 주소.*유효한 인증서/);
});

test('the Naver QR screenshot scenario shows source shortener caution even when the target is clean', () => {
  const data = lowFixture();
  data.url = 'https://m.site.naver.com/1vSl3';
  data.url_analysis = urlAnalysis({ pattern_codes: ['SHORT_URL'], suspicious_url_pattern: true });
  data.final_url_analysis = urlAnalysis();
  data.page!.final_url = 'https://ece.cbnu.ac.kr/ECE';
  data.page!.final_evidence = structuredClone(data.evidence);
  data.verdict = { version: 'combined-v1', score: 20, level: '주의', assessment_status: 'complete', reasons: [] };
  const result = buildVerdict(data);
  const shape = result.checks.find((c) => c.key === 'shape')!;
  assert.equal(shape.tone, 'caution');
  assert.match(shape.detail, /QR의 원래 주소: 단축 URL/);
  assert.equal(result.tone, 'caution');
  assert.equal(result.score, 20);
  assert.equal(result.finalUrl, 'https://ece.cbnu.ac.kr/ECE');
});

test('unmeasured address checks are unknown and null score is not displayed as zero', () => {
  const data = lowFixture();
  data.url_analysis.risk_signals.suspicious_url_pattern = null;
  data.verdict!.score = null;
  data.verdict!.level = '확인 불가';
  data.verdict!.assessment_status = 'failed';
  const result = buildVerdict(data);
  assert.equal(check(data, 'shape').tone, 'unknown');
  assert.equal(result.score, null);
  assert.equal(result.scoreLabel, '위험 점수 산출 불가');
});


test('observed installation links in static HTML are not described as absent or proven malicious', () => {
  const data = lowFixture();
  data.page!.findings = [{ code: 'PAGE_EXECUTABLE_LINK', points: 0, message: 'Link seen', evidence_ids: ['link_1'] }];
  const download = check(data, 'download');
  assert.equal(download.tone, 'info');
  assert.match(download.detail, /파일 링크가 있어요/);
  assert.doesNotMatch(download.detail, /발견되지 않았/);
  assert.equal(buildVerdict(data).score, 0);
});


test('AI official-domain search is shown even with no brand hint or registry entry', () => {
  const data = lowFixture();
  data.url_analysis = urlAnalysis({ brand_domain_status: 'matched' });
  data.url_analysis.brand_domain = {
    source: 'ai_web_search', status: 'matched', brand: '카카오',
    reason: '공식 기업 자료와 검색 출처에서 소유 관계를 확인했어요.',
    sources: ['https://www.kakaocorp.com/'],
  };
  const brand = buildVerdict(data).checks.find((c) => c.key === 'brand')!;
  assert.equal(brand.label, '공식 도메인 (AI 검색)');
  assert.equal(brand.tone, 'ok');
  assert.match(brand.detail, /검색 출처.*kakaocorp/);
  assert.doesNotMatch(brand.detail, /입력하지 않아/);
});

test('ungrounded or failed AI domain search cannot turn zero points into a low-risk banner', () => {
  const data = lowFixture();
  data.url_analysis.brand_domain = { source: 'ai_web_search', status: 'unknown', reason: '공식 검색 근거가 부족해요.', sources: [] };
  data.url_analysis.risk_signals.brand_domain_status = 'unknown';
  const result = buildVerdict(data);
  assert.equal(result.tone, 'unknown');
  assert.equal(result.checks.find((c) => c.key === 'brand')!.tone, 'unknown');
  assert.match(result.assessmentNote!, /공식 도메인/);
});

test('AI-suspected impersonation uses the backend score and explains searched evidence', () => {
  const data = fixture();
  data.url_analysis.brand_domain = { source: 'ai_web_search', status: 'mismatched', reason: '공식 주소를 흉내 낸 것으로 의심돼요.', sources: ['https://registry.gov/brand'] };
  data.url_analysis.risk_signals.brand_domain_status = 'mismatched';
  const result = buildVerdict(data);
  assert.equal(result.score, 50);
  assert.equal(result.tone, 'danger');
  assert.equal(result.checks.find((c) => c.key === 'brand')!.tone, 'danger');
});

test('metadata-only policy keeps failed page AI as reference without downgrading a complete score', () => {
  const data = fixture();
  data.score_scope = 'tls_domain_age';
  data.score_version = 'metadata-v2';
  data.verdict = {version: 'combined-v2', score: 0, level: '낮음', assessment_status: 'complete', reasons: []};
  data.page!.status = 'unknown';
  data.page!.ai_status = 'unavailable';
  data.ai_status = 'unavailable';
  data.components.ai_behavior = null;
  data.attack_types = [];
  const result = buildVerdict(data, ['네이버']);
  assert.equal(result.tone, 'low');
  assert.equal(result.assessmentNote, null);
  assert.equal(result.checks.find(c => c.key === 'page')!.tone, 'info');
  assert.equal(result.checks.find(c => c.key === 'download')!.tone, 'ok');
  assert.match(result.checks.find(c => c.key === 'page')!.detail, /반영하지/);
});
