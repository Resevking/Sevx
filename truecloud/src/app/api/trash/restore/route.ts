import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, json, parseBody, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { folderIndexFor, uniqueFileName, uniqueFolderName } from '@/lib/files';
import { isHidden } from '@/lib/tree';

const schema = z.object({ type: z.enum(['file', 'folder']), id: z.string().max(64) });

/** Stellt ein Element wieder her. Liegt der ursprüngliche Ordner selbst im Papierkorb, landet es in "Meine Dateien". */
export const POST = route(async (req) => {
    const user = await requireApiUser();
    const { type, id } = await parseBody(req, schema);
    const index = await folderIndexFor(user.id);

    if (type === 'file') {
        const file = await db.file.findFirst({ where: { id, userId: user.id, status: 'ACTIVE', deletedAt: { not: null } } });
        if (!file) throw new ApiError(404, 'Datei nicht im Papierkorb gefunden');
        const folderId = isHidden(index, file.folderId) ? null : file.folderId;
        const name = await uniqueFileName(user.id, folderId, file.name, file.id);
        await db.file.update({ where: { id }, data: { deletedAt: null, folderId, name } });
        return json({ ok: true, folderId });
    }

    const folder = await db.folder.findFirst({ where: { id, userId: user.id, deletedAt: { not: null } } });
    if (!folder) throw new ApiError(404, 'Ordner nicht im Papierkorb gefunden');
    const parentId = isHidden(index, folder.parentId) ? null : folder.parentId;
    const name = await uniqueFolderName(user.id, parentId, folder.name, folder.id);
    await db.folder.update({ where: { id }, data: { deletedAt: null, parentId, name } });
    return json({ ok: true, folderId: parentId });
});
