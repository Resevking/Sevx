// Reine Hilfsfunktionen für Ordnerbäume und Dateinamen (ohne Datenbankzugriff, testbar).

export interface FolderNode {
    id: string;
    name: string;
    parentId: string | null;
    deletedAt: Date | null;
}

export interface FolderIndex {
    byId: Map<string, FolderNode>;
    children: Map<string | null, FolderNode[]>;
}

export function buildFolderIndex(folders: FolderNode[]): FolderIndex {
    const byId = new Map<string, FolderNode>();
    const children = new Map<string | null, FolderNode[]>();
    for (const folder of folders) {
        byId.set(folder.id, folder);
        const list = children.get(folder.parentId) ?? [];
        list.push(folder);
        children.set(folder.parentId, list);
    }
    return { byId, children };
}

/** Der Ordner selbst und alle Unterordner (beliebig tief). */
export function descendantIds(index: FolderIndex, rootId: string): string[] {
    const result: string[] = [];
    const stack = [rootId];
    while (stack.length) {
        const id = stack.pop() as string;
        result.push(id);
        for (const child of index.children.get(id) ?? []) stack.push(child.id);
    }
    return result;
}

/** true, wenn der Ordner oder einer seiner Elternordner im Papierkorb liegt bzw. fehlt. */
export function isHidden(index: FolderIndex, folderId: string | null): boolean {
    let current = folderId;
    const seen = new Set<string>();
    while (current) {
        if (seen.has(current)) return true;
        seen.add(current);
        const folder = index.byId.get(current);
        if (!folder || folder.deletedAt) return true;
        current = folder.parentId;
    }
    return false;
}

/** Pfad von der Wurzel bis zum Ordner. */
export function pathOf(index: FolderIndex, folderId: string | null): { id: string; name: string }[] {
    const path: { id: string; name: string }[] = [];
    let current = folderId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
        seen.add(current);
        const folder = index.byId.get(current);
        if (!folder) break;
        path.unshift({ id: folder.id, name: folder.name });
        current = folder.parentId;
    }
    return path;
}

/** Macht einen Namen eindeutig: "Bericht.pdf" → "Bericht (1).pdf". */
export function makeUniqueName(name: string, taken: Iterable<string>): string {
    const lower = new Set([...taken].map((n) => n.toLowerCase()));
    if (!lower.has(name.toLowerCase())) return name;
    const dot = name.lastIndexOf('.');
    const hasExt = dot > 0 && dot < name.length - 1;
    const base = hasExt ? name.slice(0, dot) : name;
    const ext = hasExt ? name.slice(dot) : '';
    for (let i = 1; i < 100_000; i++) {
        const candidate = `${base} (${i})${ext}`;
        if (!lower.has(candidate.toLowerCase())) return candidate;
    }
    return `${base} (${Date.now()})${ext}`;
}

/** Bereinigt einen Datei- oder Ordnernamen. Gibt null zurück, wenn er ungültig ist. */
export function cleanName(input: string): string | null {
    const name = input
        .normalize('NFC')
        .replace(/[/\\\u0000-\u001f\u007f]/g, '_')
        .trim()
        .slice(0, 255);
    if (!name || name === '.' || name === '..') return null;
    return name;
}
