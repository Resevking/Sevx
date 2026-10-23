import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, json, parseBody, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { folderIndexFor, uniqueFolderName, validName } from '@/lib/files';
import { descendantIds, isHidden } from '@/lib/tree';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    parentId: z.string().max(64).nullable().optional()
});

/** Umbenennen und/oder Verschieben. */
export const PATCH = route<Ctx>(async (req, { params }) => {
    const user = await requireApiUser();
    const { id } = await params;
    const body = await parseBody(req, patchSchema);
    const index = await folderIndexFor(user.id);
    const folder = index.byId.get(id);
    if (!folder || isHidden(index, id)) throw new ApiError(404, 'Ordner nicht gefunden');

    const targetParent = body.parentId !== undefined ? body.parentId : folder.parentId;
    if (targetParent !== folder.parentId) {
        if (targetParent && isHidden(index, targetParent)) throw new ApiError(404, 'Zielordner nicht gefunden');
        if (targetParent && descendantIds(index, id).includes(targetParent)) {
            throw new ApiError(400, 'Ein Ordner kann nicht in sich selbst verschoben werden.');
        }
    }

    let name = body.name !== undefined ? validName(body.name) : folder.name;
    const conflict = await db.folder.findFirst({
        where: { userId: user.id, parentId: targetParent, deletedAt: null, id: { not: id }, name: { equals: name, mode: 'insensitive' } },
        select: { id: true }
    });
    if (conflict) {
        if (body.name !== undefined) throw new ApiError(409, 'Hier gibt es bereits einen Ordner mit diesem Namen.');
        name = await uniqueFolderName(user.id, targetParent, name, id);
    }

    const updated = await db.folder.update({ where: { id }, data: { name, parentId: targetParent } });
    return json({ folder: { id: updated.id, name: updated.name, parentId: updated.parentId, updatedAt: updated.updatedAt } });
});

/** Ordner (mit Inhalt) in den Papierkorb verschieben. */
export const DELETE = route<Ctx>(async (_req, { params }) => {
    const user = await requireApiUser();
    const { id } = await params;
    const { count } = await db.folder.updateMany({ where: { id, userId: user.id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!count) throw new ApiError(404, 'Ordner nicht gefunden');
    return json({ ok: true });
});
