import { FileArchive, FileImage, FileText, FileVideo, Folder, HardDrive, Link2, Search, Trash2, UploadCloud } from 'lucide-react';

const ROWS = [
    { icon: Folder, name: 'Ferien 2026', meta: '248 Dateien', color: 'text-brand-600' },
    { icon: FileImage, name: 'Sonnenuntergang-Engelberg.jpg', meta: '12.4 MB', color: 'text-emerald-600' },
    { icon: FileVideo, name: 'Hochzeit-Highlights.mp4', meta: '3.8 GB', color: 'text-purple-600' },
    { icon: FileText, name: 'Steuererklärung-2025.pdf', meta: '2.1 MB', color: 'text-red-500' },
    { icon: FileArchive, name: 'Projekt-Backup.zip', meta: '18.6 GB', color: 'text-amber-600' }
];

/** Statische Illustration des Dashboards für die Startseite. */
export function DashboardPreview() {
    return (
        <div className="relative mx-auto w-full max-w-5xl" aria-hidden="true">
            <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[3rem] bg-gradient-to-b from-brand-200/50 via-brand-100/30 to-transparent blur-2xl" />
            <div className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-2xl shadow-brand-900/10">
                <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50 px-4 py-3">
                    <span className="h-3 w-3 rounded-full bg-red-400" />
                    <span className="h-3 w-3 rounded-full bg-amber-400" />
                    <span className="h-3 w-3 rounded-full bg-emerald-400" />
                    <div className="mx-auto hidden w-72 rounded-md bg-white px-3 py-1 text-center text-xs text-ink-500 sm:block">truecloud.online/dashboard</div>
                </div>
                <div className="grid sm:grid-cols-[200px_1fr]">
                    <div className="hidden border-r border-ink-100 p-4 sm:block">
                        {[
                            { icon: HardDrive, label: 'Meine Dateien', active: true },
                            { icon: Link2, label: 'Freigaben' },
                            { icon: Trash2, label: 'Papierkorb' }
                        ].map((item) => (
                            <div
                                key={item.label}
                                className={`mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${item.active ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-600'}`}
                            >
                                <item.icon className="h-4 w-4" />
                                {item.label}
                            </div>
                        ))}
                        <div className="mt-8 rounded-xl bg-ink-50 p-3">
                            <div className="text-xs font-semibold text-ink-700">Speicher</div>
                            <div className="mt-2 h-1.5 rounded-full bg-ink-200">
                                <div className="h-1.5 w-[38%] rounded-full bg-brand-600" />
                            </div>
                            <div className="mt-2 text-xs text-ink-500">382 GB von 1 TB</div>
                        </div>
                    </div>
                    <div className="p-4 sm:p-6">
                        <div className="flex items-center gap-3">
                            <div className="flex flex-1 items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-400">
                                <Search className="h-4 w-4" /> Dateien suchen …
                            </div>
                            <div className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
                                <UploadCloud className="h-4 w-4" /> <span className="hidden sm:inline">Hochladen</span>
                            </div>
                        </div>
                        <div className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-100">
                            {ROWS.map((row) => (
                                <div key={row.name} className="flex items-center gap-3 px-4 py-3">
                                    <row.icon className={`h-5 w-5 shrink-0 ${row.color}`} />
                                    <span className="flex-1 truncate text-sm font-medium text-ink-800">{row.name}</span>
                                    <span className="text-xs text-ink-500">{row.meta}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
