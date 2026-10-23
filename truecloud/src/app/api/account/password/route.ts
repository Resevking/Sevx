import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, json, parseBody, route } from '@/lib/api';
import { getSession, requireApiUser } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/crypto';
import { rateLimit } from '@/lib/rate-limit';
import { passwordSchema } from '@/lib/validation';

const schema = z.object({ currentPassword: z.string().min(1, 'Bitte gib dein aktuelles Passwort ein.'), newPassword: passwordSchema });

export const POST = route(async (req) => {
    const user = await requireApiUser();
    rateLimit(`password:${user.id}`, 10, 60 * 60 * 1000);
    const { currentPassword, newPassword } = await parseBody(req, schema);
    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new ApiError(400, 'Das aktuelle Passwort ist falsch.');

    const session = await getSession();
    await db.$transaction([
        db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } }),
        // Andere Geräte abmelden, die aktuelle Sitzung bleibt bestehen.
        db.session.deleteMany({ where: { userId: user.id, id: { not: session?.id } } })
    ]);
    return json({ ok: true });
});
