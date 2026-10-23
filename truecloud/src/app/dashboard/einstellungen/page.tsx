import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { getSession, requireUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { hasActiveSubscription } from '@/lib/stripe';
import { DeleteAccount, PasswordForm, ProfileForm, SessionsCard } from '@/components/dashboard/settings-forms';

export const metadata: Metadata = { title: 'Einstellungen' };

function describeDevice(userAgent: string | null): string {
    if (!userAgent) return 'Unbekanntes Gerät';
    const browser = /Edg\//.test(userAgent)
        ? 'Edge'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Chrome\//.test(userAgent)
            ? 'Chrome'
            : /Safari\//.test(userAgent)
              ? 'Safari'
              : 'Browser';
    const os = /iPhone|iPad/.test(userAgent)
        ? 'iOS'
        : /Android/.test(userAgent)
          ? 'Android'
          : /Mac OS X/.test(userAgent)
            ? 'macOS'
            : /Windows/.test(userAgent)
              ? 'Windows'
              : /Linux/.test(userAgent)
                ? 'Linux'
                : '';
    return os ? `${browser} auf ${os}` : browser;
}

export default async function SettingsPage() {
    const user = await requireUser('/dashboard/einstellungen');
    const current = await getSession();
    const sessions = await db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' } });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink-950">Einstellungen</h1>
                <p className="mt-1 text-sm text-ink-600">Profil, Sicherheit und Konto.</p>
            </div>
            <ProfileForm name={user.name} email={user.email} />
            <PasswordForm />
            <SessionsCard
                sessions={sessions.map((s) => ({
                    id: s.id,
                    current: s.id === current?.id,
                    device: describeDevice(s.userAgent),
                    ip: s.ip,
                    lastSeen: formatDateTime(s.lastSeenAt)
                }))}
            />
            <DeleteAccount email={user.email} hasSubscription={hasActiveSubscription(user)} />
        </div>
    );
}
