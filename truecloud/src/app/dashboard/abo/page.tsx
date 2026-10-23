import type { Metadata } from 'next';
import { AlertTriangle, CheckCircle2, FileText, Info } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { config } from '@/lib/config';
import { formatDate, formatMoney, formatStorageGB } from '@/lib/format';
import { getPlan, isPlanId, priceFor, type BillingInterval, type PlanId } from '@/lib/plans';
import { hasActiveSubscription, stripe } from '@/lib/stripe';
import { CheckoutSuccessRefresher, PlanPicker, PortalButton } from '@/components/dashboard/billing';

export const metadata: Metadata = { title: 'Abo & Zahlung' };

const STATUS_LABELS: Record<string, string> = {
    active: 'Aktiv',
    trialing: 'Testphase',
    past_due: 'Zahlung ausstehend',
    unpaid: 'Unbezahlt',
    canceled: 'Gekündigt',
    incomplete: 'Zahlung unvollständig',
    incomplete_expired: 'Abgelaufen',
    paused: 'Pausiert'
};

async function loadInvoices(customerId: string | null) {
    if (!customerId || !config.stripe.isConfigured) return [];
    try {
        const res = await stripe().invoices.list({ customer: customerId, limit: 12 });
        return res.data.filter((i) => i.status !== 'draft');
    } catch (err) {
        console.warn('[billing] Rechnungen konnten nicht geladen werden', (err as Error).message);
        return [];
    }
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; plan?: string; interval?: string }> }) {
    const user = await requireUser('/dashboard/abo');
    const params = await searchParams;
    const plan = getPlan(user.plan);
    const subscribed = hasActiveSubscription(user);
    const interval = (user.billingInterval as BillingInterval | null) ?? null;
    const invoices = await loadInvoices(user.stripeCustomerId);
    const preselect =
        params.plan && isPlanId(params.plan) && params.plan !== 'free'
            ? { plan: params.plan as PlanId, interval: (params.interval === 'month' ? 'month' : 'year') as BillingInterval }
            : undefined;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink-950">Abo & Zahlung</h1>
                <p className="mt-1 text-sm text-ink-600">Verwalte deinen Tarif, deine Zahlungsmethode und deine Rechnungen.</p>
            </div>

            {params.checkout === 'success' && (
                <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <p>
                        {subscribed
                            ? `Danke! Dein Tarif ${plan.name} ist aktiv. Viel Spass mit deinem Speicher.`
                            : 'Danke für deine Zahlung! Dein Abo wird gerade aktiviert – das dauert nur wenige Sekunden.'}
                    </p>
                    <CheckoutSuccessRefresher active={subscribed} />
                </div>
            )}
            {params.checkout === 'cancel' && (
                <div className="flex gap-3 rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-700">
                    <Info className="h-5 w-5 shrink-0" />
                    <p>Die Zahlung wurde abgebrochen. Es wurde nichts abgebucht.</p>
                </div>
            )}
            {user.subscriptionStatus === 'past_due' && (
                <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <p>Die letzte Zahlung ist fehlgeschlagen. Bitte aktualisiere deine Zahlungsmethode, damit dein Speicher erhalten bleibt.</p>
                </div>
            )}
            {!config.stripe.isConfigured && (
                <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <p>Stripe ist noch nicht konfiguriert. Trage STRIPE_SECRET_KEY und STRIPE_WEBHOOK_SECRET in die .env ein und führe «npm run stripe:setup» aus.</p>
                </div>
            )}

            <div className="card flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-sm font-semibold text-ink-600">Aktueller Tarif</p>
                    <p className="mt-1 text-2xl font-bold text-ink-950">
                        {plan.name} · {formatStorageGB(plan.storageGB)}
                    </p>
                    <p className="mt-1 text-sm text-ink-600">
                        {subscribed && interval ? (
                            <>
                                {formatMoney(priceFor(plan, interval))} {interval === 'year' ? 'pro Jahr' : 'pro Monat'} · Status: {STATUS_LABELS[user.subscriptionStatus ?? ''] ?? user.subscriptionStatus}
                                {user.currentPeriodEnd && (user.cancelAtPeriodEnd ? ` · endet am ${formatDate(user.currentPeriodEnd)}` : ` · nächste Zahlung am ${formatDate(user.currentPeriodEnd)}`)}
                            </>
                        ) : (
                            'Kostenlos – upgrade jederzeit für mehr Speicher.'
                        )}
                    </p>
                    {user.cancelAtPeriodEnd && (
                        <p className="mt-2 text-sm text-amber-700">Dein Abo ist gekündigt. Wähle unten erneut deinen Tarif, um es fortzusetzen.</p>
                    )}
                </div>
                {user.stripeCustomerId && <PortalButton label={subscribed ? 'Abo verwalten / kündigen' : 'Rechnungen & Zahlungsdaten'} />}
            </div>

            <div>
                <h2 className="mb-6 text-lg font-semibold text-ink-950">{subscribed ? 'Tarif wechseln' : 'Tarif wählen'}</h2>
                <PlanPicker currentPlan={plan.id} currentInterval={subscribed ? interval : null} hasSubscription={subscribed} cancelAtPeriodEnd={user.cancelAtPeriodEnd} usedBytes={Number(user.usedBytes)} preselect={preselect} />
                <p className="mt-4 text-center text-xs text-ink-500">Alle Preise in CHF inkl. allfälliger MWST. Zahlung sicher über Stripe.</p>
            </div>

            {invoices.length > 0 && (
                <div className="card">
                    <h2 className="border-b border-ink-100 px-6 py-4 font-semibold text-ink-950">Rechnungen</h2>
                    <ul className="divide-y divide-ink-100">
                        {invoices.map((invoice) => (
                            <li key={invoice.id} className="flex flex-wrap items-center gap-4 px-6 py-3 text-sm">
                                <FileText className="h-4 w-4 text-ink-400" />
                                <span className="font-medium text-ink-900">{invoice.number ?? invoice.id}</span>
                                <span className="text-ink-500">{formatDate(invoice.created * 1000)}</span>
                                <span className="ml-auto font-medium text-ink-900">{formatMoney(invoice.total / 100, { currency: invoice.currency })}</span>
                                <span className={clsxStatus(invoice.status)}>{invoice.status === 'paid' ? 'Bezahlt' : invoice.status === 'open' ? 'Offen' : invoice.status}</span>
                                {invoice.hosted_invoice_url && (
                                    <a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">
                                        Ansehen
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function clsxStatus(status: string | null) {
    return `badge ${status === 'paid' ? 'bg-emerald-50 text-emerald-700' : status === 'open' ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-600'}`;
}
