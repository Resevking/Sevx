'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Check, ChevronLeft, ChevronRight, Copy, Download, Home, Loader2, Lock } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { FileIcon, FolderIcon, fileKind } from '@/components/ui/file-icon';
import { api } from '@/lib/client';
import { formatBytes, formatDateTime } from '@/lib/format';

export interface FileItem {
    id: string;
    name: string;
    size: number;
    mimeType: string;
    folderId: string | null;
    createdAt: string;
    updatedAt: string;
    location?: string;
}

export interface FolderItem {
    id: string;
    name: string;
    parentId: string | null;
    updatedAt: string;
    location?: string;
}

function ErrorText({ error }: { error: string | null }) {
    return error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null;
}

export function NameDialog({
    title,
    label,
    initial = '',
    submitLabel,
    onSubmit,
    onClose
}: {
    title: string;
    label: string;
    initial?: string;
    submitLabel: string;
    onSubmit: (name: string) => Promise<void>;
    onClose: () => void;
}) {
    const [name, setName] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        setError(null);
        try {
            await onSubmit(name.trim());
            onClose();
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    }

    return (
        <Modal open onClose={onClose} title={title} size="sm">
            <form onSubmit={submit}>
                <label className="label" htmlFor="name-input">
                    {label}
                </label>
                <input
                    id="name-input"
                    className="input"
                    value={name}
                    maxLength={255}
                    onChange={(e) => setName(e.target.value)}
                    onFocus={(e) => {
                        // Beim Umbenennen nur den Namen ohne Endung markieren
                        const dot = e.target.value.lastIndexOf('.');
                        e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
                    }}
                />
                <ErrorText error={error} />
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>
                        Abbrechen
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        {submitLabel}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export function ConfirmDialog({
    title,
    message,
    confirmLabel,
    danger,
    onConfirm,
    onClose
}: {
    title: string;
    message: React.ReactNode;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
    onClose: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <Modal
            open
            onClose={onClose}
            title={title}
            size="sm"
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>
                        Abbrechen
                    </button>
                    <button
                        type="button"
                        data-autofocus
                        className={clsx('btn', danger ? 'btn-danger' : 'btn-primary')}
                        disabled={busy}
                        onClick={async () => {
                            setBusy(true);
                            setError(null);
                            try {
                                await onConfirm();
                                onClose();
                            } catch (err) {
                                setError((err as Error).message);
                                setBusy(false);
                            }
                        }}
                    >
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        {confirmLabel}
                    </button>
                </>
            }
        >
            <div className="text-sm leading-6 text-ink-600">{message}</div>
            <ErrorText error={error} />
        </Modal>
    );
}

type TreeFolder = { id: string; name: string; parentId: string | null };

export function MoveDialog({
    count,
    excludeFolderIds,
    currentFolderId,
    onMove,
    onClose
}: {
    count: number;
    excludeFolderIds: string[];
    /** Aktueller Ordner; undefined, wenn die Elemente aus verschiedenen Ordnern stammen (Suche). */
    currentFolderId?: string | null;
    onMove: (targetId: string | null) => Promise<void>;
    onClose: () => void;
}) {
    const [folders, setFolders] = useState<TreeFolder[] | null>(null);
    const [target, setTarget] = useState<string | null>(currentFolderId ?? null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api<{ folders: TreeFolder[] }>('/api/folders')
            .then((r) => setFolders(r.folders))
            .catch((err) => setError(err.message));
    }, []);

    // Baum flach ausgeben (Tiefensuche), verschobene Ordner und deren Unterordner ausblenden
    const rows = useMemo(() => {
        if (!folders) return [];
        const children = new Map<string | null, TreeFolder[]>();
        for (const f of folders) {
            const list = children.get(f.parentId);
            if (list) list.push(f);
            else children.set(f.parentId, [f]);
        }
        const excluded = new Set(excludeFolderIds);
        const out: { folder: TreeFolder; depth: number }[] = [];
        const visit = (parentId: string | null, depth: number) => {
            for (const f of children.get(parentId) ?? []) {
                if (excluded.has(f.id)) continue;
                out.push({ folder: f, depth });
                visit(f.id, depth + 1);
            }
        };
        visit(null, 0);
        return out;
    }, [folders, excludeFolderIds]);

    return (
        <Modal
            open
            onClose={onClose}
            title={count === 1 ? 'Element verschieben' : `${count} Elemente verschieben`}
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>
                        Abbrechen
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy || (currentFolderId !== undefined && target === currentFolderId)}
                        onClick={async () => {
                            setBusy(true);
                            setError(null);
                            try {
                                await onMove(target);
                                onClose();
                            } catch (err) {
                                setError((err as Error).message);
                                setBusy(false);
                            }
                        }}
                    >
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        Hierher verschieben
                    </button>
                </>
            }
        >
            <p className="mb-3 text-sm text-ink-600">Wähle den Zielordner:</p>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-ink-100">
                <button
                    type="button"
                    onClick={() => setTarget(null)}
                    className={clsx('flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm', target === null ? 'bg-brand-50 font-semibold text-brand-700' : 'hover:bg-ink-50')}
                >
                    <Home className="h-4 w-4" /> Meine Dateien
                </button>
                {!folders && !error && (
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
                    </div>
                )}
                {rows.map(({ folder, depth }) => (
                    <button
                        type="button"
                        key={folder.id}
                        onClick={() => setTarget(folder.id)}
                        style={{ paddingLeft: `${12 + (depth + 1) * 18}px` }}
                        className={clsx(
                            'flex w-full items-center gap-2.5 py-2.5 pr-3 text-left text-sm',
                            target === folder.id ? 'bg-brand-50 font-semibold text-brand-700' : 'hover:bg-ink-50'
                        )}
                    >
                        <FolderIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{folder.name}</span>
                    </button>
                ))}
            </div>
            <ErrorText error={error} />
        </Modal>
    );
}

