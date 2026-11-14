/** Explicit photo opt-in is required before any server upload. */
export async function scanWithFallback<T>(
  local: () => Promise<T | null>, remote: () => Promise<T | null>, enabled: boolean,
): Promise<T | null> {
  let initialError: unknown;
  try {
    const code = await local();
    if (code) return code;
  } catch (error) {
    if (!enabled) throw error;
    initialError = error;
  }
  if (!enabled) return null;
  const result = await remote();
  if (!result && initialError) throw initialError;
  return result;
}
