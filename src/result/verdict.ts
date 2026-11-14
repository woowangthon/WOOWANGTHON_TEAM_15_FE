import type { AnalyzeResponse, AttackType, Level, Severity, URLAnalysis } from '../api/types';

// Turns the backend response into what the result screen shows.
// Banner and score come from the backend's combined-v1 verdict; the check list explains each item.
// Check badges follow the same point bands (>=50 위험 → danger, otherwise caution).

export type Tone = 'danger' | 'caution' | 'unknown' | 'low';
const LEVEL_TONE: Record<Level, Tone> = { 위험: 'danger', 주의: 'caution', 낮음: 'low', '확인 불가': 'unknown' };
export type CheckTone = 'danger' | 'caution' | 'ok' | 'unknown' | 'info' | 'not_checked';
export type CheckItem = { key: string; label: string; tone: CheckTone; detail: string };

export type Verdict = {
  tone: Tone;
  title: string;
  summary: string;
  score: number | null;
  scoreLabel: string;
  assessmentNote: string | null;
  reasons: string[];
  checks: CheckItem[];
  canOpen: boolean;
  finalUrl: string | null;
};

const ATTACK_NAMES: Record<AttackType, string> = {
  credential_theft: '비밀번호·인증정보 입력 요구',
  personal_data_theft: '개인정보 입력 요구',
  financial_fraud: '송금·결제 유도',
  unsafe_installation: '앱·파일 설치 유도',
};
const SEVERITY_RANK: Record<Severity, number> = { unknown: -1, none: 0, weak: 1, moderate: 2, strong: 3 };

export function checkStatusLabel(check: CheckItem): string {
  if (check.tone === 'ok') {
    return ['shape', 'download', 'page'].includes(check.key) ? '신호 미발견' : '확인됨';
  }
  return { danger: '위험', caution: '주의', unknown: '확인 불가', info: '참고', not_checked: '미검사' }[check.tone];
}

function formatAge(days: number): string {
  if (days < 1) return '오늘';
  if (days < 30) return `${days}일 전`;
  if (days < 365) return `약 ${Math.floor(days / 30)}개월 전`;
  return `약 ${Math.floor(days / 365)}년 전`;
}

function domainAgeCheck(d: AnalyzeResponse): CheckItem {
  const rdap = d.evidence.rdap;
  const label = '도메인 생성일';
  if (rdap.status === 'ok' && typeof rdap.age_days === 'number') {
    const date = rdap.created_at ? ` (${rdap.created_at.slice(0, 10)})` : '';
    const when = `${formatAge(rdap.age_days)} 생성${date}`;
    if (rdap.age_days < 30) return { key: 'age', label, tone: 'caution', detail: `최근에 만들어진 도메인이에요. ${when}` };
    if (rdap.age_days < 180) return { key: 'age', label, tone: 'caution', detail: `만들어진 지 얼마 안 된 도메인이에요. ${when}` };
    return { key: 'age', label, tone: 'ok', detail: when };
  }
  if (rdap.status === 'not_applicable') return { key: 'age', label, tone: 'info', detail: '도메인 이름이 아니라 생성일 정보가 없어요.' };
  return { key: 'age', label, tone: 'unknown', detail: rdap.reason ?? '생성일을 확인하지 못했어요.' };
}

function tlsCheck(d: AnalyzeResponse): CheckItem {
  const label = 'HTTPS·보안 인증서';
  if (d.url.toLowerCase().startsWith('http://')) {
    return { key: 'tls', label, tone: 'caution', detail: '암호화되지 않은 HTTP 주소예요. 입력한 정보가 노출될 수 있어요.' };
  }
  const tls = d.evidence.tls;
  if (tls.status === 'invalid') return { key: 'tls', label, tone: 'caution', detail: '보안 인증서 검증에 실패했어요.' };
  if (tls.status === 'ok') {
    return { key: 'tls', label, tone: 'ok', detail: tls.issuer ? `유효한 인증서예요. (발급: ${tls.issuer})` : '유효한 인증서예요.' };
  }
  return { key: 'tls', label, tone: 'unknown', detail: tls.reason ?? '인증서를 확인하지 못했어요.' };
}

