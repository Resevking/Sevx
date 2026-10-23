// Kleiner fetch-Wrapper für Client-Komponenten.

export class RequestError extends Error {
    constructor(
        public status: number,
        message: string
    ) {
        super(message);
    }
}

export async function api<T = { ok: true }>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await fetch(url, {
        method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
        headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        credentials: 'same-origin'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new RequestError(res.status, (data as { error?: string }).error ?? `Fehler ${res.status}`);
    return data as T;
}

/** Nur relative Pfade innerhalb der Seite zulassen (Schutz vor Open Redirects). */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
    if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
    return next;
}
