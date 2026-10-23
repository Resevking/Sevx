import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, json, parseBody, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { assertFolder, folderIndexFor, validName } from '@/lib/files';
import { isHidden } from '@/lib/tree';

/** Alle sichtbaren Ordner (für den Verschieben-Dialog). */
export const GET = route(async () => {
    const user = await requireApiUser();
    const index = await folderIndexFor(user.id);
    const folders = [...index.byId.values()]
        .filter((f) => !isHidden(index, f.id))
        .map((f) => ({ id: f.id, name: f.name, parentId: f.parentId }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return json({ folders });
});

const createSchema = z.object({ name: z.string().min(1, 'Bitte gib einen Namen ein.').max(255), parentId: z.string().max(64).nullable().optional() });

export const POST = route(async (req) => {
    const user = await requireApiUser();
    const body = await parseBody(req, createSchema);
    const parentId = body.parentId ?? null;
    await assertFolder(user.id, parentId);
    const name = validName(body.name);

    const conflict = await db.folder.findFirst({
        where: { userId: user.id, parentId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
        select: { id: true }
    });
    if (conflict) throw new ApiError(409, 'Hier gibt es bereits einen Ordner mit diesem Namen.');

    const count = await db.folder.count({ where: { userId: user.id } });
    if (count >= 50_000) throw new ApiError(400, 'Maximale Anzahl an Ordnern erreicht.');

    const folder = await db.folder.create({ data: { userId: user.id, parentId, name } });
    return json({ folder: { id: folder.id, name: folder.name, parentId: folder.parentId, updatedAt: folder.updatedAt } }, { status: 201 });
});