function locationCheck(d: AnalyzeResponse): CheckItem {
  const geo = d.evidence.geoip;
  const label = '서버 위치';
  if (geo.status === 'ok' && typeof geo.is_overseas === 'boolean') {
    const codes = [...new Set(geo.countries.map((c) => c.country_code).filter(Boolean))].join(', ');
    return geo.is_overseas
      ? { key: 'geo', label, tone: 'info', detail: `해외에 있는 서버예요.${codes ? ` (${codes})` : ''} 해외 서버라고 모두 위험한 것은 아니에요.` }
      : { key: 'geo', label, tone: 'ok', detail: '국내 서버예요.' };
  }
  return { key: 'geo', label, tone: 'unknown', detail: '서버 위치를 확인하지 못했어요.' };
}

// Both observations contribute to the backend verdict. Name each one so a final
// official-domain match does not hide a risk found in the original QR address.
function urlChecks(d: AnalyzeResponse): { analysis: URLAnalysis; prefix: string }[] {
  return d.final_url_analysis
    ? [{ analysis: d.final_url_analysis, prefix: '최종 이동 주소: ' }, { analysis: d.url_analysis, prefix: 'QR의 원래 주소: ' }]
    : [{ analysis: d.url_analysis, prefix: '' }];
}

function combineChecks(key: string, label: string, checks: CheckItem[]): CheckItem {
  const rank: Record<CheckTone, number> = { not_checked: 0, info: 0, ok: 1, unknown: 2, caution: 3, danger: 4 };
  const tone = checks.reduce<CheckTone>((worst, check) => rank[check.tone] > rank[worst] ? check.tone : worst, checks[0]?.tone ?? 'info');
  return { key, label, tone, detail: checks.map((check) => check.detail).join(' ') };
}

function metadataCheck(d: AnalyzeResponse, check: (data: AnalyzeResponse) => CheckItem): CheckItem {
  const source = check(d);
  const finalUrl = d.page?.final_url;
  if (!finalUrl || new URL(finalUrl).host === new URL(d.url).host) return source;
  const evidence = d.page?.final_evidence;
  const final = evidence ? check({ ...d, url: finalUrl, evidence }) : {
    ...source, tone: 'unknown' as const, detail: '최종 이동 주소의 정보를 확인하지 못했어요.',
  };
  return combineChecks(source.key, source.label, [
    { ...final, detail: '최종 이동 주소: ' + final.detail },
    { ...source, detail: 'QR의 원래 주소: ' + source.detail },
  ]);
}

function urlShapeCheck(d: AnalyzeResponse): CheckItem {
  const label = '주소 형태';
  const checks = urlChecks(d).map(({ analysis, prefix }): CheckItem => {
    const s = analysis.risk_signals;
    const notes: string[] = [];
    if (s.pattern_codes.includes('SHORT_URL')) notes.push('단축 URL이라 실제 목적지를 숨기고 있을 수 있어요.');
    if (s.pattern_codes.includes('IP_LITERAL')) notes.push('도메인 이름 대신 숫자 IP 주소를 쓰고 있어요.');
    if (s.pattern_codes.includes('USERINFO_IN_URL')) notes.push('주소에 @가 들어 있어 실제 목적지를 속일 수 있어요.');
    if (s.redirect_pattern_detected) notes.push('다른 주소로 넘겨주는 형태가 들어 있어요.');
    if (notes.length) return { key: 'shape', label, tone: 'caution', detail: prefix + notes.join(' ') };
    if (s.url_valid !== true || typeof s.suspicious_url_pattern !== 'boolean' || typeof s.redirect_pattern_detected !== 'boolean') return { key: 'shape', label, tone: 'unknown', detail: prefix + '주소 형태를 확인하지 못했어요.' };
    return { key: 'shape', label, tone: 'ok', detail: prefix + '검사한 주소에서 등록된 단축 주소·IP 주소·이동 매개변수 등의 패턴이 발견되지 않았어요. 알려지지 않은 단축 서비스는 놓칠 수 있어요.' };
  });
  return combineChecks('shape', label, checks);
}

