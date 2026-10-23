'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Link2, Loader2, Lock, Trash2 } from 'lucide-react';
import { FileIcon } from '@/components/ui/file-icon';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from './file-dialogs';
import { api } from '@/lib/client';
import { formatBytes, formatDate } from '@/lib/format';

interface Share {
    id: string;
    url: string;
    hasPassword: boolean;
    expiresAt: string | null;
    downloadCount: number;
    createdAt: string;
    file: { id: string; name: string; size: number; mimeType: string; inTrash: boolean };
}

function CopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={async () => {
                await navigator.clipboard.writeText(value).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
        >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Kopiert' : 'Link kopieren'}
        </button>
    );
}

export function SharesList() {
    const toast = useToast();
    const [shares, setShares] = useState<Share[] | null>(null);
    const [removing, setRemoving] = useState<Share | null>(null);

    const load = useCallback(() => {
        api<{ shares: Share[] }>('/api/shares')
            .then((r) => setShares(r.shares))
            .catch((err) => toast.error(err.message));
    }, [toast]);
    useEffect(load, [load]);

    if (!shares) {
        return (
            <div className="card flex justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-ink-400" />
            </div>
        );
    }

    if (!shares.length) {
        return (
            <div className="card flex flex-col items-center px-6 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <Link2 className="h-7 w-7" />
                </div>
                <h2 className="mt-5 text-lg font-semibold text-ink-950">Noch keine Freigaben</h2>
                <p className="mt-2 max-w-sm text-sm text-ink-600">Öffne in «Meine Dateien» das Menü einer Datei und wähle «Teilen», um einen Link zu erstellen.</p>
                <Link href="/dashboard/dateien" className="btn btn-primary mt-6">
                    Zu meinen Dateien
                </Link>
            </div>
        );
    }

    return (
        <>
            <div className="card divide-y divide-ink-100">
                {shares.map((share) => {
                    const expired = share.expiresAt && new Date(share.expiresAt) < new Date();
                    const inactive = expired || share.file.inTrash;
                    return (
                        <div key={share.id} className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <FileIcon mimeType={share.file.mimeType} name={share.file.name} className="h-6 w-6 shrink-0" />
                                <div className="min-w-0">
                                    <p className="truncate font-medium text-ink-900">{share.file.name}</p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                                        <span>{formatBytes(share.file.size)}</span>
                                        <span>erstellt {formatDate(share.createdAt)}</span>
                                        <span>
                                            {share.downloadCount} {share.downloadCount === 1 ? 'Download' : 'Downloads'}
                                        </span>
                                        {share.hasPassword && (
                                            <span className="flex items-center gap-1">
                                                <Lock className="h-3 w-3" /> Passwort
                                            </span>
                                        )}
                                        {share.expiresAt && <span>{expired ? 'abgelaufen' : `gültig bis ${formatDate(share.expiresAt)}`}</span>}
                                        {share.file.inTrash && <span className="text-amber-700">Datei im Papierkorb</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {inactive ? <span className="badge bg-ink-100 text-ink-600">Inaktiv</span> : <CopyButton value={share.url} />}
                                <button type="button" className="btn btn-ghost btn-sm text-red-600" onClick={() => setRemoving(share)}>
                                    <Trash2 className="h-4 w-4" /> Entfernen
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            {removing && (
                <ConfirmDialog
                    title="Freigabe entfernen?"
                    message={`Der Link für «${removing.file.name}» funktioniert danach nicht mehr. Die Datei selbst bleibt erhalten.`}
                    confirmLabel="Entfernen"
                    danger
                    onClose={() => setRemoving(null)}
                    onConfirm={async () => {
                        await api(`/api/shares/${removing.id}`, { method: 'DELETE' });
                        toast.success('Freigabe entfernt.');
                        load();
                    }}
                />
            )}
        </>
    );
}
