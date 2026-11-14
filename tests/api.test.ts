import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeQR, apiBaseUrl, parseAnalysis, readQR } from '../src/lib/api.ts';

function fixture() {
  return { url: 'https://example.com', score: 0, score_version: 'behavior-v1', assessment_status: 'partial',
    level: '확인 불가', components: { ai_behavior: null, tls: 0, domain_age: 0 },
    reasons: [], attack_types: [], analysis_complete: false, navigation_allowed: true, auto_open: false,
    requires_confirmation: true, ai_status: 'disabled', warning: 'Not a guarantee.' };
}

test('only validated HTTP(S) QR URLs enter the backend request flow', () => {
  assert.equal(readQR('https://example.com').url, 'https://example.com/');
  for (const raw of ['plain text', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com:22', 'https://exa mple.com']) {
    assert.equal(readQR(raw).url, null);
  }
});

test('missing or malformed API configuration fails before fetching', () => {
  const original = process.env.EXPO_PUBLIC_API_URL;
  try {
    delete process.env.EXPO_PUBLIC_API_URL;
    assert.throws(apiBaseUrl, /설정되지/);
    process.env.EXPO_PUBLIC_API_URL = 'http://server.example/api?token=x';
    assert.throws(apiBaseUrl, /형식/);
  } finally {
    if (original === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = original;
  }
});

test('partial zero and unmeasurable null remain distinct', () => {
  assert.equal(parseAnalysis(fixture()).score, 0);
  const failed = { ...fixture(), score: null, assessment_status: 'failed', navigation_allowed: false };
  assert.equal(parseAnalysis(failed).score, null);
  assert.throws(() => parseAnalysis({ ...fixture(), score: 150 }));
  assert.throws(() => parseAnalysis({ ...fixture(), auto_open: true }));
  assert.throws(() => parseAnalysis({ ...fixture(), score_version: 'old-version' }));
});

test('analysis POST targets only the backend and explicitly controls AI/page fetching', async t => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/';
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let called = 0;
  globalThis.fetch = async (input, init) => {
    called++;
    assert.equal(input, 'http://localhost:8000/api/analyze');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, { qr_text: 'https://example.com', brand_texts: [], include_ai: called === 2, inspect_page: called === 2 });
    return new Response(JSON.stringify(fixture()), { status: 200 });
  };
  await analyzeQR('https://example.com', false);
  await analyzeQR('https://example.com', true);
  assert.equal(called, 2);
});

test('HTTP validation/server failures become readable messages', async t => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('{}', { status: 422 });
  await assert.rejects(analyzeQR('https://example.com', false), /분석할 수 없는/);
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  await assert.rejects(analyzeQR('https://example.com', false), /처리하지 못했/);
});

test('cancellation is forwarded to fetch without a new paid request', async t => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const controller = new AbortController();
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.signal?.aborted, true);
    throw new Error('aborted');
  };
  controller.abort();
  await assert.rejects(analyzeQR('https://example.com', true, controller.signal), /취소/);
});
