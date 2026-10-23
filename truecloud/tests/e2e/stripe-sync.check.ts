// Prüft syncSubscription() mit simulierten Stripe-Abos gegen die lokale Datenbank.
//   npm run test:stripe-sync   (nur gegen eine lokale Testdatenbank ausführen)
import type Stripe from 'stripe';
import { db } from '../../src/lib/db';
import { syncSubscription } from '../../src/lib/stripe';
import { quotaBytesFor } from '../../src/lib/plans';

let failures = 0;
function check(cond: boolean, msg: string) {
    console.log(cond ? '  ✓' : '  ✗', msg);
    if (!cond) failures++;
}

function fakeSub(id: string, customer: string, status: Stripe.Subscription.Status, lookupKey: string, extra: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
    return {
        id,
        object: 'subscription',
        customer,
        status,
        cancel_at_period_end: false,
        cancel_at: null,
        metadata: {},
        items: { object: 'list', data: [{ id: 'si_1', current_period_end: periodEnd, price: { id: 'price_1', lookup_key: lookupKey, metadata: {}, recurring: { interval: 'month' } } }] },
        ...extra
    } as unknown as Stripe.Subscription;
}

async function main() {
    await db.user.deleteMany({ where: { email: 'stripe@check.test' } });
    const user = await db.user.create({ data: { email: 'stripe@check.test', passwordHash: 'x', quotaBytes: quotaBytesFor('free'), stripeCustomerId: 'cus_check' } });
    const load = () => db.user.findUniqueOrThrow({ where: { id: user.id } });

    await syncSubscription(fakeSub('sub_A', 'cus_check', 'incomplete', 'truecloud_plus_month'));
    let u = await load();
    check(u.plan === 'free' && u.subscriptionStatus === 'incomplete', 'unbezahltes Abo schaltet nichts frei');

    await syncSubscription(fakeSub('sub_A', 'cus_check', 'active', 'truecloud_plus_month'));
    u = await load();
    check(u.plan === 'plus' && u.quotaBytes === quotaBytesFor('plus') && u.billingInterval === 'month' && u.stripeSubscriptionId === 'sub_A', 'aktives Abo → Plus, 1 TB');
    check(Boolean(u.currentPeriodEnd), 'Periodenende gesetzt');

    await syncSubscription(fakeSub('sub_A', 'cus_check', 'active', 'truecloud_max_year', { cancel_at_period_end: true }));
    u = await load();
    check(u.plan === 'max' && u.billingInterval === 'year' && u.cancelAtPeriodEnd, 'Wechsel auf Max jährlich + Kündigung vorgemerkt');

    await syncSubscription(fakeSub('sub_OLD', 'cus_check', 'canceled', 'truecloud_start_month'));
    u = await load();
    check(u.plan === 'max', 'Ereignis eines alten Abos überschreibt das aktuelle nicht');

    await syncSubscription(fakeSub('sub_A', 'cus_check', 'past_due', 'truecloud_max_year'));
    u = await load();
    check(u.plan === 'max' && u.subscriptionStatus === 'past_due', 'Zahlung ausstehend → Speicher bleibt vorerst');

    await syncSubscription(fakeSub('sub_A', 'cus_check', 'canceled', 'truecloud_max_year'));
    u = await load();
    check(u.plan === 'free' && u.quotaBytes === quotaBytesFor('free') && u.stripeSubscriptionId === null, 'gekündigt → zurück auf Free');

    await syncSubscription(fakeSub('sub_B', 'cus_other', 'active', 'truecloud_pro_month', { metadata: { userId: user.id } }));
    u = await load();
    check(u.plan === 'pro' && u.stripeCustomerId === 'cus_other', 'Zuordnung über metadata.userId');

    await db.user.delete({ where: { id: user.id } });
    console.log(failures ? `\n${failures} Fehler` : '\nStripe-Synchronisation OK');
    await db.$disconnect();
    process.exit(failures ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
