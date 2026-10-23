import type Stripe from 'stripe';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { errorResponse, json } from '@/lib/api';
import { sendMail } from '@/lib/mail';
import { stripe, syncSubscription } from '@/lib/stripe';

// Stripe → https://truecloud.online/api/stripe/webhook
// Benötigte Ereignisse: checkout.session.completed, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed

async function syncById(subscriptionId: string) {
    // Immer den aktuellen Stand laden – Webhooks können in falscher Reihenfolge eintreffen.
    await syncSubscription(await stripe().subscriptions.retrieve(subscriptionId));
}

async function handle(event: Stripe.Event) {
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            if (session.client_reference_id && typeof session.customer === 'string') {
                await db.user.updateMany({
                    where: { id: session.client_reference_id, stripeCustomerId: null },
                    data: { stripeCustomerId: session.customer }
                });
            }
            if (typeof session.subscription === 'string') await syncById(session.subscription);
            break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
        case 'customer.subscription.paused':
        case 'customer.subscription.resumed':
            await syncById(event.data.object.id);
            break;
        case 'invoice.payment_failed': {
            const invoice = event.data.object;
            const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
            const user = customerId ? await db.user.findUnique({ where: { stripeCustomerId: customerId } }) : null;
            if (user) {
                await sendMail({
                    to: user.email,
                    subject: 'Zahlung fehlgeschlagen',
                    text: `Hallo${user.name ? ' ' + user.name : ''}\n\nleider konnten wir die Zahlung für dein TrueCloud-Abo nicht einziehen. Bitte prüfe deine Zahlungsmethode, damit dein Speicher erhalten bleibt.`,
                    action: { label: 'Zahlungsmethode prüfen', url: `${config.appUrl}/dashboard/abo` }
                }).catch((err) => console.error('[mail]', err));
            }
            break;
        }
        default:
            break;
    }
}

export async function POST(req: Request) {
    const signature = req.headers.get('stripe-signature');
    if (!signature) return errorResponse(400, 'Signatur fehlt');

    let event: Stripe.Event;
    try {
        event = stripe().webhooks.constructEvent(await req.text(), signature, config.stripe.webhookSecret);
    } catch (err) {
        console.warn('[stripe] Ungültige Webhook-Signatur', (err as Error).message);
        return errorResponse(400, 'Ungültige Signatur');
    }

    if (await db.stripeEvent.findUnique({ where: { id: event.id } })) return json({ received: true, duplicate: true });

    try {
        await handle(event);
    } catch (err) {
        console.error('[stripe] Webhook-Verarbeitung fehlgeschlagen', event.type, event.id, err);
        // 500 → Stripe versucht es später erneut
        return errorResponse(500, 'Verarbeitung fehlgeschlagen');
    }

    await db.stripeEvent.create({ data: { id: event.id, type: event.type } }).catch(() => undefined);
    return json({ received: true });
}
