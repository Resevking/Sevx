import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, json, parseBody, route } from '@/lib/api';
import { destroySession, requireApiUser } from '@/lib/auth';
import { verifyPassword } from '@/lib/crypto';
import { config } from '@/lib/config';
import { abortMultipartUpload, deletePrefix, userPrefix } from '@/lib/storage';
import { stripe } from '@/lib/stripe';
import { rateLimit } from '@/lib/rate-limit';
import { nameSchema } from '@/lib/validation';

export const PATCH = route(async (req) => {
    const user = await requireApiUser();
    const { name } = await parseBody(req, z.object({ name: nameSchema }));
    await db.user.update({ where: { id: user.id }, data: { name: name || null } });
    return json({ ok: true });
});

const deleteSchema = z.object({ password: z.string().min(1, 'Bitte gib dein Passwort ein.'), confirmEmail: z.string() });

export const DELETE = route(async (req) => {
    const user = await requireApiUser();
    rateLimit(`delete-account:${user.id}`, 5, 60 * 60 * 1000);
    const body = await parseBody(req, deleteSchema);
    if (body.confirmEmail.trim().toLowerCase() !== user.email) throw new ApiError(400, 'Die E-Mail-Adresse stimmt nicht überein.');
    if (!(await verifyPassword(body.password, user.passwordHash))) throw new ApiError(400, 'Das Passwort ist falsch.');

    // 1. Laufendes Abo sofort beenden, damit nichts mehr abgebucht wird.
    if (user.stripeSubscriptionId && config.stripe.isConfigured) {
        await stripe()
            .subscriptions.cancel(user.stripeSubscriptionId)
            .catch((err) => {
                if (err?.code !== 'resource_missing') throw err;
            });
    }
    // 2. Alle Dateien bei OVHcloud löschen (inkl. abgebrochener Multipart-Uploads).
    const pending = await db.file.findMany({ where: { userId: user.id, status: 'PENDING', uploadId: { not: null } } });
    for (const f of pending) await abortMultipartUpload(f.storageKey, f.uploadId as string);
    await deletePrefix(userPrefix(user.id));
    // 3. Benutzer samt Ordnern, Dateien, Freigaben und Sitzungen löschen.
    await db.user.delete({ where: { id: user.id } });
    await destroySession();
    return json({ ok: true });
});
