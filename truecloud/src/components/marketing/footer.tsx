import Link from 'next/link';
import { Logo } from '@/components/logo';

const COLUMNS = [
    {
        title: 'Produkt',
        links: [
            { href: '/#funktionen', label: 'Funktionen' },
            { href: '/preise', label: 'Preise' },
            { href: '/sicherheit', label: 'Sicherheit' },
            { href: '/#faq', label: 'Häufige Fragen' }
        ]
    },
    {
        title: 'Konto',
        links: [
            { href: '/registrieren', label: 'Registrieren' },
            { href: '/login', label: 'Anmelden' },
            { href: '/dashboard', label: 'Dashboard' },
            { href: '/passwort-vergessen', label: 'Passwort vergessen' }
        ]
    },
    {
        title: 'Rechtliches',
        links: [
            { href: '/impressum', label: 'Impressum' },
            { href: '/datenschutz', label: 'Datenschutz' },
            { href: '/agb', label: 'AGB' }
        ]
    }
];

export function Footer() {
    return (
        <footer className="border-t border-ink-100 bg-ink-50/60">
            <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
                <div>
                    <Logo />
                    <p className="mt-4 max-w-xs text-sm leading-6 text-ink-600">
                        Fairer Cloud-Speicher für alle, die ihre Daten sicher in Europa aufbewahren wollen.
                    </p>
                    <a href="mailto:support@truecloud.online" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
                        support@truecloud.online
                    </a>
                </div>
                {COLUMNS.map((col) => (
                    <div key={col.title}>
                        <h3 className="text-sm font-semibold text-ink-950">{col.title}</h3>
                        <ul className="mt-4 space-y-3">
                            {col.links.map((link) => (
                                <li key={link.href}>
                                    <Link href={link.href} className="text-sm text-ink-600 transition hover:text-ink-950">
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            <div className="border-t border-ink-100">
                <div className="container-page flex flex-col justify-between gap-2 py-6 text-xs text-ink-500 sm:flex-row">
                    <p>© {new Date().getFullYear()} TrueCloud · truecloud.online</p>
                    <p>Alle Preise in CHF inkl. allfälliger MWST. Zahlungen sicher über Stripe.</p>
                </div>
            </div>
        </footer>
    );
}
