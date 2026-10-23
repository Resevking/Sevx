import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { Logo } from '@/components/logo';
import { MobileNav } from './mobile-nav';

export const NAV_LINKS = [
    { href: '/#funktionen', label: 'Funktionen' },
    { href: '/preise', label: 'Preise' },
    { href: '/sicherheit', label: 'Sicherheit' },
    { href: '/#faq', label: 'FAQ' }
];

export async function Header() {
    const user = await getCurrentUser();
    return (
        <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-white/85 backdrop-blur">
            <div className="container-page flex h-16 items-center justify-between gap-6">
                <Logo />
                <nav className="hidden items-center gap-1 md:flex" aria-label="Hauptnavigation">
                    {NAV_LINKS.map((link) => (
                        <Link key={link.href} href={link.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-50 hover:text-ink-950">
                            {link.label}
                        </Link>
                    ))}
                </nav>
                <div className="hidden items-center gap-2 md:flex">
                    {user ? (
                        <Link href="/dashboard" className="btn btn-primary">
                            Zum Dashboard
                        </Link>
                    ) : (
                        <>
                            <Link href="/login" className="btn btn-ghost">
                                Anmelden
                            </Link>
                            <Link href="/registrieren" className="btn btn-primary">
                                Kostenlos starten
                            </Link>
                        </>
                    )}
                </div>
                <MobileNav links={NAV_LINKS} loggedIn={Boolean(user)} />
            </div>
        </header>
    );
}
