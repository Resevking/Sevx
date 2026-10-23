import 'server-only';
import type { File as DbFile } from '@prisma/client';
import { db } from './db';
import { ApiError } from './api';
import { abortMultipartUpload, deleteObjects } from './storage';
import { buildFolderIndex, cleanName, descendantIds, isHidden, makeUniqueName, type FolderIndex } from './tree';

export const TRASH_RETENTION_DAYS = 30;

export function validName(input: string): string {
    const name = cleanName(input);
    if (!name) throw new ApiError(400, 'Bitte gib einen gültigen Namen ein.');
    return name;
}

export async function folderIndexFor(userId: string): Promise<FolderIndex> {
    const folders = await db.folder.findMany({ where: { userId }, select: { id: true, name: true, parentId: true, deletedAt: true } });
    return buildFolderIndex(folders);
}

/** Stellt sicher, dass der Ordner dem Benutzer gehört und nicht im Papierkorb liegt. */
export async function assertFolder(userId: string, folderId: string | null): Promise<FolderIndex> {
    const index = await folderIndexFor(userId);
    if (folderId && isHidden(index, folderId)) throw new ApiError(404, 'Ordner nicht gefunden');
    return index;
}

export async function uniqueFileName(userId: string, folderId: string | null, name: string, excludeId?: string): Promise<string> {
    const siblings = await db.file.findMany({
        where: { userId, folderId, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { name: true }
    });
    return makeUniqueName(
        name,
        siblings.map((s) => s.name)
    );
}

export async function uniqueFolderName(userId: string, parentId: string | null, name: string, excludeId?: string): Promise<string> {
    const siblings = await db.folder.findMany({
        where: { userId, parentId, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { name: true }
    });
    return makeUniqueName(
        name,
        siblings.map((s) => s.name)
    );
}

// ---------------------------------------------------------------------------
// Kontingent
// ---------------------------------------------------------------------------

/** Reserviert atomar Speicher für einen Upload. false, wenn das Kontingent nicht reicht. */
export async function reserveQuota(userId: string, bytes: number): Promise<boolean> {
    const size = BigInt(bytes);
    const updated = await db.$executeRaw`
        UPDATE "User" SET "reservedBytes" = "reservedBytes" + ${size}
        WHERE "id" = ${userId} AND "usedBytes" + "reservedBytes" + ${size} <= "quotaBytes"`;
    return updated === 1;
}

export async function releaseReservation(userId: string, bytes: bigint | number): Promise<void> {
    await db.$executeRaw`
        UPDATE "User" SET "reservedBytes" = GREATEST(0, "reservedBytes" - ${BigInt(bytes)}) WHERE "id" = ${userId}`;
}

/** Schliesst einen Upload ab: Reservierung wird zu belegtem Speicher. Nur einmal pro Datei wirksam. */
export async function commitUpload(file: Pick<DbFile, 'id' | 'userId' | 'size'>): Promise<boolean> {
    return db.$transaction(async (tx) => {
        const { count } = await tx.file.updateMany({ where: { id: file.id, status: 'PENDING' }, data: { status: 'ACTIVE', uploadId: null } });
        if (count !== 1) return false;
        await tx.$executeRaw`
            UPDATE "User" SET
                "reservedBytes" = GREATEST(0, "reservedBytes" - ${file.size}),
                "usedBytes" = "usedBytes" + ${file.size}
            WHERE "id" = ${file.userId}`;
        return true;
    });
}

// ---------------------------------------------------------------------------
// Endgültiges Löschen
// ---------------------------------------------------------------------------

type PurgeableFile = Pick<DbFile, 'id' | 'storageKey' | 'size' | 'status' | 'uploadId'>;

/** Löscht Dateien endgültig aus OVHcloud und der Datenbank und gibt den Speicher frei. */
export async function purgeFiles(userId: string, files: PurgeableFile[]): Promise<void> {
    if (!files.length) return;
    for (const f of files) {
        if (f.status === 'PENDING' && f.uploadId) await abortMultipartUpload(f.storageKey, f.uploadId);
    }
    await deleteObjects(files.map((f) => f.storageKey));
    const ids = files.map((f) => f.id);
    await db.$transaction(async (tx) => {
        // Nur tatsächlich gelöschte Zeilen zählen – so wird bei gleichzeitigen
        // Löschvorgängen kein Speicher doppelt gutgeschrieben.
        const rows = await tx.$queryRaw<{ size: bigint; status: string }[]>`
            DELETE FROM "File" WHERE "userId" = ${userId} AND "id" = ANY(${ids}::text[]) RETURNING "size", "status"`;
        let active = 0n;
        let pending = 0n;
        for (const row of rows) {
            if (row.status === 'ACTIVE') active += BigInt(row.size);
            else pending += BigInt(row.size);
        }
        if (active || pending) {
            await tx.$executeRaw`
                UPDATE "User" SET
                    "usedBytes" = GREATEST(0, "usedBytes" - ${active}),
                    "reservedBytes" = GREATEST(0, "reservedBytes" - ${pending})
                WHERE "id" = ${userId}`;
        }
    });
}

/** Löscht einen Ordner samt Inhalt endgültig. */
export async function purgeFolder(userId: string, folderId: string): Promise<void> {
    const index = await folderIndexFor(userId);
    if (!index.byId.has(folderId)) return;
    const ids = descendantIds(index, folderId);
    const files = await db.file.findMany({
        where: { userId, folderId: { in: ids } },
        select: { id: true, storageKey: true, size: true, status: true, uploadId: true }
    });
    await purgeFiles(userId, files);
    await db.folder.deleteMany({ where: { userId, id: folderId } });
}

export function serializeFile(f: DbFile) {
    return {
        id: f.id,
        name: f.name,
        size: Number(f.size),
        mimeType: f.mimeType,
        folderId: f.folderId,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        deletedAt: f.deletedAt
    };
}
