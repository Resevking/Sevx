'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
    ArrowDown,
    ArrowUp,
    ChevronRight,
    Download,
    Eye,
    FolderInput,
    FolderPlus,
    FolderUp,
    Home,
    LayoutGrid,
    Link2,
    List,
    Loader2,
    Pencil,
    Search,
    Trash2,
    UploadCloud,
    X
} from 'lucide-react';
import { ActionMenu } from '@/components/ui/menu';
import { FileIcon, FolderIcon, fileKind } from '@/components/ui/file-icon';
import { useToast } from '@/components/ui/toast';
import { api, RequestError } from '@/lib/client';
import { formatBytes, formatDate } from '@/lib/format';
import { useUploads } from './uploads';
import { collectDropped, collectFromInput, prepareFolderUpload, type PathedFile } from './folder-upload';
import { ConfirmDialog, MoveDialog, NameDialog, PreviewDialog, ShareDialog, type FileItem, type FolderItem } from './file-dialogs';

type Listing = { mode: 'folder' | 'search'; breadcrumbs: { id: string; name: string }[]; folders: FolderItem[]; files: FileItem[] };
type Key = `f:${string}` | `d:${string}`;
type SortKey = 'name' | 'size' | 'date';
type Dialog =
    | { type: 'newFolder' }
    | { type: 'rename'; kind: 'file' | 'folder'; id: string; name: string }
    | { type: 'move'; keys: Key[] }
    | { type: 'delete'; keys: Key[] }
    | { type: 'share'; file: FileItem };

const VIEW_STORAGE_KEY = 'truecloud:view';
const THUMBNAIL_MAX_BYTES = 20 * 1000 * 1000;

function useDebounced<T>(value: T, ms: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return debounced;
}