export function CopyField({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="flex gap-2">
            <input readOnly value={value} className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
            <button
                type="button"
                className="btn btn-secondary shrink-0"
                onClick={async () => {
                    await navigator.clipboard.writeText(value).catch(() => undefined);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                }}
            >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Kopiert' : 'Kopieren'}
            </button>
        </div>
    );
}

export function ShareDialog({
    file,
    canProtect,
    emailVerified,
    onClose
}: {
    file: FileItem;
    canProtect: boolean;
    emailVerified: boolean;
    onClose: () => void;
}) {
    const [password, setPassword] = useState('');
    const [expires, setExpires] = useState<string>('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [url, setUrl] = useState<string | null>(null);

    async function create(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await api<{ share: { url: string } }>('/api/shares', {
                body: { fileId: file.id, password: password || undefined, expiresInDays: expires ? Number(expires) : null }
            });
            setUrl(res.share.url);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open onClose={onClose} title={`«${file.name}» teilen`}>
            {!emailVerified ? (
                <p className="text-sm text-ink-600">Bitte bestätige zuerst deine E-Mail-Adresse. Den Link dazu findest du oben im Dashboard.</p>
            ) : url ? (
                <div className="space-y-4">
                    <p className="text-sm text-ink-600">Dein Freigabelink ist bereit. Jeder mit diesem Link kann die Datei herunterladen{password ? ' (mit Passwort)' : ''}.</p>
                    <CopyField value={url} />
                    <p className="text-xs text-ink-500">
                        Alle Links verwaltest du unter{' '}
                        <Link href="/dashboard/freigaben" className="font-medium text-brand-700 hover:underline">
                            Freigaben
                        </Link>
                        .
                    </p>
                </div>
            ) : (
                <form onSubmit={create} className="space-y-4">
                    {!canProtect && (
                        <div className="flex gap-3 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900">
                            <Lock className="h-4 w-4 shrink-0" />
                            <p>
                                Passwortschutz und Ablaufdatum gibt es ab dem{' '}
                                <Link href="/dashboard/abo" className="font-semibold underline">
                                    Start-Tarif
                                </Link>
                                .
                            </p>
                        </div>
                    )}
                    <div>
                        <label className="label" htmlFor="share-password">
                            Passwort <span className="font-normal text-ink-400">(optional)</span>
                        </label>
                        <input
                            id="share-password"
                            type="text"
                            autoComplete="off"
                            className="input"
                            value={password}
                            disabled={!canProtect}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Ohne Passwort"
                        />
                    </div>
                    <div>
                        <label className="label" htmlFor="share-expiry">
                            Gültig für
                        </label>
                        <select id="share-expiry" className="input" value={expires} disabled={!canProtect} onChange={(e) => setExpires(e.target.value)}>
                            <option value="">Unbegrenzt</option>
                            <option value="1">1 Tag</option>
                            <option value="7">7 Tage</option>
                            <option value="30">30 Tage</option>
                            <option value="90">90 Tage</option>
                        </select>
                    </div>
                    <ErrorText error={error} />
                    <div className="flex justify-end gap-2 pt-1">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Abbrechen
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                            Link erstellen
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
}

export function PreviewDialog({ files, index, onIndex, onClose }: { files: FileItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
    const file = files[index];
    const kind = file ? fileKind(file.mimeType, file.name) : 'other';
    const src = file ? `/api/files/${file.id}/download?inline=1` : '';

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' && index < files.length - 1) onIndex(index + 1);
            if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [index, files.length, onIndex]);

    if (!file) return null;
    return (
        <Modal open onClose={onClose} title={file.name} size="xl">
            <div className="relative flex min-h-[50vh] items-center justify-center rounded-xl bg-ink-950/95">
                {kind === 'image' && <img key={file.id} src={src} alt={file.name} className="max-h-[70vh] max-w-full object-contain" />}
                {kind === 'video' && <video key={file.id} src={src} controls className="max-h-[70vh] max-w-full" />}
                {kind === 'audio' && <audio key={file.id} src={src} controls className="w-full max-w-md" />}
                {kind === 'pdf' && <iframe key={file.id} src={src} title={file.name} className="h-[70vh] w-full rounded-xl bg-white" />}
                {kind === 'other' && (
                    <div className="py-16 text-center text-white">
                        <FileIcon mimeType={file.mimeType} name={file.name} className="mx-auto h-14 w-14" />
                        <p className="mt-4 text-sm text-ink-300">Für diesen Dateityp gibt es keine Vorschau.</p>
                    </div>
                )}
                {index > 0 && (
                    <button
                        type="button"
                        onClick={() => onIndex(index - 1)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-ink-900 shadow hover:bg-white"
                        aria-label="Vorherige Datei"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                )}
                {index < files.length - 1 && (
                    <button
                        type="button"
                        onClick={() => onIndex(index + 1)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-ink-900 shadow hover:bg-white"
                        aria-label="Nächste Datei"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                )}
            </div>
            <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="text-sm text-ink-600">
                    {formatBytes(file.size)} · geändert {formatDateTime(file.updatedAt)}
                </p>
                <a href={`/api/files/${file.id}/download`} className="btn btn-primary">
                    <Download className="h-4 w-4" /> Herunterladen
                </a>
            </div>
        </Modal>
    );
}
