import { after } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { clientIp, json, parseBody, route } from '@/lib/api';
import { normalizeEmail } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { sendPasswordResetMail } from '@/lib/tokens';
import { emailSchema } from '@/lib/validation';

const schema = z.object({ email: emailSchema });

export const POST = route(async (req) => {
    rateLimit(`forgot:${clientIp(req)}`, 5, 60 * 60 * 1000);
    const { email } = await parseBody(req, schema);
    const user = await db.user.findUnique({ where: { email: normalizeEmail(email) } });
    // Mail im Hintergrund senden und immer dieselbe Antwort geben, damit sich nicht
    // herausfinden lässt, welche Adressen registriert sind.
    if (user) after(() => sendPasswordResetMail(user).catch((err) => console.error('[mail] Reset-Mail fehlgeschlagen', err)));
    return json({ ok: true });
});