function downloadCheck(d: AnalyzeResponse): CheckItem {
  const label = '파일 다운로드 유도';
  const found = urlChecks(d).filter(({ analysis }) => analysis.risk_signals.pattern_codes.some(
    (code) => code === 'EXECUTABLE_LINK' || code === 'EXECUTABLE_QUERY'));
  if (found.length) {
    return { key: 'download', label, tone: 'danger', detail: found.map(({ prefix }) =>
      prefix + '앱·실행 파일(.apk, .exe 등)을 내려받는 형태의 링크예요.').join(' ') };
  }
  if (d.page?.download_response) return { key: 'download', label, tone: 'danger', detail: '대상 서버가 파일 다운로드 응답을 반환했어요.' };
  if (d.page?.findings?.some((finding) => finding.code === 'PAGE_EXECUTABLE_LINK')) {
    return { key: 'download', label, tone: 'info', detail: '정적 페이지에 실행·설치 파일 링크가 있어요. 링크의 존재만으로 악성을 단정하지 않으며, 파일 자체는 내려받거나 검사하지 않았어요.' };
  }
  if (d.score_scope === 'tls_domain_age' && urlChecks(d).every(({ analysis }) =>
    analysis.risk_signals.url_valid === true && typeof analysis.risk_signals.suspicious_url_pattern === 'boolean')) {
    return { key: 'download', label, tone: 'ok', detail: '검사한 URL에서 실행 파일 확장자 신호를 찾지 못했어요. 페이지 안의 다운로드 유도 여부를 보장하는 검사는 아니에요.' };
  }
  if (d.page?.status !== 'ok' || d.page.readable === false || d.page.meta_refresh || urlChecks(d).some(({ analysis }) => analysis.risk_signals.url_valid !== true || typeof analysis.risk_signals.suspicious_url_pattern !== 'boolean')) {
    return { key: 'download', label, tone: 'unknown', detail: '검사한 주소에서 실행 파일 확장자를 찾지 못했지만, 페이지 내용을 확인하지 못해 다운로드 유도 여부는 확인하지 못했어요.' };
  }
  return { key: 'download', label, tone: 'ok', detail: '검사한 URL과 정적 페이지 응답에서 실행 파일 링크·다운로드 응답 신호가 발견되지 않았어요. 파일 자체나 JavaScript 실행 결과는 검사하지 않았어요.' };
}

function brandCheck(d: AnalyzeResponse, brandTexts: string[]): CheckItem {
  const label = '공식 도메인 비교';
  if (urlChecks(d).some(({ analysis }) => analysis.brand_domain.source === 'ai_web_search')) {
    const checks = urlChecks(d).map(({ analysis, prefix }): CheckItem => {
      const report = analysis.brand_domain;
      const status = analysis.risk_signals.brand_domain_status;
      const reason = typeof report.reason === 'string' ? report.reason : '공식 여부를 확인하지 못했어요.';
      const sources = Array.isArray(report.sources)
        ? report.sources.filter((s): s is string => typeof s === 'string').slice(0, 2) : [];
      const evidence = sources.length ? ` 검색 출처: ${sources.join(', ')}` : '';
      const note = status === 'matched' ? ' 공식 주소 판정은 합법성이나 전체 안전을 보장하지 않아요.' : '';
      return {
        key: 'brand', label: '공식 도메인 (AI 검색)',
        tone: status === 'matched' ? 'ok' : status === 'mismatched' ? 'danger' : 'unknown',
        detail: prefix + reason + note + evidence,
      };
    });
    return combineChecks('brand', '공식 도메인 (AI 검색)', checks);
  }
  const entered = brandTexts.map((b) => b.trim()).filter(Boolean);
  if (entered.length === 0) {
    return { key: 'brand', label, tone: 'not_checked', detail: '상표명을 입력하지 않아 공식 도메인 비교를 하지 않았어요. 추가 정보에 상표명을 넣으면 비교할 수 있어요.' };
  }
  const checks = urlChecks(d).map(({ analysis, prefix }): CheckItem => {
    const compared = typeof analysis.brand_domain.brand === 'string' ? analysis.brand_domain.brand : null;
    const name = compared ?? entered[0];
    switch (analysis.risk_signals.brand_domain_status) {
      case 'matched':
        return { key: 'brand', label, tone: 'ok', detail: prefix + `'${name}'의 공식 도메인과 일치해요.` };
      case 'mismatched':
        return { key: 'brand', label, tone: 'danger', detail: prefix + `'${name}'의 공식 도메인과 달라요. 사칭 사이트일 수 있어요.` };
      default:
        return { key: 'brand', label, tone: 'unknown', detail: prefix + `'${entered.join(', ')}'의 공식 도메인을 확인하지 못했어요.` };
    }
  });
  return combineChecks('brand', label, checks);
}

