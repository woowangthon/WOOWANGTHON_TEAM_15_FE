import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

try {
  loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  const base = new URL(process.env.EXPO_PUBLIC_API_URL).origin;
  const health = await fetch(base + '/health', { signal: AbortSignal.timeout(5000) });
  if (!health.ok || (await health.json()).status !== 'ok') throw new Error('health failed');
  const spec = await fetch(base + '/openapi.json', { signal: AbortSignal.timeout(5000) });
  const schema = await spec.json();
  if (!schema.components?.schemas?.AnalyzeResponse?.properties?.components) throw new Error('behavior-v1 schema missing');
  const origin = 'http://localhost:8081';
  const cors = await fetch(base + '/api/analyze', {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    signal: AbortSignal.timeout(5000),
  });
  if (cors.headers.get('access-control-allow-origin') !== origin) {
    throw new Error('Expo Web CORS origin is not allowed: ' + origin);
  }
  console.log('Backend health, behavior-v1 response schema, and Expo Web CORS: OK');
} catch (error) {
  console.error('Backend check failed:', error instanceof Error ? error.message : 'unknown error');
  console.error('Start the backend on 0.0.0.0:8000 and check EXPO_PUBLIC_API_URL / CORS_ORIGINS.');
  process.exitCode = 1;
}
