'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { ExternalLink, Loader2 } from 'lucide-react';
import { IntervalToggle, PlanCard } from '@/components/pricing/plan-cards';
import { ConfirmDialog } from './file-dialogs';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client';
import { formatBytes, formatMoney, formatStorageGB } from '@/lib/format';
import { PAID_PLANS, getPlan, priceFor, quotaBytesFor, type BillingInterval, type PlanId } from '@/lib/plans';

export function PortalButton({ label = 'Zahlungsmethoden & Rechnungen', className }: { label?: string; className?: string }) {
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    return (
        <button
            type="button"
            className={clsx('btn btn-secondary', className)}
            disabled={busy}
            onClick={async () => {
                setBusy(true);
                try {
                    const { url } = await api<{ url: string }>('/api/billing/portal', { method: 'POST' });
                    window.location.href = url;
                } catch (err) {
                    toast.error((err as Error).message);
                    setBusy(false);
                }
            }}
        >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {label}
        </button>
    );
}

/** Lädt die Seite nach erfolgreichem Checkout einige Male neu, bis der Webhook das Abo aktiviert hat. */
export function CheckoutSuccessRefresher({ active }: { active: boolean }) {
    const router = useRouter();
    useEffect(() => {
        if (active) return;
        let count = 0;
        const t = setInterval(() => {
            router.refresh();
            if (++count >= 5) clearInterval(t);
        }, 2500);
        return () => clearInterval(t);
    }, [active, router]);
    return null;
}

export function PlanPicker({
    currentPlan,
    currentInterval,
    hasSubscription,
    cancelAtPeriodEnd,
    usedBytes,
    preselect
}: {
    currentPlan: PlanId;
    currentInterval: BillingInterval | null;
    hasSubscription: boolean;
    cancelAtPeriodEnd: boolean;
    usedBytes: number;
    preselect?: { plan: PlanId; interval: BillingInterval };
}) {
    const router = useRouter();
    const toast = useToast();
    const [interval, setBillingInterval] = useState<BillingInterval>(preselect?.interval ?? currentInterval ?? 'year');
    const [busy, setBusy] = useState<string | null>(null);
    const [confirmChange, setConfirmChange] = useState<{ plan: PlanId; interval: BillingInterval } | null>(null);
    const current = getPlan(currentPlan);

    async function choose(plan: PlanId, chosenInterval: BillingInterval) {
        setBusy(plan);
        try {
            const res = await api<{ url?: string; message?: string }>('/api/billing/checkout', { body: { plan, interval: chosenInterval } });
            if (res.url) {
                window.location.href = res.url;
                return;
            }
            toast.success(res.message ?? 'Tarif geändert.');
            router.refresh();
        } catch (err) {
            toast.error((err as Error).message);
        }
        setBusy(null);
    }

    function onSelect(plan: PlanId) {
        if (hasSubscription) setConfirmChange({ plan, interval });
        else choose(plan, interval);
    }

    const target = confirmChange ? getPlan(confirmChange.plan) : null;
    const isUpgrade = target ? target.storageGB > current.storageGB || (target.storageGB === current.storageGB && confirmChange?.interval === 'year') : false;

    return (
        <div>
            {preselect && !hasSubscription && (
                <div className="mb-8 flex flex-col justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-5 sm:flex-row sm:items-center">
                    <div>
                        <p className="font-semibold text-brand-950">
                            Fast geschafft: {getPlan(preselect.plan).name} mit {formatStorageGB(getPlan(preselect.plan).storageGB)}
                        </p>
                        <p className="mt-1 text-sm text-brand-900">
                            {formatMoney(priceFor(getPlan(preselect.plan), preselect.interval))} {preselect.interval === 'year' ? 'pro Jahr' : 'pro Monat'} · sichere Zahlung über
                            Stripe
                        </p>
                    </div>
                    <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => choose(preselect.plan, preselect.interval)}>
                        {busy === preselect.plan && <Loader2 className="h-4 w-4 animate-spin" />}
                        Weiter zur Zahlung
                    </button>
                </div>
            )}

            <div className="flex justify-center">
                <IntervalToggle value={interval} onChange={setBillingInterval} />
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                {PAID_PLANS.map((plan) => {
                    const isCurrent = plan.id === currentPlan && (!currentInterval || currentInterval === interval);
                    const tooSmall = usedBytes > Number(quotaBytesFor(plan.id));
                    let label = hasSubscription ? (plan.storageGB > current.storageGB ? 'Upgrade' : plan.storageGB < current.storageGB ? 'Downgrade' : 'Intervall wechseln') : `${plan.name} wählen`;
                    if (isCurrent) label = cancelAtPeriodEnd ? 'Abo fortsetzen' : 'Aktueller Tarif';
                    const resume = isCurrent && cancelAtPeriodEnd;
                    return (
                        <PlanCard
                            key={plan.id}
                            plan={plan}
                            interval={interval}
                            current={plan.id === currentPlan && currentPlan !== 'free'}
                            action={
                                <>
                                    <button
                                        type="button"
                                        className={clsx('btn w-full', isCurrent ? 'btn-secondary' : plan.highlight ? 'btn-primary' : 'btn-secondary')}
                                        disabled={(isCurrent && !resume) || tooSmall || busy !== null}
                                        onClick={() => (resume ? choose(plan.id, interval) : onSelect(plan.id))}
                                    >
                                        {busy === plan.id && <Loader2 className="h-4 w-4 animate-spin" />}
                                        {label}
                                    </button>
                                    {tooSmall && !isCurrent && <p className="mt-2 text-xs text-ink-500">Du belegst bereits {formatBytes(usedBytes)}.</p>}
                                </>
                            }
                        />
                    );
                })}
            </div>

            {confirmChange && target && (
                <ConfirmDialog
                    title={`Zu ${target.name} wechseln?`}
                    message={
                        <>
                            <p>
                                Neuer Tarif: <strong>{target.name}</strong> mit {formatStorageGB(target.storageGB)} für {formatMoney(priceFor(target, confirmChange.interval))}{' '}
                                {confirmChange.interval === 'year' ? 'pro Jahr' : 'pro Monat'}.
                            </p>
                            <p className="mt-2">
                                {isUpgrade
                                    ? 'Die Differenz für die laufende Periode wird sofort anteilig mit deiner hinterlegten Zahlungsmethode abgerechnet. Der zusätzliche Speicher steht sofort bereit.'
                                    : 'Die Differenz wird dir anteilig auf der nächsten Rechnung gutgeschrieben.'}
                            </p>
                        </>
                    }
                    confirmLabel="Tarif wechseln"
                    onClose={() => setConfirmChange(null)}
                    onConfirm={() => choose(confirmChange.plan, confirmChange.interval)}
                />
            )}
        </div>
    );
}
