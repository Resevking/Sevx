import { describe, expect, it } from 'vitest';
import { buildFolderIndex, cleanName, descendantIds, isHidden, makeUniqueName, pathOf } from '../src/lib/tree';

const folders = [
    { id: 'a', name: 'Fotos', parentId: null, deletedAt: null },
    { id: 'b', name: '2026', parentId: 'a', deletedAt: null },
    { id: 'c', name: 'Ferien', parentId: 'b', deletedAt: null },
    { id: 'd', name: 'Alt', parentId: null, deletedAt: new Date() },
    { id: 'e', name: 'Unter Alt', parentId: 'd', deletedAt: null }
];

describe('Ordnerbaum', () => {
    const index = buildFolderIndex(folders);

    it('findet alle Unterordner', () => {
        expect(descendantIds(index, 'a').sort()).toEqual(['a', 'b', 'c']);
    });

    it('erkennt Ordner im Papierkorb, auch indirekt', () => {
        expect(isHidden(index, 'c')).toBe(false);
        expect(isHidden(index, 'd')).toBe(true);
        expect(isHidden(index, 'e')).toBe(true);
        expect(isHidden(index, 'gibt-es-nicht')).toBe(true);
        expect(isHidden(index, null)).toBe(false);
    });

    it('baut den Pfad', () => {
        expect(pathOf(index, 'c').map((p) => p.name)).toEqual(['Fotos', '2026', 'Ferien']);
        expect(pathOf(index, null)).toEqual([]);
    });
});

describe('Dateinamen', () => {
    it('macht Namen eindeutig', () => {
        expect(makeUniqueName('Bericht.pdf', [])).toBe('Bericht.pdf');
        expect(makeUniqueName('Bericht.pdf', ['bericht.pdf'])).toBe('Bericht (1).pdf');
        expect(makeUniqueName('Bericht.pdf', ['Bericht.pdf', 'Bericht (1).pdf'])).toBe('Bericht (2).pdf');
        expect(makeUniqueName('README', ['README'])).toBe('README (1)');
        expect(makeUniqueName('.env', ['.env'])).toBe('.env (1)');
    });

    it('bereinigt ungültige Zeichen', () => {
        expect(cleanName('  a/b\\c.txt ')).toBe('a_b_c.txt');
        expect(cleanName('..')).toBeNull();
        expect(cleanName('   ')).toBeNull();
        expect(cleanName('x'.repeat(300))?.length).toBe(255);
    });
});
