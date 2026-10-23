import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, json, parseBody, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { commitUpload, purgeFiles, serializeFile } from '@/lib/files';
import { completeMultipartUpload, objectSize } from '@/lib/storage';

const schema = z.object({
    fileId: z.string().max(64),
    parts: z
        .array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) }))
        .max(10_000)
        .optional()
});

export const POST = route(async (req) => {
    const user = await requireApiUser();
    const { fileId, parts } = await parseBody(req, schema);
    const file = await db.file.findFirst({ where: { id: fileId, userId: user.id, status: 'PENDING' } });
    if (!file) throw new ApiError(404, 'Upload nicht gefunden');

    if (file.uploadId) {
        if (!parts?.length) throw new ApiError(400, 'Es fehlen Teile des Uploads.');
        try {
            await completeMultipartUpload(file.storageKey, file.uploadId, parts);
        } catch (err) {
            console.warn('[upload] Multipart-Abschluss fehlgeschlagen', file.id, (err as Error).name);
            throw new ApiError(400, 'Der Upload ist unvollständig. Bitte versuche es erneut.');
        }
        await db.file.update({ where: { id: file.id }, data: { uploadId: null } });
    }

    // Die tatsächliche Grösse bei OVHcloud muss der angemeldeten entsprechen,
    // sonst könnte jemand mehr hochladen als sein Kontingent erlaubt.
    const actual = await objectSize(file.storageKey);
    if (actual === null) throw new ApiError(400, 'Die Datei ist noch nicht vollständig hochgeladen.');
    if (actual !== Number(file.size)) {
        await purgeFiles(user.id, [{ ...file, uploadId: null }]);
        throw new ApiError(400, 'Die Dateigrösse stimmt nicht mit der Anmeldung überein. Der Upload wurde verworfen.');
    }

    await commitUpload(file);
    return json({ file: serializeFile({ ...file, status: 'ACTIVE', uploadId: null }) });
});
