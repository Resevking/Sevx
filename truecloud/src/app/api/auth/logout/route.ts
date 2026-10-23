import { json, route } from '@/lib/api';
import { destroySession } from '@/lib/auth';

export const POST = route(async () => {
    await destroySession();
    return json({ ok: true });
});
