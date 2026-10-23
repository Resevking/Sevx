import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string
    ) {
        super(message);
    }
}

function replacer(_key: string, value: unknown) {
    return typeof value === 'bigint' ? Number(value) : value;
}

export function json(data: unknown, init?: ResponseInit): NextResponse {
    return new NextResponse(JSON.stringify(data, replacer), {
        ...init,
        headers: { 'content-type': 'application/json', ...init?.headers }
    });
}

export function errorResponse(status: number, message: string): NextResponse {
    return json({ error: message }, { status });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Einheitliche Fehlerbehandlung für alle API-Routen. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
    return async (req, ctx) => {
        try {
            return await handler(req, ctx);
        } catch (err) {
            if (err instanceof ApiError) return errorResponse(err.status, err.message);
            if (err instanceof ZodError) return errorResponse(400, err.issues[0]?.message ?? 'Ungültige Eingabe');
            console.error('[api]', err);
            return errorResponse(500, 'Interner Fehler. Bitte später erneut versuchen.');
        }
    };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        throw new ApiError(400, 'Ungültige Anfrage');
    }
    return schema.parse(body);
}

export function clientIp(req: Request): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers.get('x-real-ip') ?? 'unknown';
}
