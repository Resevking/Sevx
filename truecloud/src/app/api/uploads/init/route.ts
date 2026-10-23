import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, json, parseBody, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { assertFolder, releaseReservation, reserveQuota, uniqueFileName, validName } from '@/lib/files';
import { formatBytes } from '@/lib/format';
import { MAX_OBJECT_SIZE, SINGLE_UPLOAD_LIMIT, createMultipartUpload, partCountFor, partSizeFor, presignPut, storageKeyFor } from '@/lib/storage';

const schema = z.object({
    name: z.string().min(1).max(1000),
    size: z.number().int().min(0).max(MAX_OBJECT_SIZE, 'Dateien dürfen höchstens 5 TB gross sein.'),
    mimeType: z.string().max(255).optional(),
    folderId: z.string().max(64).nullable().optional()
});

const MAX_PENDING_UPLOADS = 100;

function cleanMimeType(value: string | undefined): string {
    return value && /^[\w.+-]+\/[\w.+-]+$/.test(value) ? value : 'application/octet-stream';
}

export const POST = route(async (req) => {
    const user = await requireApiUser();
    const body = await parseBody(req, schema);
    const folderId = body.folderId ?? null;
    await assertFolder(user.id, folderId);
    const name = validName(body.name);
    const mimeType = cleanMimeType(body.mimeType);

    const pending = await db.file.count({ where: { userId: user.id, status: 'PENDING' } });
    if (pending >= MAX_PENDING_UPLOADS) throw new ApiError(429, 'Zu viele gleichzeitige Uploads. Bitte warte, bis laufende Uploads fertig sind.');

    if (!(await reserveQuota(user.id, body.size))) {
        const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
        const free = fresh.quotaBytes - fresh.usedBytes - fresh.reservedBytes;
        throw new ApiError(
            413,
            `Nicht genügend Speicherplatz für "${name}" (${formatBytes(body.size)}). Frei: ${formatBytes(free > 0 ? free : 0)}. Upgrade dein Abo für mehr Speicher.`
        );
    }

    let fileId: string | null = null;
    try {
        const finalName = await uniqueFileName(user.id, folderId, name);
        const storageKey = storageKeyFor(user.id, randomUUID());
        const file = await db.file.create({
            data: { userId: user.id, folderId, name: finalName, size: BigInt(body.size), mimeType, storageKey, status: 'PENDING' }
        });
        fileId = file.id;

        if (body.size <= SINGLE_UPLOAD_LIMIT) {
            const url = await presignPut(storageKey, mimeType);
            return json({ fileId: file.id, name: finalName, mode: 'single', url, contentType: mimeType });
        }

        const uploadId = await createMultipartUpload(storageKey, mimeType);
        await db.file.update({ where: { id: file.id }, data: { uploadId } });
        return json({
            fileId: file.id,
            name: finalName,
            mode: 'multipart',
            partSize: partSizeFor(body.size),
            partCount: partCountFor(body.size)
        });
    } catch (err) {
        await releaseReservation(user.id, body.size);
        if (fileId) await db.file.delete({ where: { id: fileId } }).catch(() => undefined);
        throw err;
    }
});
