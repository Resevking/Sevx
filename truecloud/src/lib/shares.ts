import 'server-only';
import { db } from './db';
import { config } from './config';
import { folderIndexFor } from './files';
import { isHidden } from './tree';

export function shareUrl(token: string): string {
    return `${config.appUrl}/s/${token}`;
}

/** Sucht eine öffentlich abrufbare Freigabe. null, wenn sie abgelaufen ist oder die Datei gelöscht wurde. */
export async function findPublicShare(token: string) {
    if (!/^[\w-]{10,64}$/.test(token)) return null;
    const share = await db.share.findUnique({ where: { token }, include: { file: true } });
    if (!share) return null;
    if (share.expiresAt && share.expiresAt < new Date()) return null;
    if (share.file.status !== 'ACTIVE' || share.file.deletedAt) return null;
    if (isHidden(await folderIndexFor(share.userId), share.file.folderId)) return null;
    return share;
}
