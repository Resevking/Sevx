import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, json, parseBody, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { partCountFor, presignPart } from '@/lib/storage';

const schema = z.object({
    fileId: z.string().max(64),
    partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100)
});

/** Liefert vorsignierte URLs für einzelne Teile eines Multipart-Uploads. */
export const POST = route(async (req) => {
    const user = await requireApiUser();
    const { fileId, partNumbers } = await parseBody(req, schema);
    const file = await db.file.findFirst({ where: { id: fileId, userId: user.id, status: 'PENDING' } });
    if (!file?.uploadId) throw new ApiError(404, 'Upload nicht gefunden');

    const partCount = partCountFor(Number(file.size));
    if (partNumbers.some((n) => n > partCount)) throw new ApiError(400, 'Ungültige Teilnummer');

    const urls: Record<number, string> = {};
    await Promise.all(
        partNumbers.map(async (n) => {
            urls[n] = await presignPart(file.storageKey, file.uploadId as string, n);
        })
    );
    return json({ urls });
});
