import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/auth-forms';
import { getCurrentUser } from '@/lib/auth';
import { safeNext } from '@/lib/client';

export const metadata: Metadata = { title: 'Anmelden', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
    const { next } = await searchParams;
    if (await getCurrentUser()) redirect(safeNext(next));
    return (
        <>
            <h1 className="text-2xl font-bold tracking-tight text-ink-950">Willkommen zurück</h1>
            <p className="mt-2 text-sm text-ink-600">
                Noch kein Konto?{' '}
                <Link href="/registrieren" className="font-semibold text-brand-700 hover:underline">
                    Kostenlos registrieren
                </Link>
            </p>
            <div className="mt-8">
                <LoginForm next={next} />
            </div>
        </>
    );
}
