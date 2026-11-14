import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBrandOCR, readBrandsFromPhoto } from '../src/api/ocr.ts';
import { analyzeQr } from '../src/api/analyze.ts';

const imageBase64 = 'iVBORw0KGgoAAAAAAAAAAAAAAAAAAAAA';
const fixture = () => ({ status: 'ok', brands: [{ name: '스타벅스', registered: true }], domains: [], message: null });

function restoreEnv(value: string | undefined) {
  if (value === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = value;
}

test('AI OCR sends prepared base64 JSON only to the backend AI endpoint', async t => {
  const before = globalThis.fetch;
  const env = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => { globalThis.fetch = before; restoreEnv(env); });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/';
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'http://localhost:8000/api/ocr/brands');
    assert.equal(options?.method, 'POST');
    assert.deepEqual(options?.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(String(options?.body)), { image_base64: imageBase64 });
    assert.equal(options?.redirect, 'error');
    return Response.json(fixture());
  };
  const result = await readBrandsFromPhoto(imageBase64);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.candidates, [{ brand: '스타벅스', registered: true }]);
  assert.equal(calls, 1); // No automatic URL analysis or CPU fallback.
  assert.equal('brand_texts' in result, false);
  assert.equal('ocr_confidence' in result.candidates[0], false); // AI provides no numeric OCR confidence.
});

test('AI candidates, unregistered names, empty and failed results remain explicit', () => {
  const result = parseBrandOCR({ ...fixture(), brands: [{ name: '알 수 없는 상표', registered: false }] });
  assert.equal(result.candidates[0].registered, false);
  assert.ok(result.message.includes('확인'));
  const empty = parseBrandOCR({ ...fixture(), brands: [] });
  assert.deepEqual(empty.candidates, []);
  assert.match(empty.message, /찾지 못/);
  for (const status of ['unavailable', 'invalid_image']) {
    const failed = parseBrandOCR({ ...fixture(), status, message: '인식 실패' });
    assert.deepEqual(failed.candidates, []);
    assert.equal(failed.message, '인식 실패');
  }
  for (const value of [
    { ocr_status: 'ok', brand_candidates: [] },
    { ...fixture(), brands: [{ name: '상표', registered: 'true' }] },
    { ...fixture(), status: 'safe' },
    { ...fixture(), brands: [{ name: '', registered: true }] },
  ]) assert.throws(() => parseBrandOCR(value));
});

test('URLs, local paths, malformed and oversized base64 never start an AI request', async t => {
  const before = globalThis.fetch;
  t.after(() => { globalThis.fetch = before; });
  globalThis.fetch = async () => { assert.fail('must not fetch'); };
  for (const value of ['https://example.com/image.jpg', 'file:///cache/photo.jpg', 'invalid??', 'A'.repeat(4 * 1024 * 1024 + 4)]) {
    assert.equal((await readBrandsFromPhoto(value)).status, 'invalid_image');
  }
});

test('AI failures and HTTP failures do not retry or silently fall back to CPU OCR', async t => {
  const before = globalThis.fetch;
  const env = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => { globalThis.fetch = before; restoreEnv(env); });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ ...fixture(), status: 'unavailable', message: '모델 사용 불가' }); };
  assert.equal((await readBrandsFromPhoto(imageBase64)).status, 'unavailable');
  assert.equal(calls, 1);
  for (const code of [413, 422, 503, 504]) {
    globalThis.fetch = async () => Response.json({ detail: '사진 처리 실패' }, { status: code });
    const result = await readBrandsFromPhoto(imageBase64);
    assert.equal(result.status, code < 500 ? 'invalid_image' : 'unavailable');
    assert.deepEqual(result.candidates, []);
  }
});

test('only the brand explicitly chosen by the user enters analysis', async t => {
  const before = globalThis.fetch;
  const env = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => { globalThis.fetch = before; restoreEnv(env); });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
  const requests: unknown[] = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8000/api/analyze');
    requests.push(JSON.parse(String(options?.body)));
    return Response.json({});
  };
  const selected = parseBrandOCR(fixture()).candidates[0].brand;
  await analyzeQr('https://example.com', 'https://example.com', { brandTexts: [selected] });
  await analyzeQr('https://example.com', 'https://example.com');
  assert.deepEqual(requests.map((r) => (r as { brand_texts: string[] }).brand_texts), [['스타벅스'], []]);
});

test('image data URI prefixes are stripped before the JSON request', async t => {
  const before = globalThis.fetch;
  const env = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => { globalThis.fetch = before; restoreEnv(env); });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
  globalThis.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(String(options?.body)), { image_base64: imageBase64 });
    return Response.json(fixture());
  };
  assert.equal((await readBrandsFromPhoto('data:image/png;base64,' + imageBase64)).status, 'ok');
});
