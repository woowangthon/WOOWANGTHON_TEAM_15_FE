import type { AnalyzeResponse, AttackType, Level, Severity } from '../api/types';

// Turns the backend response into what the result screen shows.
// Banner and score come from the backend's combined-v1 verdict; the check list explains each item.
// Check badges follow the same point bands (>=50 위험 → danger, otherwise caution).

export type Tone = 'danger' | 'caution' | 'unknown' | 'low';
const LEVEL_TONE: Record<Level, Tone> = { 위험: 'danger', 주의: 'caution', 낮음: 'low', '확인 불가': 'unknown' };
export type CheckTone = 'danger' | 'caution' | 'ok' | 'unknown' | 'info';
export type CheckItem = { key: string; label: string; tone: CheckTone; detail: string };

export type Verdict = {
  tone: Tone;
  title: string;
  summary: string;
  score: number | null;
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
  if (geo.status === 'ok' && geo.is_overseas !== null) {
    const codes = [...new Set(geo.countries.map((c) => c.country_code).filter(Boolean))].join(', ');
    return geo.is_overseas
      ? { key: 'geo', label, tone: 'info', detail: `해외에 있는 서버예요.${codes ? ` (${codes})` : ''} 해외 서버라고 모두 위험한 것은 아니에요.` }
      : { key: 'geo', label, tone: 'ok', detail: '국내 서버예요.' };
  }
  return { key: 'geo', label, tone: 'unknown', detail: '서버 위치를 확인하지 못했어요.' };
}

function urlShapeCheck(d: AnalyzeResponse): CheckItem {
  const s = d.url_analysis.risk_signals;
  const label = '주소 형태';
  const notes: string[] = [];
  if (s.pattern_codes.includes('SHORT_URL')) notes.push('단축 URL이라 실제 목적지를 숨기고 있을 수 있어요.');
  if (s.pattern_codes.includes('IP_LITERAL')) notes.push('도메인 이름 대신 숫자 IP 주소를 쓰고 있어요.');
  if (s.pattern_codes.includes('USERINFO_IN_URL')) notes.push('주소에 @가 들어 있어 실제 목적지를 속일 수 있어요.');
  if (s.redirect_pattern_detected) notes.push('다른 주소로 넘겨주는 형태가 들어 있어요.');
  if (notes.length) return { key: 'shape', label, tone: 'caution', detail: notes.join(' ') };
  if (s.suspicious_url_pattern === null) return { key: 'shape', label, tone: 'unknown', detail: '주소 형태를 확인하지 못했어요.' };
  return { key: 'shape', label, tone: 'ok', detail: '단축 URL·IP 주소 같은 의심 형태가 없어요.' };
}

function downloadCheck(d: AnalyzeResponse): CheckItem {
  const s = d.url_analysis.risk_signals;
  const label = '파일 다운로드 유도';
  if (s.pattern_codes.includes('EXECUTABLE_LINK') || s.pattern_codes.includes('EXECUTABLE_QUERY')) {
    return { key: 'download', label, tone: 'danger', detail: '주소가 앱·실행 파일(.apk, .exe 등)을 내려받게 해요.' };
  }
  if (d.page?.download_response) return { key: 'download', label, tone: 'danger', detail: '접속하면 바로 파일이 내려받아져요.' };
  return { key: 'download', label, tone: 'ok', detail: '실행 파일 링크는 없어요.' };
}

function brandCheck(d: AnalyzeResponse, brandTexts: string[]): CheckItem {
  const label = '공식 도메인 비교';
  // The backend names the brand it compared against when one was found in the official-domain DB.
  const compared = typeof d.url_analysis.brand_domain.brand === 'string' ? d.url_analysis.brand_domain.brand : null;
  const entered = brandTexts.map((b) => b.trim()).filter(Boolean);
  const name = compared ?? entered[0];
  switch (d.url_analysis.risk_signals.brand_domain_status) {
    case 'matched':
      return { key: 'brand', label, tone: 'ok', detail: `'${name}'의 공식 도메인과 일치해요.` };
    case 'mismatched':
      return { key: 'brand', label, tone: 'danger', detail: `'${name}'의 공식 도메인과 달라요. 사칭 사이트일 수 있어요.` };
    default:
      if (entered.length === 0) {
        return { key: 'brand', label, tone: 'info', detail: '상표명을 입력하지 않아 비교하지 않았어요. 추가 정보에 상표명을 넣으면 사칭 여부도 확인해요.' };
      }
      return { key: 'brand', label, tone: 'unknown', detail: `'${entered.join(', ')}'은(는) 공식 도메인 목록에 아직 없어 비교하지 못했어요.` };
  }
}

