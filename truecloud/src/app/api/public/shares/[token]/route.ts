import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, clientIp, json, parseBody, route } from '@/lib/api';
import { verifyPassword } from '@/lib/crypto';
import { rateLimit } from '@/lib/rate-limit';
import { findPublicShare } from '@/lib/shares';
import { presignDownload } from '@/lib/storage';

type Ctx = { params: Promise<{ token: string }> };

/** Öffentlicher Download einer Freigabe. Gibt eine kurzlebige Download-URL zurück. */
export const POST = route<Ctx>(async (req, { params }) => {
    const { token } = await params;
    rateLimit(`share:${clientIp(req)}:${token}`, 30, 15 * 60 * 1000);
    const { password } = await parseBody(req, z.object({ password: z.string().max(200).optional() }));

    const share = await findPublicShare(token);
    if (!share) throw new ApiError(404, 'Dieser Link ist ungültig oder abgelaufen.');
    if (share.passwordHash) {
        if (!password) throw new ApiError(401, 'Für diesen Link wird ein Passwort benötigt.');
        if (!(await verifyPassword(password, share.passwordHash))) throw new ApiError(401, 'Das Passwort ist falsch.');
    }

    await db.share.update({ where: { id: share.id }, data: { downloadCount: { increment: 1 } } });
    const url = await presignDownload(share.file.storageKey, share.file.name);
    return json({ url });
});
