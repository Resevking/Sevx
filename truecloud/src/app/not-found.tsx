import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function NotFound() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
            <Logo />
            <p className="mt-12 text-sm font-semibold text-brand-600">404</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink-950">Seite nicht gefunden</h1>
            <p className="mt-3 text-ink-600">Die gesuchte Seite existiert nicht oder wurde verschoben.</p>
            <div className="mt-8 flex gap-3">
                <Link href="/" className="btn btn-primary">
                    Zur Startseite
                </Link>
                <Link href="/dashboard" className="btn btn-secondary">
                    Zum Dashboard
                </Link>
            </div>
        </div>
    );
}
