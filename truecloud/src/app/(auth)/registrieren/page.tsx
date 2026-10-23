import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/auth/auth-forms';
import { getCurrentUser } from '@/lib/auth';
import { formatMoney, formatStorageGB } from '@/lib/format';
import { getPlan, isPlanId, priceFor } from '@/lib/plans';

export const metadata: Metadata = { title: 'Registrieren' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ plan?: string; interval?: string }> }) {
    const params = await searchParams;
    const plan = params.plan && isPlanId(params.plan) ? getPlan(params.plan) : null;
    const interval = params.interval === 'month' ? 'month' : 'year';
    if (await getCurrentUser()) redirect(plan && plan.id !== 'free' ? `/dashboard/abo?plan=${plan.id}&interval=${interval}` : '/dashboard');

    return (
        <>
            <h1 className="text-2xl font-bold tracking-tight text-ink-950">Konto erstellen</h1>
            <p className="mt-2 text-sm text-ink-600">
                Bereits registriert?{' '}
                <Link href="/login" className="font-semibold text-brand-700 hover:underline">
                    Anmelden
                </Link>
            </p>
            {plan && plan.id !== 'free' && (
                <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
                    Gewählter Tarif: <strong>{plan.name}</strong> · {formatStorageGB(plan.storageGB)} für {formatMoney(priceFor(plan, interval))}
                    {interval === 'year' ? ' pro Jahr' : ' pro Monat'}. Nach der Registrierung geht es direkt zur Zahlung.
                </div>
            )}
            <div className="mt-8">
                <RegisterForm plan={plan?.id} interval={interval} />
            </div>
        </>
    );
}
