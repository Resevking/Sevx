'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CreditCard, HardDrive, LayoutDashboard, Link2, LogOut, Mail, Menu, Settings, Shield, Trash2, X } from 'lucide-react';
import { Logo } from '@/components/logo';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { UploadProvider } from './uploads';
import { UsageBar } from './usage-bar';
import { api } from '@/lib/client';

export interface ShellUser {
    name: string | null;
    email: string;
    emailVerified: boolean;
    isAdmin: boolean;
    planName: string;
    usedBytes: number;
    quotaBytes: number;
    isPaid: boolean;
}

const NAV = [
    { href: '/dashboard', label: 'Übersicht', icon: LayoutDashboard, exact: true },
    { href: '/dashboard/dateien', label: 'Meine Dateien', icon: HardDrive },
    { href: '/dashboard/freigaben', label: 'Freigaben', icon: Link2 },
    { href: '/dashboard/papierkorb', label: 'Papierkorb', icon: Trash2 },
    { href: '/dashboard/abo', label: 'Abo & Zahlung', icon: CreditCard },
    { href: '/dashboard/einstellungen', label: 'Einstellungen', icon: Settings }
];

function Sidebar({ user, onNavigate }: { user: ShellUser; onNavigate?: () => void }) {
    const pathname = usePathname();
    const router = useRouter();
    const items = user.isAdmin ? [...NAV, { href: '/dashboard/admin', label: 'Admin', icon: Shield }] : NAV;

    async function logout() {
        await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        router.replace('/login');
        router.refresh();
    }

    return (
        <div className="flex h-full flex-col">
            <div className="px-5 py-5">
                <Logo href="/dashboard" />
            </div>
            <nav className="flex-1 space-y-1 px-3" aria-label="Dashboard">
                {items.map((item) => {
                    const active = 'exact' in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={onNavigate}
                            className={clsx(
                                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                                active ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950'
                            )}
                        >
                            <item.icon className="h-[18px] w-[18px]" />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
            <div className="space-y-4 p-4">
                <div className="rounded-xl border border-ink-100 bg-ink-50/70 p-4">
                    <div className="flex items-center justify-between text-xs font-semibold text-ink-700">
                        <span>Speicher</span>
                        <span className="badge bg-white text-ink-700 ring-1 ring-ink-200">{user.planName}</span>
                    </div>
                    <UsageBar used={user.usedBytes} quota={user.quotaBytes} className="mt-3" compact />
                    {!user.isPaid && (
                        <Link href="/dashboard/abo" onClick={onNavigate} className="btn btn-primary btn-sm mt-3 w-full">
                            Mehr Speicher
                        </Link>
                    )}
                </div>
                <div className="flex items-center gap-3 px-1">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                        {(user.name || user.email).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-900">{user.name || 'Mein Konto'}</p>
                        <p className="truncate text-xs text-ink-500">{user.email}</p>
                    </div>
                    <button type="button" onClick={logout} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Abmelden" title="Abmelden">
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function VerifyBanner() {
    const toast = useToast();
    const [sending, setSending] = useState(false);
    return (
        <div className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:px-8">
            <Mail className="hidden h-4 w-4 shrink-0 sm:block" />
            <p className="flex-1">Bitte bestätige deine E-Mail-Adresse, um Freigabelinks erstellen zu können.</p>
            <button
                type="button"
                disabled={sending}
                className="btn btn-sm border border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                onClick={async () => {
                    setSending(true);
                    try {
                        await api('/api/auth/resend-verification', { method: 'POST' });
                        toast.success('Bestätigungslink gesendet. Schau in dein Postfach.');
                    } catch (err) {
                        toast.error((err as Error).message);
                    } finally {
                        setSending(false);
                    }
                }}
            >
                Link erneut senden
            </button>
        </div>
    );
}

export function DashboardShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const pathname = usePathname();
    useEffect(() => setMobileOpen(false), [pathname]);

    return (
        <ToastProvider>
            <UploadProvider>
                <div className="min-h-screen bg-ink-50/50">
                    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-ink-100 bg-white lg:block">
                        <Sidebar user={user} />
                    </aside>
                    {mobileOpen && (
                        <div className="fixed inset-0 z-50 lg:hidden">
                            <div className="absolute inset-0 bg-ink-950/40" onClick={() => setMobileOpen(false)} />
                            <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
                                <button
                                    type="button"
                                    className="absolute right-3 top-5 rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"
                                    onClick={() => setMobileOpen(false)}
                                    aria-label="Menü schliessen"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                                <Sidebar user={user} onNavigate={() => setMobileOpen(false)} />
                            </aside>
                        </div>
                    )}
                    <div className="lg:pl-64">
                        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-100 bg-white/90 px-4 backdrop-blur lg:hidden">
                            <button type="button" className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100" onClick={() => setMobileOpen(true)} aria-label="Menü öffnen">
                                <Menu className="h-5 w-5" />
                            </button>
                            <Logo href="/dashboard" />
                        </div>
                        {!user.emailVerified && <VerifyBanner />}
                        <main className="px-4 py-6 sm:px-8 sm:py-8">{children}</main>
                    </div>
                </div>
            </UploadProvider>
        </ToastProvider>
    );
}
