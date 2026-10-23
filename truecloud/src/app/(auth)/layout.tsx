import Link from 'next/link';
import { Check } from 'lucide-react';
import { Logo } from '@/components/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="grid min-h-screen lg:grid-cols-2">
            <div className="flex flex-col px-4 py-8 sm:px-10">
                <Logo />
                <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</div>
                <p className="text-xs text-ink-500">
                    <Link href="/impressum" className="hover:text-ink-800">
                        Impressum
                    </Link>{' '}
                    ·{' '}
                    <Link href="/datenschutz" className="hover:text-ink-800">
                        Datenschutz
                    </Link>{' '}
                    ·{' '}
                    <Link href="/agb" className="hover:text-ink-800">
                        AGB
                    </Link>
                </p>
            </div>
            <div className="relative hidden overflow-hidden bg-ink-950 lg:block">
                <div className="bg-grid-dark absolute inset-0" />
                <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-600/40 blur-3xl" />
                <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />
                <div className="relative flex h-full flex-col justify-center px-16 text-white">
                    <h2 className="max-w-md text-4xl font-bold tracking-tight">Dein Speicher in der Cloud – sicher in Europa.</h2>
                    <ul className="mt-10 space-y-4 text-ink-200">
                        {['10 GB kostenlos, ohne Kreditkarte', 'Dateien bis 5 TB hochladen', 'Teilen per Link mit Passwortschutz', 'Jederzeit kündbar'].map((t) => (
                            <li key={t} className="flex items-center gap-3">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600">
                                    <Check className="h-3.5 w-3.5" />
                                </span>
                                {t}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
