'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, UploadCloud, X, XCircle } from 'lucide-react';
import { api, RequestError } from '@/lib/client';
import { formatBytes } from '@/lib/format';

// Upload-Ablauf:
// 1. /api/uploads/init reserviert Speicher und liefert eine vorsignierte URL (oder Multipart-Infos)
// 2. Der Browser lädt direkt zu OVHcloud hoch (grosse Dateien in Teilen, 4 parallel)
// 3. /api/uploads/complete prüft die Grösse und gibt die Datei frei

type Status = 'queued' | 'uploading' | 'done' | 'error' | 'canceled';

export interface UploadItem {
    id: string;
    name: string;
    size: number;
    folderId: string | null;
    loaded: number;
    status: Status;
    error?: string;
}

interface UploadActions {
    /** Wird bei jedem abgeschlossenen Upload erhöht – Listen können darauf neu laden. */
    version: number;
    enqueue: (files: File[], folderId: string | null) => void;
}

interface UploadQueue {
    items: UploadItem[];
    cancel: (id: string) => void;
    clearFinished: () => void;
}

// Zwei Kontexte, damit Fortschrittsupdates nicht die Dateiliste neu rendern.
const UploadActionsContext = createContext<UploadActions | null>(null);
const UploadQueueContext = createContext<UploadQueue | null>(null);

const FILE_CONCURRENCY = 3;
const PART_CONCURRENCY = 4;
const PART_URL_BATCH = 20;
const PART_RETRIES = 3;

type InitResponse =
    | { fileId: string; name: string; mode: 'single'; url: string; contentType: string }
    | { fileId: string; name: string; mode: 'multipart'; partSize: number; partCount: number };

class AbortedError extends Error {
    constructor() {
        super('Abgebrochen');
    }
}

