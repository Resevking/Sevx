import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { User } from '@prisma/client';
import { db } from './db';
import { config } from './config';
import { randomToken, sha256 } from './crypto';
import { ApiError, clientIp } from './api';

export const SESSION_COOKIE = 'tc_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LAST_SEEN_UPDATE_MS = 10 * 60 * 1000;

export async function createSession(userId: string, req: Request): Promise<void> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.session.create({
        data: {
            tokenHash: sha256(token),
            userId,
            expiresAt,
            userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
            ip: clientIp(req)
        }
    });
    (await cookies()).set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: config.secureCookies,
        sameSite: 'lax',
        path: '/',
        expires: expiresAt
    });
}

export async function destroySession(): Promise<void> {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
    store.delete(SESSION_COOKIE);
}

export const getSession = cache(async () => {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!session) return null;
    if (session.expiresAt < new Date()) {
        await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
        return null;
    }
    if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_UPDATE_MS) {
        await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
    return session;
});

export async function getCurrentUser(): Promise<User | null> {
    return (await getSession())?.user ?? null;
}

export function isAdmin(user: Pick<User, 'role' | 'email'>): boolean {
    return user.role === 'ADMIN' || config.adminEmails.includes(user.email.toLowerCase());
}

/** Für Seiten: leitet ohne Login zur Anmeldung weiter. */
export async function requireUser(nextPath = '/dashboard'): Promise<User> {
    const user = await getCurrentUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    return user;
}

/** Für API-Routen: antwortet ohne Login mit 401. */
export async function requireApiUser(): Promise<User> {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, 'Bitte melde dich an.');
    return user;
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}
