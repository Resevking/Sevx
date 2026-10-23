import { z } from 'zod';
import { db } from '@/lib/db';
import { json, parseBody, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { purgeFiles } from '@/lib/files';

export const POST = route(async (req) => {
    const user = await requireApiUser();
    const { fileId } = await parseBody(req, z.object({ fileId: z.string().max(64) }));
    const file = await db.file.findFirst({ where: { id: fileId, userId: user.id, status: 'PENDING' } });
    if (file) await purgeFiles(user.id, [file]);
    return json({ ok: true });
});
