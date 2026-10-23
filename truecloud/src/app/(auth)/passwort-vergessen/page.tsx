import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/auth-forms';

export const metadata: Metadata = { title: 'Passwort vergessen', robots: { index: false } };

export default function ForgotPasswordPage() {
    return (
        <>
            <h1 className="text-2xl font-bold tracking-tight text-ink-950">Passwort vergessen?</h1>
            <p className="mt-2 text-sm text-ink-600">Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.</p>
            <div className="mt-8">
                <ForgotPasswordForm />
            </div>
            <p className="mt-6 text-center text-sm">
                <Link href="/login" className="font-medium text-brand-700 hover:underline">
                    Zurück zur Anmeldung
                </Link>
            </p>
        </>
    );
}