export function FileManager({ canProtectShares, emailVerified }: { canProtectShares: boolean; emailVerified: boolean }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const folderId = searchParams.get('ordner');
    const { enqueue, version } = useUploads();
    const toast = useToast();

    const [listing, setListing] = useState<Listing | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const search = useDebounced(query.trim(), 300);
    const [view, setView] = useState<'list' | 'grid'>('list');
    const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
    const [selected, setSelected] = useState<Set<Key>>(new Set());
    const [dialog, setDialog] = useState<Dialog | null>(null);
    const [preview, setPreview] = useState<number | null>(null);
    const [dragging, setDragging] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const dragDepth = useRef(0);
    const fileInput = useRef<HTMLInputElement>(null);
    const folderInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(VIEW_STORAGE_KEY);
            if (stored === 'grid' || stored === 'list') setView(stored);
        } catch {
            /* localStorage nicht verfügbar */
        }
    }, []);

    const changeView = (v: 'list' | 'grid') => {
        setView(v);
        try {
            localStorage.setItem(VIEW_STORAGE_KEY, v);
        } catch {
            /* ignorieren */
        }
    };

    const load = useCallback(async () => {
        const params = new URLSearchParams();
        if (search) params.set('q', search);
        else if (folderId) params.set('folderId', folderId);
        try {
            const data = await api<Listing>(`/api/files?${params}`);
            setListing(data);
            setLoadError(null);
        } catch (err) {
            if (err instanceof RequestError && err.status === 404 && folderId) {
                toast.error('Dieser Ordner existiert nicht mehr.');
                router.replace('/dashboard/dateien');
                return;
            }
            setLoadError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [folderId, search, router, toast]);

    useEffect(() => {
        load();
    }, [load, version]);

    useEffect(() => {
        setSelected(new Set());
        setPreview(null);
    }, [folderId, search]);

    const folders = useMemo(() => {
        const list = [...(listing?.folders ?? [])];
        // Ordner haben keine Grösse – bei Sortierung nach Grösse bleiben sie alphabetisch.
        return list.sort((a, b) => {
            if (sort.key === 'date') return a.updatedAt.localeCompare(b.updatedAt) * sort.dir;
            return a.name.localeCompare(b.name, 'de', { numeric: true }) * (sort.key === 'name' ? sort.dir : 1);
        });
    }, [listing, sort]);

    const files = useMemo(() => {
        const list = [...(listing?.files ?? [])];
        return list.sort((a, b) => {
            if (sort.key === 'size') return (a.size - b.size) * sort.dir;
            if (sort.key === 'date') return a.updatedAt.localeCompare(b.updatedAt) * sort.dir;
            return a.name.localeCompare(b.name, 'de', { numeric: true }) * sort.dir;
        });
    }, [listing, sort]);

    const isSearch = listing?.mode === 'search';
    const allKeys = useMemo<Key[]>(() => [...folders.map((f) => `d:${f.id}` as Key), ...files.map((f) => `f:${f.id}` as Key)], [folders, files]);

    function openFolder(id: string | null) {
        setQuery('');
        router.push(id ? `/dashboard/dateien?ordner=${id}` : '/dashboard/dateien');
    }

    function toggle(key: Key) {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    function toggleSort(key: SortKey) {
        setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 }));
    }

    async function startUpload(items: PathedFile[]) {
        if (!items.length) return;
        if (items.every((i) => !i.path.includes('/'))) {
            enqueue(
                items.map((i) => i.file),
                folderId
            );
            return;
        }
        setPreparing(true);
        try {
            const groups = await prepareFolderUpload(items, folderId);
            for (const [target, list] of groups) enqueue(list, target);
            await load();
        } catch (err) {
            toast.error(`Ordner konnten nicht angelegt werden: ${(err as Error).message}`);
        } finally {
            setPreparing(false);
        }
    }

    // ---------------------------------------------------------------- Aktionen

    async function runBulk(keys: Key[], action: (kind: 'file' | 'folder', id: string) => Promise<unknown>): Promise<number> {
        let failed = 0;
        let lastError = '';
        for (const key of keys) {
            try {
                await action(key.startsWith('d:') ? 'folder' : 'file', key.slice(2));
            } catch (err) {
                failed++;
                lastError = (err as Error).message;
            }
        }
        if (failed) toast.error(failed === keys.length ? lastError : `${failed} von ${keys.length} Elementen fehlgeschlagen: ${lastError}`);
        return keys.length - failed;
    }

    async function deleteKeys(keys: Key[]) {
        const ok = await runBulk(keys, (kind, id) => api(`/api/${kind === 'file' ? 'files' : 'folders'}/${id}`, { method: 'DELETE' }));
        if (ok) toast.success(ok === 1 ? 'In den Papierkorb verschoben.' : `${ok} Elemente in den Papierkorb verschoben.`);
        setSelected(new Set());
        await load();
        router.refresh();
    }

    async function moveKeys(keys: Key[], target: string | null) {
        const ok = await runBulk(keys, (kind, id) =>
            api(`/api/${kind === 'file' ? 'files' : 'folders'}/${id}`, { method: 'PATCH', body: kind === 'file' ? { folderId: target } : { parentId: target } })
        );
        if (ok) toast.success(ok === 1 ? 'Verschoben.' : `${ok} Elemente verschoben.`);
        setSelected(new Set());
        await load();
    }

    function fileActions(file: FileItem, index: number) {
        return [
            { label: 'Vorschau', icon: Eye, onClick: () => setPreview(index) },
            { label: 'Herunterladen', icon: Download, onClick: () => (window.location.href = `/api/files/${file.id}/download`) },
            { label: 'Teilen', icon: Link2, onClick: () => setDialog({ type: 'share', file }) },
            { label: 'Umbenennen', icon: Pencil, onClick: () => setDialog({ type: 'rename', kind: 'file', id: file.id, name: file.name }) },
            { label: 'Verschieben', icon: FolderInput, onClick: () => setDialog({ type: 'move', keys: [`f:${file.id}`] }) },
            { label: 'Löschen', icon: Trash2, danger: true, onClick: () => setDialog({ type: 'delete', keys: [`f:${file.id}`] }) }
        ];
    }

    function folderActions(folder: FolderItem) {
        return [
            { label: 'Öffnen', icon: FolderIcon, onClick: () => openFolder(folder.id) },
            { label: 'Umbenennen', icon: Pencil, onClick: () => setDialog({ type: 'rename', kind: 'folder', id: folder.id, name: folder.name }) },
            { label: 'Verschieben', icon: FolderInput, onClick: () => setDialog({ type: 'move', keys: [`d:${folder.id}`] }) },
            { label: 'Löschen', icon: Trash2, danger: true, onClick: () => setDialog({ type: 'delete', keys: [`d:${folder.id}`] }) }
        ];
    }

    // ---------------------------------------------------------------- Drag & Drop

    const dropHandlers = {
        onDragEnter: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            dragDepth.current++;
            setDragging(true);
        },
        onDragOver: (e: React.DragEvent) => {
            if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        },
        onDragLeave: () => {
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (!dragDepth.current) setDragging(false);
        },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            if (isSearch) {
                toast.error('Bitte beende zuerst die Suche, um in einen Ordner hochzuladen.');
                return;
            }
            collectDropped(e.dataTransfer)
                .then(startUpload)
                .catch(() => toast.error('Die Dateien konnten nicht gelesen werden.'));
        }
    };

    // ---------------------------------------------------------------- Rendering

    const selectedKeys = [...selected];
    const empty = listing && !folders.length && !files.length;

    const SortHeader = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
        <button type="button" onClick={() => toggleSort(k)} className={clsx('inline-flex items-center gap-1 hover:text-ink-900', className)}>
            {label}
            {sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
        </button>
    );

    return (
        <div className="relative" {...dropHandlers}>
            {/* Kopfzeile */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <nav className="flex min-w-0 flex-wrap items-center gap-1 text-lg font-semibold text-ink-950" aria-label="Pfad">
                    {isSearch ? (
                        <span>Suchergebnisse für «{search}»</span>
                    ) : (
                        <>
                            <button type="button" onClick={() => openFolder(null)} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-ink-100">
                                <Home className="h-5 w-5 text-ink-500" /> Meine Dateien
                            </button>
                            {listing?.breadcrumbs.map((crumb) => (
                                <span key={crumb.id} className="flex min-w-0 items-center gap-1">
                                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
                                    <button type="button" onClick={() => openFolder(crumb.id)} className="truncate rounded-lg px-1.5 py-1 hover:bg-ink-100">
                                        {crumb.name}
                                    </button>
                                </span>
                            ))}
                        </>
                    )}
                </nav>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-64">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Alle Dateien durchsuchen" className="input pl-9 pr-8" aria-label="Suchen" />
                        {query && (
                            <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700" aria-label="Suche löschen">
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex rounded-lg border border-ink-200 bg-white p-0.5 shadow-sm">
                        <button type="button" onClick={() => changeView('list')} className={clsx('rounded-md p-1.5', view === 'list' ? 'bg-ink-100 text-ink-950' : 'text-ink-500')} aria-label="Listenansicht">
                            <List className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => changeView('grid')} className={clsx('rounded-md p-1.5', view === 'grid' ? 'bg-ink-100 text-ink-950' : 'text-ink-500')} aria-label="Kachelansicht">
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={() => setDialog({ type: 'newFolder' })} disabled={isSearch}>
                        <FolderPlus className="h-4 w-4" /> <span className="hidden sm:inline">Neuer Ordner</span>
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => folderInput.current?.click()} disabled={isSearch || preparing} title="Ordner hochladen">
                        {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderUp className="h-4 w-4" />}
                        <span className="hidden xl:inline">Ordner hochladen</span>
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={isSearch}>
                        <UploadCloud className="h-4 w-4" /> Hochladen
                    </button>
                    <input
                        ref={fileInput}
                        type="file"
                        multiple
                        hidden
                        onChange={(e) => {
                            if (e.target.files) startUpload(collectFromInput(e.target.files).map((p) => ({ ...p, path: p.file.name })));
                            e.target.value = '';
                        }}
                    />
                    <input
                        ref={folderInput}
                        type="file"
                        multiple
                        hidden
                        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                        onChange={(e) => {
                            if (e.target.files) startUpload(collectFromInput(e.target.files));
                            e.target.value = '';
                        }}
                    />
                </div>
            </div>

            {/* Auswahlleiste */}
            {selected.size > 0 && (
                <div className="sticky top-14 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm lg:top-2">
                    <span className="font-semibold text-brand-900">{selected.size} ausgewählt</span>
                    <div className="ml-auto flex flex-wrap gap-2">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ type: 'move', keys: selectedKeys })}>
                            <FolderInput className="h-4 w-4" /> Verschieben
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm text-red-600" onClick={() => setDialog({ type: 'delete', keys: selectedKeys })}>
                            <Trash2 className="h-4 w-4" /> Löschen
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
                            Auswahl aufheben
                        </button>
                    </div>
                </div>
            )}

            {/* Inhalt */}
            <div className="mt-5">
                {loading && !listing ? (
                    <div className="card flex items-center justify-center py-24">
                        <Loader2 className="h-6 w-6 animate-spin text-ink-400" />
                    </div>
                ) : loadError ? (
                    <div className="card px-6 py-16 text-center">
                        <p className="text-sm text-red-600">{loadError}</p>
                        <button type="button" className="btn btn-secondary mt-4" onClick={load}>
                            Erneut versuchen
                        </button>
                    </div>
                ) : empty ? (
                    <div className="card flex flex-col items-center px-6 py-20 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                            {isSearch ? <Search className="h-7 w-7" /> : <UploadCloud className="h-7 w-7" />}
                        </div>
                        <h2 className="mt-5 text-lg font-semibold text-ink-950">{isSearch ? 'Nichts gefunden' : 'Dieser Ordner ist leer'}</h2>
                        <p className="mt-2 max-w-sm text-sm text-ink-600">
                            {isSearch ? 'Versuche es mit einem anderen Suchbegriff.' : 'Zieh Dateien oder Ordner hierher oder wähle sie über den Button aus.'}
                        </p>
                        {!isSearch && (
                            <button type="button" className="btn btn-primary mt-6" onClick={() => fileInput.current?.click()}>
                                <UploadCloud className="h-4 w-4" /> Dateien hochladen
                            </button>
                        )}
                    </div>
                ) : view === 'list' ? (
                    <div className="card overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-ink-100 bg-ink-50/70 text-xs font-semibold uppercase tracking-wide text-ink-500">
                                <tr>
                                    <th className="w-10 py-3 pl-4">
                                        <input
                                            type="checkbox"
                                            aria-label="Alle auswählen"
                                            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                                            checked={allKeys.length > 0 && selected.size === allKeys.length}
                                            onChange={(e) => setSelected(e.target.checked ? new Set(allKeys) : new Set())}
                                        />
                                    </th>
                                    <th className="py-3 pl-2 pr-4">
                                        <SortHeader k="name" label="Name" />
                                    </th>
                                    <th className="hidden w-28 py-3 pr-4 text-right sm:table-cell">
                                        <SortHeader k="size" label="Grösse" className="justify-end" />
                                    </th>
                                    <th className="hidden w-32 py-3 pr-4 md:table-cell">
                                        <SortHeader k="date" label="Geändert" />
                                    </th>
                                    <th className="w-12 py-3 pr-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100">
                                {folders.map((folder) => {
                                    const key: Key = `d:${folder.id}`;
                                    return (
                                        <tr key={key} className={clsx('group', selected.has(key) ? 'bg-brand-50/60' : 'hover:bg-ink-50/70')}>
                                            <td className="py-2.5 pl-4">
                                                <input type="checkbox" aria-label={`${folder.name} auswählen`} className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" checked={selected.has(key)} onChange={() => toggle(key)} />
                                            </td>
                                            <td className="py-2.5 pl-2 pr-4">
                                                <button type="button" onClick={() => openFolder(folder.id)} className="flex max-w-full items-center gap-3 text-left">
                                                    <FolderIcon className="h-5 w-5 shrink-0" />
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-medium text-ink-900 group-hover:text-brand-700">{folder.name}</span>
                                                        {folder.location !== undefined && <span className="block truncate text-xs text-ink-500">{folder.location || 'Meine Dateien'}</span>}
                                                    </span>
                                                </button>
                                            </td>
                                            <td className="hidden py-2.5 pr-4 text-right text-ink-500 sm:table-cell">–</td>
                                            <td className="hidden py-2.5 pr-4 text-ink-500 md:table-cell">{formatDate(folder.updatedAt)}</td>
                                            <td className="py-2.5 pr-3">
                                                <ActionMenu items={folderActions(folder)} />
                                            </td>
                                        </tr>
                                    );
                                })}
                                {files.map((file, index) => {
                                    const key: Key = `f:${file.id}`;
                                    return (
                                        <tr key={key} className={clsx('group', selected.has(key) ? 'bg-brand-50/60' : 'hover:bg-ink-50/70')}>
                                            <td className="py-2.5 pl-4">
                                                <input type="checkbox" aria-label={`${file.name} auswählen`} className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" checked={selected.has(key)} onChange={() => toggle(key)} />
                                            </td>
                                            <td className="py-2.5 pl-2 pr-4">
                                                <button type="button" onClick={() => setPreview(index)} className="flex max-w-full items-center gap-3 text-left">
                                                    <FileIcon mimeType={file.mimeType} name={file.name} className="h-5 w-5 shrink-0" />
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-medium text-ink-900 group-hover:text-brand-700">{file.name}</span>
                                                        {file.location !== undefined && <span className="block truncate text-xs text-ink-500">{file.location || 'Meine Dateien'}</span>}
                                                        <span className="block text-xs text-ink-500 sm:hidden">{formatBytes(file.size)}</span>
                                                    </span>
                                                </button>
                                            </td>
                                            <td className="hidden whitespace-nowrap py-2.5 pr-4 text-right text-ink-600 sm:table-cell">{formatBytes(file.size)}</td>
                                            <td className="hidden py-2.5 pr-4 text-ink-500 md:table-cell">{formatDate(file.updatedAt)}</td>
                                            <td className="py-2.5 pr-3">
                                                <ActionMenu items={fileActions(file, index)} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {folders.map((folder) => {
                            const key: Key = `d:${folder.id}`;
                            return (
                                <div key={key} className={clsx('card group relative p-3', selected.has(key) && 'ring-2 ring-brand-500')}>
                                    <button type="button" onClick={() => openFolder(folder.id)} className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-brand-50/60">
                                        <FolderIcon className="h-14 w-14" />
                                    </button>
                                    <div className="mt-3 flex items-center gap-2">
                                        <input type="checkbox" aria-label={`${folder.name} auswählen`} className="h-4 w-4 rounded border-ink-300 text-brand-600" checked={selected.has(key)} onChange={() => toggle(key)} />
                                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900" title={folder.name}>
                                            {folder.name}
                                        </span>
                                        <ActionMenu items={folderActions(folder)} />
                                    </div>
                                </div>
                            );
                        })}
                        {files.map((file, index) => {
                            const key: Key = `f:${file.id}`;
                            const thumb = fileKind(file.mimeType, file.name) === 'image' && file.size <= THUMBNAIL_MAX_BYTES;
                            return (
                                <div key={key} className={clsx('card group relative p-3', selected.has(key) && 'ring-2 ring-brand-500')}>
                                    <button type="button" onClick={() => setPreview(index)} className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-ink-50">
                                        {thumb ? (
                                            <img src={`/api/files/${file.id}/download?inline=1`} alt="" loading="lazy" className="h-full w-full object-cover" />
                                        ) : (
                                            <FileIcon mimeType={file.mimeType} name={file.name} className="h-12 w-12" />
                                        )}
                                    </button>
                                    <div className="mt-3 flex items-center gap-2">
                                        <input type="checkbox" aria-label={`${file.name} auswählen`} className="h-4 w-4 rounded border-ink-300 text-brand-600" checked={selected.has(key)} onChange={() => toggle(key)} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-ink-900" title={file.name}>
                                                {file.name}
                                            </span>
                                            <span className="block text-xs text-ink-500">{formatBytes(file.size)}</span>
                                        </span>
                                        <ActionMenu items={fileActions(file, index)} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {!isSearch && listing && !empty && (
                <p className="mt-4 text-center text-xs text-ink-500">
                    Tipp: Dateien und Ordner einfach ins Fenster ziehen, um sie hochzuladen. Gelöschtes findest du 30 Tage lang im{' '}
                    <Link href="/dashboard/papierkorb" className="font-medium text-brand-700 hover:underline">
                        Papierkorb
                    </Link>
                    .
                </p>
            )}

            {/* Drop-Overlay */}
            {dragging && (
                <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand-600/10 p-8 backdrop-blur-[1px] lg:left-64">
                    <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-brand-500 bg-white/95 px-16 py-12 text-center shadow-2xl">
                        <UploadCloud className="h-12 w-12 text-brand-600" />
                        <p className="mt-4 text-lg font-semibold text-ink-950">Loslassen zum Hochladen</p>
                        <p className="mt-1 text-sm text-ink-600">in «{listing?.breadcrumbs.at(-1)?.name ?? 'Meine Dateien'}»</p>
                    </div>
                </div>
            )}

            {/* Dialoge */}
            {dialog?.type === 'newFolder' && (
                <NameDialog
                    title="Neuer Ordner"
                    label="Name des Ordners"
                    submitLabel="Erstellen"
                    onClose={() => setDialog(null)}
                    onSubmit={async (name) => {
                        await api('/api/folders', { body: { name, parentId: folderId } });
                        await load();
                    }}
                />
            )}
            {dialog?.type === 'rename' && (
                <NameDialog
                    title="Umbenennen"
                    label="Neuer Name"
                    initial={dialog.name}
                    submitLabel="Speichern"
                    onClose={() => setDialog(null)}
                    onSubmit={async (name) => {
                        await api(`/api/${dialog.kind === 'file' ? 'files' : 'folders'}/${dialog.id}`, { method: 'PATCH', body: { name } });
                        await load();
                    }}
                />
            )}
            {dialog?.type === 'move' && (
                <MoveDialog
                    count={dialog.keys.length}
                    excludeFolderIds={dialog.keys.filter((k) => k.startsWith('d:')).map((k) => k.slice(2))}
                    currentFolderId={isSearch ? undefined : folderId}
                    onClose={() => setDialog(null)}
                    onMove={(target) => moveKeys(dialog.keys, target)}
                />
            )}
            {dialog?.type === 'delete' && (
                <ConfirmDialog
                    title="In den Papierkorb verschieben?"
                    message={
                        dialog.keys.length === 1
                            ? 'Das Element wird in den Papierkorb verschoben und nach 30 Tagen endgültig gelöscht. Freigabelinks funktionieren in dieser Zeit nicht mehr.'
                            : `${dialog.keys.length} Elemente werden in den Papierkorb verschoben und nach 30 Tagen endgültig gelöscht.`
                    }
                    confirmLabel="Löschen"
                    danger
                    onClose={() => setDialog(null)}
                    onConfirm={() => deleteKeys(dialog.keys)}
                />
            )}
            {dialog?.type === 'share' && <ShareDialog file={dialog.file} canProtect={canProtectShares} emailVerified={emailVerified} onClose={() => setDialog(null)} />}
            {preview !== null && files[preview] && <PreviewDialog files={files} index={preview} onIndex={setPreview} onClose={() => setPreview(null)} />}
        </div>
    );
}
