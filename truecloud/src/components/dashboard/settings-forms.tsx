'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client';

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <section className="card grid gap-6 p-6 md:grid-cols-[240px_1fr]">
            <div>
                <h2 className="font-semibold text-ink-950">{title}</h2>
                {description && <p className="mt-1 text-sm text-ink-600">{description}</p>}
            </div>
            <div>{children}</div>
        </section>
    );
}

export function ProfileForm({ name, email }: { name: string | null; email: string }) {
    const router = useRouter();
    const toast = useToast();
    const [value, setValue] = useState(name ?? '');
    const [busy, setBusy] = useState(false);
    return (
        <Section title="Profil" description="Dein Name erscheint im Dashboard und in E-Mails.">
            <form
                className="max-w-md space-y-4"
                onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                        await api('/api/account', { method: 'PATCH', body: { name: value } });
                        toast.success('Profil gespeichert.');
                        router.refresh();
                    } catch (err) {
                        toast.error((err as Error).message);
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <div>
                    <label className="label" htmlFor="profile-name">
                        Name
                    </label>
                    <input id="profile-name" className="input" value={value} maxLength={100} onChange={(e) => setValue(e.target.value)} />
                </div>
                <div>
                    <label className="label" htmlFor="profile-email">
                        E-Mail-Adresse
                    </label>
                    <input id="profile-email" className="input" value={email} disabled />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Speichern
                </button>
            </form>
        </Section>
    );
}

export function PasswordForm() {
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    return (
        <Section title="Passwort" description="Nach der Änderung werden alle anderen Geräte abgemeldet.">
            <form
                className="max-w-md space-y-4"
                onSubmit={async (e) => {
                    e.preventDefault();
                    const formEl = e.currentTarget;
                    const form = new FormData(formEl);
                    if (form.get('newPassword') !== form.get('confirm')) {
                        toast.error('Die neuen Passwörter stimmen nicht überein.');
                        return;
                    }
                    setBusy(true);
                    try {
                        await api('/api/account/password', { body: { currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') } });
                        toast.success('Passwort geändert.');
                        formEl.reset();
                    } catch (err) {
                        toast.error((err as Error).message);
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <div>
                    <label className="label" htmlFor="currentPassword">
                        Aktuelles Passwort
                    </label>
                    <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required className="input" />
                </div>
                <div>
                    <label className="label" htmlFor="newPassword">
                        Neues Passwort
                    </label>
                    <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} required className="input" />
                </div>
                <div>
                    <label className="label" htmlFor="confirm">
                        Neues Passwort wiederholen
                    </label>
                    <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="input" />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Passwort ändern
                </button>
            </form>
        </Section>
    );
}

export function SessionsCard({ sessions }: { sessions: { id: string; current: boolean; device: string; ip: string | null; lastSeen: string }[] }) {
    const router = useRouter();
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    return (
        <Section title="Angemeldete Geräte" description="Hier siehst du, wo dein Konto gerade angemeldet ist.">
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                {sessions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                        <div className="min-w-0">
                            <p className="truncate font-medium text-ink-900">{s.device}</p>
                            <p className="text-xs text-ink-500">
                                {s.ip ?? 'unbekannte IP'} · zuletzt aktiv {s.lastSeen}
                            </p>
                        </div>
                        {s.current && <span className="badge shrink-0 bg-emerald-50 text-emerald-700">Dieses Gerät</span>}
                    </li>
                ))}
            </ul>
            {sessions.length > 1 && (
                <button
                    type="button"
                    className="btn btn-secondary mt-4"
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            await api('/api/account/sessions', { method: 'DELETE' });
                            toast.success('Alle anderen Geräte wurden abgemeldet.');
                            router.refresh();
                        } catch (err) {
                            toast.error((err as Error).message);
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Alle anderen Geräte abmelden
                </button>
            )}
        </Section>
    );
}

export function DeleteAccount({ email, hasSubscription }: { email: string; hasSubscription: boolean }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [confirmEmail, setConfirmEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    return (
        <Section title="Konto löschen" description="Löscht dein Konto, alle Dateien und Freigaben unwiderruflich.">
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-sm text-red-900">
                {hasSubscription
                    ? 'Dein laufendes Abo wird dabei sofort beendet. Für die angebrochene Periode erfolgt keine Rückerstattung.'
                    : 'Alle deine Dateien werden sofort und endgültig aus dem Speicher entfernt.'}
            </div>
            <button type="button" className="btn btn-danger mt-4" onClick={() => setOpen(true)}>
                Konto endgültig löschen
            </button>
            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title="Konto wirklich löschen?"
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                            Abbrechen
                        </button>
                        <button
                            type="button"
                            className="btn btn-danger"
                            disabled={busy || confirmEmail.trim().toLowerCase() !== email || !password}
                            onClick={async () => {
                                setBusy(true);
                                setError(null);
                                try {
                                    await api('/api/account', { method: 'DELETE', body: { confirmEmail, password } });
                                    router.replace('/');
                                    router.refresh();
                                } catch (err) {
                                    setError((err as Error).message);
                                    setBusy(false);
                                }
                            }}
                        >
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                            Alles löschen
                        </button>
                    </>
                }
            >
                <div className="space-y-4 text-sm">
                    <p className="text-ink-600">
                        Gib zur Bestätigung deine E-Mail-Adresse <strong className="text-ink-900">{email}</strong> und dein Passwort ein.
                    </p>
                    <input className="input" placeholder="E-Mail-Adresse" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} />
                    <input className="input" type="password" placeholder="Passwort" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    {error && <p className="text-red-600">{error}</p>}
                </div>
            </Modal>
        </Section>
    );
}
