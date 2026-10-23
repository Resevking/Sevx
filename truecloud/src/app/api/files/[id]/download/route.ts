import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ApiError, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { folderIndexFor } from '@/lib/files';
import { presignDownload } from '@/lib/storage';
import { isHidden } from '@/lib/tree';

type Ctx = { params: Promise<{ id: string }> };

/** Leitet auf eine zeitlich begrenzte Download-URL bei OVHcloud weiter. ?inline=1 für die Vorschau. */
export const GET = route<Ctx>(async (req, { params }) => {
    const user = await requireApiUser();
    const { id } = await params;
    const file = await db.file.findFirst({ where: { id, userId: user.id, status: 'ACTIVE', deletedAt: null } });
    if (!file) throw new ApiError(404, 'Datei nicht gefunden');
    const index = await folderIndexFor(user.id);
    if (isHidden(index, file.folderId)) throw new ApiError(404, 'Datei nicht gefunden');

    const inline = new URL(req.url).searchParams.get('inline') === '1';
    const url = await presignDownload(file.storageKey, file.name, { inline, contentType: file.mimeType });
    return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'no-store' } });
});
