/** Backend QR decoder. This endpoint does not call AI or visit the decoded address. */
export class QRPhotoError extends Error {}

export async function decodeQRImage(imageBase64: string): Promise<{data: string} | null> {
  if (!imageBase64 || imageBase64.length > 4 * 1024 * 1024 ||
      imageBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64))
    throw new QRPhotoError('서버에 보낼 QR 사진을 준비하지 못했어요.');
  const base = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new QRPhotoError('사진 검사 서버 주소가 설정되지 않았어요.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(base + '/api/qr/decode', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({image_base64: imageBase64}), signal: controller.signal, redirect: 'error',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 404) throw new QRPhotoError('서버에 사진 QR 검사 기능이 없어요. 백엔드를 최신 코드로 재시작해 주세요.');
      throw new QRPhotoError(typeof body?.detail === 'string' ? body.detail.slice(0, 240) : '서버에서 QR 사진을 처리하지 못했어요.');
    }
    if (body?.auto_open !== false || body?.decoder !== 'zxing_cpp')
      throw new QRPhotoError('QR 사진 검사 응답을 확인하지 못했어요.');
    if (body.status === 'ok' && typeof body.qr_text === 'string' && body.qr_text.trim() && body.qr_text.length <= 4096)
      return {data: body.qr_text};
    if (body.status === 'not_found' && body.qr_text === null) return null;
    if (body.status === 'multiple_qr') throw new QRPhotoError('서로 다른 QR이 여러 개 있어요. 검사할 QR 한 개만 나오도록 찍어 주세요.');
    throw new QRPhotoError('QR 사진 검사 응답 형식이 올바르지 않아요.');
  } catch (error) {
    if (error instanceof QRPhotoError) throw error;
    throw new QRPhotoError(error instanceof Error && error.name === 'AbortError'
      ? '서버 사진 검사 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.'
      : '휴대폰에서 QR을 읽지 못했고 사진 검사 서버에도 연결하지 못했어요. 백엔드 주소와 연결을 확인해 주세요.');
  } finally { clearTimeout(timer); }
}
