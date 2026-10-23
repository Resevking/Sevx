'use client';

import { useState } from 'react';
import { Download, Loader2, Lock } from 'lucide-react';
import { api } from '@/lib/client';

export function ShareDownload({ token, needsPassword }: { token: string; needsPassword: boolean }) {
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function download(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const { url } = await api<{ url: string }>(`/api/public/shares/${token}`, { body: { password: needsPassword ? password : undefined } });
            window.location.href = url;
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={download} className="space-y-4">
            {needsPassword && (
                <div>
                    <label htmlFor="share-pw" className="label flex items-center gap-2">
                        <Lock className="h-4 w-4" /> Passwort
                    </label>
                    <input id="share-pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" />
                </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                Herunterladen
            </button>
        </form>
    );
}
