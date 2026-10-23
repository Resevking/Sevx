import { db } from '@/lib/db';
import { json, route } from '@/lib/api';
import { getSession, requireApiUser } from '@/lib/auth';

/** Meldet alle anderen Geräte ab. */
export const DELETE = route(async () => {
    const user = await requireApiUser();
    const session = await getSession();
    const { count } = await db.session.deleteMany({ where: { userId: user.id, id: { not: session?.id } } });
    return json({ ok: true, count });
});
