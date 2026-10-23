'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Check, HardDrive } from 'lucide-react';
import { PAID_PLANS, PLANS, effectiveMonthly, priceFor, yearlySavingsPercent, type BillingInterval, type Plan } from '@/lib/plans';
import { formatMoney, formatStorageGB } from '@/lib/format';

export function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (v: BillingInterval) => void }) {
    const savings = Math.max(...PAID_PLANS.map(yearlySavingsPercent));
    return (
        <div className="inline-flex rounded-full border border-ink-200 bg-white p-1 shadow-sm" role="radiogroup" aria-label="Abrechnungsintervall">
            {(['month', 'year'] as const).map((option) => (
                <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={value === option}
                    onClick={() => onChange(option)}
                    className={clsx(
                        'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
                        value === option ? 'bg-ink-950 text-white' : 'text-ink-600 hover:text-ink-950'
                    )}
                >
                    {option === 'month' ? 'Monatlich' : 'Jährlich'}
                    {option === 'year' && (
                        <span className={clsx('badge', value === 'year' ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-700')}>bis −{savings}%</span>
                    )}
                </button>
            ))}
        </div>
    );
}

export function PlanCard({
    plan,
    interval,
    action,
    current = false
}: {
    plan: Plan;
    interval: BillingInterval;
    action: React.ReactNode;
    current?: boolean;
}) {
    const monthly = effectiveMonthly(plan, interval);
    const perTb = monthly / (plan.storageGB / 1000);
    return (
        <div
            className={clsx(
                'relative flex flex-col rounded-2xl border bg-white p-6 shadow-card',
                plan.highlight ? 'border-brand-500 ring-1 ring-brand-500' : 'border-ink-100',
                current && 'ring-2 ring-emerald-500'
            )}
        >
            {plan.highlight && !current && <span className="badge absolute -top-3 left-6 bg-brand-600 text-white">Beliebteste Wahl</span>}
            {current && <span className="badge absolute -top-3 left-6 bg-emerald-600 text-white">Dein Tarif</span>}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-ink-950">{plan.name}</h3>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                    <HardDrive className="h-4 w-4" />
                    {formatStorageGB(plan.storageGB)}
                </span>
            </div>
            <p className="mt-1 text-sm text-ink-500">{plan.tagline}</p>
            <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-ink-950">{formatMoney(monthly)}</span>
                <span className="text-sm text-ink-500">/Monat</span>
            </div>
            <p className="mt-1 h-10 text-xs leading-5 text-ink-500">
                {interval === 'year' ? `${formatMoney(priceFor(plan, 'year'))} jährlich abgerechnet` : 'monatlich kündbar'}
                <br />
                entspricht {formatMoney(perTb)} pro TB
            </p>
            <div className="mt-5">{action}</div>
            <ul className="mt-6 space-y-3 border-t border-ink-100 pt-6">
                {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm text-ink-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                        {feature}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Preistabelle für die öffentlichen Seiten. */
export function MarketingPricing() {
    const [interval, setBillingInterval] = useState<BillingInterval>('year');
    const free = PLANS[0];
    return (
        <div>
            <div className="flex justify-center">
                <IntervalToggle value={interval} onChange={setBillingInterval} />
            </div>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {PAID_PLANS.map((plan) => (
                    <PlanCard
                        key={plan.id}
                        plan={plan}
                        interval={interval}
                        action={
                            <Link href={`/registrieren?plan=${plan.id}&interval=${interval}`} className={clsx('btn w-full', plan.highlight ? 'btn-primary' : 'btn-secondary')}>
                                {plan.name} wählen
                            </Link>
                        }
                    />
                ))}
            </div>
            <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-dashed border-ink-200 bg-ink-50/60 p-6 sm:flex-row sm:items-center">
                <div>
                    <p className="font-semibold text-ink-950">
                        {free.name} · {formatStorageGB(free.storageGB)} kostenlos
                    </p>
                    <p className="mt-1 text-sm text-ink-600">Ohne Kreditkarte. Teste TrueCloud in Ruhe und wechsle jederzeit auf einen grösseren Tarif.</p>
                </div>
                <Link href="/registrieren" className="btn btn-secondary">
                    Kostenlos registrieren
                </Link>
            </div>
        </div>
    );
}
