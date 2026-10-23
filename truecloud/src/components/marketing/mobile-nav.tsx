'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export function MobileNav({ links, loggedIn }: { links: { href: string; label: string }[]; loggedIn: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="md:hidden">
            <button type="button" className="btn btn-ghost -mr-2 px-2" aria-label={open ? 'Menü schliessen' : 'Menü öffnen'} aria-expanded={open} onClick={() => setOpen(!open)}>
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            {open && (
                <div className="absolute inset-x-0 top-16 border-b border-ink-100 bg-white px-4 pb-6 pt-2 shadow-lg">
                    <nav className="flex flex-col" aria-label="Mobile Navigation">
                        {links.map((link) => (
                            <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-base font-medium text-ink-800 hover:bg-ink-50">
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                    <div className="mt-4 grid gap-2">
                        {loggedIn ? (
                            <Link href="/dashboard" className="btn btn-primary">
                                Zum Dashboard
                            </Link>
                        ) : (
                            <>
                                <Link href="/registrieren" className="btn btn-primary">
                                    Kostenlos starten
                                </Link>
                                <Link href="/login" className="btn btn-secondary">
                                    Anmelden
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
