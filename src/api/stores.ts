export type Store = { store_id: string; store_name: string; qr_type: string; verification_status: string };

// GET /api/stores/search: registered stores whose name contains the keyword.
export async function searchStores(keyword: string): Promise<Store[]> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!apiUrl) throw new Error('검사 서버 주소가 설정되지 않았어요.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${apiUrl}/api/stores/search?keyword=${encodeURIComponent(keyword)}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    return Array.isArray(body?.stores) ? body.stores : [];
  } finally {
    clearTimeout(timer);
  }
}
