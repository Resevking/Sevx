import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, json, parseBody, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { purgeFiles, purgeFolder } from '@/lib/files';

const schema = z.object({ type: z.enum(['file', 'folder']), id: z.string().max(64) });

/** Löscht ein Element aus dem Papierkorb endgültig. */
export const POST = route(async (req) => {
    const user = await requireApiUser();
    const { type, id } = await parseBody(req, schema);

    if (type === 'file') {
        const file = await db.file.findFirst({ where: { id, userId: user.id, deletedAt: { not: null } } });
        if (!file) throw new ApiError(404, 'Datei nicht im Papierkorb gefunden');
        await purgeFiles(user.id, [file]);
    } else {
        const folder = await db.folder.findFirst({ where: { id, userId: user.id, deletedAt: { not: null } }, select: { id: true } });
        if (!folder) throw new ApiError(404, 'Ordner nicht im Papierkorb gefunden');
        await purgeFolder(user.id, folder.id);
    }
    return json({ ok: true });
});