function putBlob(url: string, body: Blob, headers: Record<string, string>, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<string | null> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => onProgress(e.loaded);
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.getResponseHeader('ETag'));
            else reject(new Error(`Speicher antwortet mit Status ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Netzwerkfehler beim Hochladen'));
        xhr.onabort = () => reject(new AbortedError());
        if (signal.aborted) return reject(new AbortedError());
        signal.addEventListener('abort', () => xhr.abort(), { once: true });
        xhr.send(body);
    });
}

async function uploadMultipart(
    file: File,
    init: Extract<InitResponse, { mode: 'multipart' }>,
    signal: AbortSignal,
    onProgress: (loaded: number) => void
): Promise<{ partNumber: number; etag: string }[]> {
    const { fileId, partSize, partCount } = init;
    const batches = new Map<number, Promise<Record<number, string>>>();
    const getUrl = async (n: number) => {
        const batch = Math.floor((n - 1) / PART_URL_BATCH);
        if (!batches.has(batch)) {
            const first = batch * PART_URL_BATCH + 1;
            const numbers = Array.from({ length: Math.min(PART_URL_BATCH, partCount - first + 1) }, (_, i) => first + i);
            batches.set(
                batch,
                api<{ urls: Record<number, string> }>('/api/uploads/parts', { body: { fileId, partNumbers: numbers } }).then((r) => r.urls)
            );
        }
        return (await batches.get(batch))![n];
    };

    const loadedByPart = new Map<number, number>();
    const report = () => onProgress([...loadedByPart.values()].reduce((a, b) => a + b, 0));
    const parts: { partNumber: number; etag: string }[] = [];
    let next = 1;

    async function worker() {
        while (next <= partCount) {
            const n = next++;
            const start = (n - 1) * partSize;
            const blob = file.slice(start, Math.min(start + partSize, file.size));
            for (let attempt = 1; ; attempt++) {
                if (signal.aborted) throw new AbortedError();
                try {
                    const etag = await putBlob(await getUrl(n), blob, {}, signal, (loaded) => {
                        loadedByPart.set(n, loaded);
                        report();
                    });
                    if (!etag) throw new Error('ETag fehlt – bitte die CORS-Konfiguration des Buckets prüfen (npm run ovh:setup).');
                    loadedByPart.set(n, blob.size);
                    report();
                    parts.push({ partNumber: n, etag });
                    break;
                } catch (err) {
                    if (err instanceof AbortedError || attempt >= PART_RETRIES) throw err;
                    loadedByPart.set(n, 0);
                    await new Promise((r) => setTimeout(r, 1000 * attempt));
                }
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, partCount) }, worker));
    return parts;
}

async function uploadFile(file: File, folderId: string | null, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<void> {
    const init = await api<InitResponse>('/api/uploads/init', {
        body: { name: file.name, size: file.size, mimeType: file.type || undefined, folderId }
    });
    try {
        if (init.mode === 'single') {
            await putBlob(init.url, file, { 'Content-Type': init.contentType }, signal, onProgress);
            await api('/api/uploads/complete', { body: { fileId: init.fileId } });
        } else {
            const parts = await uploadMultipart(file, init, signal, onProgress);
            await api('/api/uploads/complete', { body: { fileId: init.fileId, parts } });
        }
    } catch (err) {
        await api('/api/uploads/abort', { body: { fileId: init.fileId } }).catch(() => undefined);
        throw err;
    }
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [items, setItems] = useState<UploadItem[]>([]);
    const [version, setVersion] = useState(0);
    const files = useRef(new Map<string, File>());
    const controllers = useRef(new Map<string, AbortController>());
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const update = useCallback((id: string, patch: Partial<UploadItem>) => {
        setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    }, []);

    const enqueue = useCallback((list: File[], folderId: string | null) => {
        const added = list.map((file) => {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            files.current.set(id, file);
            return { id, name: file.name, size: file.size, folderId, loaded: 0, status: 'queued' as Status };
        });
        setItems((current) => [...current, ...added]);
    }, []);

    const cancel = useCallback(
        (id: string) => {
            controllers.current.get(id)?.abort();
            files.current.delete(id);
            setItems((list) => list.map((item) => (item.id === id && (item.status === 'queued' || item.status === 'uploading') ? { ...item, status: 'canceled' } : item)));
        },
        []
    );

    const clearFinished = useCallback(() => {
        setItems((list) => list.filter((item) => item.status === 'queued' || item.status === 'uploading'));
    }, []);

    // Warteschlange abarbeiten
    useEffect(() => {
        const running = items.filter((i) => i.status === 'uploading').length;
        const queued = items.filter((i) => i.status === 'queued').slice(0, Math.max(0, FILE_CONCURRENCY - running));
        for (const item of queued) {
            const file = files.current.get(item.id);
            if (!file) continue;
            const controller = new AbortController();
            controllers.current.set(item.id, controller);
            update(item.id, { status: 'uploading' });
            uploadFile(file, item.folderId, controller.signal, (loaded) => update(item.id, { loaded: Math.min(loaded, item.size) }))
                .then(() => {
                    update(item.id, { status: 'done', loaded: item.size });
                    setVersion((v) => v + 1);
                    if (refreshTimer.current) clearTimeout(refreshTimer.current);
                    refreshTimer.current = setTimeout(() => router.refresh(), 800);
                })
                .catch((err) => {
                    if (err instanceof AbortedError || controller.signal.aborted) update(item.id, { status: 'canceled' });
                    else update(item.id, { status: 'error', error: err instanceof RequestError || err instanceof Error ? err.message : 'Upload fehlgeschlagen' });
                })
                .finally(() => {
                    controllers.current.delete(item.id);
                    files.current.delete(item.id);
                });
        }
    }, [items, update, router]);

    // Warnung beim Verlassen der Seite während laufender Uploads
    const active = items.some((i) => i.status === 'uploading' || i.status === 'queued');
    useEffect(() => {
        if (!active) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [active]);

    const actions = useMemo(() => ({ version, enqueue }), [version, enqueue]);
    const queue = useMemo(() => ({ items, cancel, clearFinished }), [items, cancel, clearFinished]);
    return (
        <UploadActionsContext.Provider value={actions}>
            {children}
            <UploadQueueContext.Provider value={queue}>
                <UploadPanel />
            </UploadQueueContext.Provider>
        </UploadActionsContext.Provider>
    );
}

export function useUploads(): UploadActions {
    const ctx = useContext(UploadActionsContext);
    if (!ctx) throw new Error('useUploads muss innerhalb von UploadProvider verwendet werden');
    return ctx;
}

function UploadPanel() {
    const { items, cancel, clearFinished } = useContext(UploadQueueContext) as UploadQueue;
    const [collapsed, setCollapsed] = useState(false);
    if (!items.length) return null;

    const active = items.filter((i) => i.status === 'uploading' || i.status === 'queued');
    const done = items.filter((i) => i.status === 'done').length;
    const totalSize = active.reduce((s, i) => s + i.size, 0);
    const totalLoaded = active.reduce((s, i) => s + i.loaded, 0);

    return (
        <div className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 bg-ink-950 px-4 py-3 text-white">
                {active.length ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                <div className="min-w-0 flex-1 text-sm font-semibold">
                    {active.length
                        ? `${active.length} ${active.length === 1 ? 'Upload' : 'Uploads'} · ${totalSize ? Math.round((totalLoaded / totalSize) * 100) : 0} %`
                        : `${done} ${done === 1 ? 'Datei' : 'Dateien'} hochgeladen`}
                </div>
                <button type="button" onClick={() => setCollapsed(!collapsed)} className="rounded p-1 hover:bg-white/10" aria-label={collapsed ? 'Ausklappen' : 'Einklappen'}>
                    {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {!active.length && (
                    <button type="button" onClick={clearFinished} className="rounded p-1 hover:bg-white/10" aria-label="Liste schliessen">
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>
            {!collapsed && (
                <ul className="max-h-72 divide-y divide-ink-100 overflow-y-auto">
                    {[...items].reverse().map((item) => (
                        <li key={item.id} className="px-4 py-3">
                            <div className="flex items-center gap-3">
                                {item.status === 'done' ? (
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                ) : item.status === 'error' ? (
                                    <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                                ) : item.status === 'canceled' ? (
                                    <XCircle className="h-4 w-4 shrink-0 text-ink-400" />
                                ) : (
                                    <UploadCloud className="h-4 w-4 shrink-0 text-brand-600" />
                                )}
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800" title={item.name}>
                                    {item.name}
                                </span>
                                {(item.status === 'uploading' || item.status === 'queued') && (
                                    <button type="button" onClick={() => cancel(item.id)} className="text-ink-400 hover:text-red-600" aria-label={`${item.name} abbrechen`}>
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            {item.status === 'uploading' || item.status === 'queued' ? (
                                <div className="mt-2">
                                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                                        <div
                                            className={clsx('h-full rounded-full bg-brand-600 transition-[width]', item.status === 'queued' && 'opacity-40')}
                                            style={{ width: `${item.size ? (item.loaded / item.size) * 100 : 0}%` }}
                                        />
                                    </div>
                                    <p className="mt-1 text-xs text-ink-500">
                                        {item.status === 'queued' ? 'Wartet …' : `${formatBytes(item.loaded)} von ${formatBytes(item.size)}`}
                                    </p>
                                </div>
                            ) : item.status === 'error' ? (
                                <p className="mt-1 text-xs text-red-600">{item.error}</p>
                            ) : item.status === 'canceled' ? (
                                <p className="mt-1 text-xs text-ink-500">Abgebrochen</p>
                            ) : (
                                <p className="mt-1 text-xs text-ink-500">{formatBytes(item.size)}</p>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
