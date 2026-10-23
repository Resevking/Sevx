'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api, safeNext } from '@/lib/client';

function FormError({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {message}
        </p>
    );
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
    return (
        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {children}
        </button>
    );
}

function useSubmit() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    async function run(fn: () => Promise<void>) {
        setLoading(true);
        setError(null);
        try {
            await fn();
        } catch (err) {
            setError((err as Error).message);
            setLoading(false);
        }
    }
    return { loading, error, run, setLoading };
}

export function LoginForm({ next }: { next?: string }) {
    const router = useRouter();
    const { loading, error, run } = useSubmit();
    return (
        <form
            className="space-y-5"
            onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                run(async () => {
                    await api('/api/auth/login', { body: { email: form.get('email'), password: form.get('password') } });
                    router.replace(safeNext(next));
                    router.refresh();
                });
            }}
        >
            <FormError message={error} />
            <div>
                <label htmlFor="email" className="label">
                    E-Mail-Adresse
                </label>
                <input id="email" name="email" type="email" autoComplete="email" required className="input" />
            </div>
            <div>
                <div className="flex items-center justify-between">
                    <label htmlFor="password" className="label">
                        Passwort
                    </label>
                    <Link href="/passwort-vergessen" className="mb-1.5 text-sm font-medium text-brand-700 hover:underline">
                        Vergessen?
                    </Link>
                </div>
                <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
            </div>
            <SubmitButton loading={loading}>Anmelden</SubmitButton>
        </form>
    );
}

export function RegisterForm({ plan, interval }: { plan?: string; interval?: string }) {
    const router = useRouter();
    const { loading, error, run } = useSubmit();
    return (
        <form
            className="space-y-5"
            onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                run(async () => {
                    await api('/api/auth/register', {
                        body: {
                            name: form.get('name') || undefined,
                            email: form.get('email'),
                            password: form.get('password'),
                            acceptTerms: form.get('acceptTerms') === 'on'
                        }
                    });
                    const paid = plan && plan !== 'free';
                    router.replace(paid ? `/dashboard/abo?plan=${encodeURIComponent(plan)}&interval=${encodeURIComponent(interval ?? 'year')}` : '/dashboard');
                    router.refresh();
                });
            }}
        >
            <FormError message={error} />
            <div>
                <label htmlFor="name" className="label">
                    Name <span className="font-normal text-ink-400">(optional)</span>
                </label>
                <input id="name" name="name" type="text" autoComplete="name" className="input" maxLength={100} />
            </div>
            <div>
                <label htmlFor="email" className="label">
                    E-Mail-Adresse
                </label>
                <input id="email" name="email" type="email" autoComplete="email" required className="input" />
            </div>
            <div>
                <label htmlFor="password" className="label">
                    Passwort
                </label>
                <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" />
                <p className="mt-1.5 text-xs text-ink-500">Mindestens 10 Zeichen.</p>
            </div>
            <label className="flex items-start gap-3 text-sm text-ink-600">
                <input type="checkbox" name="acceptTerms" required className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" />
                <span>
                    Ich akzeptiere die{' '}
                    <Link href="/agb" target="_blank" className="font-medium text-brand-700 hover:underline">
                        AGB
                    </Link>{' '}
                    und die{' '}
                    <Link href="/datenschutz" target="_blank" className="font-medium text-brand-700 hover:underline">
                        Datenschutzerklärung
                    </Link>
                    .
                </span>
            </label>
            <SubmitButton loading={loading}>Konto erstellen</SubmitButton>
        </form>
    );
}

export function ForgotPasswordForm() {
    const [sent, setSent] = useState(false);
    const { loading, error, run, setLoading } = useSubmit();
    if (sent) {
        return (
            <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <p>Falls ein Konto mit dieser Adresse existiert, haben wir dir einen Link zum Zurücksetzen geschickt. Schau auch im Spam-Ordner nach.</p>
            </div>
        );
    }
    return (
        <form
            className="space-y-5"
            onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                run(async () => {
                    await api('/api/auth/forgot-password', { body: { email: form.get('email') } });
                    setLoading(false);
                    setSent(true);
                });
            }}
        >
            <FormError message={error} />
            <div>
                <label htmlFor="email" className="label">
                    E-Mail-Adresse
                </label>
                <input id="email" name="email" type="email" autoComplete="email" required className="input" />
            </div>
            <SubmitButton loading={loading}>Link senden</SubmitButton>
        </form>
    );
}

export function ResetPasswordForm({ token }: { token: string }) {
    const [done, setDone] = useState(false);
    const { loading, error, run, setLoading } = useSubmit();
    if (done) {
        return (
            <div className="space-y-5">
                <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <p>Dein Passwort wurde geändert. Du kannst dich jetzt anmelden.</p>
                </div>
                <Link href="/login" className="btn btn-primary w-full">
                    Zur Anmeldung
                </Link>
            </div>
        );
    }
    return (
        <form
            className="space-y-5"
            onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                if (form.get('password') !== form.get('confirm')) {
                    run(async () => {
                        throw new Error('Die Passwörter stimmen nicht überein.');
                    });
                    return;
                }
                run(async () => {
                    await api('/api/auth/reset-password', { body: { token, password: form.get('password') } });
                    setLoading(false);
                    setDone(true);
                });
            }}
        >
            <FormError message={error} />
            <div>
                <label htmlFor="password" className="label">
                    Neues Passwort
                </label>
                <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" />
            </div>
            <div>
                <label htmlFor="confirm" className="label">
                    Passwort wiederholen
                </label>
                <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="input" />
            </div>
            <SubmitButton loading={loading}>Passwort speichern</SubmitButton>
        </form>
    );
}
