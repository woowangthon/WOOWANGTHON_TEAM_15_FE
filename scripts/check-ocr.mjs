// Opt-in live OCR check. It uploads only the supplied photo to your configured backend.
// This makes one paid AI OCR call. Later analysis uses a blocked loopback URL, so no page AI runs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { readBrandsFromPhoto } from '../src/api/ocr.ts';
import { analyzeQr } from '../src/api/analyze.ts';

try { if (!process.env.EXPO_PUBLIC_API_URL) loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch { /* Environment may already be set. */ }
const [imagePath, expectedBrand] = process.argv.slice(2);
if (!imagePath || !expectedBrand) {
  console.error('Usage: node scripts/check-ocr.mjs <local JPEG/PNG> <expected canonical brand>');
  process.exitCode = 1;
} else {
  try {
    const bytes = await readFile(imagePath);
    assert.ok(bytes.length <= 3 * 1024 * 1024, 'Photo must be <= 3MiB');
    const mime = /\.png$/i.test(imagePath) ? 'image/png' : 'image/jpeg';
    const ocr = await readBrandsFromPhoto(`data:${mime};base64,${bytes.toString('base64')}`);
    assert.ok(ocr.candidates.some(c => c.brand === expectedBrand), `Expected brand was not recognized: ${ocr.status} (${ocr.message})`);
    const blockedUrl = 'https://127.0.0.1';
    const outcome = await analyzeQr(blockedUrl, blockedUrl, { brandTexts: [expectedBrand] });
    assert.equal(outcome.kind, 'analysis');
    if (outcome.kind !== 'analysis') throw new Error('Analysis failed');
    assert.equal(outcome.data.url_analysis?.brand_domain.brand, expectedBrand);
    assert.equal(outcome.data.url_analysis?.brand_domain.status, 'mismatched');
    assert.equal(outcome.data.navigation_allowed, false);
    console.log('PASS: frontend base64 JSON -> BAZE AI OCR -> canonical brand -> backend analysis');
    console.log(JSON.stringify({ ocr_status: ocr.status, brand: expectedBrand, navigation_allowed: outcome.data.navigation_allowed }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'OCR integration failed');
    process.exitCode = 1;
  }
}
