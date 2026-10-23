import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { db } from '@/lib/db';
import { consumeToken } from '@/lib/tokens';

export const metadata: Metadata = { title: 'E-Mail bestätigen', robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
    const { token } = await searchParams;
    const userId = token ? await consumeToken(token, 'EMAIL_VERIFY') : null;
    if (userId) await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });

    return userId ? (
        <div className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-950">E-Mail bestätigt</h1>
            <p className="mt-2 text-sm text-ink-600">Danke! Du kannst jetzt alle Funktionen von TrueCloud nutzen.</p>
            <Link href="/dashboard" className="btn btn-primary mt-8 w-full">
                Zum Dashboard
            </Link>
        </div>
    ) : (
        <div className="text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-950">Link ungültig</h1>
            <p className="mt-2 text-sm text-ink-600">Der Bestätigungslink ist ungültig oder abgelaufen. Im Dashboard kannst du einen neuen anfordern.</p>
            <Link href="/dashboard" className="btn btn-secondary mt-8 w-full">
                Zum Dashboard
            </Link>
        </div>
    );
}
