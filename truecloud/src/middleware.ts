import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'tc_session';
// Diese Endpunkte werden von externen Diensten aufgerufen und prüfen sich selbst
// (Stripe-Signatur bzw. CRON_SECRET).
const EXTERNAL_API = ['/api/stripe/webhook', '/api/cron/'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    if (pathname.startsWith('/api/')) {
        // CSRF-Schutz: schreibende Anfragen müssen von unserer eigenen Seite kommen.
        if (!SAFE_METHODS.has(req.method) && !EXTERNAL_API.some((p) => pathname.startsWith(p))) {
            const origin = req.headers.get('origin');
            const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
            let originHost: string | null = null;
            try {
                originHost = origin ? new URL(origin).host : null;
            } catch {
                originHost = null;
            }
            if (!originHost || originHost !== host) {
                return NextResponse.json({ error: 'Ungültige Herkunft der Anfrage' }, { status: 403 });
            }
        }
        return NextResponse.next();
    }

    // Geschützte Bereiche: ohne Session-Cookie direkt zur Anmeldung.
    // Die eigentliche Prüfung der Session passiert serverseitig im Layout.
    if (!req.cookies.get(SESSION_COOKIE)) {
        const url = req.nextUrl.clone();
        url.pathname = '/login';
        url.search = `?next=${encodeURIComponent(pathname + search)}`;
        return NextResponse.redirect(url);
    }
    return NextResponse.next();
}

export const config = {
    matcher: ['/api/:path*', '/dashboard/:path*']
};
