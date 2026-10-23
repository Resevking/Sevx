import Link from 'next/link';
import { AlertTriangle, ArrowRight, Files, FolderClosed, Link2, UploadCloud } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { formatBytes, formatDate, formatStorageGB, percent } from '@/lib/format';
import { getPlan, PAID_PLANS } from '@/lib/plans';
import { UsageBar } from '@/components/dashboard/usage-bar';
import { FileIcon } from '@/components/ui/file-icon';

export default async function DashboardHome() {
    const user = await requireUser();
    const plan = getPlan(user.plan);
    const [fileCount, folderCount, shareCount, recent, trashBytes] = await Promise.all([
        db.file.count({ where: { userId: user.id, status: 'ACTIVE', deletedAt: null } }),
        db.folder.count({ where: { userId: user.id, deletedAt: null } }),
        db.share.count({ where: { userId: user.id } }),
        db.file.findMany({ where: { userId: user.id, status: 'ACTIVE', deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 6 }),
        db.file.aggregate({ where: { userId: user.id, status: 'ACTIVE', deletedAt: { not: null } }, _sum: { size: true } })
    ]);
    const used = Number(user.usedBytes);
    const quota = Number(user.quotaBytes);
    const pct = percent(used, quota);
    const nextPlan = PAID_PLANS.find((p) => p.storageGB > plan.storageGB);
    const trash = Number(trashBytes._sum.size ?? 0);

    return (
        <div className="space-y-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-ink-950">Hallo{user.name ? ` ${user.name}` : ''} 👋</h1>
                    <p className="mt-1 text-sm text-ink-600">Hier ist der Überblick über deinen Speicher.</p>
                </div>
                <Link href="/dashboard/dateien" className="btn btn-primary">
                    <UploadCloud className="h-4 w-4" /> Dateien hochladen
                </Link>
            </div>

            {used > quota && (
                <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <p>
                        Du belegst mehr Speicher als dein Tarif erlaubt. Deine Dateien bleiben erhalten, aber neue Uploads sind erst wieder möglich, wenn du
                        Platz schaffst oder{' '}
                        <Link href="/dashboard/abo" className="font-semibold underline">
                            deinen Tarif erweiterst
                        </Link>
                        .
                    </p>
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="card p-6 lg:col-span-2">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-sm font-semibold text-ink-600">Speicherplatz</h2>
                            <p className="mt-2 text-3xl font-bold tracking-tight text-ink-950">
                                {formatBytes(used)} <span className="text-base font-medium text-ink-500">von {formatBytes(quota)}</span>
                            </p>
                        </div>
                        <span className="badge bg-brand-50 text-brand-700">{Math.round(pct)} % belegt</span>
                    </div>
                    <UsageBar used={used} quota={quota} className="mt-6" />
                    {trash > 0 && (
                        <p className="mt-3 text-xs text-ink-500">
                            Davon {formatBytes(trash)} im{' '}
                            <Link href="/dashboard/papierkorb" className="font-medium text-brand-700 hover:underline">
                                Papierkorb
                            </Link>
                            .
                        </p>
                    )}
                </div>
                <div className="card flex flex-col p-6">
                    <h2 className="text-sm font-semibold text-ink-600">Dein Tarif</h2>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-ink-950">{plan.name}</p>
                    <p className="mt-1 text-sm text-ink-600">
                        {formatStorageGB(plan.storageGB)} Speicher
                        {user.currentPeriodEnd && ` · ${user.cancelAtPeriodEnd ? 'endet' : 'verlängert sich'} am ${formatDate(user.currentPeriodEnd)}`}
                    </p>
                    <div className="mt-auto pt-6">
                        {nextPlan ? (
                            <Link href="/dashboard/abo" className="btn btn-secondary w-full">
                                Auf {formatStorageGB(nextPlan.storageGB)} erweitern <ArrowRight className="h-4 w-4" />
                            </Link>
                        ) : (
                            <Link href="/dashboard/abo" className="btn btn-secondary w-full">
                                Abo verwalten
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                {[
                    { icon: Files, label: 'Dateien', value: fileCount.toLocaleString('de-CH'), href: '/dashboard/dateien' },
                    { icon: FolderClosed, label: 'Ordner', value: folderCount.toLocaleString('de-CH'), href: '/dashboard/dateien' },
                    { icon: Link2, label: 'Freigaben', value: shareCount.toLocaleString('de-CH'), href: '/dashboard/freigaben' }
                ].map((stat) => (
                    <Link key={stat.label} href={stat.href} className="card flex items-center gap-4 p-5 transition hover:shadow-lg">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                            <stat.icon className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-ink-950">{stat.value}</p>
                            <p className="text-sm text-ink-600">{stat.label}</p>
                        </div>
                    </Link>
                ))}
            </div>

            <div className="card">
                <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
                    <h2 className="font-semibold text-ink-950">Zuletzt hochgeladen</h2>
                    <Link href="/dashboard/dateien" className="text-sm font-medium text-brand-700 hover:underline">
                        Alle Dateien
                    </Link>
                </div>
                {recent.length ? (
                    <ul className="divide-y divide-ink-100">
                        {recent.map((file) => (
                            <li key={file.id}>
                                <Link
                                    href={file.folderId ? `/dashboard/dateien?ordner=${file.folderId}` : '/dashboard/dateien'}
                                    className="flex items-center gap-4 px-6 py-3 hover:bg-ink-50/70"
                                >
                                    <FileIcon mimeType={file.mimeType} name={file.name} className="h-5 w-5 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{file.name}</span>
                                    <span className="hidden text-sm text-ink-500 sm:block">{formatBytes(file.size)}</span>
                                    <span className="text-sm text-ink-500">{formatDate(file.createdAt)}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="px-6 py-12 text-center">
                        <p className="text-sm text-ink-600">Noch keine Dateien. Lade jetzt deine erste Datei hoch!</p>
                        <Link href="/dashboard/dateien" className="btn btn-primary mt-4">
                            <UploadCloud className="h-4 w-4" /> Hochladen
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
