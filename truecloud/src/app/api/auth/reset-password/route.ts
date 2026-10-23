import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, clientIp, json, parseBody, route } from '@/lib/api';
import { hashPassword } from '@/lib/crypto';
import { rateLimit } from '@/lib/rate-limit';
import { consumeToken } from '@/lib/tokens';
import { passwordSchema } from '@/lib/validation';

const schema = z.object({ token: z.string().min(10), password: passwordSchema });

export const POST = route(async (req) => {
    rateLimit(`reset:${clientIp(req)}`, 10, 60 * 60 * 1000);
    const { token, password } = await parseBody(req, schema);
    const userId = await consumeToken(token, 'PASSWORD_RESET');
    if (!userId) throw new ApiError(400, 'Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.');

    await db.$transaction([
        db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password), emailVerifiedAt: new Date() } }),
        // Alle bestehenden Sitzungen beenden
        db.session.deleteMany({ where: { userId } })
    ]);
    return json({ ok: true });
});
