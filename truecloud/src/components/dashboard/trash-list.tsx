'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { FileIcon, FolderIcon } from '@/components/ui/file-icon';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from './file-dialogs';
import { api } from '@/lib/client';
import { formatBytes, formatDate } from '@/lib/format';

interface TrashData {
    retentionDays: number;
    folders: { id: string; name: string; deletedAt: string }[];
    files: { id: string; name: string; size: number; mimeType: string; deletedAt: string }[];
}

type Item = { type: 'file' | 'folder'; id: string; name: string; deletedAt: string; size?: number; mimeType?: string };

export function TrashList() {
    const router = useRouter();
    const toast = useToast();
    const [data, setData] = useState<TrashData | null>(null);
    const [confirm, setConfirm] = useState<{ type: 'purge'; item: Item } | { type: 'empty' } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(() => {
        api<TrashData>('/api/trash')
            .then(setData)
            .catch((err) => toast.error(err.message));
    }, [toast]);
    useEffect(load, [load]);

    if (!data) {
        return (
            <div className="card flex justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-ink-400" />
            </div>
        );
    }

    const items: Item[] = [
        ...data.folders.map((f) => ({ type: 'folder' as const, ...f })),
        ...data.files.map((f) => ({ type: 'file' as const, ...f }))
    ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

    const purgeDate = (deletedAt: string) => new Date(new Date(deletedAt).getTime() + data.retentionDays * 24 * 60 * 60 * 1000);

    async function restore(item: Item) {
        setBusy(item.id);
        try {
            await api('/api/trash/restore', { body: { type: item.type, id: item.id } });
            toast.success(`«${item.name}» wurde wiederhergestellt.`);
            load();
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setBusy(null);
        }
    }

    return (
        <>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="text-sm text-ink-600">Elemente im Papierkorb werden nach {data.retentionDays} Tagen automatisch endgültig gelöscht und zählen bis dahin zu deinem Speicher.</p>
                {items.length > 0 && (
                    <button type="button" className="btn btn-secondary text-red-600" onClick={() => setConfirm({ type: 'empty' })}>
                        <XCircle className="h-4 w-4" /> Papierkorb leeren
                    </button>
                )}
            </div>

            {items.length ? (
                <div className="card mt-6 divide-y divide-ink-100">
                    {items.map((item) => (
                        <div key={`${item.type}:${item.id}`} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                {item.type === 'folder' ? (
                                    <FolderIcon className="h-5 w-5 shrink-0" />
                                ) : (
                                    <FileIcon mimeType={item.mimeType ?? ''} name={item.name} className="h-5 w-5 shrink-0" />
                                )}
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-ink-900">{item.name}</p>
                                    <p className="text-xs text-ink-500">
                                        {item.type === 'folder' ? 'Ordner mit Inhalt' : formatBytes(item.size ?? 0)} · gelöscht am {formatDate(item.deletedAt)} · wird am{' '}
                                        {formatDate(purgeDate(item.deletedAt))} entfernt
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button type="button" className="btn btn-secondary btn-sm" disabled={busy === item.id} onClick={() => restore(item)}>
                                    {busy === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                    Wiederherstellen
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm text-red-600" onClick={() => setConfirm({ type: 'purge', item })}>
                                    <Trash2 className="h-4 w-4" /> Endgültig löschen
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="card mt-6 flex flex-col items-center px-6 py-20 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-100 text-ink-500">
                        <Trash2 className="h-7 w-7" />
                    </div>
                    <h2 className="mt-5 text-lg font-semibold text-ink-950">Der Papierkorb ist leer</h2>
                </div>
            )}

            {confirm && (
                <ConfirmDialog
                    title={confirm.type === 'empty' ? 'Papierkorb leeren?' : 'Endgültig löschen?'}
                    message={
                        confirm.type === 'empty'
                            ? 'Alle Elemente im Papierkorb werden unwiderruflich gelöscht.'
                            : `«${confirm.item.name}» wird unwiderruflich gelöscht${confirm.item.type === 'folder' ? ', inklusive aller enthaltenen Dateien' : ''}.`
                    }
                    confirmLabel="Endgültig löschen"
                    danger
                    onClose={() => setConfirm(null)}
                    onConfirm={async () => {
                        if (confirm.type === 'empty') await api('/api/trash', { method: 'DELETE' });
                        else await api('/api/trash/purge', { body: { type: confirm.item.type, id: confirm.item.id } });
                        toast.success('Endgültig gelöscht. Der Speicher wurde freigegeben.');
                        load();
                        router.refresh();
                    }}
                />
            )}
        </>
    );
}
