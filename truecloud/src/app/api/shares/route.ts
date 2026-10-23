import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, json, parseBody, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { hashPassword, randomToken } from '@/lib/crypto';
import { folderIndexFor } from '@/lib/files';
import { canProtectShares } from '@/lib/plans';
import { shareUrl } from '@/lib/shares';
import { isHidden } from '@/lib/tree';

export const GET = route(async () => {
    const user = await requireApiUser();
    const shares = await db.share.findMany({
        where: { userId: user.id },
        include: { file: { select: { id: true, name: true, size: true, mimeType: true, deletedAt: true } } },
        orderBy: { createdAt: 'desc' }
    });
    return json({
        shares: shares.map((s) => ({
            id: s.id,
            url: shareUrl(s.token),
            hasPassword: Boolean(s.passwordHash),
            expiresAt: s.expiresAt,
            downloadCount: s.downloadCount,
            createdAt: s.createdAt,
            file: { id: s.file.id, name: s.file.name, size: Number(s.file.size), mimeType: s.file.mimeType, inTrash: Boolean(s.file.deletedAt) }
        }))
    });
});

const createSchema = z.object({
    fileId: z.string().max(64),
    password: z.string().max(200).optional(),
    expiresInDays: z.number().int().min(1).max(365).nullable().optional()
});

export const POST = route(async (req) => {
    const user = await requireApiUser();
    const body = await parseBody(req, createSchema);
    if (!user.emailVerifiedAt) throw new ApiError(403, 'Bitte bestätige zuerst deine E-Mail-Adresse, um Dateien zu teilen.');

    const password = body.password?.trim() || null;
    if ((password || body.expiresInDays) && !canProtectShares(user.plan)) {
        throw new ApiError(403, 'Passwortschutz und Ablaufdatum gibt es ab dem Start-Tarif.');
    }
    if (password && password.length < 4) throw new ApiError(400, 'Das Passwort muss mindestens 4 Zeichen lang sein.');

    const file = await db.file.findFirst({ where: { id: body.fileId, userId: user.id, status: 'ACTIVE', deletedAt: null } });
    if (!file || isHidden(await folderIndexFor(user.id), file.folderId)) throw new ApiError(404, 'Datei nicht gefunden');

    const token = randomToken(18);
    const share = await db.share.create({
        data: {
            token,
            userId: user.id,
            fileId: file.id,
            passwordHash: password ? await hashPassword(password) : null,
            expiresAt: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000) : null
        }
    });
    return json({ share: { id: share.id, url: shareUrl(token), hasPassword: Boolean(password), expiresAt: share.expiresAt } }, { status: 201 });
});