function domainWordsCheck(d: AnalyzeResponse): CheckItem | null {
  const check = d.domain_keyword_check;
  if (!check) return null;
  const label = '주소 속 상표·의심 단어';
  if (check.brand_in_domain) {
    const { word, official, match, found } = check.brand_in_domain;
    const detail = match === 'lookalike'
      ? `주소의 '${found}'가 '${word}'와 비슷하게 생겼지만 공식 주소(${official.join(', ')})가 아니에요. 글자를 바꿔 상표를 흉내 낸 주소일 수 있어요.`
      : `주소에 '${word}'가 들어 있지만 공식 주소(${official.join(', ')})가 아니에요. 상표를 흉내 낸 주소일 수 있어요.`;
    return { key: 'words', label, tone: 'danger', detail };
  }
  if (check.domain_keywords.length) {
    return { key: 'words', label, tone: 'caution', detail: `주소 이름에 '${check.domain_keywords.join(', ')}' 같은 낚시성 단어가 들어 있어요.` };
  }
  if (check.path_keywords.length) {
    return { key: 'words', label, tone: 'info', detail: `주소 뒷부분에 '${check.path_keywords.join(', ')}'가 있어요. 정상 사이트에도 흔한 단어라 참고만 하세요.` };
  }
  return null;
}

function printedCheck(d: AnalyzeResponse): CheckItem | null {
  const check = d.printed_domain_check;
  if (!check || check.status === 'not_checked') return null;
  const label = '안내문 주소 비교';
  const printed = check.printed.join(', ');
  if (check.status === 'matched') {
    return { key: 'printed', label, tone: 'ok', detail: `사진 속 안내문에 적힌 주소(${printed})와 QR 주소가 같아요.` };
  }
  return {
    key: 'printed', label, tone: 'caution',
    detail: `사진 속 안내문에 적힌 주소(${printed})와 QR 주소(${check.qr_domain ?? '알 수 없음'})가 달라요. 주문 대행 서비스일 수도 있지만, QR 위에 스티커가 덧붙여진 건 아닌지 확인해 주세요.`,
  };
}

function storeCheck(d: AnalyzeResponse): CheckItem | null {
  const label = '매장 QR 비교';
  const checks = urlChecks(d).flatMap(({ analysis, prefix }): CheckItem[] => {
    const s = analysis.risk_signals;
    if (s.domain_impersonation_status === 'impersonation_suspected') {
      return [{ key: 'store', label, tone: 'danger', detail: prefix + '등록된 매장 주소를 흉내 낸 다른 도메인이에요.' }];
    }
    switch (s.store_qr_status) {
      case 'not_checked': return [];
      case 'matched':
        return [{ key: 'store', label, tone: s.store_data_verified ? 'ok' : 'info', detail: prefix + (s.store_data_verified ? '등록된 매장 주소와 일치해요.' : '등록된 주소와 일치하지만, 매장 정보가 아직 검증되지 않았어요.') }];
      case 'mismatched': return [{ key: 'store', label, tone: 'caution', detail: prefix + '등록된 매장 QR 주소와 달라요.' }];
      default: return [{ key: 'store', label, tone: 'unknown', detail: prefix + '매장 정보를 확인하지 못했어요.' }];
    }
  });
  return checks.length ? combineChecks('store', label, checks) : null;
}

function pageCheck(d: AnalyzeResponse): CheckItem {
  if (d.score_scope === 'tls_domain_age') {
    const reference = pageCheck({ ...d, score_scope: 'ai_behavior_tls_domain_age' });
    return { ...reference, label: '페이지 내용 (참고)', tone: 'info',
      detail: reference.detail + ' 페이지 AI 결과는 위험 점수와 종합 판정에 반영하지 않아요.' };
  }
  const label = '페이지 내용 (AI 분석)';
  if ((d.ai_status !== 'generated' && d.ai_status !== 'cached') || d.page?.status !== 'ok' || (d.page.ai_status !== 'generated' && d.page.ai_status !== 'cached')) {
    const why = d.page?.status === 'blocked' ? '보안상 페이지를 열어보지 않았어요.'
      : d.page?.status === 'not_applicable' ? '파일 주소라 페이지 내용을 열어보지 않았어요.'
        : d.page?.reason ? `페이지 내용을 확인하지 못했어요. (${d.page.reason})` : 'AI 분석을 하지 못했어요.';
    return { key: 'page', label, tone: 'unknown', detail: why };
  }
  const worst = d.attack_types.reduce<{ type: AttackType; severity: Severity } | null>(
    (best, a) => (!best || SEVERITY_RANK[a.severity] > SEVERITY_RANK[best.severity] ? a : best), null);
  if (!worst || SEVERITY_RANK[worst.severity] <= 0) {
    const complete = d.attack_types.length === 4 && Object.keys(ATTACK_NAMES).every(
      (type) => d.attack_types.filter((a) => a.type === type && a.severity === 'none').length === 1);
    if (!complete || d.page.readable === false || d.page.meta_refresh) {
      return { key: 'page', label, tone: 'unknown', detail: 'AI 분석에서 일부 행동 유형이나 페이지 내용을 확인하지 못했어요. 위험 신호가 없다고 판단할 수 없어요.' };
    }
    return { key: 'page', label, tone: 'ok', detail: '검사한 정적 페이지 범위에서 인증정보·개인정보 탈취, 금전 피해, 위험한 설치 유도 신호가 발견되지 않았어요. JavaScript 실행 후 화면이나 이후 이동은 확인하지 않았어요.' };
  }
  const name = ATTACK_NAMES[worst.type];
  if (worst.severity === 'strong') return { key: 'page', label, tone: 'danger', detail: `${name} 내용이 강하게 의심돼요.` };
  if (worst.severity === 'moderate') return { key: 'page', label, tone: 'caution', detail: `${name} 내용이 있어요.` };
  return { key: 'page', label, tone: 'caution', detail: `${name} 내용이 약하게 보여요.` };
}

