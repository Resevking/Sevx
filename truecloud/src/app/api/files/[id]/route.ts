import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, json, parseBody, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { assertFolder, folderIndexFor, serializeFile, uniqueFileName, validName } from '@/lib/files';
import { isHidden } from '@/lib/tree';

type Ctx = { params: Promise<{ id: string }> };

async function findVisibleFile(userId: string, id: string) {
    const file = await db.file.findFirst({ where: { id, userId, status: 'ACTIVE', deletedAt: null } });
    if (!file) throw new ApiError(404, 'Datei nicht gefunden');
    const index = await folderIndexFor(userId);
    if (isHidden(index, file.folderId)) throw new ApiError(404, 'Datei nicht gefunden');
    return file;
}

const patchSchema = z.object({
    name: z.string().min(1).max(1000).optional(),
    folderId: z.string().max(64).nullable().optional()
});

/** Umbenennen und/oder Verschieben. */
export const PATCH = route<Ctx>(async (req, { params }) => {
    const user = await requireApiUser();
    const { id } = await params;
    const body = await parseBody(req, patchSchema);
    const file = await findVisibleFile(user.id, id);

    const targetFolder = body.folderId !== undefined ? body.folderId : file.folderId;
    if (targetFolder !== file.folderId) await assertFolder(user.id, targetFolder);

    let name = body.name !== undefined ? validName(body.name) : file.name;
    const conflict = await db.file.findFirst({
        where: { userId: user.id, folderId: targetFolder, deletedAt: null, id: { not: file.id }, name: { equals: name, mode: 'insensitive' } },
        select: { id: true }
    });
    if (conflict) {
        if (body.name !== undefined) throw new ApiError(409, 'In diesem Ordner gibt es bereits eine Datei mit diesem Namen.');
        name = await uniqueFileName(user.id, targetFolder, name, file.id);
    }

    const updated = await db.file.update({ where: { id: file.id }, data: { name, folderId: targetFolder } });
    return json({ file: serializeFile(updated) });
});

/** In den Papierkorb verschieben. */
export const DELETE = route<Ctx>(async (_req, { params }) => {
    const user = await requireApiUser();
    const { id } = await params;
    const file = await db.file.findFirst({ where: { id, userId: user.id, status: 'ACTIVE', deletedAt: null } });
    if (!file) throw new ApiError(404, 'Datei nicht gefunden');
    await db.file.update({ where: { id: file.id }, data: { deletedAt: new Date() } });
    return json({ ok: true });
});
