import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, clientIp, json, parseBody, route } from '@/lib/api';
import { createSession, normalizeEmail } from '@/lib/auth';
import { verifyPassword } from '@/lib/crypto';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({
    email: z.string().min(1, 'Bitte gib deine E-Mail-Adresse ein.'),
    password: z.string().min(1, 'Bitte gib dein Passwort ein.')
});

// Vergleichs-Hash, damit unbekannte E-Mail-Adressen gleich lange dauern wie falsche Passwörter.
const DUMMY_HASH = '$2b$12$1goJ.NvXynLWlgxbJA2T7.8KS4cMxuRoh7EvnO3Y.10LJqknW1ItW';

export const POST = route(async (req) => {
    const body = await parseBody(req, schema);
    const email = normalizeEmail(body.email);
    rateLimit(`login:${clientIp(req)}`, 30, 15 * 60 * 1000);
    rateLimit(`login:${email}`, 10, 15 * 60 * 1000);

    const user = await db.user.findUnique({ where: { email } });
    const valid = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new ApiError(401, 'E-Mail-Adresse oder Passwort ist falsch.');

    await createSession(user.id, req);
    return json({ ok: true });
});
