import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { isAdmin, requireUser } from '@/lib/auth';
import { formatBytes, formatDate, formatMoney, formatStorageGB, percent } from '@/lib/format';
import {
    PAID_PLANS,
    PLANS,
    STORAGE_COST_PER_TB_MONTH,
    STRIPE_FEE_FIXED,
    STRIPE_FEE_PERCENT,
    VAT_RATE,
    effectiveMonthly,
    getPlan,
    monthlyMargin,
    storageCostForBytes,
    type BillingInterval
} from '@/lib/plans';

export const metadata: Metadata = { title: 'Admin' };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="card p-5">
            <p className="text-sm text-ink-600">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-ink-950">{value}</p>
            {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
        </div>
    );
}

export default async function AdminPage() {
    const user = await requireUser('/dashboard/admin');
    if (!isAdmin(user)) notFound();

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [userCount, newUsers, byPlan, storage, recentUsers, fileCount] = await Promise.all([
        db.user.count(),
        db.user.count({ where: { createdAt: { gte: since } } }),
        db.user.groupBy({ by: ['plan', 'billingInterval'], _count: { _all: true }, _sum: { usedBytes: true } }),
        db.user.aggregate({ _sum: { usedBytes: true, quotaBytes: true } }),
        db.user.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
        db.file.count({ where: { status: 'ACTIVE' } })
    ]);

    // Umsatz pro Monat (Jahresabos anteilig) – nur Benutzer mit bezahltem Tarif
    let mrr = 0;
    let payingUsers = 0;
    for (const row of byPlan) {
        const plan = getPlan(row.plan);
        if (!plan.priceMonthly || !row.billingInterval) continue;
        payingUsers += row._count._all;
        mrr += effectiveMonthly(plan, row.billingInterval as BillingInterval) * row._count._all;
    }
    const usedBytes = Number(storage._sum.usedBytes ?? 0);
    const soldBytes = Number(storage._sum.quotaBytes ?? 0);
    const storageCost = storageCostForBytes(usedBytes);
    const mrrNet = mrr / (1 + VAT_RATE);
    const estimatedFees = mrr * STRIPE_FEE_PERCENT + payingUsers * STRIPE_FEE_FIXED;
    const profit = mrrNet - estimatedFees - storageCost;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink-950">Admin</h1>
                <p className="mt-1 text-sm text-ink-600">Kennzahlen, Kosten und Margen von TrueCloud.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Benutzer" value={userCount.toLocaleString('de-CH')} hint={`+${newUsers} in den letzten 30 Tagen`} />
                <Stat label="Zahlende Kunden" value={payingUsers.toLocaleString('de-CH')} hint={`${userCount ? Math.round((payingUsers / userCount) * 100) : 0} % Conversion`} />
                <Stat label="Monatsumsatz (MRR)" value={formatMoney(mrr)} hint={`${formatMoney(mrrNet)} ohne MWST`} />
                <Stat label="Gewinn / Monat (geschätzt)" value={formatMoney(profit)} hint="nach MWST, Stripe-Gebühren und OVHcloud" />
                <Stat label="Belegter Speicher" value={formatBytes(usedBytes)} hint={`${fileCount.toLocaleString('de-CH')} Dateien`} />
                <Stat label="OVHcloud-Kosten / Monat" value={formatMoney(storageCost)} hint={`${formatMoney(STORAGE_COST_PER_TB_MONTH)} pro TB belegt`} />
                <Stat label="Verkaufte Kontingente" value={formatBytes(soldBytes)} hint={`${Math.round(percent(usedBytes, soldBytes))} % davon belegt`} />
                <Stat label="Stripe-Gebühren / Monat" value={formatMoney(estimatedFees)} hint={`Annahme: ${(STRIPE_FEE_PERCENT * 100).toFixed(2)} % + ${formatMoney(STRIPE_FEE_FIXED)}`} />
            </div>

            <div className="card overflow-hidden">
                <div className="border-b border-ink-100 px-6 py-4">
                    <h2 className="font-semibold text-ink-950">Margenrechnung pro Tarif</h2>
                    <p className="mt-1 text-sm text-ink-600">
                        Ungünstigster Fall: Kontingent zu 100 % belegt, Preis inkl. {(VAT_RATE * 100).toFixed(1)} % MWST, Speicher {formatMoney(STORAGE_COST_PER_TB_MONTH)}/TB.
                        Werte pro Monat.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                            <tr>
                                <th className="px-6 py-3">Tarif</th>
                                <th className="px-4 py-3">Intervall</th>
                                <th className="px-4 py-3 text-right">Preis</th>
                                <th className="px-4 py-3 text-right">ohne MWST</th>
                                <th className="px-4 py-3 text-right">Stripe</th>
                                <th className="px-4 py-3 text-right">OVHcloud</th>
                                <th className="px-4 py-3 text-right">Gewinn</th>
                                <th className="px-6 py-3 text-right">Marge</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-100">
                            {PAID_PLANS.flatMap((plan) =>
                                (['month', 'year'] as const).map((interval) => {
                                    const m = monthlyMargin(plan, interval);
                                    return (
                                        <tr key={`${plan.id}-${interval}`}>
                                            <td className="px-6 py-3 font-medium text-ink-900">
                                                {plan.name} · {formatStorageGB(plan.storageGB)}
                                            </td>
                                            <td className="px-4 py-3 text-ink-600">{interval === 'month' ? 'monatlich' : 'jährlich'}</td>
                                            <td className="px-4 py-3 text-right">{formatMoney(m.price)}</td>
                                            <td className="px-4 py-3 text-right text-ink-600">{formatMoney(m.netOfVat)}</td>
                                            <td className="px-4 py-3 text-right text-ink-600">−{formatMoney(m.stripeFee)}</td>
                                            <td className="px-4 py-3 text-right text-ink-600">−{formatMoney(m.storageCost)}</td>
                                            <td className={`px-4 py-3 text-right font-semibold ${m.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(m.profit)}</td>
                                            <td className="px-6 py-3 text-right text-ink-700">{m.marginPercent.toFixed(0)} %</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
                <div className="card">
                    <h2 className="border-b border-ink-100 px-6 py-4 font-semibold text-ink-950">Verteilung nach Tarif</h2>
                    <ul className="divide-y divide-ink-100">
                        {PLANS.map((plan) => {
                            const rows = byPlan.filter((r) => r.plan === plan.id);
                            const count = rows.reduce((s, r) => s + r._count._all, 0);
                            const used = rows.reduce((s, r) => s + Number(r._sum.usedBytes ?? 0), 0);
                            return (
                                <li key={plan.id} className="flex items-center justify-between px-6 py-3 text-sm">
                                    <span className="font-medium text-ink-900">{plan.name}</span>
                                    <span className="text-ink-600">
                                        {count} · {formatBytes(used)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
                <div className="card overflow-hidden">
                    <h2 className="border-b border-ink-100 px-6 py-4 font-semibold text-ink-950">Neueste Benutzer</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-sm">
                            <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                                <tr>
                                    <th className="px-6 py-3">E-Mail</th>
                                    <th className="px-4 py-3">Tarif</th>
                                    <th className="px-4 py-3">Speicher</th>
                                    <th className="px-6 py-3">Registriert</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100">
                                {recentUsers.map((u) => (
                                    <tr key={u.id}>
                                        <td className="max-w-[240px] truncate px-6 py-3 text-ink-900">
                                            {u.email}
                                            {!u.emailVerifiedAt && <span className="badge ml-2 bg-amber-50 text-amber-700">unbestätigt</span>}
                                        </td>
                                        <td className="px-4 py-3 text-ink-700">
                                            {getPlan(u.plan).name}
                                            {u.subscriptionStatus && u.subscriptionStatus !== 'active' && <span className="ml-1 text-xs text-ink-500">({u.subscriptionStatus})</span>}
                                        </td>
                                        <td className="px-4 py-3 text-ink-600">
                                            {formatBytes(u.usedBytes)} / {formatBytes(u.quotaBytes)}
                                        </td>
                                        <td className="px-6 py-3 text-ink-600">{formatDate(u.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
