import { db } from '@/lib/db';
import { json, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { TRASH_RETENTION_DAYS, purgeFiles, purgeFolder, serializeFile } from '@/lib/files';

export const GET = route(async () => {
    const user = await requireApiUser();
    const [folders, files] = await Promise.all([
        db.folder.findMany({ where: { userId: user.id, deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } }),
        db.file.findMany({ where: { userId: user.id, status: 'ACTIVE', deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } })
    ]);
    return json({
        retentionDays: TRASH_RETENTION_DAYS,
        folders: folders.map((f) => ({ id: f.id, name: f.name, deletedAt: f.deletedAt })),
        files: files.map(serializeFile)
    });
});

/** Papierkorb leeren. */
export const DELETE = route(async () => {
    const user = await requireApiUser();
    const files = await db.file.findMany({ where: { userId: user.id, deletedAt: { not: null } } });
    await purgeFiles(user.id, files);
    const folders = await db.folder.findMany({ where: { userId: user.id, deletedAt: { not: null } }, select: { id: true } });
    for (const folder of folders) await purgeFolder(user.id, folder.id);
    return json({ ok: true });
});