function domainWordsCheck(d: AnalyzeResponse): CheckItem | null {
  const check = d.domain_keyword_check;
  if (!check) return null;
  const label = '주소 속 상표·의심 단어';
  if (check.brand_in_domain) {
    const { word, official } = check.brand_in_domain;
    return { key: 'words', label, tone: 'danger', detail: `주소에 '${word}'가 들어 있지만 공식 주소(${official.join(', ')})가 아니에요. 상표를 흉내 낸 주소일 수 있어요.` };
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
  const s = d.url_analysis.risk_signals;
  const label = '매장 QR 비교';
  if (s.domain_impersonation_status === 'impersonation_suspected') {
    return { key: 'store', label, tone: 'danger', detail: '등록된 매장 주소를 흉내 낸 다른 도메인이에요.' };
  }
  switch (s.store_qr_status) {
    case 'not_checked': return null;
    case 'matched':
      return { key: 'store', label, tone: s.store_data_verified ? 'ok' : 'info', detail: s.store_data_verified ? '등록된 매장 주소와 일치해요.' : '등록된 주소와 일치하지만, 매장 정보가 아직 검증되지 않았어요.' };
    case 'mismatched': return { key: 'store', label, tone: 'caution', detail: '등록된 매장 QR 주소와 달라요.' };
    default: return { key: 'store', label, tone: 'unknown', detail: '매장 정보를 확인하지 못했어요.' };
  }
}

function pageCheck(d: AnalyzeResponse): CheckItem {
  const label = '페이지 내용 (AI 분석)';
  if (d.ai_status !== 'generated' && d.ai_status !== 'cached') {
    const why = d.page?.status === 'blocked' ? '보안상 페이지를 열어보지 않았어요.'
      : d.page?.status === 'not_applicable' ? '파일 주소라 페이지 내용을 열어보지 않았어요.'
        : d.page?.reason ? `페이지 내용을 확인하지 못했어요. (${d.page.reason})` : 'AI 분석을 하지 못했어요.';
    return { key: 'page', label, tone: 'unknown', detail: why };
  }
  const worst = d.attack_types.reduce<{ type: AttackType; severity: Severity } | null>(
    (best, a) => (!best || SEVERITY_RANK[a.severity] > SEVERITY_RANK[best.severity] ? a : best), null);
  if (!worst || SEVERITY_RANK[worst.severity] <= 0) {
    return { key: 'page', label, tone: 'ok', detail: '개인정보·결제·설치를 요구하는 내용을 찾지 못했어요.' };
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
    domainAgeCheck(d), tlsCheck(d), locationCheck(d), pageCheck(d));

  // The backend's combined-v1 verdict is the single source of truth for the banner and score.
  // Older backends without it fall back to the worse of behavior-v1 level and the check badges.
  const has = (t: CheckTone) => checks.some((c) => c.tone === t);
  const tone: Tone = d.verdict
    ? LEVEL_TONE[d.verdict.level]
    : blocked || d.level === '위험' || has('danger') ? 'danger'
      : d.level === '주의' || has('caution') ? 'caution'
        : d.level === '낮음' ? 'low'
          : 'unknown';
  const score = d.verdict ? d.verdict.score : d.score;

  const reasons = [...checks.filter((c) => c.tone === 'danger'), ...checks.filter((c) => c.tone === 'caution')]
    .map((c) => c.detail);

  const copy: Record<Tone, { title: string; summary: string }> = {
    danger: { title: '위험', summary: '이 QR 주소는 접속하지 않는 것을 권해요.' },
    caution: { title: '주의', summary: '접속하기 전에 아래 내용을 꼭 확인해 주세요.' },
    unknown: { title: '확인 불가', summary: '일부 항목을 확인하지 못해 안전한지 판단할 수 없어요.' },
    low: { title: '위험 신호 낮음', summary: '큰 위험 신호는 찾지 못했어요. 그래도 안전을 보장하지는 않아요.' },
  };

  const finalUrl = d.page?.final_url && d.page.final_url !== d.url ? d.page.final_url : null;
  return { tone, ...copy[tone], score, reasons, checks, canOpen: !blocked, finalUrl };
}
