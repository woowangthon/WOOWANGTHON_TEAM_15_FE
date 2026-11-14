import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBrandOCR } from '../src/api/ocr.ts';
import { analyzeQr } from '../src/api/analyze.ts';

test('printed addresses survive OCR -> analysis even without a selected brand, and never leak into the next scan', async t => {
  const before = globalThis.fetch;
  const env = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => { globalThis.fetch = before; if (env === undefined) delete process.env.EXPO_PUBLIC_API_URL; else process.env.EXPO_PUBLIC_API_URL = env; });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
  const ocr = parseBrandOCR({status: 'ok', brands: [], domains: [{text: 'www.naver.com', domain: 'naver.com'}]});
  assert.deepEqual(ocr.printedDomains, ['naver.com']);
  const bodies: {printed_domains: string[]; brand_texts: string[]}[] = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(String(options?.body)));
    return Response.json({});
  };
  await analyzeQr('https://m.naver.com', 'https://m.naver.com', {printedDomains: ocr.printedDomains});
  await analyzeQr('https://example.com', 'https://example.com');
  assert.deepEqual(bodies.map(b => b.printed_domains), [['naver.com'], []]);
  assert.deepEqual(bodies.map(b => b.brand_texts), [[], []]);
  assert.deepEqual(parseBrandOCR({status: 'unavailable', brands: [], domains: [{domain: 'naver.com'}]}).printedDomains, []);
  assert.throws(() => parseBrandOCR({status: 'ok', brands: [], domains: [{domain: 'https://fake.com/path'}]}));
});
