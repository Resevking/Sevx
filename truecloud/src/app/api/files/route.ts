import { db } from '@/lib/db';
import { json, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { assertFolder, serializeFile } from '@/lib/files';
import { isHidden, pathOf } from '@/lib/tree';

/** Inhalt eines Ordners (?folderId=…) oder Suchergebnisse (?q=…). */
export const GET = route(async (req) => {
    const user = await requireApiUser();
    const params = new URL(req.url).searchParams;
    const folderId = params.get('folderId') || null;
    const q = (params.get('q') ?? '').trim().slice(0, 200);
    const index = await assertFolder(user.id, folderId);

    if (q) {
        const [folders, files] = await Promise.all([
            db.folder.findMany({ where: { userId: user.id, deletedAt: null, name: { contains: q, mode: 'insensitive' } }, orderBy: { name: 'asc' }, take: 100 }),
            db.file.findMany({
                where: { userId: user.id, deletedAt: null, status: 'ACTIVE', name: { contains: q, mode: 'insensitive' } },
                orderBy: { name: 'asc' },
                take: 300
            })
        ]);
        const location = (id: string | null) =>
            pathOf(index, id)
                .map((p) => p.name)
                .join(' / ');
        return json({
            mode: 'search',
            breadcrumbs: [],
            folders: folders
                .filter((f) => !isHidden(index, f.id))
                .map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, updatedAt: f.updatedAt, location: location(f.parentId) })),
            files: files.filter((f) => !isHidden(index, f.folderId)).map((f) => ({ ...serializeFile(f), location: location(f.folderId) }))
        });
    }

    const [folders, files] = await Promise.all([
        db.folder.findMany({ where: { userId: user.id, parentId: folderId, deletedAt: null }, orderBy: { name: 'asc' } }),
        db.file.findMany({ where: { userId: user.id, folderId, deletedAt: null, status: 'ACTIVE' }, orderBy: { name: 'asc' } })
    ]);
    return json({
        mode: 'folder',
        breadcrumbs: pathOf(index, folderId),
        folders: folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, updatedAt: f.updatedAt })),
        files: files.map(serializeFile)
    });
});
