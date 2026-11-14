import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanWithFallback } from '../src/qr/fallback.ts';
import { decodeQRImage } from '../src/api/qr-decode.ts';

test('phone failure uses independent decoder only with photo upload opt-in', async () => {
  let calls = 0;
  const remote = async () => {calls++; return {data: 'https://naver.com'};};
  assert.equal(await scanWithFallback(async () => null, remote, false), null);
  assert.equal(calls, 0);
  assert.equal((await scanWithFallback(async () => null, remote, true))?.data, 'https://naver.com');
  assert.equal(calls, 1);
  await scanWithFallback(async () => ({data: 'local'}), remote, true);
  assert.equal(calls, 1);
  await scanWithFallback(async () => {throw new Error('native format');}, remote, true);
  assert.equal(calls, 2);
});

test('backend decode transmits image only, returns exact QR and never fetches the target', async t => {
  const before = globalThis.fetch;
  const env = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => { globalThis.fetch = before; if (env === undefined) delete process.env.EXPO_PUBLIC_API_URL; else process.env.EXPO_PUBLIC_API_URL = env; });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'http://localhost:8000/api/qr/decode');
    assert.equal(options?.redirect, 'error');
    assert.deepEqual(JSON.parse(String(options?.body)), {image_base64: 'YWJjZA=='});
    return Response.json({status: 'ok', qr_text: 'https://naver-event.xyz', decoder: 'zxing_cpp', auto_open: false});
  };
  assert.equal((await decodeQRImage('YWJjZA=='))?.data, 'https://naver-event.xyz');
  assert.equal(calls, 1);
  globalThis.fetch = async () => Response.json({status: 'not_found', qr_text: null, decoder: 'zxing_cpp', auto_open: false});
  assert.equal(await decodeQRImage('YWJjZA=='), null);
  globalThis.fetch = async () => Response.json({detail: 'Not found'}, {status: 404});
  await assert.rejects(decodeQRImage('YWJjZA=='), /재시작/);
  globalThis.fetch = async () => {throw new Error('offline');};
  await assert.rejects(decodeQRImage('YWJjZA=='), /연결/);
});

test('photo mode can decode on server first without invoking the failing native decoder; errors are preserved', async () => {
  let localCalls = 0;
  const local = async () => { localCalls++; return null; };
  const code = await scanWithFallback(async () => ({data: 'https://naver.com'}), local, true);
  assert.equal(code?.data, 'https://naver.com');
  assert.equal(localCalls, 0);
  await assert.rejects(scanWithFallback(async () => {throw new Error('server connection failed');}, local, true), /server connection/);
});
