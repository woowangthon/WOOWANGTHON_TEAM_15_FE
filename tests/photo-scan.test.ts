import assert from 'node:assert/strict';
import { test } from 'node:test';
import { qrCropRegions, scanQRPhoto, type PhotoScanner } from '../src/qr/photo-scan.ts';

function adapter(overrides: Partial<PhotoScanner> = {}): PhotoScanner {
  return { scan: async () => [], normalize: async () => ({ uri: 'file:///normalized.png', width: 1200, height: 1800 }),
    crop: async () => 'file:///qr-crop.png', ...overrides };
}

test('poster QR missed in full photo is recovered from a crop; original URI remains unchanged', async () => {
  const original = 'file:///poster.jpg';
  const scans: string[] = [];
  const result = await scanQRPhoto(original, adapter({
    scan: async uri => { scans.push(uri); return uri.includes('qr-crop') ? [{ data: 'https://naver.com/' }] : []; },
    crop: async (image, rect) => {
      assert.equal(image.uri, 'file:///normalized.png');
      assert.ok(rect.width < image.width);
      return 'file:///qr-crop.png';
    },
  }));
  assert.equal(result?.data, 'https://naver.com/');
  assert.deepEqual(scans, [original, 'file:///normalized.png', 'file:///qr-crop.png']);
  assert.equal(original, 'file:///poster.jpg');
});

test('working original scan avoids all photo processing', async () => {
  const result = await scanQRPhoto('content://photo/1', adapter({
    scan: async () => [{ data: 'plain QR text' }],
    normalize: async () => { assert.fail('must not process a decoded photo'); },
  }));
  assert.equal(result?.data, 'plain QR text');
});

test('local conversion recovers a native source format failure', async () => {
  const result = await scanQRPhoto('file:///poster.heic', adapter({
    scan: async uri => { if (uri.endsWith('.heic')) throw new Error('format'); return [{ data: 'https://example.com' }]; },
  }));
  assert.equal(result?.data, 'https://example.com');
});

test('overlapping crops stay inside portrait/landscape/small image bounds and retries are bounded', async () => {
  for (const [w, h] of [[1200,1800], [1800,1200], [1,1], [777,1111]]) {
    const regions = qrCropRegions(w, h);
    assert.ok(regions.length <= 11);
    for (const r of regions) {
      assert.ok(r.originX >= 0 && r.originY >= 0 && r.width > 0 && r.height > 0);
      assert.ok(r.originX + r.width <= w && r.originY + r.height <= h);
    }
  }
  assert.deepEqual(qrCropRegions(NaN, 1200), []);
  let attempts = 0;
  assert.equal(await scanQRPhoto('file:///blank.jpg', adapter({scan: async () => { attempts++; return []; }})), null);
  assert.ok(attempts <= 13);
});

test('remote targets never reach image readers and decoder failure differs from no QR', async () => {
  for (const uri of ['https://suspect.example/qr.png', 'javascript:alert(1)', 'data:image/png;base64,abcd']) {
    assert.equal(await scanQRPhoto(uri, adapter({scan: async () => { assert.fail('must stay local'); }})), null);
  }
  await assert.rejects(scanQRPhoto('file:///broken.jpg', adapter({
    scan: async () => { throw new Error('decoder'); }, normalize: async () => { throw new Error('image'); },
  })), /PHOTO_QR_UNREADABLE/);
});
