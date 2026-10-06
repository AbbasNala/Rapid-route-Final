// Simple in-memory token bucket. Per-instance only (fine for an MVP;
// on serverless each warm instance gets its own bucket — documented in README).
const buckets = new Map<string, { tokens: number; last: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  if (buckets.size > 5000) buckets.clear(); // crude sweep
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: limit, last: now };
  if (now - b.last >= windowMs) {
    b.tokens = limit;
    b.last = now;
  }
  const allowed = b.tokens > 0;
  if (allowed) b.tokens -= 1;
  buckets.set(key, b);
  return allowed;
}
