import { db } from '@/lib/db';
import { ApiError, json, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>(async (_req, { params }) => {
    const user = await requireApiUser();
    const { id } = await params;
    const { count } = await db.share.deleteMany({ where: { id, userId: user.id } });
    if (!count) throw new ApiError(404, 'Freigabe nicht gefunden');
    return json({ ok: true });
});
