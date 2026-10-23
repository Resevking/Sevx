import clsx from 'clsx';
import { File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, Presentation } from 'lucide-react';

const EXT_GROUPS: [RegExp, React.ComponentType<{ className?: string }>, string][] = [
    [/\.(zip|rar|7z|tar|gz|bz2|xz)$/i, FileArchive, 'text-amber-600'],
    [/\.(xlsx?|csv|ods|numbers)$/i, FileSpreadsheet, 'text-emerald-700'],
    [/\.(pptx?|odp|key)$/i, Presentation, 'text-orange-600'],
    [/\.(docx?|odt|rtf|txt|md|pages)$/i, FileText, 'text-blue-600'],
    [/\.(js|ts|tsx|jsx|json|html|css|py|java|go|rs|php|rb|sh|yml|yaml|xml|sql)$/i, FileCode, 'text-slate-600']
];

export function fileKind(mimeType: string, name: string): 'image' | 'video' | 'audio' | 'pdf' | 'other' {
    if (mimeType.startsWith('image/') && !mimeType.includes('svg')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
    return 'other';
}

export function FileIcon({ mimeType, name, className }: { mimeType: string; name: string; className?: string }) {
    const kind = fileKind(mimeType, name);
    if (kind === 'image') return <FileImage className={clsx('text-emerald-600', className)} />;
    if (kind === 'video') return <FileVideo className={clsx('text-purple-600', className)} />;
    if (kind === 'audio') return <FileAudio className={clsx('text-pink-600', className)} />;
    if (kind === 'pdf') return <FileText className={clsx('text-red-500', className)} />;
    for (const [re, Icon, color] of EXT_GROUPS) if (re.test(name)) return <Icon className={clsx(color, className)} />;
    return <File className={clsx('text-ink-400', className)} />;
}

export function FolderIcon({ className }: { className?: string }) {
    return <Folder className={clsx('fill-brand-100 text-brand-600', className)} />;
}
