import 'server-only';
import { ApiError } from './api';

// Einfacher In-Memory-Limiter (pro App-Instanz). Für mehrere Instanzen hinter einem
// Load-Balancer sollte ein gemeinsamer Speicher wie Redis verwendet werden.

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        if (buckets.size > 10_000) {
            for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
        }
        return;
    }
    bucket.count++;
    if (bucket.count > limit) {
        throw new ApiError(429, 'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.');
    }
}
