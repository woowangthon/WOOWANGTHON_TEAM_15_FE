import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBrandOCR, readBrandsFromPhoto } from '../src/api/ocr.ts';
import { analyzeQr } from '../src/api/analyze.ts';

const candidate = { brand: '스타벅스', matched_text: 'STARBUCKS', ocr_confidence: 0.95 };
const fixture = (ocr_status = 'ok') => ({
  ocr_status, brand_candidates: [candidate], brand_texts: ['스타벅스'], requires_confirmation: true,
});

// Native FormData retains the local uri/type/name until RN serializes it on the device.
class NativeFormData {
  parts: [string, unknown][] = [];
  append(name: string, value: unknown) { this.parts.push([name, value]); }
}

test('native photo upload uses the image multipart field and leaves the boundary to fetch', async t => {
  const fetchBefore = globalThis.fetch;
  const formBefore = globalThis.FormData;
  const envBefore = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => {
    globalThis.fetch = fetchBefore;
    globalThis.FormData = formBefore;
    if (envBefore === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = envBefore;
  });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/';
  globalThis.FormData = NativeFormData as unknown as typeof FormData;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'http://localhost:8000/api/ocr/brands/local');
    assert.equal(options?.method, 'POST');
    assert.equal(options?.headers, undefined);
    assert.equal(options?.redirect, 'error');
    assert.deepEqual((options?.body as unknown as NativeFormData).parts, [
      ['image', { uri: 'file:///cache/brand.jpg', type: 'image/jpeg', name: 'brand.jpg' }],
    ]);
    return Response.json(fixture());
  };
  const result = await readBrandsFromPhoto('file:///cache/brand.jpg');
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.candidates, [candidate]);
  assert.equal(calls, 1); // Reading OCR does not itself call /api/analyze.
  assert.equal('brand_texts' in result, false); // No automatically selected brand.
});

test('all backend OCR outcomes preserve uncertainty and require confirmation', () => {
  for (const status of ['ok', 'ambiguous', 'low_confidence', 'no_text', 'no_brand']) {
    const result = parseBrandOCR({ ...fixture(status), brand_candidates: status === 'no_text' || status === 'no_brand' ? [] : [candidate] });
    assert.equal(result.status, status);
    assert.ok(result.message);
  }
  for (const value of [
    { brands: [{ name: '스타벅스' }] },
    { ...fixture(), requires_confirmation: false },
    { ...fixture(), brand_candidates: [{ ...candidate, ocr_confidence: 1.2 }] },
    { ...fixture(), ocr_status: 'safe' },
  ]) assert.throws(() => parseBrandOCR(value));
});

test('QR target URLs are rejected without fetching an image or invoking analysis', async t => {
  const before = globalThis.fetch;
  t.after(() => { globalThis.fetch = before; });
  globalThis.fetch = async () => { throw new Error('must not fetch'); };
  for (const uri of ['https://example.com/image.jpg', 'http://127.0.0.1/image.jpg', 'javascript:alert(1)']) {
    assert.equal((await readBrandsFromPhoto(uri)).status, 'invalid_image');
  }
});

test('upload and model failures remain readable rather than successful OCR', async t => {
  const fetchBefore = globalThis.fetch;
  const formBefore = globalThis.FormData;
  const envBefore = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => {
    globalThis.fetch = fetchBefore;
    globalThis.FormData = formBefore;
    if (envBefore === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = envBefore;
  });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
  globalThis.FormData = NativeFormData as unknown as typeof FormData;
  for (const code of [400, 413, 415, 422, 503, 504]) {
    globalThis.fetch = async () => Response.json({ detail: '사진 처리 실패' }, { status: code });
    const result = await readBrandsFromPhoto('file:///cache/brand.jpg');
    assert.equal(result.status, code < 500 ? 'invalid_image' : 'unavailable');
    assert.deepEqual(result.candidates, []);
    assert.equal(result.message, '사진 처리 실패');
  }
  globalThis.fetch = async () => Response.json({ brands: [] });
  assert.equal((await readBrandsFromPhoto('file:///cache/brand.jpg')).status, 'unavailable');
});

test('analysis sends only the explicitly confirmed canonical brand and supported request fields', async t => {
  const before = globalThis.fetch;
  const envBefore = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => {
    globalThis.fetch = before;
    if (envBefore === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = envBefore;
  });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
  const requests: unknown[] = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8000/api/analyze');
    requests.push(JSON.parse(String(options?.body)));
    return Response.json({});
  };
  const confirmed = parseBrandOCR(fixture()).candidates[0].brand;
  await analyzeQr('https://example.com', 'https://example.com', { brandTexts: [confirmed] });
  await analyzeQr('https://example.com', 'https://example.com');
  assert.deepEqual(requests, [
    { qr_text: 'https://example.com', brand_texts: ['스타벅스'], store_id: null, include_ai: true, inspect_page: true, include_explanation: true },
    { qr_text: 'https://example.com', brand_texts: [], store_id: null, include_ai: true, inspect_page: true, include_explanation: true },
  ]);
});

test('browser local images use a real multipart file rather than base64 JSON', async t => {
  const before = globalThis.fetch;
  const envBefore = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => {
    globalThis.fetch = before;
    if (envBefore === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = envBefore;
  });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
  const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
  globalThis.fetch = async (url, options) => {
    if (url === dataUri) return new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
    const file = (options?.body as FormData).get('image') as File;
    assert.equal(file.name, 'brand.png');
    assert.equal(file.type, 'image/png');
    assert.equal(file.size, 4);
    return Response.json({ ...fixture('no_text'), brand_candidates: [] });
  };
  assert.equal((await readBrandsFromPhoto(dataUri)).status, 'no_text');
});
