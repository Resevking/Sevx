import 'server-only';
import Stripe from 'stripe';
import type { User } from '@prisma/client';
import { db } from './db';
import { config } from './config';
import { ApiError } from './api';
import { lookupKey, parseLookupKey, quotaBytesFor, type BillingInterval, type PlanId } from './plans';

let client: Stripe | null = null;

export function stripe(): Stripe {
    if (!config.stripe.isConfigured) throw new ApiError(503, 'Zahlungen sind noch nicht eingerichtet (STRIPE_SECRET_KEY fehlt).');
    client ??= new Stripe(config.stripe.secretKey, { appInfo: { name: 'TrueCloud', url: 'https://truecloud.online' } });
    return client;
}

const priceCache = new Map<string, { id: string; expiresAt: number }>();

/** Sucht den Stripe-Preis über seinen lookup_key (angelegt von scripts/stripe-setup.ts). */
export async function priceIdFor(planId: PlanId, interval: BillingInterval): Promise<string> {
    const key = lookupKey(planId, interval);
    const cached = priceCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.id;
    const res = await stripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
    const price = res.data[0];
    if (!price) throw new ApiError(500, `Stripe-Preis "${key}" fehlt. Bitte "npm run stripe:setup" ausführen.`);
    priceCache.set(key, { id: price.id, expiresAt: Date.now() + 10 * 60 * 1000 });
    return price.id;
}

export async function ensureCustomer(user: User): Promise<string> {
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const customer = await stripe().customers.create(
        { email: user.email, name: user.name ?? undefined, preferred_locales: ['de'], metadata: { userId: user.id } },
        { idempotencyKey: `customer-${user.id}` }
    );
    await db.user.updateMany({ where: { id: user.id, stripeCustomerId: null }, data: { stripeCustomerId: customer.id } });
    const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { stripeCustomerId: true } });
    return fresh.stripeCustomerId as string;
}

/** Status, in denen der Kunde den bezahlten Speicher nutzen darf. */
const ENTITLED_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'trialing', 'past_due']);
/** Status, nach denen das Abo nicht mehr reaktiviert werden kann. */
const TERMINAL_STATUSES = new Set<Stripe.Subscription.Status>(['canceled', 'incomplete_expired']);

function planFromSubscription(sub: Stripe.Subscription) {
    const price = sub.items.data[0]?.price;
    if (!price) return null;
    const fromKey = parseLookupKey(price.lookup_key);
    if (fromKey) return fromKey;
    return parseLookupKey(`truecloud_${price.metadata?.plan}_${price.recurring?.interval}`);
}

/**
 * Überträgt den Zustand eines Stripe-Abos auf den Benutzer (Tarif, Kontingent, Status).
 * Idempotent – kann beliebig oft mit demselben Abo aufgerufen werden.
 */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const metaUserId = sub.metadata?.userId;
    const user = await db.user.findFirst({
        where: { OR: [{ stripeCustomerId: customerId }, ...(metaUserId ? [{ id: metaUserId }] : [])] }
    });
    if (!user) {
        console.warn('[stripe] Kein Benutzer für Abo gefunden', sub.id, customerId);
        return;
    }

    const parsed = planFromSubscription(sub);
    const item = sub.items.data[0];
    const periodEnd = item?.current_period_end;

    if (ENTITLED_STATUSES.has(sub.status) && parsed) {
        await db.user.update({
            where: { id: user.id },
            data: {
                stripeCustomerId: customerId,
                stripeSubscriptionId: sub.id,
                subscriptionStatus: sub.status,
                plan: parsed.planId,
                quotaBytes: quotaBytesFor(parsed.planId),
                billingInterval: parsed.interval,
                currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
                cancelAtPeriodEnd: sub.cancel_at_period_end || Boolean(sub.cancel_at)
            }
        });
        return;
    }

    // Ereignisse eines älteren Abos dürfen ein neueres nicht überschreiben.
    if (user.stripeSubscriptionId && user.stripeSubscriptionId !== sub.id) return;

    if (sub.status === 'incomplete') {
        // Erste Zahlung läuft noch – Tarif erst nach erfolgreicher Zahlung freischalten.
        await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId, subscriptionStatus: sub.status } });
        return;
    }

    // Abo beendet, unbezahlt oder pausiert → zurück auf Free. Daten bleiben erhalten,
    // neue Uploads sind aber erst wieder möglich, wenn das Kontingent reicht.
    await db.user.update({
        where: { id: user.id },
        data: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: TERMINAL_STATUSES.has(sub.status) ? null : sub.id,
            subscriptionStatus: sub.status,
            plan: 'free',
            quotaBytes: quotaBytesFor('free'),
            billingInterval: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false
        }
    });
}

export function hasActiveSubscription(user: Pick<User, 'stripeSubscriptionId' | 'subscriptionStatus'>): boolean {
    return Boolean(user.stripeSubscriptionId && user.subscriptionStatus && ENTITLED_STATUSES.has(user.subscriptionStatus as Stripe.Subscription.Status));
}