// navigation_allowed=false: either the address resolves to an internal network (DNS blocked),
// or following the page hit an unsafe hop (e.g. HTTPS→HTTP redirect, redirect into an internal address).
export function blockedReason(d: AnalyzeResponse): string {
  if (d.evidence.dns.status === 'blocked') return '내부 네트워크 주소를 가리키고 있어 검사와 접속을 막았어요.';
  if (d.page?.status === 'blocked' && d.page.reason) return `이동 과정이 안전하지 않아 막았어요. (${d.page.reason})`;
  return '안전하지 않은 이동이 확인되어 접속을 막았어요.';
}

export function buildVerdict(d: AnalyzeResponse, brandTexts: string[] = []): Verdict {
  const blocked = !d.navigation_allowed;
  const checks: CheckItem[] = [];
  if (blocked) checks.push({ key: 'blocked', label: '접속 차단', tone: 'danger', detail: blockedReason(d) });
  const store = storeCheck(d);
  const printed = printedCheck(d);
  const words = domainWordsCheck(d);
  checks.push(downloadCheck(d), brandCheck(d, brandTexts), ...(words ? [words] : []), ...(printed ? [printed] : []), ...(store ? [store] : []), urlShapeCheck(d),
    metadataCheck(d, domainAgeCheck), metadataCheck(d, tlsCheck), metadataCheck(d, locationCheck), pageCheck(d));

  // The backend's combined-v1 verdict is the single source of truth for the banner and score.
  // Older backends without it fall back to the worse of behavior-v1 level and the check badges.
  const has = (t: CheckTone) => checks.some((c) => c.tone === t);
  let tone: Tone = d.verdict
    ? LEVEL_TONE[d.verdict.level]
    : blocked || d.level === '위험' || has('danger') ? 'danger'
      : d.level === '주의' || has('caution') ? 'caution'
        : d.level === '낮음' ? 'low'
          : 'unknown';
  const score = d.verdict ? d.verdict.score : d.score;
  const complete = (d.verdict?.assessment_status ?? d.assessment_status) === 'complete' && !has('unknown');
  // Older backend responses can contain a low verdict despite unknown check details.
  if (tone === 'low' && !complete) tone = 'unknown';
  const unknown = checks.filter((c) => c.tone === 'unknown').map((c) => c.label);
  const scoreLabel = score === null ? '위험 점수 산출 불가'
    : `${complete ? '위험 점수' : '확인된 위험 점수'} ${score}점`;
  const assessmentNote = complete ? null
    : `검사 미완료${unknown.length ? `: ${unknown.join(', ')}` : ''}. 점수는 확인된 위험 신호만 반영하며, 확인하지 못한 항목을 안전으로 계산하지 않아요.`;

  const reasons = [...checks.filter((c) => c.tone === 'danger'), ...checks.filter((c) => c.tone === 'caution')]
    .map((c) => c.detail);

  const copy: Record<Tone, { title: string; summary: string }> = {
    danger: { title: '위험', summary: '이 QR 주소는 접속하지 않는 것을 권해요.' },
    caution: { title: '주의', summary: '접속하기 전에 아래 내용을 꼭 확인해 주세요.' },
    unknown: { title: '확인 불가', summary: '일부 항목을 확인하지 못해 안전한지 판단할 수 없어요.' },
    low: { title: '위험 신호 낮음', summary: '큰 위험 신호는 찾지 못했어요. 그래도 안전을 보장하지는 않아요.' },
  };

  const finalUrl = d.page?.final_url && d.page.final_url !== d.url ? d.page.final_url : null;
  return { tone, ...copy[tone], score, scoreLabel, assessmentNote, reasons, checks, canOpen: !blocked, finalUrl };
}
