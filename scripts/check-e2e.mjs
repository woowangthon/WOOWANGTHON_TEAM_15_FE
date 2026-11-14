// Real frontend client -> configured FastAPI -> BAZE OCR/page analysis -> result-screen view model.
// The driver decodes a synthetic QR photo with OpenCV. Native Expo camera, rendering and taps are NOT automated here.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { readBrandsFromPhoto } from '../src/api/ocr.ts';
import { analyzeQr } from '../src/api/analyze.ts';
import { buildVerdict } from '../src/result/verdict.ts';

if (!process.env.EXPO_PUBLIC_API_URL) loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
const [fixturePath, reportPath] = process.argv.slice(2);
assert.ok(fixturePath && reportPath, 'Usage: node scripts/check-e2e.mjs <fixture.json> <report.json>');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const base = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
assert.ok(base, 'EXPO_PUBLIC_API_URL must be configured');
const image = await readFile(fixture.image_path);
const calls = [];
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  assert.equal(typeof input, 'string');
  assert.ok(input.startsWith(base + '/'), 'The frontend must send requests only to its backend');
  const path = input.slice(base.length);
  const request = JSON.parse(String(options?.body ?? '{}'));
  const started = performance.now();
  const response = await nativeFetch(input, options);
  calls.push({
    path, status: response.status, elapsed_ms: Math.round(performance.now() - started),
    request_fields: Object.keys(request),
    ...(path === '/api/analyze' ? { brand_texts: request.brand_texts, qr_text: request.qr_text } : {}),
  });
  return response;
};

const started = performance.now();
try {
  const ocr = await readBrandsFromPhoto(image.toString('base64'));
  assert.equal(ocr.status, 'ok', ocr.message);
  const selected = ocr.candidates.find(c => c.brand === fixture.expected_brand && c.registered);
  assert.ok(selected, 'Expected registered canonical brand was not offered');
  assert.equal(calls.length, 1, 'Photo recognition must not itself trigger URL analysis');
  assert.equal(calls[0].path, '/api/ocr/brands');

  // Explicit harness selection corresponds to the person choosing this candidate.
  // It does not claim to exercise an actual native button tap.
  const outcome = await analyzeQr(fixture.decoded_qr, new URL(fixture.decoded_qr).href, { brandTexts: [selected.brand] });
  assert.equal(outcome.kind, 'analysis', outcome.kind === 'error' ? outcome.message : 'Expected analysis');
  const data = outcome.data;
  const view = buildVerdict(data, outcome.brandTexts);
  assert.equal(calls.length, 2, 'No automatic retries or frontend requests to QR target');
  assert.equal(calls[1].path, '/api/analyze');
  assert.deepEqual(calls[1].brand_texts, [fixture.expected_brand]);
  assert.equal(data.page?.status, 'ok', data.page?.reason ?? 'Page fetch failed');
  assert.equal(new URL(data.page.final_url).hostname, fixture.expected_final_host);
  assert.ok(data.page.redirect_chain.some(hop => hop.http_status === 302), 'HTTP redirect was not recorded');
  assert.equal(data.final_url_analysis?.url_info.hostname, fixture.expected_final_host);
  assert.equal(data.final_url_analysis.risk_signals.brand_domain_status, 'mismatched');
  assert.equal(data.final_url_analysis.brand_domain.brand, fixture.expected_brand);
  assert.equal(data.verdict.level, '위험');
  assert.ok(data.verdict.score >= 50 && data.verdict.score <= 100);
  assert.ok(data.verdict.reasons.some(reason => reason.code === 'BRAND_DOMAIN_MISMATCH'));
  assert.equal(view.score, data.verdict.score);
  assert.equal(view.tone, 'danger');
  assert.equal(new URL(view.finalUrl).hostname, fixture.expected_final_host);
  assert.ok(view.checks.some(check => check.key === 'brand' && check.tone === 'danger'));
  assert.equal(data.auto_open, false);
  assert.equal(data.requires_confirmation, true);
  assert.equal(data.ai_status, 'generated', 'Page AI classification did not run successfully');

  const report = {
    status: 'passed',
    scenario: 'NAVER photo QR -> public HTTP redirect -> example.com -> brand mismatch warning',
    checked_at: new Date().toISOString(), backend_base_url: base,
    elapsed_ms: Math.round(performance.now() - started),
    input: { image_path: fixture.image_path, decoded_qr: fixture.decoded_qr, qr_decoder: 'OpenCV' },
    ocr: { status: ocr.status, candidates: ocr.candidates, selected_brand: selected.brand },
    confirmation: 'explicit candidate selection simulated by the harness',
    http_calls: calls,
    backend: {
      final_url: data.page.final_url, redirect_chain: data.page.redirect_chain,
      final_brand_comparison: data.final_url_analysis.brand_domain,
      score: data.verdict.score, level: data.verdict.level, reasons: data.verdict.reasons,
      behavior_components: data.components, assessment_status: data.assessment_status,
      ai_status: data.ai_status, ai_model: data.ai_model,
      explanation_status: data.explanation_status, explanation: data.explanation,
      auto_open: data.auto_open, requires_confirmation: data.requires_confirmation,
    },
    frontend_result: { title: view.title, tone: view.tone, score: view.score, final_url: view.finalUrl, checks: view.checks },
    limitations: ['No physical phone camera/album/permissions were automated', 'No native button taps or rendered screen were automated', 'Same-PC LAN address does not prove phone-to-PC firewall/Wi-Fi access'],
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, report: reportPath, final_url: data.page.final_url, selected_brand: selected.brand, score: view.score, level: data.verdict.level, ai_status: data.ai_status, explanation_status: data.explanation_status }));
} catch (error) {
  await writeFile(reportPath, JSON.stringify({ status: 'failed', checked_at: new Date().toISOString(), elapsed_ms: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error), http_calls: calls }, null, 2) + '\n');
  throw error;
} finally {
  globalThis.fetch = nativeFetch;
}
