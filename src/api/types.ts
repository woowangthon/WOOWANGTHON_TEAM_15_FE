// Subset of the backend's POST /api/analyze response (app/models.py, app/url_models.py).
// Only the fields the result screen reads are typed here.

export type CheckStatus = 'ok' | 'unknown' | 'blocked' | 'invalid' | 'not_applicable';
export type Level = '낮음' | '주의' | '위험' | '확인 불가';
export type AttackType = 'credential_theft' | 'personal_data_theft' | 'financial_fraud' | 'unsafe_installation';
export type Severity = 'none' | 'weak' | 'moderate' | 'strong' | 'unknown';
export type AiStatus = 'generated' | 'cached' | 'disabled' | 'unavailable' | 'skipped';
export type PatternCode = 'IP_LITERAL' | 'SHORT_URL' | 'EXECUTABLE_LINK' | 'EXECUTABLE_QUERY' | 'USERINFO_IN_URL';

export type Reason = { code: string; points: number; message: string; evidence_ids: string[] };
export type AttackAssessment = { type: AttackType; severity: Severity; evidence_ids: string[] };

export type Evidence = {
  dns: { status: CheckStatus; reason: string | null; addresses: string[] };
  rdap: { status: CheckStatus; reason: string | null; domain: string | null; created_at: string | null; age_days: number | null };
  tls: { status: CheckStatus; reason: string | null; valid: boolean | null; issuer: string | null; expires_at: string | null };
  geoip: {
    status: CheckStatus;
    reason: string | null;
    countries: { ip: string; country_code: string | null; is_overseas: boolean | null }[];
    is_overseas: boolean | null;
  };
};

export type RiskSignals = {
  url_valid: boolean | null;
  suspicious_url_pattern: boolean | null;
  pattern_codes: PatternCode[];
  brand_domain_status: 'matched' | 'mismatched' | 'unknown' | 'invalid_url';
  store_qr_status: 'matched' | 'mismatched' | 'unknown' | 'invalid_url' | 'not_checked';
  store_data_verified: boolean | null;
  domain_impersonation_status: 'host_matched' | 'impersonation_suspected' | 'other_domain' | 'unknown' | 'invalid_url' | 'not_checked';
  redirect_pattern_detected: boolean | null;
};

export type URLAnalysis = {
  status: 'ok' | 'partial' | 'invalid_url';
  suspicious_patterns: { valid: boolean; suspicious: boolean | null; codes: PatternCode[]; reasons: string[] };
  brand_domain: { status: string; reason?: string | null; [key: string]: unknown };
  store_qr: { status: string; reason?: string | null; store_name?: string | null; [key: string]: unknown } | null;
  domain_impersonation: { status: string; reason?: string | null; [key: string]: unknown } | null;
  redirect_patterns: { suspicious: boolean | null; reasons: string[] };
  risk_signals: RiskSignals;
  errors: string[];
};

export type PageReport = {
  status: CheckStatus;
  reason: string | null;
  final_url: string | null;
  download_response: boolean;
  password_fields: number;
  meta_refresh: boolean;
  attack_types: AttackAssessment[];
  ai_status: AiStatus;
};

export type AnalyzeResponse = {
  url: string;
  hostname: string;
  evidence: Evidence;
  score: number | null;
  url_analysis: URLAnalysis;
  final_url_analysis: URLAnalysis | null;
  assessment_status: 'complete' | 'partial' | 'failed';
  components: { ai_behavior: number | null; tls: number | null; domain_age: number | null };
  attack_types: AttackAssessment[];
  level: Level;
  reasons: Reason[];
  analysis_complete: boolean;
  navigation_allowed: boolean;
  auto_open: false;
  requires_confirmation: true;
  warning: string;
  ai_explanation: string;
  ai_status: AiStatus;
  page: PageReport | null;
  // Plain-language explanation; AI-written only when explanation_status is generated/cached.
  // Optional so responses from older backends still parse.
  explanation?: string;
  explanation_status?: AiStatus;
  // Why no AI explanation was made (blocked target, or AI unavailable). Shown in the AI card instead.
  explanation_skip_reason?: string | null;
  // Overall verdict (combined-v1): behavior-v1 points + URL/brand/store signals. Drives the banner.
  verdict?: { version: 'combined-v1'; score: number | null; level: Level; reasons: { code: string; points: number; message: string }[] };
};
