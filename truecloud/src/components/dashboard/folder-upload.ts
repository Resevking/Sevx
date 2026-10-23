'use client';

import { api, RequestError } from '@/lib/client';

export interface PathedFile {
    file: File;
    /** Relativer Pfad inkl. Dateiname, z. B. "Ferien/Tag 1/bild.jpg" */
    path: string;
}

/** Liest Dateien inkl. Ordnerstruktur aus einem Drop-Ereignis. Muss synchron im Drop-Handler gestartet werden. */
export function collectDropped(dt: DataTransfer): Promise<PathedFile[]> {
    const entries = Array.from(dt.items ?? [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.webkitGetAsEntry?.())
        .filter((e): e is FileSystemEntry => Boolean(e));
    const plainFiles = Array.from(dt.files);
    if (!entries.length) return Promise.resolve(plainFiles.map((file) => ({ file, path: file.name })));

    const out: PathedFile[] = [];
    async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
        if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
            out.push({ file, path: prefix + file.name });
        } else if (entry.isDirectory) {
            const reader = (entry as FileSystemDirectoryEntry).createReader();
            let batch: FileSystemEntry[];
            do {
                batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
                for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
            } while (batch.length);
        }
    }
    return (async () => {
        for (const entry of entries) await walk(entry, '');
        return out;
    })();
}

/** Dateien aus einem <input webkitdirectory>. */
export function collectFromInput(files: FileList): PathedFile[] {
    return Array.from(files).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

type Listing = { folders: { id: string; name: string }[] };

async function ensureFolder(parentId: string | null, name: string): Promise<string> {
    try {
        const res = await api<{ folder: { id: string } }>('/api/folders', { body: { name, parentId } });
        return res.folder.id;
    } catch (err) {
        if (!(err instanceof RequestError) || err.status !== 409) throw err;
        // Ordner existiert schon → zusammenführen
        const listing = await api<Listing>(`/api/files${parentId ? `?folderId=${parentId}` : ''}`);
        const existing = listing.folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
        if (!existing) throw err;
        return existing.id;
    }
}

/** Legt die nötigen Ordner an und gruppiert die Dateien nach Zielordner. */
export async function prepareFolderUpload(files: PathedFile[], baseFolderId: string | null): Promise<Map<string | null, File[]>> {
    const folderIds = new Map<string, string | null>([['', baseFolderId]]);
    const groups = new Map<string | null, File[]>();

    const dirs = [...new Set(files.map((f) => f.path.split('/').slice(0, -1).join('/')))]
        .flatMap((dir) => dir.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/')))
        .filter(Boolean);
    const unique = [...new Set(dirs)].sort((a, b) => a.split('/').length - b.split('/').length);

    for (const dir of unique) {
        const parts = dir.split('/');
        const parent = folderIds.get(parts.slice(0, -1).join('/')) ?? baseFolderId;
        folderIds.set(dir, await ensureFolder(parent, parts[parts.length - 1]));
    }
    for (const { file, path } of files) {
        const dir = path.split('/').slice(0, -1).join('/');
        const target = folderIds.get(dir) ?? baseFolderId;
        const list = groups.get(target);
        if (list) list.push(file);
        else groups.set(target, [file]);
    }
    return groups;
}
