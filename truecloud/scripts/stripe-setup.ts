// Legt alle TrueCloud-Produkte und -Preise in Stripe an (idempotent) und richtet
// das Kundenportal sowie den Webhook ein.
//
//   npm run stripe:setup
//
// Preisänderungen in src/lib/plans.ts einfach erneut mit diesem Skript übertragen:
// Es wird ein neuer Preis mit demselben lookup_key angelegt, der alte archiviert.
// Bestehende Abos laufen zum alten Preis weiter, bis sie den Tarif wechseln.

import Stripe from 'stripe';
import { PAID_PLANS, STRIPE_CURRENCY, lookupKey, priceFor, type BillingInterval } from '../src/lib/plans';
import { formatStorageGB } from '../src/lib/format';

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
    'invoice.payment_failed'
];

async function main() {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error('STRIPE_SECRET_KEY fehlt in der .env');
    const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const https = appUrl.startsWith('https://');
    const stripe = new Stripe(secret);
    console.log(`Stripe-Modus: ${secret.startsWith('sk_live') ? 'LIVE' : 'TEST'} · App: ${appUrl}\n`);

    // ------------------------------------------------------------ Produkte & Preise
    const products: Stripe.Product[] = [];
    for await (const product of stripe.products.list({ limit: 100 })) products.push(product);

    for (const plan of PAID_PLANS) {
        const name = `TrueCloud ${plan.name} (${formatStorageGB(plan.storageGB)})`;
        let product = products.find((p) => p.metadata.truecloud_plan === plan.id);
        if (!product) {
            product = await stripe.products.create({
                name,
                description: `${formatStorageGB(plan.storageGB)} Cloud-Speicher bei TrueCloud`,
                tax_code: 'txcd_10000000',
                metadata: { truecloud_plan: plan.id }
            });
            console.log(`+ Produkt ${name}`);
        } else if (product.name !== name || !product.active) {
            product = await stripe.products.update(product.id, { name, active: true });
            console.log(`~ Produkt ${name} aktualisiert`);
        }

        for (const interval of ['month', 'year'] as BillingInterval[]) {
            const key = lookupKey(plan.id, interval);
            const amount = Math.round(priceFor(plan, interval) * 100);
            const existing = (await stripe.prices.list({ lookup_keys: [key], limit: 1 })).data[0];
            const upToDate =
                existing &&
                existing.active &&
                existing.unit_amount === amount &&
                existing.currency === STRIPE_CURRENCY &&
                existing.product === product.id &&
                existing.recurring?.interval === interval;
            if (upToDate) {
                console.log(`  ✓ ${key}: ${(amount / 100).toFixed(2)} ${STRIPE_CURRENCY.toUpperCase()}`);
                continue;
            }
            await stripe.prices.create({
                product: product.id,
                currency: STRIPE_CURRENCY,
                unit_amount: amount,
                recurring: { interval },
                lookup_key: key,
                transfer_lookup_key: true,
                tax_behavior: 'inclusive',
                nickname: `${plan.name} ${interval === 'month' ? 'monatlich' : 'jährlich'}`,
                metadata: { plan: plan.id, interval }
            });
            if (existing) await stripe.prices.update(existing.id, { active: false });
            console.log(`  + ${key}: ${(amount / 100).toFixed(2)} ${STRIPE_CURRENCY.toUpperCase()}${existing ? ' (alter Preis archiviert)' : ''}`);
        }
    }

    // ------------------------------------------------------------ Kundenportal
    // Tarifwechsel erledigt die App selbst (mit Prüfung des belegten Speichers),
    // im Portal gibt es deshalb nur Zahlungsmethode, Rechnungen und Kündigung.
    const portalParams: Stripe.BillingPortal.ConfigurationCreateParams = {
        business_profile: {
            headline: 'TrueCloud – Abo verwalten',
            ...(https ? { privacy_policy_url: `${appUrl}/datenschutz`, terms_of_service_url: `${appUrl}/agb` } : {})
        },
        ...(https ? { default_return_url: `${appUrl}/dashboard/abo` } : {}),
        features: {
            customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name', 'tax_id'] },
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
            subscription_cancel: {
                enabled: true,
                mode: 'at_period_end',
                cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'] }
            },
            subscription_update: { enabled: false }
        },
        metadata: { truecloud: 'true' }
    };
    const existingPortal = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
    if (existingPortal) {
        await stripe.billingPortal.configurations.update(existingPortal, portalParams);
        console.log(`\n✓ Kundenportal ${existingPortal} aktualisiert`);
    } else {
        const portal = await stripe.billingPortal.configurations.create(portalParams);
        console.log(`\n+ Kundenportal angelegt. In die .env eintragen:\n  STRIPE_PORTAL_CONFIGURATION_ID=${portal.id}`);
    }

    // ------------------------------------------------------------ Webhook
    const webhookUrl = `${appUrl}/api/stripe/webhook`;
    if (!https) {
        console.log(`\nℹ Webhook: Für lokale Tests die Stripe CLI verwenden:\n  stripe listen --forward-to localhost:3000/api/stripe/webhook`);
    } else {
        const endpoints: Stripe.WebhookEndpoint[] = [];
        for await (const e of stripe.webhookEndpoints.list({ limit: 100 })) endpoints.push(e);
        const found = endpoints.find((e) => e.url === webhookUrl);
        if (found) {
            await stripe.webhookEndpoints.update(found.id, { enabled_events: WEBHOOK_EVENTS });
            console.log(`\n✓ Webhook ${webhookUrl} existiert bereits (Events aktualisiert). Das Signing-Secret findest du im Stripe-Dashboard.`);
        } else {
            const created = await stripe.webhookEndpoints.create({ url: webhookUrl, enabled_events: WEBHOOK_EVENTS, description: 'TrueCloud' });
            console.log(`\n+ Webhook angelegt. In die .env eintragen:\n  STRIPE_WEBHOOK_SECRET=${created.secret}`);
        }
    }
    console.log('\nFertig.');
}

main().catch((err) => {
    console.error('\n✗', err.message);
    process.exit(1);
});
