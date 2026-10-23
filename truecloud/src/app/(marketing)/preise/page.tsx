import type { Metadata } from 'next';
import { Check, Minus } from 'lucide-react';
import { Faq } from '@/components/marketing/faq';
import { MarketingPricing } from '@/components/pricing/plan-cards';
import { formatMoney, formatStorageGB } from '@/lib/format';
import { PLANS, canProtectShares } from '@/lib/plans';

export const metadata: Metadata = {
    title: 'Preise',
    description: 'Faire Preise für Cloud-Speicher: 10 GB gratis, 200 GB für CHF 2.90, 1 TB für CHF 12.90 im Monat. Jährlich bis zu 17 % sparen.'
};

const ROWS: { label: string; value: (plan: (typeof PLANS)[number]) => string | boolean }[] = [
    { label: 'Speicherplatz', value: (p) => formatStorageGB(p.storageGB) },
    { label: 'Preis pro Monat', value: (p) => (p.priceMonthly ? formatMoney(p.priceMonthly) : 'Gratis') },
    { label: 'Preis pro Jahr', value: (p) => (p.priceYearly ? formatMoney(p.priceYearly) : 'Gratis') },
    { label: 'Web-Dashboard & Vorschau', value: () => true },
    { label: 'Dateien bis 5 TB', value: () => true },
    { label: 'Freigabelinks', value: () => true },
    { label: 'Passwortschutz & Ablaufdatum', value: (p) => canProtectShares(p.id) },
    { label: '30 Tage Papierkorb', value: () => true },
    { label: 'E-Mail-Support', value: (p) => p.priceMonthly > 0 },
    { label: 'Bevorzugter Support', value: (p) => p.storageGB >= 1000 }
];

export default function PricingPage() {
    return (
        <>
            <section className="py-20">
                <div className="container-page">
                    <div className="mx-auto max-w-2xl text-center">
                        <h1 className="text-4xl font-bold tracking-tight text-ink-950 sm:text-5xl">Einfache, faire Preise</h1>
                        <p className="mt-4 text-lg text-ink-600">Wähle den Speicher, den du brauchst. Wechseln oder kündigen kannst du jederzeit im Dashboard.</p>
                    </div>
                    <div className="mt-12">
                        <MarketingPricing />
                    </div>
                    <p className="mt-6 text-center text-xs text-ink-500">Alle Preise in CHF inkl. allfälliger MWST. 1 TB = 1000 GB.</p>
                </div>
            </section>

            <section className="pb-24">
                <div className="container-page">
                    <h2 className="text-2xl font-bold tracking-tight text-ink-950">Alle Tarife im Vergleich</h2>
                    <div className="mt-6 overflow-x-auto rounded-2xl border border-ink-100 shadow-card">
                        <table className="w-full min-w-[720px] text-left text-sm">
                            <thead className="bg-ink-50">
                                <tr>
                                    <th className="px-5 py-4 font-semibold text-ink-700" />
                                    {PLANS.map((plan) => (
                                        <th key={plan.id} className="px-5 py-4 font-semibold text-ink-950">
                                            {plan.name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100 bg-white">
                                {ROWS.map((row) => (
                                    <tr key={row.label}>
                                        <td className="px-5 py-3.5 font-medium text-ink-700">{row.label}</td>
                                        {PLANS.map((plan) => {
                                            const value = row.value(plan);
                                            return (
                                                <td key={plan.id} className="px-5 py-3.5 text-ink-900">
                                                    {value === true ? (
                                                        <Check className="h-4 w-4 text-brand-600" aria-label="Ja" />
                                                    ) : value === false ? (
                                                        <Minus className="h-4 w-4 text-ink-300" aria-label="Nein" />
                                                    ) : (
                                                        value
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-10 rounded-2xl border border-ink-100 bg-ink-50/60 p-6">
                        <h3 className="font-semibold text-ink-950">Mehr als 5 TB oder für dein Unternehmen?</h3>
                        <p className="mt-1 text-sm text-ink-600">
                            Schreib uns an{' '}
                            <a href="mailto:support@truecloud.online" className="font-medium text-brand-700 hover:underline">
                                support@truecloud.online
                            </a>{' '}
                            – wir machen dir ein individuelles Angebot.
                        </p>
                    </div>
                </div>
            </section>

            <section className="bg-ink-50/60 py-24">
                <div className="container-page max-w-3xl">
                    <h2 className="text-center text-3xl font-bold tracking-tight text-ink-950">Fragen zu Abo & Zahlung</h2>
                    <div className="mt-10">
                        <Faq />
                    </div>
                </div>
            </section>
        </>
    );
}
