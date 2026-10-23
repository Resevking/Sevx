import { json, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { sendVerificationMail } from '@/lib/tokens';

export const POST = route(async () => {
    const user = await requireApiUser();
    if (user.emailVerifiedAt) return json({ ok: true });
    rateLimit(`verify:${user.id}`, 3, 60 * 60 * 1000);
    await sendVerificationMail(user);
    return json({ ok: true });
});
