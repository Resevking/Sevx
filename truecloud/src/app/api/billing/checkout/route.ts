import { z } from 'zod';
import type Stripe from 'stripe';
import { ApiError, json, parseBody, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { config } from '@/lib/config';
import { formatBytes } from '@/lib/format';
import { getPlan, quotaBytesFor, type BillingInterval, type PlanId } from '@/lib/plans';
import { ensureCustomer, hasActiveSubscription, priceIdFor, stripe, syncSubscription } from '@/lib/stripe';

const schema = z.object({
    plan: z.enum(['start', 'plus', 'pro', 'max']),
    interval: z.enum(['month', 'year'])
});

/**
 * Ohne Abo: erstellt eine Stripe-Checkout-Session und gibt deren URL zurück.
 * Mit Abo: wechselt direkt den Tarif (mit anteiliger Verrechnung).
 */
export const POST = route(async (req) => {
    const user = await requireApiUser();
    const { plan, interval } = await parseBody(req, schema);
    const target = getPlan(plan);

    if (user.usedBytes > quotaBytesFor(plan)) {
        throw new ApiError(
            400,
            `Du belegst aktuell ${formatBytes(user.usedBytes)}, der Tarif ${target.name} bietet ${formatBytes(quotaBytesFor(plan))}. Bitte lösche zuerst Dateien (auch im Papierkorb).`
        );
    }

    const priceId = await priceIdFor(plan as PlanId, interval as BillingInterval);

    if (hasActiveSubscription(user)) {
        const sub = await stripe().subscriptions.retrieve(user.stripeSubscriptionId as string);
        const item = sub.items.data[0];
        if (item.price.id === priceId) {
            if (sub.cancel_at_period_end) {
                await syncSubscription(await stripe().subscriptions.update(sub.id, { cancel_at_period_end: false }));
                return json({ ok: true, message: 'Dein Abo läuft weiter.' });
            }
            throw new ApiError(400, 'Du hast diesen Tarif bereits.');
        }

        const current = getPlan(user.plan);
        const isUpgrade = target.storageGB > current.storageGB || (target.storageGB === current.storageGB && interval === 'year');
        let updated: Stripe.Subscription;
        try {
            updated = await stripe().subscriptions.update(sub.id, {
                items: [{ id: item.id, price: priceId }],
                cancel_at_period_end: false,
                // Upgrade: Differenz sofort abrechnen. Downgrade: Gutschrift auf der nächsten Rechnung.
                proration_behavior: isUpgrade ? 'always_invoice' : 'create_prorations',
                payment_behavior: isUpgrade ? 'error_if_incomplete' : 'allow_incomplete',
                metadata: { userId: user.id }
            });
        } catch (err) {
            const e = err as Stripe.errors.StripeError;
            if (e?.type === 'StripeCardError') throw new ApiError(402, `Zahlung fehlgeschlagen: ${e.message}`);
            throw err;
        }
        await syncSubscription(updated);
        return json({ ok: true, message: `Dein Tarif wurde auf ${target.name} geändert.` });
    }

    const customer = await ensureCustomer(user);
    const automaticTax = config.stripe.automaticTax;
    const session = await stripe().checkout.sessions.create({
        mode: 'subscription',
        customer,
        client_reference_id: user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${config.appUrl}/dashboard/abo?checkout=success`,
        cancel_url: `${config.appUrl}/dashboard/abo?checkout=cancel`,
        subscription_data: { metadata: { userId: user.id } },
        allow_promotion_codes: true,
        billing_address_collection: automaticTax ? 'required' : 'auto',
        ...(automaticTax ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' } } : {}),
        locale: 'de'
    });
    if (!session.url) throw new ApiError(500, 'Checkout konnte nicht gestartet werden.');
    return json({ url: session.url });
});
