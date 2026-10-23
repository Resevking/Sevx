import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth/auth-forms';

export const metadata: Metadata = { title: 'Neues Passwort', robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
    const { token } = await searchParams;
    return (
        <>
            <h1 className="text-2xl font-bold tracking-tight text-ink-950">Neues Passwort festlegen</h1>
            {token ? (
                <div className="mt-8">
                    <ResetPasswordForm token={token} />
                </div>
            ) : (
                <p className="mt-4 text-sm text-ink-600">
                    Der Link ist unvollständig.{' '}
                    <Link href="/passwort-vergessen" className="font-medium text-brand-700 hover:underline">
                        Neuen Link anfordern
                    </Link>
                </p>
            )}
        </>
    );
}
