import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, clientIp, json, parseBody, route } from '@/lib/api';
import { createSession, normalizeEmail } from '@/lib/auth';
import { hashPassword } from '@/lib/crypto';
import { quotaBytesFor } from '@/lib/plans';
import { rateLimit } from '@/lib/rate-limit';
import { sendVerificationMail } from '@/lib/tokens';
import { emailSchema, nameSchema, passwordSchema } from '@/lib/validation';

const schema = z.object({
    name: nameSchema.optional(),
    email: emailSchema,
    password: passwordSchema,
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Bitte akzeptiere die AGB und die Datenschutzerklärung.' }) })
});

export const POST = route(async (req) => {
    rateLimit(`register:${clientIp(req)}`, 10, 60 * 60 * 1000);
    const body = await parseBody(req, schema);
    const email = normalizeEmail(body.email);

    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ApiError(409, 'Für diese E-Mail-Adresse existiert bereits ein Konto.');

    const user = await db.user.create({
        data: {
            email,
            name: body.name || null,
            passwordHash: await hashPassword(body.password),
            plan: 'free',
            quotaBytes: quotaBytesFor('free')
        }
    });

    await createSession(user.id, req);
    await sendVerificationMail(user).catch((err) => console.error('[mail] Bestätigungsmail fehlgeschlagen', err));
    return json({ ok: true }, { status: 201 });
});
