import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { errorResponse, json } from '@/lib/api';
import { TRASH_RETENTION_DAYS, purgeFiles, purgeFolder } from '@/lib/files';

// Aufräumjob – stündlich aufrufen (siehe docker-compose.yml, Dienst "cron"):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://truecloud.online/api/cron/cleanup

const DAY = 24 * 60 * 60 * 1000;
const STALE_UPLOAD_MS = DAY;

function authorized(req: Request): boolean {
    const secret = config.cronSecret;
    const header = req.headers.get('authorization') ?? '';
    if (!secret) return false;
    const expected = Buffer.from(`Bearer ${secret}`);
    const given = Buffer.from(header);
    return expected.length === given.length && timingSafeEqual(expected, given);
}

async function cleanup() {
    const now = Date.now();
    const result = { staleUploads: 0, trashedFiles: 0, trashedFolders: 0, sessions: 0, tokens: 0, stripeEvents: 0 };

    // 1. Abgebrochene Uploads (älter als 24 h) entfernen und Reservierungen freigeben
    const stale = await db.file.findMany({ where: { status: 'PENDING', createdAt: { lt: new Date(now - STALE_UPLOAD_MS) } }, take: 1000 });
    for (const [userId, files] of groupBy(stale, (f) => f.userId)) await purgeFiles(userId, files);
    result.staleUploads = stale.length;

    // 2. Papierkorb nach Ablauf der Aufbewahrungsfrist leeren
    const cutoff = new Date(now - TRASH_RETENTION_DAYS * DAY);
    const files = await db.file.findMany({ where: { deletedAt: { lt: cutoff } }, take: 5000 });
    for (const [userId, group] of groupBy(files, (f) => f.userId)) await purgeFiles(userId, group);
    result.trashedFiles = files.length;
    const folders = await db.folder.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true, userId: true }, take: 1000 });
    for (const folder of folders) await purgeFolder(folder.userId, folder.id);
    result.trashedFolders = folders.length;

    // 3. Abgelaufene Sitzungen und Tokens
    result.sessions = (await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })).count;
    result.tokens = (await db.authToken.deleteMany({ where: { expiresAt: { lt: new Date(now - DAY) } } })).count;
    result.stripeEvents = (await db.stripeEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * DAY) } } })).count;
    return result;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
    return map;
}

async function handler(req: Request) {
    if (!authorized(req)) return errorResponse(401, 'Nicht autorisiert');
    try {
        return json({ ok: true, ...(await cleanup()) });
    } catch (err) {
        console.error('[cron] Aufräumen fehlgeschlagen', err);
        return errorResponse(500, 'Aufräumen fehlgeschlagen');
    }
}

export const GET = handler;
export const POST = handler;
