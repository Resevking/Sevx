import { db } from '@/lib/db';
import { errorResponse, json } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await db.$queryRaw`SELECT 1`;
        return json({ ok: true });
    } catch {
        return errorResponse(503, 'Datenbank nicht erreichbar');
    }
}
